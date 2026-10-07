const fs = require('fs');
const path = require('path');
const {
  REQUIRED_BUILD_TOOLS_VERSION,
  formatDoctorReport,
  inspectAndroidEnv,
} = require('./androidEnv');

const projectRoot = path.resolve(__dirname, '..', '..');
const state = inspectAndroidEnv(projectRoot);

console.log(formatDoctorReport(state));

if (state.warnings.length) {
  console.log('\nWarnings:');
  for (const warning of state.warnings) {
    console.log(`- ${warning.message}`);
  }
}

if (!state.issues.length) {
  console.log('\nAndroid toolchain looks ready for `npm run android`.');
  process.exit(0);
}

console.error('\nAndroid environment is not ready:');
for (const issue of state.issues) {
  console.error(`- ${issue.message}`);
}

if (state.sdk.path && state.tools.sdkManager && fs.existsSync(state.tools.sdkManager)) {
  console.error('\nInstall the missing SDK packages with:');
  console.error(
    `"${state.tools.sdkManager}" --sdk_root="${state.sdk.path}" "platform-tools" "platforms;android-36" "build-tools;${REQUIRED_BUILD_TOOLS_VERSION}"`
  );
} else {
  console.error('\nInstall the missing SDK components from Android Studio > SDK Manager:');
  console.error('- Android SDK Command-line Tools (latest)');
  console.error('- Android SDK Platform-Tools');
  console.error('- Android SDK Platform 36');
  console.error(`- Android SDK Build-Tools ${REQUIRED_BUILD_TOOLS_VERSION}`);
}

if (!state.existingAvds.length) {
  console.error('\nNo AVD was found. This is optional for a USB-connected physical device.');
}

process.exit(1);
