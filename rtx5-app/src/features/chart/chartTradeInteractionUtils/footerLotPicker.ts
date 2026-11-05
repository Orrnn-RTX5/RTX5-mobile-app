/**
 * Pure helpers for the footer lot picker UI.
 * Build quick-adjustment buttons, grid value lists, and chevron press behaviour
 * from a (lot, bounds) pair without touching React state.
 */
import {
  formatTradeVolume,
  incrementTradeVolume,
  normalizeTradeVolume,
  resolveTradeVolumeBounds,
  sanitizeTradeVolumeDraft,
  type TradeVolumeBounds,
} from '../../../utils/tradeVolume';

const FOOTER_LOT_PICKER_QUICK_ADJUSTMENT_MULTIPLIERS = [1, 10, 50] as const;
const FOOTER_LOT_PICKER_GRID_MULTIPLIER = 10;
const FOOTER_LOT_PICKER_GRID_ENTRY_COUNT = 10;

export type FooterLotPickerMode = 'absolute' | 'increase' | 'decrease';

export type FooterLotPickerQuickAdjustment = {
  key: string;
  label: string;
  nextValue: number;
  multiplier: number;
};

export type FooterLotPickerValueOption = {
  key: string;
  label: string;
  value: number;
  multiplier: number;
  rangeMultiplier?: number;
};

type FooterLotCommitDraftInput = {
  draftOverride?: string;
  draftRef?: string;
  currentDraft?: string;
};

type FooterLotChevronStateInput = {
  lotSize: number;
  bounds?: TradeVolumeBounds;
  hasDecreaseAction: boolean;
  hasIncreaseAction: boolean;
};

type FooterLotChevronPressBehaviorInput = {
  hasStepAction: boolean;
  hasLotPickerAction: boolean;
};

const formatTradeVolumePickerLabel = (value: number, bounds?: TradeVolumeBounds) =>
  formatTradeVolume(value, bounds).replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');

const formatSignedTradeVolumePickerLabel = (value: number, bounds?: TradeVolumeBounds) =>
  `${value > 0 ? '+' : value < 0 ? '-' : ''}${formatTradeVolumePickerLabel(Math.abs(value), bounds)}`;

const roundLotPickerAmount = (value: number, decimals: number) =>
  Number(value.toFixed(Math.max(decimals, 6)));

export function resolveFooterLotCommitDraft({
  draftOverride,
  draftRef,
  currentDraft,
}: FooterLotCommitDraftInput) {
  const candidates = [draftOverride, draftRef, currentDraft];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue;
    }
    const sanitized = sanitizeTradeVolumeDraft(candidate);
    if (sanitized.trim()) {
      return sanitized;
    }
  }

  return '';
}

export function resolveFooterLotChevronState({
  lotSize,
  bounds,
  hasDecreaseAction,
  hasIncreaseAction,
}: FooterLotChevronStateInput) {
  const { stepVolume } = resolveTradeVolumeBounds(bounds);
  const normalizedLotSize = normalizeTradeVolume(lotSize, bounds);
  const lotStepEpsilon = stepVolume / 1000;
  const nextDecreaseLot = incrementTradeVolume(normalizedLotSize, -1, bounds);
  const nextIncreaseLot = incrementTradeVolume(normalizedLotSize, 1, bounds);

  return {
    canDecreaseLot: hasDecreaseAction && nextDecreaseLot < normalizedLotSize - lotStepEpsilon,
    canIncreaseLot: hasIncreaseAction && nextIncreaseLot > normalizedLotSize + lotStepEpsilon,
  };
}

export function resolveFooterLotChevronPressBehavior({
  hasStepAction,
  hasLotPickerAction,
}: FooterLotChevronPressBehaviorInput) {
  if (hasLotPickerAction) {
    return 'picker';
  }

  if (hasStepAction) {
    return 'step';
  }

  return 'none';
}

export function buildFooterLotPickerQuickAdjustments(
  value: number,
  mode: FooterLotPickerMode,
  bounds?: TradeVolumeBounds,
) {
  const resolved = resolveTradeVolumeBounds(bounds);
  const currentValue = normalizeTradeVolume(value, bounds);
  const epsilon = resolved.stepVolume / 1000;
  const seen = new Set<number>();
  const options: FooterLotPickerQuickAdjustment[] = [];

  for (const multiplier of FOOTER_LOT_PICKER_QUICK_ADJUSTMENT_MULTIPLIERS) {
    const rawAmount = roundLotPickerAmount(resolved.stepVolume * multiplier, resolved.decimals);
    const signedAmount = mode === 'decrease' ? -rawAmount : rawAmount;
    const nextValue = normalizeTradeVolume(currentValue + signedAmount, bounds);
    const actualAmount = roundLotPickerAmount(nextValue - currentValue, resolved.decimals);
    const labelAmount = mode === 'absolute' ? actualAmount : signedAmount;

    if (mode === 'absolute' && Math.abs(actualAmount) <= epsilon) {
      continue;
    }

    if (mode === 'absolute' && seen.has(nextValue)) {
      continue;
    }

    seen.add(nextValue);
    options.push({
      key: `${mode}:${multiplier}:${nextValue}`,
      label: formatSignedTradeVolumePickerLabel(labelAmount, bounds),
      nextValue,
      multiplier,
    });
  }

  return options;
}

export function buildFooterLotPickerValues(
  value: number,
  mode: FooterLotPickerMode,
  bounds?: TradeVolumeBounds,
  selectedQuickMultiplier?: number,
) {
  const resolved = resolveTradeVolumeBounds(bounds);
  const currentValue = normalizeTradeVolume(value, bounds);
  const seen = new Set<number>();
  const values: FooterLotPickerValueOption[] = [];

  if (mode === 'absolute') {
    const coarseStep = resolved.stepVolume * FOOTER_LOT_PICKER_GRID_MULTIPLIER;

    for (let index = 1; index <= FOOTER_LOT_PICKER_GRID_ENTRY_COUNT; index += 1) {
      const candidate = normalizeTradeVolume(coarseStep * index, bounds);
      if (candidate < resolved.minVolume || candidate > resolved.maxVolume || seen.has(candidate)) {
        continue;
      }
      seen.add(candidate);
      values.push({
        key: `${mode}:${candidate}`,
        label: formatTradeVolumePickerLabel(candidate, bounds),
        value: candidate,
        multiplier: index,
      });
    }

    if (values.length === 0) {
      values.push({
        key: `${mode}:${resolved.minVolume}`,
        label: formatTradeVolumePickerLabel(resolved.minVolume, bounds),
        value: resolved.minVolume,
        multiplier: 1,
      });
    }

    return values;
  }

  const direction = mode === 'decrease' ? -1 : 1;
  const selectedMultiplier =
    typeof selectedQuickMultiplier === 'number' && Number.isFinite(selectedQuickMultiplier)
      ? Math.max(1, Math.floor(selectedQuickMultiplier))
      : FOOTER_LOT_PICKER_QUICK_ADJUSTMENT_MULTIPLIERS[0];
  const rangeStep = Math.max(1, Math.pow(10, Math.floor(Math.log10(selectedMultiplier))));
  const startMultiplier = selectedMultiplier;
  const endMultiplier = rangeStep * FOOTER_LOT_PICKER_GRID_MULTIPLIER;

  for (let multiplier = startMultiplier; multiplier <= endMultiplier; multiplier += rangeStep) {
    const amount = roundLotPickerAmount(resolved.stepVolume * multiplier, resolved.decimals);
    const candidate = normalizeTradeVolume(currentValue + direction * amount, bounds);
    const displayAmount = roundLotPickerAmount(direction * amount, resolved.decimals);

    if (seen.has(multiplier)) {
      continue;
    }

    seen.add(multiplier);
    values.push({
      key: `${mode}:${selectedMultiplier}:${multiplier}:${candidate}`,
      label: formatSignedTradeVolumePickerLabel(displayAmount, bounds),
      value: candidate,
      multiplier,
      rangeMultiplier: multiplier,
    });
  }

  return values;
}
