#!/usr/bin/env node

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

const args = process.argv.slice(2);
const getArgValue = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : '';
};

const channel = getArgValue('--channel') || args[0] || process.env.EXPO_PUBLIC_APP_ENV || 'unknown';
const run = (command, commandArgs) =>
  execFileSync(command, commandArgs, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

const safeRun = (command, commandArgs) => {
  try {
    return run(command, commandArgs);
  } catch {
    return '';
  }
};

const expoUpdatesCliPath = require.resolve('expo-updates/bin/cli.js');

const gitSha = safeRun('git', ['rev-parse', '--short=12', 'HEAD']);
const gitDirty = Boolean(safeRun('git', ['status', '--short']));
const appJson = JSON.parse(fs.readFileSync('app.json', 'utf8')).expo;

const resolveRuntime = (platform) => {
  let output = '';
  try {
    output = run(process.execPath, [
      expoUpdatesCliPath,
      'runtimeversion:resolve',
      '--platform',
      platform,
    ]);
  } catch {
    output = '';
  }
  if (!output) return 'unresolved';
  try {
    return JSON.parse(output).runtimeVersion || 'unresolved';
  } catch {
    return output;
  }
};

const context = {
  channel,
  easEnvironment: channel,
  gitSha,
  gitDirty,
  appVersion: appJson.version,
  updatesUrl: appJson.updates?.url ?? null,
  updatesEnabled: appJson.updates?.enabled ?? null,
  checkAutomatically: appJson.updates?.checkAutomatically ?? null,
  runtimePolicy: appJson.runtimeVersion?.policy ?? appJson.runtimeVersion ?? null,
  forcedRuntimeVersion: process.env.RTX5_FORCE_RUNTIME_VERSION || null,
  androidRuntimeVersion: resolveRuntime('android'),
  iosRuntimeVersion: resolveRuntime('ios'),
};

console.log('[OTA context]');
for (const [key, value] of Object.entries(context)) {
  console.log(`${key}: ${value}`);
}
