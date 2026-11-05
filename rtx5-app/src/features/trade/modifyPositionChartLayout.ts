export type ModifyPositionChartMarkerKey = 'ask' | 'bid' | 'sl' | 'tp';

export type ModifyPositionChartMarker = {
  key: ModifyPositionChartMarkerKey;
  value: number;
  y: number;
};

export type ModifyPositionChartMarkerYMap = Partial<Record<ModifyPositionChartMarkerKey, number>>;

type MarkerGroup = {
  markers: ModifyPositionChartMarker[];
  value: number;
  targetY: number;
  resolvedY: number;
};

const DEFAULT_MIN_MARKER_GAP_PX = 24;
const DEFAULT_MARKER_EDGE_INSET_PX = 10;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function resolveModifyPositionMarkerYPositions(
  markers: readonly ModifyPositionChartMarker[],
  options: {
    chartHeight: number;
    sameValueEpsilon: number;
    minGapPx?: number;
    edgeInsetPx?: number;
  },
): ModifyPositionChartMarkerYMap {
  const finiteMarkers = markers.filter(
    (marker) => Number.isFinite(marker.value) && Number.isFinite(marker.y),
  );
  const chartHeight = options.chartHeight;
  if (!Number.isFinite(chartHeight) || chartHeight <= 0 || finiteMarkers.length === 0) {
    return finiteMarkers.reduce<ModifyPositionChartMarkerYMap>((acc, marker) => {
      acc[marker.key] = marker.y;
      return acc;
    }, {});
  }

  const edgeInset = Math.max(0, options.edgeInsetPx ?? DEFAULT_MARKER_EDGE_INSET_PX);
  const top = Math.min(edgeInset, chartHeight / 2);
  const bottom = Math.max(top, chartHeight - edgeInset);
  const sameValueEpsilon = Math.max(0, options.sameValueEpsilon);

  const groups: MarkerGroup[] = [];
  const sortedMarkers = [...finiteMarkers].sort((a, b) => b.value - a.value);

  for (const marker of sortedMarkers) {
    const previousGroup = groups[groups.length - 1];
    if (previousGroup && Math.abs(marker.value - previousGroup.value) <= sameValueEpsilon) {
      previousGroup.markers.push(marker);
      previousGroup.targetY =
        previousGroup.markers.reduce((sum, groupMarker) => sum + groupMarker.y, 0) /
        previousGroup.markers.length;
      continue;
    }

    groups.push({
      markers: [marker],
      value: marker.value,
      targetY: marker.y,
      resolvedY: marker.y,
    });
  }

  const availableHeight = Math.max(0, bottom - top);
  const requestedGap = Math.max(0, options.minGapPx ?? DEFAULT_MIN_MARKER_GAP_PX);
  const minGap =
    groups.length > 1
      ? Math.min(requestedGap, availableHeight / (groups.length - 1))
      : 0;

  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    group.resolvedY = clamp(group.targetY, top, bottom);
    if (index > 0) {
      group.resolvedY = Math.max(group.resolvedY, groups[index - 1].resolvedY + minGap);
    }
  }

  for (let index = groups.length - 1; index >= 0; index -= 1) {
    const group = groups[index];
    group.resolvedY = Math.min(group.resolvedY, bottom);
    if (index < groups.length - 1) {
      group.resolvedY = Math.min(group.resolvedY, groups[index + 1].resolvedY - minGap);
    }
  }

  if (groups[0]?.resolvedY < top) {
    groups[0].resolvedY = top;
    for (let index = 1; index < groups.length; index += 1) {
      groups[index].resolvedY = Math.max(groups[index].resolvedY, groups[index - 1].resolvedY + minGap);
    }
  }

  return groups.reduce<ModifyPositionChartMarkerYMap>((acc, group) => {
    for (const marker of group.markers) {
      acc[marker.key] = group.resolvedY;
    }
    return acc;
  }, {});
}
