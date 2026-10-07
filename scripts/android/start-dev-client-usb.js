const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { createExpoStartOptions, selectConnectionOptions } = require('../expoStartOptions');
const { networkInterfaces } = require('node:os');
const { reuseMetroSession, readMetroManifest } = require('./existingMetroSession');
const { printProjectQr, watchStartupQr } = require('./terminalQr');
const {
  buildAndroidEnv,
  formatDoctorReport,
  inspectAndroidEnv,
} = require('./androidEnv');

const projectRoot = path.resolve(__dirname, '..', '..');
const state = inspectAndroidEnv(projectRoot);
const sdkVersion = `${require('expo/package.json').version.split('.')[0]}.0.0`;
const reuseOnly = process.argv.includes('--reuse-only');
const startOptions = createExpoStartOptions(process.argv.slice(2).filter((arg) => arg !== '--reuse-only'), process.env, sdkVersion);

if (!startOptions.useExpoGo && state.issues.length) {
  console.error(formatDoctorReport(state));
  console.error('\nAndroid environment is not ready for USB dev-client startup.');
  process.exit(1);
}

let env = buildAndroidEnv(startOptions.env, state);
const adbCommand = state.tools.adb && fs.existsSync(state.tools.adb) ? state.tools.adb : 'adb';
const adbAvailable = spawnSync(adbCommand, ['version'], { env, stdio: 'ignore', timeout: 3000 }).status === 0;
const adbDevices = adbAvailable
  ? spawnSync(adbCommand, ['devices'], { env, encoding: 'utf8', timeout: 10000 })
  : null;
const usbDeviceAvailable = adbDevices?.status === 0 && /\tdevice(?:\r?\n|$)/.test(adbDevices.stdout || '');
const connection = selectConnectionOptions(startOptions, usbDeviceAvailable, networkInterfaces());
env = buildAndroidEnv(connection.env, state);
const reversePort = `tcp:${startOptions.port}`;

let reverseSucceeded = false;

function ensureAdbReverse({ stdio = 'ignore', timeout = 3000 } = {}) {
  if (!adbAvailable) {
    return false;
  }

  const reverseResult = spawnSync(
    adbCommand,
    ['reverse', reversePort, reversePort],
    {
      cwd: projectRoot,
      env,
      stdio,
      timeout,
    },
  );

  return reverseResult.status === 0;
}

if (adbAvailable && (usbDeviceAvailable || connection.hostType === 'localhost' || reuseOnly)) {
  // USB can need a moment to reconnect. Do not switch to an unreachable LAN
  // address just because the first forwarding command timed out.
  reverseSucceeded = ensureAdbReverse({ stdio: 'inherit', timeout: 10000 });
  if (!reverseSucceeded) {
    reverseSucceeded = ensureAdbReverse({ stdio: 'inherit', timeout: 10000 });
  }

  if (!reverseSucceeded) {
    console.warn(usbDeviceAvailable
      ? `\n[android:usb] Waiting for USB forwarding ${reversePort}; Expo will retry when opening the phone.`
      : `\n[android:usb] Waiting for a phone and USB forwarding ${reversePort}. Use --lan for Wi-Fi.`);
  }
}

const hostArg = connection.hostArg;

const expoArgs = [...startOptions.args];

if (hostArg) {
  expoArgs.push(hostArg);
}
// Starting Metro alone leaves the phone on a previously failed LAN/tunnel URL.
// Open the project when USB forwarding is ready, using Expo's selected runtime.
if (connection.hostType === 'localhost' && (reverseSucceeded || usbDeviceAvailable) && !expoArgs.includes('--android')) {
  expoArgs.push('--android');
}

async function launch() {
  const reused = await reuseMetroSession({
    port: startOptions.port,
    useExpoGo: startOptions.useExpoGo,
    reverseSucceeded,
    lan: !reuseOnly && connection.hostType === 'lan',
    tunnel: !reuseOnly && connection.hostType === 'tunnel',
    projectRoot,
    sdkVersion: startOptions.useExpoGo ? `exposdk:${sdkVersion}` : undefined,
    lanHost: env.REACT_NATIVE_PACKAGER_HOSTNAME,
    onLanReuse: (url) => {
      printProjectQr(url);
    },
    open: (args) => spawnSync(adbCommand, args, {
      cwd: projectRoot, env, encoding: 'utf8', timeout: 10000,
    }),
  });
  if (reused) {
    console.log(`[android:${connection.hostType}] Reused the existing Metro server on port ${startOptions.port}. No new server started.`);
    return;
  }
  if (reuseOnly) {
    throw new Error(`No Metro server is running on port ${startOptions.port}. No new server started.`);
  }

  // Launch Node directly: spawning npx.cmd is unreliable on Windows and paths with spaces.
  const expoCliPath = path.join(path.dirname(require.resolve('expo/package.json')), 'bin', 'cli');
  const child = spawn(process.execPath, [expoCliPath, ...expoArgs], {
    cwd: projectRoot,
    env,
    stdio: process.stdout.isTTY ? 'inherit' : ['inherit', 'pipe', 'pipe'],
  });
  let stopQrWatcher = () => {};
  if (!process.stdout.isTTY) {
    child.stdout.pipe(process.stdout, { end: false });
    child.stderr.pipe(process.stderr, { end: false });
    let startupOutput = '';
    let watchingQr = false;
    child.stdout.on('data', (chunk) => {
      startupOutput = (startupOutput + chunk.toString()).slice(-2000);
      if (watchingQr || !startupOutput.includes('Logs for your project will appear below.')) return;
      watchingQr = true;
      stopQrWatcher = watchStartupQr({
        port: startOptions.port,
        hostType: connection.hostType,
        useExpoGo: startOptions.useExpoGo,
        projectRoot,
        sdkVersion: `exposdk:${sdkVersion}`,
        readManifest: readMetroManifest,
        prepare: async (manifest) => {
          if (!manifest.launchAsset?.url) return;
          console.log('\nPreparing the Android app before showing the QR...');
          const bundleUrl = new URL(manifest.launchAsset.url);
          bundleUrl.protocol = 'http:';
          bundleUrl.host = `127.0.0.1:${startOptions.port}`;
          const response = await fetch(bundleUrl, { signal: AbortSignal.timeout(180000) });
          if (!response.ok) throw new Error(`Android bundle failed (${response.status}).`);
          for await (const chunk of response.body) { /* drain without retaining the bundle */ }
        },
      });
    });
  }

  let reverseWasHealthy = reverseSucceeded;
  let pendingUsbOpen = adbAvailable && connection.hostType === 'localhost' && !expoArgs.includes('--android');
  let openingUsbApp = false;
  const openRecoveredUsbSession = async () => {
    if (!pendingUsbOpen || openingUsbApp) return;
    openingUsbApp = true;
    try {
      const opened = await reuseMetroSession({
        port: startOptions.port,
        useExpoGo: startOptions.useExpoGo,
        reverseSucceeded: true,
        open: (args) => spawnSync(adbCommand, args, { cwd: projectRoot, env, encoding: 'utf8', timeout: 10000 }),
      });
      if (opened) {
        pendingUsbOpen = false;
        console.log(`[android:usb] Opened the project after USB forwarding recovered on port ${startOptions.port}.`);
      }
    } catch (error) {
      console.warn(`[android:usb] Waiting to open the USB project: ${error.message}`);
    } finally {
      openingUsbApp = false;
    }
  };
  const reverseKeepAlive = adbAvailable && connection.hostType === 'localhost'
    ? setInterval(() => {
      if (ensureAdbReverse()) {
        if (!reverseWasHealthy) {
          console.log(`[android:usb] ADB reverse ${reversePort} restored.`);
        }
        reverseWasHealthy = true;
        void openRecoveredUsbSession();
        return;
      }

      if (reverseWasHealthy) {
        console.warn(`[android:usb] Waiting for ADB reverse ${reversePort} to be restored...`);
      }
      reverseWasHealthy = false;
    }, 5000)
    : null;

  child.on('exit', (code, signal) => {
    stopQrWatcher();
    if (reverseKeepAlive) {
      clearInterval(reverseKeepAlive);
    }

    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 1);
  });

  child.on('error', (error) => {
    stopQrWatcher();
    if (reverseKeepAlive) {
      clearInterval(reverseKeepAlive);
    }

    console.error(`Failed to start Expo session: ${error.message}`);
    process.exit(1);
  });
}

launch().catch((error) => {
  console.error(`[android:usb] ${error.message}`);
  process.exitCode = 1;
});
