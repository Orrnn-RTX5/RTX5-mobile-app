const fs = require('node:fs');
const cp = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const envText = ['.env', '.env.local'].map(name => {
  try { return fs.readFileSync(path.join(root, 'rtx5-app', name), 'utf8'); } catch { return ''; }
}).join('\n');
const env = Object.fromEntries(envText.split(/\r?\n/).map(line => {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  return match ? [match[1], match[2].replace(/^['"]|['"]$/g, '')] : [];
}).filter(pair => pair.length));
const mode = process.argv[2];
if (mode === 'logs') {
  const logs = cp.execFileSync('adb', ['logcat', '-d', '-t', '8000', '-v', 'brief'], { maxBuffer: 16000000 }).toString();
  const lines = logs.split(/\r?\n/).filter(line => /\[Quotes|\[Market|\[Feed|origin_not_allowlisted|WebSocket.*(?:failed|403|close|error)|socket.*(?:failed|403)/i.test(line));
  const safe = lines.map(line => line
    .replace(/(?:wss?|https?):\/\/[^\s"']+/g, url => url.split('?')[0])
    .replace(/Bearer\s+\S+/ig, 'Bearer [redacted]')
    .replace(/(?:access_token|refresh_token|authorization|credentialIdentity)\s*["']?\s*[:=]\s*[^,}\s]+/ig, '[redacted]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[redacted]'));
  fs.writeFileSync(path.join(__dirname, 'live-feed-log-sanitized.txt'), safe.join('\n'));
  console.log(safe.slice(-60).join('\n') || 'No quote socket lifecycle logs in the recent buffer.');
} else if (mode === 'nexa') {
  const WS = require(path.join(root, 'rtx5-app/node_modules/ws'));
  const probe = (name, headers) => new Promise(resolve => {
    const result = { name, opened: false, frames: 0, samples: [] };
    const socket = new WS('wss://nexa.orrnn.com/ws/feed', { headers, handshakeTimeout: 10000 });
    const timer = setTimeout(() => { socket.terminate(); resolve(result); }, 12000);
    const done = () => { clearTimeout(timer); resolve(result); };
    socket.on('open', () => {
      result.opened = true;
      socket.send(JSON.stringify({ type: 'subscribe', symbols: ['EURUSD', 'BTCUSD'] }));
    });
    socket.on('message', buffer => {
      result.frames++;
      if (result.samples.length < 3) {
        try { result.samples.push(JSON.parse(buffer.toString())); } catch { result.samples.push(buffer.toString().slice(0, 300)); }
      }
    });
    socket.on('unexpected-response', (_, response) => {
      result.httpStatus = response.statusCode;
      let body = '';
      response.on('data', chunk => body += chunk);
      response.on('end', () => { result.body = body.slice(0, 600); socket.terminate(); done(); });
    });
    socket.on('error', error => { result.error = error.message; done(); });
    socket.on('close', (code, reason) => { result.closeCode = code; result.closeReason = reason.toString(); done(); });
  });
  (async () => {
    const statusTask = fetch('https://nexa.orrnn.com/ws/feed/status', { signal: AbortSignal.timeout(10000) })
      .then(async response => ({ httpStatus: response.status, payload: await response.json() }))
      .catch(error => ({ error: error.message }));
    const [native, omitted, hostOrigin, status] = await Promise.all([
      probe('empty-origin-native', { Origin: '' }), probe('no-origin', {}),
      probe('host-origin', { Origin: 'https://nexa.orrnn.com' }), statusTask,
    ]);
    const result = { native, omitted, hostOrigin, status };
    fs.writeFileSync(path.join(__dirname, 'nexa-feed-probe.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  })();
} else if (mode === 'directory') {
  const urls = new Set([
    env.EXPO_PUBLIC_BROKER_DIRECTORY_BASE_URL,
    ...(env.EXPO_PUBLIC_ADDITIONAL_BROKER_DIRECTORY_BASE_URL || '').split(','),
  ].filter(Boolean).map(base => base.replace(/\/+$/, '') + '/broker/servers'));
  (async () => {
    for (const url of urls) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
        const payload = await response.json();
        const rows = Array.isArray(payload) ? payload : payload.servers || payload.data || payload.brokers || [];
        console.log(JSON.stringify({ url, status: response.status, rows: Array.isArray(rows) ? rows.map(row => ({
          broker_id: row.broker_id, broker_name: row.broker_name, server: row.server,
          server_url: row.server_url, services_domain: row.services_domain,
          market_api_url: row.market_api_url, feed_wss_url: row.feed_wss_url,
          feed_status_https_url: row.feed_status_https_url,
        })) : 'unexpected directory shape' }, null, 2));
      } catch (error) { console.log(JSON.stringify({ url, error: error.message })); }
    }
  })();
}
