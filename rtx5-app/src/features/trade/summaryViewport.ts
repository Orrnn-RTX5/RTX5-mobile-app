/** Keep account summaries scrollable when pinned chrome would crowd the list. */
export function shouldScrollTradingSummary(layout: Readonly<{
  availableHeight: number;
  fontScale: number;
}>): boolean {
  return layout.availableHeight / Math.max(1, layout.fontScale) < 500;
}
