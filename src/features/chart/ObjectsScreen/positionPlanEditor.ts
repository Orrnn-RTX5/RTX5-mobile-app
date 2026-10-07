import type {
  ChartDrawingKind,
  PersistedChartDrawing,
  PersistedPositionPlan,
} from '../drawingPersistence';

export type PositionPlanPatch = Partial<{
  entryPrice: number;
  targetPrice: number;
  stopPrice: number | null;
  accountSize: number | null;
  riskPercent: number | null;
}>;

export type PositionPlanDirection = 'long' | 'short';

export type PositionPlanEditorValues = {
  direction: PositionPlanDirection;
  entryPrice: number;
  targetPrice: number;
  stopPrice: number;
  stopIsCustom: boolean;
  accountSize: number | null;
  riskPercent: number;
  rewardPerUnit: number;
  riskPerUnit: number;
  riskReward: number | null;
  riskAmount: number | null;
  rewardAmount: number | null;
  quantity: number | null;
};

export const DEFAULT_POSITION_RISK_PERCENT = 1;

const PRICE_MAX = Number.MAX_SAFE_INTEGER;
const RISK_PERCENT_MAX = 100;

export const drawingSupportsPositionPlanEditor = (kind: ChartDrawingKind) =>
  kind === 'prediction' || kind === 'shortPosition';

const positionPlanDirection = (kind: ChartDrawingKind): PositionPlanDirection =>
  kind === 'shortPosition' ? 'short' : 'long';

const roundPrice = (value: number) => Number(value.toFixed(5));

function normalizePositionPlan(plan: PersistedPositionPlan | undefined): PersistedPositionPlan {
  return {
    stopPrice: typeof plan?.stopPrice === 'number' && Number.isFinite(plan.stopPrice) && plan.stopPrice > 0
      ? roundPrice(plan.stopPrice)
      : null,
    accountSize: typeof plan?.accountSize === 'number' && Number.isFinite(plan.accountSize) && plan.accountSize > 0
      ? Math.min(plan.accountSize, PRICE_MAX)
      : null,
    riskPercent: typeof plan?.riskPercent === 'number' && Number.isFinite(plan.riskPercent) && plan.riskPercent > 0
      ? Math.min(plan.riskPercent, RISK_PERCENT_MAX)
      : null,
  };
}

/**
 * Effective stop price: the persisted stop when set, otherwise the 1:1 mirror
 * of the target distance on the opposite side of the entry. Must stay in sync
 * with resolvePositionPlanStop in longPositionRuntime.ts.
 */
function effectiveStopPrice(
  entryPrice: number,
  targetPrice: number,
  stopPrice: number | null,
  direction: PositionPlanDirection,
) {
  if (stopPrice !== null) {
    return stopPrice;
  }

  return direction === 'short'
    ? roundPrice(entryPrice + (entryPrice - targetPrice))
    : roundPrice(entryPrice - (targetPrice - entryPrice));
}

export function getPositionPlanEditorValues(
  drawing: PersistedChartDrawing | null | undefined,
): PositionPlanEditorValues | null {
  if (!drawing || !drawingSupportsPositionPlanEditor(drawing.kind)) {
    return null;
  }

  const entryPoint = drawing.points[0];
  const targetPoint = drawing.points[1];
  if (!entryPoint || !targetPoint) {
    return null;
  }

  const direction = positionPlanDirection(drawing.kind);
  const plan = normalizePositionPlan(drawing.position);
  const entryPrice = roundPrice(entryPoint.price);
  const targetPrice = roundPrice(targetPoint.price);
  const stopPrice = effectiveStopPrice(entryPrice, targetPrice, plan.stopPrice, direction);
  const riskPercent = plan.riskPercent ?? DEFAULT_POSITION_RISK_PERCENT;

  const rewardPerUnit = direction === 'short' ? entryPrice - targetPrice : targetPrice - entryPrice;
  const riskPerUnit = direction === 'short' ? stopPrice - entryPrice : entryPrice - stopPrice;
  const riskReward = riskPerUnit > 0 ? rewardPerUnit / riskPerUnit : null;

  const riskAmount = plan.accountSize !== null ? (plan.accountSize * riskPercent) / 100 : null;
  const rewardAmount = riskAmount !== null && riskReward !== null ? riskAmount * riskReward : null;
  const quantity = riskAmount !== null && riskPerUnit > 0 ? riskAmount / riskPerUnit : null;

  return {
    direction,
    entryPrice,
    targetPrice,
    stopPrice,
    stopIsCustom: plan.stopPrice !== null,
    accountSize: plan.accountSize,
    riskPercent,
    rewardPerUnit,
    riskPerUnit,
    riskReward,
    riskAmount,
    rewardAmount,
    quantity,
  };
}

export function applyPositionPlanPatch(
  drawing: PersistedChartDrawing,
  patch: PositionPlanPatch,
  now = Date.now(),
): PersistedChartDrawing {
  if (!drawingSupportsPositionPlanEditor(drawing.kind)) {
    return drawing;
  }

  const plan = normalizePositionPlan(drawing.position);
  const nextPlan: PersistedPositionPlan = {
    stopPrice: patch.stopPrice !== undefined
      ? (patch.stopPrice === null ? null : roundPrice(patch.stopPrice))
      : plan.stopPrice,
    accountSize: patch.accountSize !== undefined
      ? (patch.accountSize === null ? null : Math.min(patch.accountSize, PRICE_MAX))
      : plan.accountSize,
    riskPercent: patch.riskPercent !== undefined
      ? (patch.riskPercent === null ? null : Math.min(patch.riskPercent, RISK_PERCENT_MAX))
      : plan.riskPercent,
  };

  const nextPoints = drawing.points.map((point, index) => {
    if (index === 0 && patch.entryPrice !== undefined) {
      return { ...point, price: roundPrice(patch.entryPrice) };
    }
    if (index === 1 && patch.targetPrice !== undefined) {
      return { ...point, price: roundPrice(patch.targetPrice) };
    }
    return point;
  });

  const planIsEmpty = nextPlan.stopPrice === null && nextPlan.accountSize === null && nextPlan.riskPercent === null;

  return {
    ...drawing,
    points: nextPoints,
    position: planIsEmpty ? undefined : nextPlan,
    updatedAt: now,
  };
}

export function resetPositionPlan(drawing: PersistedChartDrawing, now = Date.now()) {
  if (!drawingSupportsPositionPlanEditor(drawing.kind)) {
    return drawing;
  }

  return {
    ...drawing,
    position: undefined,
    updatedAt: now,
  };
}

export function parsePositionPlanNumber(value: string, max = PRICE_MAX): number | null {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, max) : null;
}

export function parsePositionPlanRiskPercent(value: string) {
  return parsePositionPlanNumber(value, RISK_PERCENT_MAX);
}

export function formatPositionPlanNumber(value: number | null, maxDecimals = 5) {
  if (value === null || !Number.isFinite(value)) {
    return '';
  }

  return Number(value.toFixed(maxDecimals)).toString();
}

export function formatPositionPlanRiskReward(value: number | null) {
  return value === null || !Number.isFinite(value) || value <= 0
    ? '—'
    : `1 : ${Number(value.toFixed(2))}`;
}
