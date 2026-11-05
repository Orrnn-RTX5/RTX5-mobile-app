const fs = require('node:fs');
const path = require('node:path');

const marker = '// RTX5 plain Expo start compatibility';
function patchExpoCli(source) {
  if (source.includes(marker)) return source;
  const entry = "require('@expo/cli');";
  if (!source.includes(entry)) throw new Error('Expo CLI entry changed; USB startup patch could not be applied.');
  return source.replace(entry, `${marker}
const rtx5ProjectRoot = require('node:path').resolve(__dirname, '../../..');
const rtx5StartHook = require('node:path').join(rtx5ProjectRoot, 'scripts/android/plainExpoStart.js');
if (!require('node:fs').existsSync(rtx5StartHook) || !require(rtx5StartHook).routePlainExpoStart(rtx5ProjectRoot)) {
  require('@expo/cli');
}`);
}

if (require.main === module) {
  const projectRoot = path.resolve(__dirname, '..');
  const cli = path.join(path.dirname(require.resolve('expo/package.json', { paths: [projectRoot] })), 'bin/cli');
  const source = fs.readFileSync(cli, 'utf8');
  const patched = patchExpoCli(source);
  if (patched !== source) {
    fs.writeFileSync(cli, patched);
    console.log('[postinstall] Plain npx expo start now uses the project USB launcher.');
  }

  if (process.platform === 'linux' && (process.env.EAS_BUILD || process.env.CI)) {
    try {
      const os = require('node:os');
      const gradleOverrides = [
        'org.gradle.parallel=false',
        'org.gradle.workers.max=2',
        'org.gradle.jvmargs=-Xmx2560m -XX:MaxMetaspaceSize=512m -XX:+UseG1GC -XX:+UseStringDeduplication -Dfile.encoding=UTF-8',
        'kotlin.daemon.jvmargs=-Xmx1024m -XX:MaxMetaspaceSize=384m',
        'reactNativeArchitectures=arm64-v8a',
        'android.enableMinifyInReleaseBuilds=false',
        'android.enableShrinkResourcesInReleaseBuilds=false',
      ];

      const gradleUserHome = process.env.GRADLE_USER_HOME || path.join(os.homedir(), '.gradle');
      fs.mkdirSync(gradleUserHome, { recursive: true });
      const userPropsPath = path.join(gradleUserHome, 'gradle.properties');
      fs.writeFileSync(userPropsPath, gradleOverrides.join('\n') + '\n', 'utf8');

      const androidPropsPath = path.join(projectRoot, 'android', 'gradle.properties');
      if (fs.existsSync(androidPropsPath)) {
        let androidProps = fs.readFileSync(androidPropsPath, 'utf8');
        androidProps = androidProps
          .replace(/^org\.gradle\.jvmargs=.*$/gm, 'org.gradle.jvmargs=-Xmx2560m -XX:MaxMetaspaceSize=512m -XX:+UseG1GC -XX:+UseStringDeduplication -Dfile.encoding=UTF-8')
          .replace(/^org\.gradle\.parallel=.*$/gm, 'org.gradle.parallel=false')
          .replace(/^reactNativeArchitectures=.*$/gm, 'reactNativeArchitectures=arm64-v8a')
          .replace(/^android\.enableMinifyInReleaseBuilds=.*$/gm, 'android.enableMinifyInReleaseBuilds=false')
          .replace(/^android\.enableShrinkResourcesInReleaseBuilds=.*$/gm, 'android.enableShrinkResourcesInReleaseBuilds=false');
        androidProps += '\n' + gradleOverrides.join('\n') + '\n';
        fs.writeFileSync(androidPropsPath, androidProps, 'utf8');
        console.log('[postinstall] Patched android/gradle.properties for fast EAS Play Store AAB build (arm64-v8a, R8 skipped, sequential).');
      } else {
        console.log('[postinstall] Configured ~/.gradle/gradle.properties for EAS Linux build.');
      }
    } catch (err) {
      console.warn('[postinstall] Could not configure Gradle properties:', err.message);
    }
  }
}

module.exports = { patchExpoCli };
