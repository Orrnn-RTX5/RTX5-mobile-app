const { withDangerousMod, withGradleProperties } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const ADI_REGISTRATION_TOKEN = 'CVFFBC3LLFRXCAAAAAAAAAAAAA';

const setGradleProp = (props, key, value) => {
  const existing = props.find((item) => item.type === 'property' && item.key === key);
  if (existing) {
    existing.value = value;
  } else {
    props.push({ type: 'property', key, value });
  }
};

const withAdiRegistration = (config) => {
  config = withGradleProperties(config, (modConfig) => {
    setGradleProp(modConfig.modResults, 'reactNativeArchitectures', 'arm64-v8a,armeabi-v7a');
    setGradleProp(modConfig.modResults, 'org.gradle.workers.max', '2');
    setGradleProp(
      modConfig.modResults,
      'org.gradle.jvmargs',
      '-Xmx4096m -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8',
    );
    return modConfig;
  });

  return withDangerousMod(config, [
    'android',
    async (config) => {
      const assetsPath = path.join(config.modRequest.platformProjectRoot, 'app', 'src', 'main', 'assets');
      const filePath = path.join(assetsPath, 'adi-registration.properties');

      if (!fs.existsSync(assetsPath)) {
        fs.mkdirSync(assetsPath, { recursive: true });
      }

      fs.writeFileSync(filePath, `${ADI_REGISTRATION_TOKEN}\n`);
      return config;
    },
  ]);
};

module.exports = withAdiRegistration;

