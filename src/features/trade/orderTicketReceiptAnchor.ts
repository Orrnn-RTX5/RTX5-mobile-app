type ReceiptGeometry = {
  rootHeight: number;
  viewportTop: number;
  viewportHeight: number;
  actionsTop: number;
  scrollOffset: number;
};
export type OrderTicketReceiptPlacement = Readonly<{ top: number; bottom: number }> | null;
export type OrderTicketReceiptAnchor = ReturnType<typeof createOrderTicketReceiptAnchor>;

/** Publish only popup placement changes; scrolling never rerenders the ticket. */
export function createOrderTicketReceiptAnchor() {
  const geometry: ReceiptGeometry = {
    rootHeight: 0, viewportTop: 0, viewportHeight: 0, actionsTop: Number.NaN, scrollOffset: 0,
  };
  let placement: OrderTicketReceiptPlacement = null;
  const listeners = new Set<() => void>();
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => placement,
    update(patch: Partial<ReceiptGeometry>) {
      Object.assign(geometry, patch);
      const { rootHeight, viewportTop, viewportHeight, actionsTop, scrollOffset } = geometry;
      const buttonTop = viewportTop + actionsTop - scrollOffset;
      const top = viewportTop + 8;
      const next = [rootHeight, viewportTop, viewportHeight, actionsTop, scrollOffset].every(Number.isFinite)
        && rootHeight > 0 && viewportHeight > 0 && buttonTop > top + 8
        && buttonTop <= viewportTop + viewportHeight
        ? { top, bottom: rootHeight - buttonTop + 8 }
        : null;
      if (placement?.top === next?.top && placement?.bottom === next?.bottom) return;
      placement = next;
      listeners.forEach(listener => listener());
    },
  };
}
