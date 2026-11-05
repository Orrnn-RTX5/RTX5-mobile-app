import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { resolveResponsiveLayout } from './responsiveLayout';

/** Recomputes when the app window, safe area, or system text size changes. */
export function useResponsiveLayout() {
  const { width, height, fontScale } = useWindowDimensions();
  const { top, right, bottom, left } = useSafeAreaInsets();
  return useMemo(
    () => resolveResponsiveLayout({ width, height, fontScale }, { top, right, bottom, left }),
    [width, height, fontScale, top, right, bottom, left],
  );
}
