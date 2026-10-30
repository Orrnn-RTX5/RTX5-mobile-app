type Insets = Readonly<{ top: number; bottom: number; left: number; right: number }>;

/** Stable viewport bounds let the card fit its content within the safe area. */
export function getLogoutDialogLayout(width: number, height: number, fontScale: number, insets: Insets) {
  const paddingTop = insets.top + 20;
  const paddingBottom = insets.bottom + 20;
  const paddingLeft = insets.left + 20;
  const paddingRight = insets.right + 20;
  const dialogWidth = Math.max(0, Math.min(380, width - paddingLeft - paddingRight));
  const stackActions = dialogWidth < 300 || fontScale >= 1.4;
  return Object.freeze({
    viewportWidth: width,
    viewportHeight: height,
    paddingTop,
    paddingBottom,
    paddingLeft,
    paddingRight,
    contentPaddingHorizontal: dialogWidth < 320 ? 20 : 24,
    contentPaddingVertical: 20,
    stackActions,
    width: dialogWidth,
    maxHeight: Math.max(0, height - paddingTop - paddingBottom),
  });
}
