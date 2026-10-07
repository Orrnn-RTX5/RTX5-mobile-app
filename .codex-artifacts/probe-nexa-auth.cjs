const WS = require('../rtx5-app/node_modules/ws');
const fake = 'diagnostic-invalid-token';
const variants = [
  ['bearer', '', { Authorization: `Bearer ${fake}` }],
  ['token-query', `?token=${fake}`, {}],
  ['access-token-query', `?access_token=${fake}`, {}],
  ['broker-token-query', `?broker_token=${fake}`, {}],
  ['broker-token-header', '', { 'X-Broker-Token': fake }],
];
const probe = ([name, query, headers]) => new Promise(resolve => {
  const result = { name };
  const socket = new WS(`wss://nexa.orrnn.com/ws/feed${query}`, { headers: { Origin: '', ...headers }, handshakeTimeout: 8000 });
  const timer = setTimeout(() => { socket.terminate(); resolve(result); }, 10000);
  const done = () => { clearTimeout(timer); resolve(result); };
  socket.on('open', () => { result.opened = true; socket.close(); done(); });
  socket.on('unexpected-response', (_, response) => {
    result.status = response.statusCode;
    let body = '';
    response.on('data', chunk => body += chunk);
    response.on('end', () => { result.body = body.slice(0, 500); socket.terminate(); done(); });
  });
  socket.on('error', () => done());
  socket.on('close', () => done());
});
Promise.all(variants.map(probe)).then(results => console.log(JSON.stringify(results, null, 2)));
