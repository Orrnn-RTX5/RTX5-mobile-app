#!/usr/bin/env node

const { execFileSync } = require('node:child_process');

const args = process.argv.slice(2);
const getArgValue = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : '';
};

const baseRef =
  getArgValue('--base') ||
  getArgValue('-b') ||
  process.env.RTX5_OTA_BASE_REF ||
  '';

const allowMissingBase =
  args.includes('--allow-missing-base') ||
  process.env.RTX5_ALLOW_MISSING_OTA_BASE === 'true';

const allowForcedRuntime =
  process.env.RTX5_ALLOW_FORCE_RUNTIME_VERSION === 'true';

const git = (gitArgs) =>
  execFileSync('git', gitArgs, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

const normalizeChangedPath = (file) =>
  file
    .replace(/\\/g, '/')
    .replace(/^rtx5-app\//, '');

if (process.env.RTX5_FORCE_RUNTIME_VERSION && !allowForcedRuntime) {
  console.error('OTA cannot safely deliver this change. A new binary build is required.');
  console.error('Reason: RTX5_FORCE_RUNTIME_VERSION is set. Do not force a fingerprint runtime unless this is an explicitly approved emergency rollback.');
  process.exit(2);
}

if (!baseRef) {
  if (allowMissingBase) {
    console.warn('[OTA safety] No base binary commit was provided; native-change comparison skipped.');
    process.exit(0);
  }
  console.error('Missing last binary commit. Set RTX5_OTA_BASE_REF or pass --base <commit> before publishing OTA.');
  process.exit(2);
}

try {
  git(['rev-parse', '--verify', `${baseRef}^{commit}`]);
} catch {
  console.error(`Cannot resolve OTA base commit: ${baseRef}`);
  process.exit(2);
}

const changed = new Set();
git(['diff', '--name-only', baseRef, 'HEAD', '--', '.'])
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .forEach((file) => changed.add(normalizeChangedPath(file)));

git(['status', '--porcelain', '--', '.'])
  .split(/\r?\n/)
  .map((line) => line.trimEnd())
  .filter(Boolean)
  .forEach((line) => {
    const rawPath = line.slice(3).trim();
    const path = rawPath.includes(' -> ') ? rawPath.split(' -> ').pop() : rawPath;
    if (path) {
      changed.add(normalizeChangedPath(path));
    }
  });

const nativeImpactPatterns = [
  /^ios\//,
  /^android\//,
  /^app\.json$/,
  /^app\.config\.(js|ts|mjs|cjs)$/,
  /^eas\.json$/,
  /^package\.json$/,
  /^package-lock\.json$/,
  /^yarn\.lock$/,
  /^pnpm-lock\.yaml$/,
  /^bun\.lockb$/,
  /^Podfile(\.lock)?$/,
  /^Gemfile(\.lock)?$/,
  /^gradle\.properties$/,
  /^settings\.gradle/,
  /^build\.gradle/,
  /^google-services\.json$/,
  /^GoogleService-Info\.plist$/,
  /^with[A-Z].*\.js$/,
  /^plugins?\//,
  /^assets\/(adaptive-icon|android-icon|android-adaptive-foreground|icon|splash)/,
  /^\.easignore$/,
  /^metro\.config\./,
  /^babel\.config\./,
];

const unsafeFiles = Array.from(changed)
  .filter((file) => nativeImpactPatterns.some((pattern) => pattern.test(file)))
  .sort();

if (unsafeFiles.length > 0) {
  console.error('OTA cannot safely deliver this change. A new binary build is required.');
  console.error('Native-impacting files changed since the base binary commit:');
  unsafeFiles.forEach((file) => console.error(`- ${file}`));
  process.exit(2);
}

console.log(`[OTA safety] Passed. ${changed.size} changed file(s), 0 native-impacting files since ${baseRef}.`);
