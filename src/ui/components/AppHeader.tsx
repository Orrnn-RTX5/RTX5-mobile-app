import { FastPressable as Pressable } from './FastPressable';
/**
 * AppHeader — Shared header component for all tab screens.
 *
 * Design goals:
 * - Auto-sizes for every phone: uses useSafeAreaInsets() so status bar height
 *   is handled correctly on both Android (no notch) and iOS (notch/dynamic island).
 * - Reserves a left gutter for the global hamburger menu button.
 *   This prevents the title ever overlapping the menu icon.
 * - Title is always visually centered between the left gutter and the optional
 *   right actions zone.
 * - Right actions slot accepts any ReactNode (icon buttons, badges, etc).
 * - `noBorder` prop: use on screens where content scrolls under the header.
 */

import React, { ReactNode, useCallback } from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { AppMenuIcon } from './AppMenuIcon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/useTheme';
import { useIsDarkTheme } from '../../state/themeMode';
import { useUIState } from '../../state/uiState';
import { openSidebarDrawerImmediately, scheduleAfterSidebarOpenVisual } from './sidebarDrawerController';
import { useScreenSideInsetsHandled } from './Screen';
import { useResponsiveLayout } from '../layout/useResponsiveLayout';


// Keep the visible menu icon close to the app edge while preserving a large
// press target for reliable Android taps.
export const MENU_BTN_GUTTER = 56;
export const MENU_BUTTON_VISUAL_LEFT = 28;
const HEADER_HORIZONTAL_PADDING = 16;
// Quotes has the widest action group (two 32px buttons + a 10px gap). Keeping
// mirrored 88px slots keeps the title centered. Narrow usable windows compact
// both slots to 76px, which still accommodates this complete action group.
export const HEADER_ACTION_SLOT_WIDTH = 88;
export const HEADER_COMPACT_SLOT_WIDTH = MENU_BTN_GUTTER;
const MENU_BUTTON_LEFT_INSET = MENU_BUTTON_VISUAL_LEFT - HEADER_HORIZONTAL_PADDING;
const MENU_BUTTON_HIT_SLOP = { top: 8, bottom: 8, left: 16, right: 8 } as const;

interface AppHeaderProps {
  /** Main title string shown centered in the header */
  title: string;
  /** Optional right-side action buttons (icons, badges, etc.) */
  rightActions?: ReactNode;
  /** Extra bottom padding if content starts immediately below (default 12) */
  paddingBottom?: number;
  /** Style overrides for the outer container */
  style?: ViewStyle;
  /** Hide the bottom border hairline */
  noBorder?: boolean;
  /** Extra top padding on top of safe area (fine-tuning per screen) */
  extraTopPad?: number;
}

/**
 * Use this in every tab screen's `ListHeaderComponent` or at the top of the view
 * INSTEAD of an inline `<View style={{ height: 48 ... }}>`.
 */
export function AppHeader({
  title,
  rightActions,
  paddingBottom = 12,
  style,
  noBorder = false,
  extraTopPad = 0,
}: AppHeaderProps) {
  const T = useTheme();
  const isDark = useIsDarkTheme();
  const insets = useSafeAreaInsets();
  const sideInsetsHandled = useScreenSideInsetsHandled();
  const { availableWidth, isShort } = useResponsiveLayout();
  const hideActionSheet = useUIState((s) => s.hideActionSheet);
  const handleOpenSidebar = useCallback(() => {
    openSidebarDrawerImmediately();
    scheduleAfterSidebarOpenVisual(hideActionSheet);
  }, [hideActionSheet]);

  const safeTop = Math.max(insets.top, 0);
  const topPad = safeTop + (isShort ? 4 : 6) + extraTopPad;
  const horizontalPadding = availableWidth < 360 ? 12 : HEADER_HORIZONTAL_PADDING;
  const actionSlotWidth = rightActions && availableWidth < 360 ? 76 : HEADER_ACTION_SLOT_WIDTH;
  const sideSlotStyle = rightActions
    ? styles.sideSlotWithActions
    : styles.sideSlotCompact;

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: topPad,
          paddingBottom: isShort ? Math.min(paddingBottom, 8) : paddingBottom,
          paddingLeft: horizontalPadding + (sideInsetsHandled ? 0 : Math.max(insets.left, 0)),
          paddingRight: horizontalPadding + (sideInsetsHandled ? 0 : Math.max(insets.right, 0)),
          borderBottomColor: isDark
            ? 'rgba(255,255,255,0.06)'
            : 'rgba(0,0,0,0.06)',
          borderBottomWidth: noBorder ? 0 : StyleSheet.hairlineWidth,
        },
        style,
      ]}
    >
      {/* Hamburger menu button — in the same flex row as title */}
      <Pressable
        style={[styles.leftGutter, sideSlotStyle, rightActions ? { width: actionSlotWidth } : null]}
        onPress={handleOpenSidebar}
        activateOnTouchStart
        hitSlop={MENU_BUTTON_HIT_SLOP}
        latencyLabel="appHeader.menu"
        unstable_pressDelay={0}
      >
        <AppMenuIcon color={T.text} />
      </Pressable>

      {/* Centered title */}
      <Text
        style={[styles.title, { color: T.text }]}
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.72}
        maxFontSizeMultiplier={1.8}
      >
        {title}
      </Text>

      {/* Right slot — same width as left gutter for perfect centering */}
      <View style={[styles.rightSlot, sideSlotStyle, rightActions ? { width: actionSlotWidth } : null]}>
        {rightActions ?? null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
    paddingHorizontal: HEADER_HORIZONTAL_PADDING,
    // No background — inherits from Screen/parent so theme transitions work
  },
  leftGutter: {
    minHeight: 44,
    flexShrink: 0,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: MENU_BUTTON_LEFT_INSET,
  },
  title: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    fontSize: 18,
    lineHeight: 21,
    fontWeight: '500',
    textAlign: 'center',
    letterSpacing: 0,
  },
  rightSlot: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  sideSlotWithActions: {
    width: HEADER_ACTION_SLOT_WIDTH,
  },
  sideSlotCompact: {
    width: HEADER_COMPACT_SLOT_WIDTH,
  },
});
