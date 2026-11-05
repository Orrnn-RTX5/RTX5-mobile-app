/** Scroll just enough to keep the complete focused field above the keyboard. */
export function resolveLoginFieldScrollOffset(input: {
  fieldTop: number;
  fieldHeight: number;
  viewportTop: number;
  viewportHeight: number;
  keyboardTop: number;
  scrollOffset: number;
}): number {
  const { fieldTop, fieldHeight, viewportTop, viewportHeight, keyboardTop, scrollOffset } = input;
  if (!Object.values(input).every(Number.isFinite) || viewportHeight <= 0 || fieldHeight <= 0) {
    return scrollOffset;
  }
  const gap = 16;
  const visibleTop = viewportTop + gap;
  const visibleBottom = Math.min(viewportTop + viewportHeight, keyboardTop) - gap;
  if (visibleBottom <= visibleTop) return scrollOffset;
  const fieldBottom = fieldTop + fieldHeight;
  if (fieldBottom > visibleBottom) {
    return Math.max(0, scrollOffset + fieldBottom - visibleBottom);
  }
  if (fieldTop < visibleTop) {
    return Math.max(0, scrollOffset + fieldTop - visibleTop);
  }
  return scrollOffset;
}
