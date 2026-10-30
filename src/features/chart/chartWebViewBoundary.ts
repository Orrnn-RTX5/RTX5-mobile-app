/** Shared boundary for the local chart and preview HTML documents. */
const MESSAGE_TYPES = new Set([
  'CHART_CONTEXT_ACTIVATED','READY','CHART_READY','CHART_DATA_PAINTED',
  'DRAWING_TEXT_EDIT_REQUEST','DRAWING_QUICK_ACTIONS_REQUEST','DRAWING_ACTION_MENU_REQUEST',
  'DRAWINGS_CHANGED','DRAWINGS_SYNCED_FOR_OBJECTS','CHART_TOUCH_STATE','TOOL_ACTIVE_CHANGED',
  'CHART_TRADE_LINE_DRAG','CHART_POSITION_ACTION','CHART_PENDING_ORDER_ACTION','ON_PAGINATE_HISTORY','CHART_TAP','CHART_DOUBLE_TAP',
  'CHART_GEOMETRY','ERROR','PANE_TAP','PANE_DOUBLE_TAP',
]);
type NumericRange = { from?: number; to?: number; referenceSpan?: number };
export type ChartBridgeMessage = Record<string,unknown> & {
  type: string;
  priceRange?: NumericRange | null;
  manualPriceScale?: NumericRange | null;
  plotArea?: { left?: number; top?: number; width?: number; height?: number } | null;
};
export function allowLocalChartNavigation(request: { url: string }): boolean {
  return request.url === 'about:blank' || request.url.startsWith('about:blank#');
}
export function parseChartBridgeMessage(raw: string): ChartBridgeMessage | null {
  if (typeof raw !== 'string' || raw.length > 2_000_000) return null;
  try {
    const message: unknown = JSON.parse(raw);
    if (!message || typeof message !== 'object' || Array.isArray(message)) return null;
    const row = message as Record<string,unknown>;
    if (typeof row.type !== 'string' || !MESSAGE_TYPES.has(row.type)) return null;
    for (const key of ['dataContextSig','dataContextKey','configSig','initSignature','paintToken','recordId','text','label','tool','message','positionId','positionKey','symbol','sessionScope','action','levelRole']) {
      if (row[key] !== undefined && (typeof row[key] !== 'string' || (row[key] as string).length > 32_000)) return null;
    }
    for (const key of ['x','y','price','requestId','dataGeneration','chartGeneration','ticket']) {
      if (row[key] !== undefined && (typeof row[key] !== 'number' || !Number.isFinite(row[key]))) return null;
    }
    for (const key of ['active','canRedo','canUndo','drawingActive','locked']) {
      if (row[key] !== undefined && typeof row[key] !== 'boolean') return null;
    }
    if (row.drawings !== undefined && (!Array.isArray(row.drawings) || row.drawings.length > 5000)) return null;
    for (const key of ['priceRange','manualPriceScale','plotArea']) {
      const value = row[key];
      if (value != null && (typeof value !== 'object' || Array.isArray(value)
        || Object.values(value).some(item => typeof item !== 'number' || !Number.isFinite(item)))) return null;
    }
    if (row.type === 'CHART_TOUCH_STATE' && typeof row.active !== 'boolean') return null;
    return row as ChartBridgeMessage;
  } catch { return null; }
}
