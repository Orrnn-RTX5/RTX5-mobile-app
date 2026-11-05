import React, { memo, useEffect, useSyncExternalStore } from 'react';

import { ActionSheet } from '../../../ui/components/ActionSheet/ActionSheet';
import {
  disposeChartSymbolPickerSheet,
  getChartSymbolPickerSheetSnapshot,
  hideChartSymbolPickerSheet,
  subscribeChartSymbolPickerSheet,
  type ChartSymbolPickerSheetConfig,
} from '../chartSymbolPickerSheetController';

// The host remains mounted before preload; this no-row config keeps that first
// hidden render valid without inventing a real symbol-picker identity.
const emptyConfig: ChartSymbolPickerSheetConfig = Object.freeze({
  actions: [],
  visualKey: 'chart.symbolPicker.uninitialized',
});

/** Dedicated top-level host: Symbol Picker stays pre-mounted outside ChartScreen renders. */
export const ChartSymbolPickerSheetHost = memo(function ChartSymbolPickerSheetHost() {
  const current = useSyncExternalStore(
    subscribeChartSymbolPickerSheet,
    getChartSymbolPickerSheetSnapshot,
    getChartSymbolPickerSheetSnapshot,
  );
  const config = current.config ?? emptyConfig;
  // Dispose only when the dedicated host truly leaves the tree, not whenever
  // ChartScreen rerenders or hides the retained sheet.
  useEffect(() => () => disposeChartSymbolPickerSheet(), []);

  return (
    <ActionSheet
      key={`chart-symbol-picker-host:${current.hostEpoch}`}
      {...config}
      detent={config.detent ?? 'large'}
      instantOpen={config.instantOpen ?? true}
      visible={current.visible}
      onClose={hideChartSymbolPickerSheet}
    />
  );
});

export type { ChartSymbolPickerSheetConfig };
