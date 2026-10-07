import type {
  ChartDrawingKind,
  PersistedChartDrawing,
  PersistedElliottWave,
} from '../drawingPersistence';

export type ElliottWavePatch = Partial<{
  label: string;
  visible: boolean;
}>;

export type ElliottWavePresetId =
  | 'impulse'
  | 'impulseMajor'
  | 'impulseMinute'
  | 'triangle'
  | 'combo';

export type ElliottWavePreset = {
  id: ElliottWavePresetId;
  label: string;
  description: string;
  labels: string[];
};

export const ELLIOTT_WAVE_POINT_COUNT = 6;

const ELLIOTT_WAVE_LABEL_MAX_LENGTH = 12;

export const ELLIOTT_WAVE_PRESETS: ElliottWavePreset[] = [
  {
    id: 'impulse',
    label: 'Impulse 1-5',
    description: 'Minor degree impulse (1 2 3 4 5)',
    labels: ['', '1', '2', '3', '4', '5'],
  },
  {
    id: 'impulseMajor',
    label: 'Impulse I-V',
    description: 'Cycle degree impulse (I II III IV V)',
    labels: ['', 'I', 'II', 'III', 'IV', 'V'],
  },
  {
    id: 'impulseMinute',
    label: 'Impulse i-v',
    description: 'Minute degree impulse (i ii iii iv v)',
    labels: ['', 'i', 'ii', 'iii', 'iv', 'v'],
  },
  {
    id: 'triangle',
    label: 'Triangle A-E',
    description: 'Corrective triangle (A B C D E)',
    labels: ['', 'A', 'B', 'C', 'D', 'E'],
  },
  {
    id: 'combo',
    label: 'Combo W-Z',
    description: 'Double/triple combination (W X Y X Z)',
    labels: ['', 'W', 'X', 'Y', 'X', 'Z'],
  },
];

const DEFAULT_ELLIOTT_WAVE_PRESET = ELLIOTT_WAVE_PRESETS[0];

export const drawingSupportsElliottWaveEditor = (kind: ChartDrawingKind) =>
  kind === 'elliottWave';

const buildWaveId = (index: number) => `wave_${index + 1}`;

const sanitizeWaveLabel = (value: string) =>
  value.trim().slice(0, ELLIOTT_WAVE_LABEL_MAX_LENGTH).trim();

const makeDefaultWave = (index: number): PersistedElliottWave => ({
  id: buildWaveId(index),
  label: DEFAULT_ELLIOTT_WAVE_PRESET.labels[index] ?? '',
  visible: true,
});

function normalizeElliottWave(
  wave: Partial<PersistedElliottWave> | undefined,
  index: number,
): PersistedElliottWave {
  const fallback = makeDefaultWave(index);
  return {
    // Pivot order is the identity, so ids are always positional.
    id: fallback.id,
    label: typeof wave?.label === 'string' ? sanitizeWaveLabel(wave.label) : fallback.label,
    visible: wave?.visible !== false,
  };
}

function getNormalizedWaves(drawing: PersistedChartDrawing): PersistedElliottWave[] {
  if (!drawingSupportsElliottWaveEditor(drawing.kind)) {
    return [];
  }

  const source = drawing.waves ?? [];
  return Array.from({ length: ELLIOTT_WAVE_POINT_COUNT }, (_, index) =>
    normalizeElliottWave(source[index], index));
}

export function getElliottWaveEditorWaves(drawing: PersistedChartDrawing | null | undefined) {
  return drawing ? getNormalizedWaves(drawing) : [];
}

export function describeElliottWavePivot(index: number) {
  return index === 0 ? 'Origin pivot' : `Wave ${index} pivot`;
}

export function getActiveElliottWavePresetId(
  waves: PersistedElliottWave[],
): ElliottWavePresetId | null {
  const preset = ELLIOTT_WAVE_PRESETS.find((candidate) =>
    candidate.labels.length === waves.length &&
    waves.every((wave, index) => wave.visible && wave.label === candidate.labels[index]));
  return preset?.id ?? null;
}

export function applyElliottWavePatch(
  drawing: PersistedChartDrawing,
  waveId: string,
  patch: ElliottWavePatch,
  now = Date.now(),
): PersistedChartDrawing {
  if (!drawingSupportsElliottWaveEditor(drawing.kind)) {
    return drawing;
  }

  const waves = getNormalizedWaves(drawing).map((wave) => {
    if (wave.id !== waveId) {
      return wave;
    }

    return {
      ...wave,
      label: patch.label !== undefined ? sanitizeWaveLabel(patch.label) : wave.label,
      visible: patch.visible ?? wave.visible,
    };
  });

  return {
    ...drawing,
    waves,
    updatedAt: now,
  };
}

export function applyElliottWavePreset(
  drawing: PersistedChartDrawing,
  presetId: ElliottWavePresetId,
  now = Date.now(),
): PersistedChartDrawing {
  if (!drawingSupportsElliottWaveEditor(drawing.kind)) {
    return drawing;
  }

  const preset = ELLIOTT_WAVE_PRESETS.find((candidate) => candidate.id === presetId);
  if (!preset) {
    return drawing;
  }

  return {
    ...drawing,
    waves: Array.from({ length: ELLIOTT_WAVE_POINT_COUNT }, (_, index) => ({
      id: buildWaveId(index),
      label: preset.labels[index] ?? '',
      visible: true,
    })),
    updatedAt: now,
  };
}

export function resetElliottWaves(drawing: PersistedChartDrawing, now = Date.now()) {
  if (!drawingSupportsElliottWaveEditor(drawing.kind)) {
    return drawing;
  }

  return {
    ...drawing,
    waves: undefined,
    updatedAt: now,
  };
}
