import type { PersistedChartDrawing } from '../drawingPersistence';

const MAX_DRAWING_LABEL_LENGTH = 64;
type PriceAlertDrawingKind = 'horizontalLine' | 'horizontalRay' | 'textLevel';
type PriceAlertDrawing = PersistedChartDrawing & { kind: PriceAlertDrawingKind };

const PRICE_ALERT_DRAWING_KINDS = new Set<PriceAlertDrawingKind>([
  'horizontalLine',
  'horizontalRay',
  'textLevel',
]);

export type DrawingPriceAlertDraft = {
  condition: 'above' | 'below';
  drawingId: string;
  drawingKind: PriceAlertDrawingKind;
  message: string;
  price: string;
  symbol: string;
};

function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function sanitizeDrawingObjectLabel(value: string, fallback: string) {
  const sanitized = value
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_DRAWING_LABEL_LENGTH);

  return sanitized.length > 0 ? sanitized : fallback;
}

function normalizeAlertSymbol(symbol: string | undefined) {
  return (symbol ?? '')
    .replace(/\//g, '')
    .trim()
    .toUpperCase();
}

function formatDrawingAlertPrice(price: number) {
  if (Number.isInteger(price)) {
    return String(price);
  }

  return price
    .toFixed(8)
    .replace(/0+$/g, '')
    .replace(/\.$/g, '');
}

export function drawingSupportsPriceAlert(drawing: PersistedChartDrawing | null | undefined): drawing is PriceAlertDrawing {
  if (!drawing || !PRICE_ALERT_DRAWING_KINDS.has(drawing.kind as PriceAlertDrawingKind)) {
    return false;
  }

  const price = drawing.points[0]?.price;
  return typeof price === 'number' && Number.isFinite(price) && price > 0;
}

export function getDrawingObjectPriceAlertDraft(
  drawing: PersistedChartDrawing,
  chartSymbol: string,
): DrawingPriceAlertDraft | null {
  if (!drawingSupportsPriceAlert(drawing)) {
    return null;
  }

  const symbol = normalizeAlertSymbol(drawing.symbol || chartSymbol);
  const price = drawing.points[0]?.price;
  if (!symbol || typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
    return null;
  }

  return {
    condition: 'above',
    drawingId: drawing.id,
    drawingKind: drawing.kind,
    message: `${drawing.label} price alert`,
    price: formatDrawingAlertPrice(price),
    symbol,
  };
}

function getUniqueCloneId(
  source: PersistedChartDrawing,
  drawings: readonly PersistedChartDrawing[],
  now: number,
) {
  const existingIds = new Set(drawings.map((drawing) => drawing.id));
  const baseId = `${source.id}_clone_${Math.max(0, Math.floor(now))}`;
  let candidateId = baseId;
  let suffix = 2;

  while (existingIds.has(candidateId)) {
    candidateId = `${baseId}_${suffix}`;
    suffix += 1;
  }

  return candidateId;
}

function getUniqueCloneLabel(
  source: PersistedChartDrawing,
  drawings: readonly PersistedChartDrawing[],
) {
  const existingLabels = new Set(drawings.map((drawing) => drawing.label.trim().toLowerCase()));
  const baseLabel = sanitizeDrawingObjectLabel(`${source.label} Copy`, `${source.label} Copy`);

  if (!existingLabels.has(baseLabel.toLowerCase())) {
    return baseLabel;
  }

  let suffix = 2;
  let candidateLabel = `${baseLabel} ${suffix}`;
  while (existingLabels.has(candidateLabel.toLowerCase())) {
    suffix += 1;
    candidateLabel = `${baseLabel} ${suffix}`;
  }

  return candidateLabel;
}

export function renameDrawingObjectRecord(
  drawings: readonly PersistedChartDrawing[],
  drawingId: string,
  label: string,
  now = Date.now(),
) {
  return drawings.map((drawing) =>
    drawing.id === drawingId
      ? {
          ...drawing,
          label: sanitizeDrawingObjectLabel(label, drawing.label),
          updatedAt: now,
        }
      : drawing,
  );
}

export function toggleDrawingObjectLock(
  drawings: readonly PersistedChartDrawing[],
  drawingId: string,
  now = Date.now(),
) {
  return drawings.map((drawing) =>
    drawing.id === drawingId
      ? {
          ...drawing,
          locked: !drawing.locked,
          selected: false,
          updatedAt: now,
        }
      : drawing,
  );
}

export function cloneDrawingObjectRecord(
  drawings: readonly PersistedChartDrawing[],
  drawingId: string,
  now = Date.now(),
) {
  const sourceIndex = drawings.findIndex((drawing) => drawing.id === drawingId);
  if (sourceIndex < 0) {
    return [...drawings];
  }

  const source = drawings[sourceIndex];
  const clone = cloneSerializable(source);
  clone.id = getUniqueCloneId(source, drawings, now);
  clone.label = getUniqueCloneLabel(source, drawings);
  clone.selected = false;
  clone.createdAt = now;
  clone.updatedAt = now;

  return [
    ...drawings.slice(0, sourceIndex + 1),
    clone,
    ...drawings.slice(sourceIndex + 1),
  ];
}
