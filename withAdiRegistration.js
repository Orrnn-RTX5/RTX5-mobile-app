const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const ADI_REGISTRATION_TOKEN = 'CVFFBC3LLFRXCAAAAAAAAAAAAA';

const withAdiRegistration = (config) =>
  withDangerousMod(config, [
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

module.exports = withAdiRegistration;
