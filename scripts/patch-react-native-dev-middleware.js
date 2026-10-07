const fs = require('fs');
const path = require('path');

const launcherPath = path.join(
  __dirname,
  '..',
  'node_modules',
  '@react-native',
  'dev-middleware',
  'dist',
  'utils',
  'DefaultBrowserLauncher.js',
);

if (!fs.existsSync(launcherPath)) {
  console.warn('[postinstall] React Native dev middleware launcher not found; skipping debugger patch.');
  process.exit(0);
}

const source = fs.readFileSync(launcherPath, 'utf8');

if (source.includes('childProcess.on("spawn", () => {')) {
  process.exit(0);
}

const before = `      childProcess.on("data", () => {
        resolve();
      });`;

const after = `      childProcess.on("spawn", () => {
        childProcess.unref();
        resolve();
      });
      childProcess.on("error", reject);`;

if (!source.includes(before)) {
  console.warn('[postinstall] React Native dev middleware launcher shape changed; debugger patch not applied.');
  process.exit(0);
}

fs.writeFileSync(launcherPath, source.replace(before, after));
console.log('[postinstall] Patched React Native DevTools browser launcher.');
