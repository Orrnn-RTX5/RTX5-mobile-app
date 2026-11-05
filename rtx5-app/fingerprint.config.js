module.exports = {
  sourceSkips: [
    'PackageJsonAndroidAndIosScriptsIfNotContainRun',
    'ExpoConfigExtraSection',
  ],
  fileHookTransform: (source, chunk) => {
    if (source.type === 'contents' && source.id === 'expoConfig' && typeof chunk === 'string') {
      try {
        const parsed = JSON.parse(chunk);
        parsed.version = '1.1.30';
        if (parsed.ios && typeof parsed.ios === 'object') {
          parsed.ios.buildNumber = '1';
        }
        if (parsed.android && typeof parsed.android === 'object') {
          delete parsed.android.versionCode;
        }
        return JSON.stringify(parsed);
      } catch {
        return chunk;
      }
    }
    return chunk;
  },
};
