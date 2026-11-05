const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const adbPath = path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe');
const targetApk = path.join(process.env.TEMP, 'Expo-Go-54.0.8.apk');
const downloadUrl = 'https://github.com/expo/expo-go-releases/releases/download/Expo-Go-54.0.8/Expo-Go-54.0.8.apk';

async function main() {
  console.log('Downloading Expo Go 54.0.8 APK...');
  const res = await fetch(downloadUrl);
  if (!res.ok) throw new Error(`Download failed: ${res.statusText}`);
  const arrayBuffer = await res.arrayBuffer();
  fs.writeFileSync(targetApk, Buffer.from(arrayBuffer));
  console.log(`Downloaded ${targetApk} (${(fs.statSync(targetApk).size / 1024 / 1024).toFixed(2)} MB)`);

  console.log('Uninstalling incompatible Expo Go version 57 from phone...');
  try {
    execSync(`"${adbPath}" uninstall host.exp.exponent`, { stdio: 'inherit' });
  } catch (e) {
    console.log('Uninstall step finished.');
  }

  console.log('Installing Expo Go 54.0.8 onto your phone (RMX3521)...');
  execSync(`"${adbPath}" install -r -d "${targetApk}"`, { stdio: 'inherit' });
  console.log('Successfully installed Expo Go 54.0.8 on your device!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
