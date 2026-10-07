const { spawn } = require('child_process');
const path = require('path');
const {
  buildAndroidEnv,
  ensureLocalProperties,
  formatDoctorReport,
  inspectAndroidEnv,
} = require('./androidEnv');

const projectRoot = path.resolve(__dirname, '..', '..');
const state = inspectAndroidEnv(projectRoot);

if (state.issues.length) {
  console.error(formatDoctorReport(state));
  console.error('\nAndroid environment is not ready. Run `npm run doctor:android` for the full checklist.');
  process.exit(1);
}

ensureLocalProperties(projectRoot, state.sdk.path);

const env = buildAndroidEnv(process.env, state);
const expoArgs = ['expo', 'run:android', ...process.argv.slice(2)];
const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const child = spawn(command, expoArgs, {
  cwd: projectRoot,
  env,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});

child.on('error', (error) => {
  console.error(`Failed to start Expo Android runner: ${error.message}`);
  process.exit(1);
});
