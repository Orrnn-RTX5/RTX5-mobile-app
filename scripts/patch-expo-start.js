const fs = require('node:fs');
const path = require('node:path');

const marker = '// RTX5 plain Expo start compatibility';
function patchExpoCli(source) {
  if (source.includes(marker)) return source;
  const entry = "require('@expo/cli');";
  if (!source.includes(entry)) throw new Error('Expo CLI entry changed; USB startup patch could not be applied.');
  return source.replace(entry, `${marker}
const rtx5ProjectRoot = require('node:path').resolve(__dirname, '../../..');
const rtx5StartHook = require('node:path').join(rtx5ProjectRoot, 'scripts/android/plainExpoStart.js');
if (!require('node:fs').existsSync(rtx5StartHook) || !require(rtx5StartHook).routePlainExpoStart(rtx5ProjectRoot)) {
  require('@expo/cli');
}`);
}

if (require.main === module) {
  const projectRoot = path.resolve(__dirname, '..');
  const cli = path.join(path.dirname(require.resolve('expo/package.json', { paths: [projectRoot] })), 'bin/cli');
  const source = fs.readFileSync(cli, 'utf8');
  const patched = patchExpoCli(source);
  if (patched !== source) {
    fs.writeFileSync(cli, patched);
    console.log('[postinstall] Plain npx expo start now uses the project USB launcher.');
  }
}

module.exports = { patchExpoCli };
