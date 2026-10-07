const { withDangerousMod, withAndroidManifest } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withNetworkSecurityConfig = (config) => {
  // 1. Point the manifest to the XML
  config = withAndroidManifest(config, (config) => {
    const mainApplication = config.modResults.manifest.application[0];
    mainApplication.$['android:networkSecurityConfig'] = '@xml/network_security_config';

    // Remove the global usesCleartextTraffic if it exists to ensure strict security
    if (mainApplication.$['android:usesCleartextTraffic'] !== undefined) {
      delete mainApplication.$['android:usesCleartextTraffic'];
    }

    return config;
  });

  // 2. Create the XML file in Android app/src/main/res/xml
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const writeConfig = (sourceSet, xmlContent) => {
        const resPath = path.join(config.modRequest.platformProjectRoot, 'app', 'src', sourceSet, 'res', 'xml');
        const filePath = path.join(resPath, 'network_security_config.xml');

        if (!fs.existsSync(resPath)) {
          fs.mkdirSync(resPath, { recursive: true });
        }

        fs.writeFileSync(filePath, xmlContent);
      };

      // Default to TLS-only traffic. The test broker directory currently
      // includes one HTTP-only broker backend, so allow cleartext only for
      // that explicit host instead of weakening the whole app.
      const productionXml = `<?xml version="1.0" encoding="utf-8"?>
<!-- Network security config for Android production builds. -->
<network-security-config>
    <base-config cleartextTrafficPermitted="false" />
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">69.197.178.27</domain>
    </domain-config>
</network-security-config>
`;

      // Debug/dev-client builds need local cleartext access for Metro when
      // running over USB reverse or emulator host loopback.
      const debugXml = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="false" />
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">127.0.0.1</domain>
        <domain includeSubdomains="false">localhost</domain>
        <domain includeSubdomains="false">10.0.2.2</domain>
        <domain includeSubdomains="false">69.197.178.27</domain>
    </domain-config>
</network-security-config>
`;

      writeConfig('main', productionXml);
      writeConfig('debug', debugXml);
      writeConfig('debugOptimized', debugXml);
      return config;
    },
  ]);

  return config;
};

module.exports = withNetworkSecurityConfig;
