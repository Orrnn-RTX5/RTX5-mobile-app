/**
 * Indicator Edit State
 *
 * Ephemeral store holding the indicator currently being edited. Sub-screens
 * (line style, level) read and write through this store so the main config
 * screen stays in sync across navigations — mirroring MT5's flow.
 */

import { create } from 'zustand';
import {
  IndicatorMeta,
  IndicatorStyleLine,
  LineStyle,
} from './indicatorRegistry';

export type IndicatorLevel = {
  id: string;
  value: number;
  color: string;
  width: number;
  style: LineStyle;
  description: string;
};

export type IndicatorVisualization = {
  showInDataWindow: boolean;
  allTimeframes: boolean;
  fixedMinEnabled: boolean;
  fixedMin: number;
  fixedMaxEnabled: boolean;
  fixedMax: number;
};

type State = {
  meta: IndicatorMeta | null;
  values: Record<string, number | string | boolean>;
  styleLines: IndicatorStyleLine[];
  levels: IndicatorLevel[];
  visualization: IndicatorVisualization;

  initialize: (meta: IndicatorMeta) => void;
  clear: () => void;

  setValue: (key: string, value: number | string | boolean) => void;
  updateLine: (key: string, patch: Partial<IndicatorStyleLine>) => void;

  addLevel: () => string;
  updateLevel: (id: string, patch: Partial<IndicatorLevel>) => void;
  removeLevel: (id: string) => void;

  setVisualization: (patch: Partial<IndicatorVisualization>) => void;
};

const DEFAULT_VIZ: IndicatorVisualization = {
  showInDataWindow: true,
  allTimeframes: true,
  fixedMinEnabled: false,
  fixedMin: 0,
  fixedMaxEnabled: false,
  fixedMax: 100,
};

let levelIdCounter = 0;
const nextLevelId = () => `lvl-${++levelIdCounter}-${Date.now()}`;

export const useIndicatorEditState = create<State>((set) => ({
  meta: null,
  values: {},
  styleLines: [],
  levels: [],
  visualization: { ...DEFAULT_VIZ },

  initialize: (meta) => {
    const values: Record<string, number | string | boolean> = {};
    for (const p of meta.parameters) {
      values[p.key] = p.default;
    }
    const levels: IndicatorLevel[] = (meta.defaultLevels ?? []).map((v) => ({
      id: nextLevelId(),
      value: v,
      color: '#808080',
      width: 1,
      style: 'dotted',
      description: '',
    }));
    set({
      meta,
      values,
      styleLines: meta.styles.map((l) => ({ ...l })),
      levels,
      visualization: { ...DEFAULT_VIZ },
    });
  },

  clear: () =>
    set({
      meta: null,
      values: {},
      styleLines: [],
      levels: [],
      visualization: { ...DEFAULT_VIZ },
    }),

  setValue: (key, value) =>
    set((s) => ({ values: { ...s.values, [key]: value } })),

  updateLine: (key, patch) =>
    set((s) => ({
      styleLines: s.styleLines.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    })),

  addLevel: () => {
    const id = nextLevelId();
    set((s) => ({
      levels: [
        ...s.levels,
        { id, value: 0, color: '#808080', width: 1, style: 'dotted', description: '' },
      ],
    }));
    return id;
  },

  updateLevel: (id, patch) =>
    set((s) => ({
      levels: s.levels.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    })),

  removeLevel: (id) =>
    set((s) => ({ levels: s.levels.filter((l) => l.id !== id) })),

  setVisualization: (patch) =>
    set((s) => ({ visualization: { ...s.visualization, ...patch } })),
}));
