export type ChartPositionStopKind = 'sl' | 'tp';

const POSITION_STOP_DRAG_KEY_PREFIX = 'position-stop';

export type ChartPositionStopDragTarget = {
  kind: ChartPositionStopKind;
  positionId: string;
};

export const buildChartPositionStopDragKey = (
  positionId: string | number,
  kind: ChartPositionStopKind,
): string => `${POSITION_STOP_DRAG_KEY_PREFIX}:${kind}:${encodeURIComponent(String(positionId))}`;

export const parseChartPositionStopDragKey = (
  dragKey: unknown,
): ChartPositionStopDragTarget | null => {
  if (typeof dragKey !== 'string') {
    return null;
  }

  const match = dragKey.match(/^position-stop:(sl|tp):(.+)$/);
  if (!match) {
    return null;
  }

  try {
    return {
      kind: match[1] as ChartPositionStopKind,
      positionId: decodeURIComponent(match[2]),
    };
  } catch {
    return {
      kind: match[1] as ChartPositionStopKind,
      positionId: match[2],
    };
  }
};
