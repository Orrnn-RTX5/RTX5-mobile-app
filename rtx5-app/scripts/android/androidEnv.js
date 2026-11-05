const fs = require('fs');
const os = require('os');
const path = require('path');

const REQUIRED_BUILD_TOOLS_VERSION = '36.0.0';

function unique(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function getSdkCandidates(env = process.env) {
  return unique([
    env.ANDROID_HOME,
    env.ANDROID_SDK_ROOT,
    env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, 'Android', 'Sdk') : null,
    env.USERPROFILE ? path.join(env.USERPROFILE, 'AppData', 'Local', 'Android', 'Sdk') : null,
  ]);
}

function getJavaCandidates(env = process.env) {
  return unique([
    env.JAVA_HOME,
    'C:\\Program Files\\Android\\Android Studio\\jbr',
    'C:\\Program Files\\Android\\Android Studio\\jre',
    env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, 'Programs', 'Android Studio', 'jbr') : null,
    env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, 'Programs', 'Android Studio', 'jre') : null,
  ]);
}

function firstExistingPath(candidates) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function resolveSdkRoot(env = process.env) {
  const candidates = getSdkCandidates(env);
  const pathValue = firstExistingPath(candidates);

  return {
    path: pathValue,
    candidates,
  };
}

function resolveJavaHome(env = process.env) {
  const candidates = getJavaCandidates(env);
  const pathValue = firstExistingPath(candidates);

  return {
    path: pathValue,
    candidates,
  };
}

function getToolPaths(sdkRoot, javaHome) {
  const buildToolsRoot = sdkRoot ? path.join(sdkRoot, 'build-tools') : null;
  const buildToolsVersions = buildToolsRoot && fs.existsSync(buildToolsRoot)
    ? fs.readdirSync(buildToolsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
    : [];

  return {
    adb: sdkRoot ? path.join(sdkRoot, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb') : null,
    emulator: sdkRoot ? path.join(sdkRoot, 'emulator', process.platform === 'win32' ? 'emulator.exe' : 'emulator') : null,
    sdkManager: sdkRoot
      ? path.join(
          sdkRoot,
          'cmdline-tools',
          'latest',
          'bin',
          process.platform === 'win32' ? 'sdkmanager.bat' : 'sdkmanager'
        )
      : null,
    avdManager: sdkRoot
      ? path.join(
          sdkRoot,
          'cmdline-tools',
          'latest',
          'bin',
          process.platform === 'win32' ? 'avdmanager.bat' : 'avdmanager'
        )
      : null,
    buildToolsRoot,
    buildToolsVersions,
    requiredBuildTools: buildToolsRoot ? path.join(buildToolsRoot, REQUIRED_BUILD_TOOLS_VERSION) : null,
    java: javaHome ? path.join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : null,
  };
}

function getExistingAvds(env = process.env) {
  const avdRoot = env.USERPROFILE ? path.join(env.USERPROFILE, '.android', 'avd') : null;
  if (!avdRoot || !fs.existsSync(avdRoot)) {
    return [];
  }

  return fs.readdirSync(avdRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith('.avd'))
    .map((entry) => entry.name.replace(/\.avd$/, ''))
    .sort();
}

function inspectAndroidEnv(projectRoot, env = process.env) {
  const sdk = resolveSdkRoot(env);
  const java = resolveJavaHome(env);
  const tools = getToolPaths(sdk.path, java.path);
  const existingAvds = getExistingAvds(env);
  const issues = [];
  const warnings = [];

  if (!sdk.path) {
    issues.push({
      code: 'missing-sdk',
      message: 'Android SDK root was not found.',
    });
  }

  if (!java.path) {
    issues.push({
      code: 'missing-java',
      message: 'Java runtime was not found. Android Studio JBR is expected at C:\\Program Files\\Android\\Android Studio\\jbr.',
    });
  } else if (!fs.existsSync(tools.java)) {
    issues.push({
      code: 'missing-java-bin',
      message: `JAVA_HOME resolves to ${java.path} but ${tools.java} is missing.`,
    });
  }

  if (sdk.path && !fs.existsSync(tools.adb)) {
    issues.push({
      code: 'missing-adb',
      message: `ADB is missing at ${tools.adb}. Install the Android SDK Platform-Tools package.`,
    });
  }

  if (sdk.path && !fs.existsSync(tools.emulator)) {
    warnings.push({
      code: 'missing-emulator',
      message: `Android emulator binary is missing at ${tools.emulator}. This is optional when using a physical device.`,
    });
  }

  if (sdk.path && !tools.buildToolsVersions.length) {
    issues.push({
      code: 'missing-build-tools',
      message: `Android SDK Build-Tools are not installed under ${tools.buildToolsRoot}. Install Build-Tools ${REQUIRED_BUILD_TOOLS_VERSION}.`,
    });
  } else if (
    sdk.path &&
    tools.buildToolsVersions.length &&
    !tools.buildToolsVersions.includes(REQUIRED_BUILD_TOOLS_VERSION)
  ) {
    issues.push({
      code: 'build-tools-version-mismatch',
      message: `Build-Tools ${REQUIRED_BUILD_TOOLS_VERSION} are required but only found: ${tools.buildToolsVersions.join(', ')}.`,
    });
  }

  if (sdk.path && !existingAvds.length) {
    warnings.push({
      code: 'no-avd',
      message: 'No Android Virtual Device was found under %USERPROFILE%\\.android\\avd.',
    });
  }

  return {
    projectRoot,
    sdk,
    java,
    tools,
    existingAvds,
    issues,
    warnings,
  };
}

function ensureLocalProperties(projectRoot, sdkRoot) {
  if (!sdkRoot) {
    return null;
  }

  const androidRoot = path.join(projectRoot, 'android');
  if (!fs.existsSync(androidRoot)) {
    return null;
  }

  const localPropertiesPath = path.join(androidRoot, 'local.properties');
  const normalizedSdkRoot = sdkRoot.replace(/\\/g, '\\\\');
  const contents = `sdk.dir=${normalizedSdkRoot}${os.EOL}`;

  if (!fs.existsSync(localPropertiesPath) || fs.readFileSync(localPropertiesPath, 'utf8') !== contents) {
    fs.writeFileSync(localPropertiesPath, contents, 'utf8');
  }

  return localPropertiesPath;
}

function buildAndroidEnv(baseEnv, state) {
  const env = { ...baseEnv };

  if (state.sdk.path) {
    env.ANDROID_HOME = state.sdk.path;
    env.ANDROID_SDK_ROOT = state.sdk.path;
  }

  if (state.java.path) {
    env.JAVA_HOME = state.java.path;
  }

  const pathEntries = [];

  if (state.tools.adb) {
    pathEntries.push(path.dirname(state.tools.adb));
  }

  if (state.tools.emulator) {
    pathEntries.push(path.dirname(state.tools.emulator));
  }

  if (state.tools.java) {
    pathEntries.push(path.dirname(state.tools.java));
  }

  env.Path = `${unique(pathEntries).join(path.delimiter)}${path.delimiter}${baseEnv.Path ?? ''}`;

  return env;
}

function formatDoctorReport(state) {
  const sdkDisplay = state.sdk.path ?? '(not found)';
  const javaDisplay = state.java.path ?? '(not found)';
  const buildToolsDisplay = state.tools.buildToolsVersions.length
    ? state.tools.buildToolsVersions.join(', ')
    : '(none)';
  const avdDisplay = state.existingAvds.length ? state.existingAvds.join(', ') : '(none)';

  return [
    `Project: ${state.projectRoot}`,
    `Android SDK: ${sdkDisplay}`,
    `Java Home: ${javaDisplay}`,
    `ADB: ${state.tools.adb && fs.existsSync(state.tools.adb) ? state.tools.adb : '(missing)'}`,
    `Emulator: ${state.tools.emulator && fs.existsSync(state.tools.emulator) ? state.tools.emulator : '(missing)'}`,
    `Build-Tools: ${buildToolsDisplay}`,
    `AVDs: ${avdDisplay}`,
  ].join(os.EOL);
}

module.exports = {
  REQUIRED_BUILD_TOOLS_VERSION,
  buildAndroidEnv,
  ensureLocalProperties,
  formatDoctorReport,
  inspectAndroidEnv,
};
