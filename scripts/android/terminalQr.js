const path = require('node:path');
const { isIP } = require('node:net');

function printProjectQr(url) {
  const expoRoot = path.dirname(require.resolve('expo/package.json'));
  const cliRoot = path.dirname(require.resolve('@expo/cli', { paths: [expoRoot] }));
  const qr = require(require.resolve('qrcode-terminal', { paths: [cliRoot] }));
  console.log('\nRTX5 - Scan this QR in Expo Go\n');
  qr.generate(url, { small: true });
  console.log(`\nProject URL: ${url}`);
  console.log('Android: use Expo Go for SDK 54. Keep this terminal open.');
}

// Expo omits its QR when stdout is redirected (including task terminals).
// Wait for the manifest's final connection address, then print a QR ourselves.
function watchStartupQr({ port, hostType, useExpoGo, projectRoot, sdkVersion,
  readManifest, prepare, print = printProjectQr, intervalMs = 1000 }) {
  let stopped = false;
  let reading = false;
  const stop = () => { stopped = true; clearInterval(timer); };
  const timer = setInterval(async () => {
    if (reading || stopped) return;
    reading = true;
    try {
      const manifest = await readManifest(port);
      if (stopped) return;
      const client = manifest.extra?.expoClient;
      if (!client?.hostUri || !client._internal?.projectRoot) return;
      if (path.resolve(client._internal.projectRoot) !== path.resolve(projectRoot)) return;
      if (useExpoGo && manifest.runtimeVersion !== sdkVersion) return;
      const hostname = new URL(`http://${client.hostUri}`).hostname;
      const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(hostname);
      if (hostType === 'tunnel' && (isIP(hostname) || loopback)) return;
      if (hostType === 'lan' && loopback) return;
      const url = useExpoGo ? `exp://${client.hostUri}`
        : `rtx5://expo-development-client/?url=${encodeURIComponent(`http://${client.hostUri}`)}`;
      if (prepare) await prepare(manifest);
      if (stopped) return;
      print(url);
      stop();
    } catch {
      // Startup and tunnel connection can take a moment; retry while Metro lives.
    } finally {
      reading = false;
    }
  }, intervalMs);
  return stop;
}

module.exports = { printProjectQr, watchStartupQr };
