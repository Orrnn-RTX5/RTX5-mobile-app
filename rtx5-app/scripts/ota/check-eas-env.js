#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const toolchainPath = path.resolve(__dirname, '..', '..', '..', 'WORKSPACE_TOOLCHAIN.json');
const toolchain = JSON.parse(fs.readFileSync(toolchainPath, 'utf8'));
const repositoryRoot = path.dirname(toolchainPath);
const toolRoot = path.join(repositoryRoot, toolchain.jsToolchainDirectory);
const easPackagePath = path.join(toolRoot, 'node_modules', 'eas-cli', 'package.json');
const environment = process.argv[2] || process.env.EAS_ENVIRONMENT || process.env.EXPO_PUBLIC_APP_ENV || '';
const allowed = new Set(['preview', 'staging', 'production']);

if (!allowed.has(environment)) {
  console.error('Usage: node ./scripts/ota/check-eas-env.js <preview|staging|production>');
  process.exit(1);
}

const requiredNames = [
  'EXPO_PUBLIC_APP_ENV',
  'EXPO_PUBLIC_API_BASE_URL',
  'EXPO_PUBLIC_BROKER_DIRECTORY_BASE_URL',
  'EXPO_PUBLIC_DEMO_API_BASE_URL',
  'EXPO_PUBLIC_ORRNN_DEMO_BROKER_ID',
  'EXPO_PUBLIC_ORRNN_DEMO_INITIAL_BALANCE',
  'EXPO_PUBLIC_ORRNN_DEMO_ORIGIN_BROKER',
  'EXPO_PUBLIC_TERMS_URL',
  'EXPO_PUBLIC_PRIVACY_POLICY_URL',
  // Chart candle history after login — without these, OTA builds fail closed
  // ("Candle history contract is unconfigured") even when local .env is correct.
  'EXPO_PUBLIC_CANDLE_HISTORY_PATH',
  'EXPO_PUBLIC_CANDLE_HISTORY_QUERY_STYLE',
  // Broker-scoped SL/TP must never silently return to the locked default in an
  // OTA bundle just because the selected remote EAS environment omitted it.
  'EXPO_PUBLIC_BROKER_SLTP_CAPABILITIES',
];

if (!fs.existsSync(easPackagePath)) {
  console.error('The locked RTX5 JavaScript tools are missing. Run SETUP_NEW_WINDOWS_MACHINE.ps1.');
  process.exit(1);
}

const installedVersion = JSON.parse(fs.readFileSync(easPackagePath, 'utf8')).version;
if (installedVersion !== toolchain.easCli) {
  console.error('The installed EAS CLI differs from WORKSPACE_TOOLCHAIN.json.');
  process.exit(1);
}

const easCliPath = require.resolve('eas-cli/bin/run', { paths: [toolRoot] });
const result = spawnSync(
  process.execPath,
  [easCliPath, 'env:list', '--environment', environment],
  {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(result.status || 1);
}

const output = result.stdout || '';
const configured = new Map();
for (const line of output.split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) {
    configured.set(match[1], match[2].trim());
  }
}

const missing = requiredNames.filter((name) => !configured.has(name));
if (missing.length > 0) {
  console.error(`[OTA env] ${environment} EAS environment is missing required public variables:`);
  missing.forEach((name) => console.error(`- ${name}`));
  console.error('Do not publish OTA for this channel until the EAS environment matches the app config.');
  process.exit(2);
}

const requiredDemoContract = new Map([
  ['EXPO_PUBLIC_DEMO_API_BASE_URL', 'https://demomanager.orrnn.com/api/v1'],
  ['EXPO_PUBLIC_ORRNN_DEMO_BROKER_ID', 'orrnn-demo'],
  ['EXPO_PUBLIC_ORRNN_DEMO_INITIAL_BALANCE', '10000'],
  ['EXPO_PUBLIC_ORRNN_DEMO_ORIGIN_BROKER', 'orrnn-demo-mobile'],
]);
const mismatchedDemoContract = [...requiredDemoContract.entries()].filter(
  ([name, expected]) => configured.get(name) !== expected,
);
if (mismatchedDemoContract.length > 0) {
  console.error(`[OTA env] ${environment} EAS environment has an invalid public demo contract:`);
  mismatchedDemoContract.forEach(([name, expected]) => {
    console.error(`- ${name} must equal ${expected}`);
  });
  console.error('Do not publish OTA for this channel until the EAS demo contract is corrected.');
  process.exit(3);
}

console.log(`[OTA env] ${environment} contains required public env names: ${requiredNames.join(', ')}`);
