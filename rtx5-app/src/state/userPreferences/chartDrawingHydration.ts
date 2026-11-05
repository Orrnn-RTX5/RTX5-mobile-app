import {
  getChartDrawingBucketKey,
  getChartDrawingLabels,
  type PersistedChartDrawingsBySymbol,
} from '../../features/chart/drawingPersistence';

type DrawingPreferences = {
  chartSymbol: string;
  chartDrawings: string[];
  chartDrawingRecordsBySymbol: PersistedChartDrawingsBySymbol;
};

/** Restore sanitized disk buckets in one publication without writing them back. */
export function completeChartDrawingHydration(
  current: DrawingPreferences,
  beforeRead: PersistedChartDrawingsBySymbol,
  stored: PersistedChartDrawingsBySymbol,
): Pick<DrawingPreferences, 'chartDrawingRecordsBySymbol' | 'chartDrawings'> & { hasHydrated: true } {
  let records = current.chartDrawingRecordsBySymbol;
  // Preserve the legacy preference fallback when the separate drawing file is
  // absent/invalid/empty, matching the existing restore behavior.
  if (Object.values(stored).some(drawings => drawings.length > 0)) {
    for (const [bucket, drawings] of Object.entries(stored)) {
      // If a bucket was edited/cleared during the asynchronous read, the newer
      // runtime value owns it. Other unchanged buckets can still be restored.
      if (current.chartDrawingRecordsBySymbol[bucket] !== beforeRead[bucket]) continue;
      if (records === current.chartDrawingRecordsBySymbol) records = { ...records };
      records[bucket] = drawings;
    }
  }
  const activeBucket = getChartDrawingBucketKey(current.chartSymbol);
  return {
    chartDrawingRecordsBySymbol: records,
    chartDrawings: records[activeBucket] === current.chartDrawingRecordsBySymbol[activeBucket]
      ? current.chartDrawings
      : getChartDrawingLabels(records[activeBucket] ?? []),
    hasHydrated: true,
  };
}
