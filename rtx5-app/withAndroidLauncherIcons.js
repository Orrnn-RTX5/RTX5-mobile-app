const { withFinalizedMod } = require('@expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');
const Jimp = require('jimp-compact');

module.exports = function withAndroidLauncherIcons(config) {
  return withFinalizedMod(config, ['android', async (modConfig) => {
    const projectRoot = modConfig.modRequest.projectRoot;
    const resRoot = path.join(modConfig.modRequest.platformProjectRoot, 'app/src/main/res');
    const icon = await Jimp.read(path.resolve(projectRoot, modConfig.android.icon));
    const foreground = await Jimp.read(
      path.resolve(projectRoot, modConfig.android.adaptiveIcon.foregroundImage),
    );
    // Match the adaptive icon's visible 72 dp viewport on Android 7.1's
    // legacy round icon. Do not add a second circle or extra padding.
    const viewport = Math.round(foreground.bitmap.width * 72 / 108);
    const inset = Math.floor((foreground.bitmap.width - viewport) / 2);
    const roundArtwork = foreground.clone().crop(inset, inset, viewport, viewport);
    const background = Jimp.cssColorToHex(modConfig.android.adaptiveIcon.backgroundColor);

    for (const [density, size] of Object.entries({
      mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192,
    })) {
      const directory = path.join(resRoot, `mipmap-${density}`);
      await fs.mkdir(directory, { recursive: true });
      // Expo SDK 54 otherwise uses the padded adaptive foreground for the
      // legacy icon too, ignoring android.icon. Use the selected rounded square.
      const source = await icon.clone().resize(size, size).getBufferAsync(Jimp.MIME_PNG);
      await fs.writeFile(path.join(directory, 'ic_launcher.webp'), source);
      const round = new Jimp(size, size, background);
      round.composite(roundArtwork.clone().resize(size, size, Jimp.RESIZE_BICUBIC), 0, 0);
      round.circle();
      // Expo's generated files use the .webp name with PNG bytes when its
      // Jimp fallback is active. Android detects the format from the bytes.
      await fs.writeFile(path.join(directory, 'ic_launcher_round.webp'), await round.getBufferAsync(Jimp.MIME_PNG));
    }
    return modConfig;
  }]);
};
