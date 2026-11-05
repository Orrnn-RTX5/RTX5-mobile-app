/**
 * Reusable React Native UI component: Screen.
 *
 * Uses useSafeAreaInsets for precise inset control on every phone form factor.
 * Exports SCREEN_H_PAD so every screen uses the same horizontal padding constant.
 */

import { createContext, useContext, type PropsWithChildren } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ViewProps,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/useTheme';

/** Consistent horizontal padding used by every screen in the app */
export const SCREEN_H_PAD = 16;

const ScreenSideInsetsContext = createContext(false);
/** Shared headers skip side insets when their parent Screen already applied them. */
export const useScreenSideInsetsHandled = () => useContext(ScreenSideInsetsContext);

type ScreenProps = PropsWithChildren<{
  /** Wrap content in a ScrollView */
  scroll?: boolean;
  /** Extra style on the inner container */
  style?: ViewStyle;
  /** Skip bottom safe-area padding (e.g. when FlatList handles its own padding) */
  noBottomInset?: boolean;
  /** Opt out only when the screen already applies left/right safe-area insets. */
  noSideInset?: boolean;
  /** Optional native layout acknowledgement for retained route handoffs. */
  onLayout?: ViewProps['onLayout'];
  /** Keep a native root when a caller needs a reliable onLayout signal. */
  collapsable?: boolean;
}>;

export function Screen({
  children,
  collapsable,
  noBottomInset = false,
  noSideInset = false,
  onLayout,
  scroll = false,
  style,
}: ScreenProps) {
  const T = useTheme();
  const insets = useSafeAreaInsets();
  const parentHandlesSides = useScreenSideInsetsHandled();
  const handleSides = !noSideInset && !parentHandlesSides;
  const rootStyle = scroll ? undefined : StyleSheet.flatten(style);
  const leftPadding = rootStyle?.paddingLeft ?? rootStyle?.paddingHorizontal ?? rootStyle?.padding ?? 0;
  const rightPadding = rootStyle?.paddingRight ?? rootStyle?.paddingHorizontal ?? rootStyle?.padding ?? 0;
  const sidePadding = handleSides && (insets.left > 0 || insets.right > 0)
    ? {
        paddingLeft: insets.left + (typeof leftPadding === 'number' ? leftPadding : 0),
        paddingRight: insets.right + (typeof rightPadding === 'number' ? rightPadding : 0),
      }
    : undefined;
  const bottomPad = noBottomInset ? 0 : Math.max(insets.bottom, 8);

  if (scroll) {
    return (
      <ScreenSideInsetsContext.Provider value={parentHandlesSides || !noSideInset}>
        <KeyboardAvoidingView
          collapsable={collapsable}
          onLayout={onLayout}
          style={[styles.safe, { backgroundColor: T.bg }, sidePadding]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={[styles.base, { backgroundColor: T.bg }]}
            contentContainerStyle={[{ paddingBottom: bottomPad + 24 }, style]}
            keyboardShouldPersistTaps="always"
            canCancelContentTouches={Platform.OS === 'ios'}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </ScreenSideInsetsContext.Provider>
    );
  }

  return (
    <ScreenSideInsetsContext.Provider value={parentHandlesSides || !noSideInset}>
      <View
        collapsable={collapsable}
        onLayout={onLayout}
        style={[
          styles.safe,
          { backgroundColor: T.bg, paddingBottom: bottomPad },
          style,
          sidePadding,
        ]}
      >
        {children}
      </View>
    </ScreenSideInsetsContext.Provider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, minWidth: 0, minHeight: 0 },
  base: { flex: 1, minWidth: 0, minHeight: 0 },
});
