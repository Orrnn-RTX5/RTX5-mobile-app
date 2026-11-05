const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const candidates = [
  path.join(
    projectRoot,
    'node_modules',
    'expo',
    'node_modules',
    '@expo',
    'cli',
    'build',
    'src',
    'start',
    'server',
    'AsyncNgrok.js',
  ),
  path.join(
    projectRoot,
    'node_modules',
    '@expo',
    'cli',
    'build',
    'src',
    'start',
    'server',
    'AsyncNgrok.js',
  ),
];

const ngrokServerPath = candidates.find((candidate) => fs.existsSync(candidate));

if (!ngrokServerPath) {
  console.warn('[postinstall] Expo CLI ngrok server not found; skipping tunnel timeout patch.');
  process.exit(0);
}

const source = fs.readFileSync(ngrokServerPath, 'utf8');
const before = 'const TUNNEL_TIMEOUT = 10 * 1000;';
const after = 'const TUNNEL_TIMEOUT = 60 * 1000;';

if (source.includes(after)) {
  process.exit(0);
}

if (!source.includes(before)) {
  console.warn('[postinstall] Expo CLI tunnel timeout shape changed; patch not applied.');
  process.exit(0);
}

fs.writeFileSync(ngrokServerPath, source.replace(before, after));
console.log('[postinstall] Extended Expo ngrok tunnel timeout to 60 seconds.');
