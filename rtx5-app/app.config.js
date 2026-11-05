const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const readAppJson = () =>
  JSON.parse(fs.readFileSync(path.join(__dirname, 'app.json'), 'utf8'));

const TRUE_VALUES = new Set(['1', 'true', 'yes']);

const isNativeOtaDisabled = TRUE_VALUES.has(
  String(process.env.EXPO_PUBLIC_DISABLE_OTA_UPDATES ?? '').trim().toLowerCase()
);
const forcedExpoVersion = String(process.env.RTX5_FORCE_EXPO_VERSION ?? '').trim();
const forcedRuntimeVersion = String(process.env.RTX5_FORCE_RUNTIME_VERSION ?? '').trim();

const firstString = (...values) => {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
};

const runGitCommand = (command) => {
  try {
    return execSync(command, {
      cwd: __dirname,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
};

const resolveGitCommitSha = () =>
  (
    firstString(
      process.env.EAS_BUILD_GIT_COMMIT_HASH,
      process.env.GITHUB_SHA,
      process.env.RTX5_GIT_COMMIT_SHA,
      runGitCommand('git rev-parse --short=12 HEAD'),
    ) ?? ''
  ).slice(0, 12);

const resolveGitDirty = () => {
  const explicit = String(process.env.RTX5_GIT_DIRTY ?? '').trim();
  if (explicit) {
    return explicit;
  }
  if (process.env.EAS_BUILD_GIT_COMMIT_HASH) {
    return 'false';
  }
  return runGitCommand('git status --short') ? 'true' : 'false';
};

module.exports = ({ config }) => {
  const appJson = readAppJson();
  const easBuildProfile = firstString(
    process.env.EAS_BUILD_PROFILE,
    process.env.RTX5_EAS_BUILD_PROFILE,
    process.env.EXPO_PUBLIC_APP_ENV,
    config.extra?.easBuildProfile,
  );
  const xpremChannel = firstString(
    process.env.RELEASE_CHANNEL,
    process.env.XPREM_CHANNEL,
    appJson.expo.updates?.requestHeaders?.['expo-channel-name'],
    'yoforex-rtx5',
  );
  const xpremAppId = firstString(
    process.env.XPREM_APP_ID,
    appJson.expo.updates?.requestHeaders?.['expo-app-id'],
    'b83d7191-d5ac-4b58-b850-8979759fe290',
  );
  const xpremUpdatesUrl = firstString(
    process.env.XPREM_MANIFEST_URL,
    appJson.expo.updates?.url,
    'https://otadeploy.yopips.com/manifest',
  );
  const expoConfig = {
    ...config,
    ...appJson.expo,
    ...(forcedExpoVersion ? { version: forcedExpoVersion } : {}),
    ...(forcedRuntimeVersion ? { runtimeVersion: forcedRuntimeVersion } : {}),
    updates: {
      ...(config.updates ?? {}),
      ...(appJson.expo.updates ?? {}),
      url: xpremUpdatesUrl,
      requestHeaders: {
        ...(config.updates?.requestHeaders ?? {}),
        ...(appJson.expo.updates?.requestHeaders ?? {}),
        'expo-channel-name': xpremChannel,
        'expo-app-id': xpremAppId,
        'xprem-branch':
          config.updates?.requestHeaders?.['xprem-branch'] ??
          appJson.expo.updates?.requestHeaders?.['xprem-branch'] ??
          '',
      },
    },
    extra: {
      ...(config.extra ?? {}),
      ...(appJson.expo.extra ?? {}),
      sentryDsn:
        process.env.EXPO_PUBLIC_SENTRY_DSN ??
        config.extra?.sentryDsn ??
        appJson.expo.extra?.sentryDsn ??
        '',
      appEnv: process.env.EXPO_PUBLIC_APP_ENV ?? config.extra?.appEnv ?? 'local',
      apiBaseUrl:
        process.env.EXPO_PUBLIC_API_BASE_URL ??
        config.extra?.apiBaseUrl ??
        'https://superadmin-prod.orrnn.com/api/v2',
      brokerDirectoryBaseUrl:
        process.env.EXPO_PUBLIC_BROKER_DIRECTORY_BASE_URL ??
        config.extra?.brokerDirectoryBaseUrl ??
        'https://superadmin-prod.orrnn.com/api/v2',
      gitCommitSha: resolveGitCommitSha(),
      gitDirty: resolveGitDirty(),
      ...(easBuildProfile ? { easBuildProfile } : {}),
    },
  };

  if (!isNativeOtaDisabled) {
    return expoConfig;
  }

  return {
    ...expoConfig,
    updates: {
      enabled: false,
      checkAutomatically: 'NEVER',
      fallbackToCacheTimeout: 0,
    },
  };
};
