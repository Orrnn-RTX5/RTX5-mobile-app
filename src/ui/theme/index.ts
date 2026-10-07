// ─── Theme Index — re-exports from the glass design system ───────────────────
// Legacy consumers that import `colors`, `spacing`, `radius`, `typography`
// from here continue to work unchanged.

import { GDark } from './glass';

// Named colour shortcuts for legacy `colors.positive / colors.negative`
export const colors = {
  background: GDark.bgRoot,
  surface: GDark.bg,
  surfaceAlt: GDark.glass1,
  border: GDark.border,
  text: GDark.text,
  textMuted: GDark.textMuted,
  positive: GDark.trading.profit,
  negative: GDark.trading.loss,     // #EF4444
  warning: '#f59e0b',
  accent: GDark.accent,
  divider: GDark.borderSubtle,
};

// Numeric spacing scale (8-pt grid)
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};

// Border radius scale
export const radius = {
  sm: GDark.radius.small,   // 3
  md: GDark.radius.medium,  // 6
  lg: GDark.radius.large,   // 7
};

// Typography size scale (numeric px for React Native)
export const typography = GDark.fontSize;
