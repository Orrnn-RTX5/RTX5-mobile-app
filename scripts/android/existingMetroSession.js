const http = require('node:http');
const path = require('node:path');
const { isIP } = require('node:net');

function isMetroRunning(port) {
  return new Promise((resolve, reject) => {
    const request = http.get(`http://127.0.0.1:${port}/status`, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('error', reject);
      response.on('end', () => {
        if (response.statusCode === 200 && body.trim() === 'packager-status:running') {
          resolve(true);
        } else {
          reject(new Error(`Port ${port} is occupied by a service that is not Metro.`));
        }
      });
    });
    // A bundle/fingerprint request can briefly occupy the existing Expo process.
    request.setTimeout(15000, () => request.destroy(new Error(`Metro on port ${port} did not respond.`)));
    request.on('error', (error) => {
      if (error.code === 'ECONNREFUSED') resolve(false);
      else reject(error);
    });
  });
}

function androidProjectIntent(port, useExpoGo) {
  const manifestUrl = `http://127.0.0.1:${port}`;
  const url = useExpoGo
    ? `exp://127.0.0.1:${port}`
    : `rtx5://expo-development-client/?url=${encodeURIComponent(manifestUrl)}`;
  return ['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', url,
    '-p', useExpoGo ? 'host.exp.exponent' : 'com.rtx5.app'];
}

async function readMetroManifest(port) {
  const response = await fetch(`http://127.0.0.1:${port}/`, {
    headers: { 'expo-platform': 'android', accept: 'application/expo+json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Could not read the existing Expo manifest (${response.status}).`);
  return response.json();
}

async function reuseMetroSession({ port, useExpoGo, reverseSucceeded, open, probe = isMetroRunning,
  lan = false, tunnel = false, projectRoot, sdkVersion, lanHost, onLanReuse, readManifest = readMetroManifest }) {
  if (!await probe(port)) return false;
  if (lan || tunnel) {
    const manifest = await readManifest(port);
    const client = manifest.extra?.expoClient;
    if (!client?._internal?.projectRoot || path.resolve(client._internal.projectRoot) !== path.resolve(projectRoot)) {
      throw new Error(`Metro on port ${port} does not belong to this project. Stop it or choose another --port.`);
    }
    if (sdkVersion && manifest.runtimeVersion !== sdkVersion) {
      throw new Error('The existing server is using a native runtime. Stop it and run npm run start:lan for Expo Go.');
    }
    const hostUri = client.hostUri;
    if (!hostUri) throw new Error('The existing server has no Expo connection address. Stop it and restart.');
    const hostname = new URL(`http://${hostUri}`).hostname;
    if (tunnel && (isIP(hostname) || ['localhost', '[::1]'].includes(hostname))) {
      throw new Error('The existing server is not using a tunnel. Stop it with Ctrl+C or choose another --port.');
    }
    if (lan && (['127.0.0.1', 'localhost', '[::1]'].includes(hostname) || (lanHost && hostname !== lanHost))) {
      throw new Error(`The existing server advertises ${hostUri}, which is not the selected Wi-Fi address. Stop it with Ctrl+C and run npm run start:lan.`);
    }
    const url = useExpoGo ? `exp://${hostUri}`
      : `rtx5://expo-development-client/?url=${encodeURIComponent(`http://${hostUri}`)}`;
    onLanReuse?.(url);
    return true;
  }
  if (!reverseSucceeded) {
    throw new Error('Metro is already running, but USB forwarding failed. Connect one Android phone and retry.');
  }
  const result = open(androidProjectIntent(port, useExpoGo));
  if (result.error || result.status !== 0 || /Error:|Exception/.test(result.stdout || '')) {
    throw new Error(result.error?.message || result.stderr || result.stdout || 'Could not open the project on Android.');
  }
  return true;
}

module.exports = { isMetroRunning, androidProjectIntent, reuseMetroSession, readMetroManifest };
