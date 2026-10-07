import React, { memo, useCallback } from 'react';

import { isValidTradeVolume } from '../../../utils/tradeVolume';
import { useTheme } from '../../../ui/theme/useTheme';
import type { ChartTradeQueueEvent } from './ChartTradeReceiptStack';
import { ChartTradeButtons } from './ChartTradeButtonsFeature';
import type { TradeFeedback } from './ChartTradeButtonsFeature/useTradeHandler';
import type { AuxiliaryChartTradeRowRenderContext } from './AuxiliaryChartPane';

type FooterLotPickerMode = 'absolute' | 'increase' | 'decrease';

export type ChartWindowTradeRowProps = Readonly<{
  context: AuxiliaryChartTradeRowRenderContext;
  active: boolean;
  isDark: boolean;
  lotSize: number;
  lotInvalid?: boolean;
  invalidLotDisplay?: string;
  resolveExecutionOwnership: (context: AuxiliaryChartTradeRowRenderContext) => boolean;
  onTradeResult?: (feedback: TradeFeedback) => void;
  onTradeQueueEvent?: (event: ChartTradeQueueEvent) => void;
  onOpenLotEditor?: (mode?: FooterLotPickerMode) => void;
  onDecreaseLot?: () => void;
  onIncreaseLot?: () => void;
}>;

/**
 * Reuses the production chart order controls for a secondary chart window.
 * The pane supplies only presentation context; quote freshness, order locks,
 * broker execution, and tap-time ownership remain inside ChartTradeButtons.
 */
export const ChartWindowTradeRow = memo(function ChartWindowTradeRow({
  context,
  active,
  isDark,
  lotSize,
  lotInvalid = false,
  invalidLotDisplay = '',
  resolveExecutionOwnership,
  onTradeResult,
  onTradeQueueEvent,
  onOpenLotEditor,
  onDecreaseLot,
  onIncreaseLot,
}: ChartWindowTradeRowProps) {
  const theme = useTheme();
  const isExecutionOwner = useCallback(
    () => resolveExecutionOwnership(context),
    [context, resolveExecutionOwnership],
  );
  const paneLotInvalid = lotInvalid
    || !isValidTradeVolume(lotSize, context.volumeBounds);

  return (
    <ChartTradeButtons
      symbol={context.symbol}
      displayDecimals={context.displayDecimals}
      lotSize={lotSize}
      volumeBounds={context.volumeBounds}
      chartWindowPaneId={context.paneId}
      onTradeResult={onTradeResult}
      onTradeQueueEvent={onTradeQueueEvent}
      onOpenLotEditor={onOpenLotEditor}
      onDecreaseLot={onDecreaseLot}
      onIncreaseLot={onIncreaseLot}
      variant="compact"
      active={active}
      isSymbolExecutionOwner={isExecutionOwner}
      isDark={isDark}
      buyColor={theme.trading.buy.primary}
      sellColor={theme.trading.sell.primary}
      lotInvalid={paneLotInvalid}
      invalidLotDisplay={invalidLotDisplay}
      compactPane={context.compactPane}
    />
  );
});
