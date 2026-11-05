/**
 * Global theming utility and design-system configuration: useTheme.
 */

import { useMemo } from 'react';
import { GDark, GLight, ThemeColors } from './glass';
import { useThemeMode } from '../../state/themeMode';

export type { ThemeColors };

/**
 * Returns the current theme color set based on user preference.
 * Reactively updates when the user toggles between light/dark.
 * Pass `{ active: false }` from hidden retained hosts to use the post-paint
 * theme clock without ever freezing their visual palette.
 */
export function useTheme(options?: { active?: boolean }): ThemeColors {
  const themeMode = useThemeMode(options);
  return useMemo(() => (themeMode === 'light' ? GLight : GDark), [themeMode]);
}
