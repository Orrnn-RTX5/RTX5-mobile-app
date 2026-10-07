type Insets = Readonly<{ top: number; bottom: number; left: number; right: number }>;

/** The native dialog gets a complete frame before its content is measured. */
export function getLogoutDialogLayout(width: number, height: number, fontScale: number, insets: Insets) {
  const paddingTop = insets.top + 20;
  const paddingBottom = insets.bottom + 20;
  return Object.freeze({
    viewportWidth: width,
    viewportHeight: height,
    paddingTop,
    paddingBottom,
    width: Math.max(0, Math.min(360, width - insets.left - insets.right - 40)),
    height: Math.max(0, Math.min(height - paddingTop - paddingBottom, 240 * Math.max(1, fontScale))),
  });
}
