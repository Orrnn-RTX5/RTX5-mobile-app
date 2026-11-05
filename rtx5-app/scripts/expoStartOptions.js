function createExpoStartOptions(extraArgs, baseEnv, sdkVersion) {
  const useExpoGo = extraArgs.includes('--go');
  if (useExpoGo && extraArgs.includes('--dev-client')) {
    throw new Error('Choose either --go or --dev-client.');
  }

  const args = extraArgs.filter((arg) => arg !== '--go' && arg !== '--dev-client' && arg !== '--offline');
  const hostIndex = args.indexOf('--host');
  const useTunnel = args.includes('--tunnel') || args.includes('--host=tunnel')
    || (hostIndex >= 0 && args[hostIndex + 1] === 'tunnel');
  const portIndex = args.indexOf('--port');
  const inlinePort = args.find((arg) => arg.startsWith('--port='));
  const port = Number(portIndex >= 0 ? args[portIndex + 1] : inlinePort ? inlinePort.slice(7) : baseEnv.RCT_METRO_PORT || 8081);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('The Metro port must be an integer from 1 to 65535.');
  }
  if (useTunnel && extraArgs.includes('--offline')) {
    throw new Error('Tunnel mode needs an online connection; remove --offline.');
  }

  const env = { ...baseEnv };
  if (extraArgs.includes('--offline')) env.EXPO_OFFLINE = '1';
  if (useExpoGo) {
    // Expo Go uses its SDK runtime, not the custom native build fingerprint.
    // Scope this override to the development server, never EAS builds/updates.
    env.RTX5_FORCE_RUNTIME_VERSION ||= `exposdk:${sdkVersion}`;
    // Local startup can use cached Expo metadata when the Expo API is slow.
    // A tunnel still requires Expo's online services.
    env.EXPO_OFFLINE ??= useTunnel ? '0' : '1';
  }

  return {
    useExpoGo,
    port,
    env,
    args: ['start', useExpoGo ? '--go' : '--dev-client', ...args],
    hasExplicitHost: args.includes('--localhost') || args.includes('--lan') || useTunnel
      || hostIndex >= 0 || args.some((arg) => arg.startsWith('--host=')),
  };
}

function selectConnectionOptions(startOptions, usbDeviceAvailable, interfaces) {
  const args = startOptions.args;
  const hostIndex = args.indexOf('--host');
  const inlineHost = args.find((arg) => arg.startsWith('--host='));
  const hostType = args.includes('--tunnel') ? 'tunnel'
    : args.includes('--lan') ? 'lan'
    : args.includes('--localhost') ? 'localhost'
    : inlineHost ? inlineHost.slice(7)
    : hostIndex >= 0 ? args[hostIndex + 1]
    : usbDeviceAvailable ? 'localhost' : 'lan';
  const env = { ...startOptions.env };
  if (hostType === 'lan' && !env.REACT_NATIVE_PACKAGER_HOSTNAME) {
    // On laptops with Ethernet/VPN adapters, advertise the Wi-Fi address used
    // by the phone. Leave Expo's selection alone if there is no unique one.
    const wifiAddresses = Object.entries(interfaces).flatMap(([name, addresses]) =>
      /wi[\s-]?fi|wireless|wlan/i.test(name)
        ? (addresses || []).filter((address) => address.family === 'IPv4'
          && !address.internal && !address.address.startsWith('169.254.'))
          .map((address) => address.address)
        : []);
    if (wifiAddresses.length === 1) env.REACT_NATIVE_PACKAGER_HOSTNAME = wifiAddresses[0];
  }
  return { hostType, hostArg: startOptions.hasExplicitHost ? null : `--${hostType}`, env };
}

module.exports = { createExpoStartOptions, selectConnectionOptions };
