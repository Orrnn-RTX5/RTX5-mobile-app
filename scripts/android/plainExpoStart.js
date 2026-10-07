const path = require('node:path');

function getPlainExpoStartArgs(argv, cwd, projectRoot) {
  if (path.resolve(cwd) !== path.resolve(projectRoot) || argv[0] !== 'start') return null;
  // Explicit runtimes and other platforms retain the unmodified Expo CLI.
  // In particular, the USB launcher's child uses --go, preventing recursion.
  if (argv.some((arg) => ['--go', '-g', '--dev-client', '-d', '--web', '-w', '--ios', '-i', '--help', '-h'].includes(arg))) return null;
  // A positional project path is Expo's responsibility. Forward only options
  // supported by the existing launcher, including their values.
  const valueOptions = new Set(['--port', '-p', '--host', '-m', '--max-workers', '--scheme', '--private-key-path']);
  for (let index = 1; index < argv.length; index += 1) {
    if (valueOptions.has(argv[index])) { index += 1; continue; }
    if (!argv[index].startsWith('-')) return null;
  }
  const aliases = { '-p': '--port', '-m': '--host', '-a': '--android', '-c': '--clear' };
  const args = argv.slice(1).map((arg) => aliases[arg] || arg);
  const hasHost = args.some((arg) => ['--lan', '--localhost', '--tunnel', '--host'].includes(arg)
    || arg.startsWith('--host='));
  return ['--go', ...(hasHost ? [] : ['--tunnel']), ...args];
}

function routePlainExpoStart(projectRoot) {
  const args = getPlainExpoStartArgs(process.argv.slice(2), process.cwd(), projectRoot);
  if (!args) return false;
  const launcher = path.join(projectRoot, 'scripts/android/start-dev-client-usb.js');
  process.argv = [process.execPath, launcher, ...args];
  console.log('[expo:start] Starting Expo Go with a terminal QR code.');
  require(launcher);
  return true;
}

module.exports = { getPlainExpoStartArgs, routePlainExpoStart };
