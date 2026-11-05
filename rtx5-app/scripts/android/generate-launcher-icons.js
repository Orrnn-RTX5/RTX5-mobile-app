const path = require('node:path');
const Jimp = require('jimp-compact');

const projectRoot = path.resolve(__dirname, '../..');

async function main() {
  const config = require('../../app.json').expo;
  const sourcePath = path.resolve(projectRoot, config.icon);
  const source = await Jimp.read(sourcePath);
  const { width, height, data } = source.bitmap;
  if (width !== height) throw new Error('The iOS source icon must be square.');

  // Reuse the actual iOS pixels; never redraw or modify the shared source.
  const background = Jimp.intToRGBA(source.getPixelColor(0, 0));
  const expectedBackground = Jimp.cssColorToHex(config.android.adaptiveIcon.backgroundColor);
  if (source.getPixelColor(0, 0) !== expectedBackground) {
    throw new Error('The Android background must match the iOS artwork.');
  }

  // Android's 108 dp layer has a guaranteed central 66 dp circular safe zone.
  // Fit the original artwork radially so the long X tips survive every mask.
  let artworkRadius = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const contrast = Math.max(
        Math.abs(data[index] - background.r),
        Math.abs(data[index + 1] - background.g),
        Math.abs(data[index + 2] - background.b),
      );
      if (contrast > 8) {
        artworkRadius = Math.max(
          artworkRadius,
          Math.hypot(x - (width - 1) / 2, y - (height - 1) / 2),
        );
      }
    }
  }
  if (!artworkRadius) throw new Error('No artwork found in the source icon.');
  const safeRadius = (width * 66) / 108 / 2;
  const artworkSize = Math.floor(width * (safeRadius - 3) / artworkRadius);
  const offset = Math.floor((width - artworkSize) / 2);
  const foreground = new Jimp(width, height, 0x00000000);
  // Keep the source's matte and edge colors intact. Its dark square blends
  // exactly into the identical Android background, with no baked-in mask.
  foreground.composite(
    source.clone().resize(artworkSize, artworkSize, Jimp.RESIZE_BICUBIC),
    offset,
    offset,
  );
  await foreground.writeAsync(
    path.resolve(projectRoot, config.android.adaptiveIcon.foregroundImage),
  );

  // The user selected the rounded-square preview. Give legacy launchers
  // that exact composition and corner shape, without a wallpaper border.
  const viewport = Math.round(width * 72 / 108);
  const viewportInset = Math.floor((width - viewport) / 2);
  const visibleArtwork = new Jimp(viewport, viewport, expectedBackground);
  visibleArtwork.composite(
    foreground.clone().crop(viewportInset, viewportInset, viewport, viewport), 0, 0,
  );
  const selectedIcon = new Jimp(width, height, expectedBackground);
  selectedIcon.composite(
    visibleArtwork.resize(width, height, Jimp.RESIZE_BICUBIC),
    0,
    0,
  );
  const cornerRadius = width * 0.2;
  selectedIcon.scan(0, 0, width, height, (x, y, index) => {
    const cornerX = Math.max(cornerRadius, Math.min(width - cornerRadius, x + 0.5));
    const cornerY = Math.max(cornerRadius, Math.min(height - cornerRadius, y + 0.5));
    const coverage = Math.max(0, Math.min(1,
      cornerRadius + 0.5 - Math.hypot(x + 0.5 - cornerX, y + 0.5 - cornerY),
    ));
    selectedIcon.bitmap.data[index + 3] = Math.round(255 * coverage);
  });
  await selectedIcon.writeAsync(path.resolve(projectRoot, config.android.icon));
  console.log(`Android icons generated from the unchanged iOS icon (${artworkSize}px artwork canvas).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
