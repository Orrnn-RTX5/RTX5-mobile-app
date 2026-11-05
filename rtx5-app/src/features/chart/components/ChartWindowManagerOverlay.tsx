import { Ionicons } from '@expo/vector-icons';
import React, { memo, useCallback, useEffect, useMemo } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import { FastPressable as Pressable } from '../../../ui/components/FastPressable';
import { useTheme, type ThemeColors } from '../../../ui/theme/useTheme';
import {
  canOpenChartWindowFromManager,
  resolveChartWindowMoveTargetIndex,
  resolveChartWindowRemovalIds,
} from './chartWindowManagerUiState';

export type ChartWindowManagerPane = Readonly<{
  id: string;
  symbol: string;
  timeframe: string;
}>;

export type ChartWindowManagerOverlayProps = Readonly<{
  visible: boolean;
  panes: readonly ChartWindowManagerPane[];
  selectedRemovalIds: ReadonlySet<string> | readonly string[];
  /** Optional parent capability gate; pane count is always enforced too. */
  canOpen?: boolean;
  /** Supports parents that already expose the inverse capability. */
  maxReached?: boolean;
  onClose: () => void;
  onNewWindow: () => void;
  onToggleRemoval: (paneId: string) => void;
  onRemove: (paneIds: readonly string[]) => void;
  onSetHorizontal: () => void;
  onSetVertical: () => void;
  onMovePane: (paneId: string, toIndex: number) => void;
}>;

type TileLayoutIconProps = Readonly<{
  color: string;
  orientation: 'horizontal' | 'vertical';
}>;

function TileLayoutIcon({ color, orientation }: TileLayoutIconProps) {
  return (
    <View style={[stylesBase.tileIcon, { borderColor: color }]} pointerEvents="none">
      <View
        style={[
          stylesBase.tileDivider,
          orientation === 'horizontal'
            ? stylesBase.tileDividerHorizontal
            : stylesBase.tileDividerVertical,
          { backgroundColor: color },
        ]}
      />
    </View>
  );
}

/**
 * Controlled MT5-style chart window manager. It is intentionally unmounted
 * while closed so neither the backdrop nor the native WebView can retain a
 * stale interception/visual layer after dismissal.
 */
export const ChartWindowManagerOverlay = memo(function ChartWindowManagerOverlay({
  visible,
  panes,
  selectedRemovalIds,
  canOpen,
  maxReached,
  onClose,
  onNewWindow,
  onToggleRemoval,
  onRemove,
  onSetHorizontal,
  onSetVertical,
  onMovePane,
}: ChartWindowManagerOverlayProps) {
  const T = useTheme({ active: visible });
  const themedStyles = useMemo(() => makeStyles(T), [T]);
  const selectedIdSet = useMemo(
    () => new Set<string>(selectedRemovalIds),
    [selectedRemovalIds],
  );
  const removalIds = useMemo(
    () => resolveChartWindowRemovalIds(panes, selectedIdSet),
    [panes, selectedIdSet],
  );
  const newWindowEnabled = canOpenChartWindowFromManager({
    paneCount: panes.length,
    canOpen,
    maxReached,
  });
  const removeEnabled = removalIds.length > 0;

  useEffect(() => {
    if (!visible) {
      return undefined;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });

    return () => subscription.remove();
  }, [onClose, visible]);

  const handleRemove = useCallback(() => {
    if (removalIds.length > 0) {
      onRemove(removalIds);
    }
  }, [onRemove, removalIds]);

  const handleMovePane = useCallback((paneId: string) => {
    const targetIndex = resolveChartWindowMoveTargetIndex(panes, paneId);
    if (targetIndex !== null) {
      onMovePane(paneId, targetIndex);
    }
  }, [onMovePane, panes]);

  if (!visible) {
    return null;
  }

  return (
    <View
      testID="chart-window-manager-overlay"
      accessibilityViewIsModal
      importantForAccessibility="yes"
      style={themedStyles.overlay}
    >
      <Pressable
        testID="chart-window-manager-backdrop"
        accessibilityLabel="Close Charts"
        style={StyleSheet.absoluteFillObject}
        onPress={onClose}
        activateOnPressIn
        latencyLabel="chart.windowManager.closeBackdrop"
        unstable_pressDelay={0}
      />

      <View
        testID="chart-window-manager-panel"
        accessibilityRole="summary"
        style={themedStyles.panel}
      >
        <Text accessibilityRole="header" style={themedStyles.title}>Charts</Text>

        <Pressable
          testID="chart-window-manager-new-window"
          accessibilityRole="button"
          accessibilityLabel="New Window"
          accessibilityState={{ disabled: !newWindowEnabled }}
          disabled={!newWindowEnabled}
          onPress={onNewWindow}
          activateOnPressIn
          latencyLabel="chart.windowManager.newWindow"
          unstable_pressDelay={0}
          style={({ pressed }) => [
            themedStyles.actionRow,
            themedStyles.newWindowRow,
            pressed && newWindowEnabled && themedStyles.rowPressed,
          ]}
        >
          <Ionicons
            name="add-outline"
            size={24}
            color={newWindowEnabled ? T.accent : T.textFaint}
          />
          <Text
            style={[
              themedStyles.actionText,
              !newWindowEnabled && themedStyles.disabledText,
            ]}
          >
            New Window
          </Text>
        </Pressable>

        <View style={themedStyles.divider} />

        <View accessibilityRole="list" style={themedStyles.paneList}>
          {panes.map((pane, index) => {
            const selected = selectedIdSet.has(pane.id);
            const canMove = panes.length > 1;

            return (
              <View
                key={pane.id}
                testID={`chart-window-manager-pane-${pane.id}`}
                accessibilityRole="none"
                style={[
                  themedStyles.paneRow,
                  index < panes.length - 1 && themedStyles.paneRowBorder,
                ]}
              >
                <Pressable
                  testID={`chart-window-manager-select-${pane.id}`}
                  accessibilityRole="checkbox"
                  accessibilityLabel={`Select ${pane.symbol}, ${pane.timeframe} for removal`}
                  accessibilityState={{ checked: selected }}
                  onPress={() => onToggleRemoval(pane.id)}
                  activateOnPressIn
                  latencyLabel={`chart.windowManager.toggleRemoval.${pane.id}`}
                  unstable_pressDelay={0}
                  hitSlop={6}
                  style={({ pressed }) => [
                    themedStyles.paneSelection,
                    pressed && themedStyles.rowPressed,
                  ]}
                >
                  <View
                    pointerEvents="none"
                    style={[
                      themedStyles.checkbox,
                      selected && themedStyles.checkboxSelected,
                    ]}
                  >
                    {selected ? <Ionicons name="checkmark" size={15} color="#FFFFFF" /> : null}
                  </View>
                  <Text numberOfLines={1} style={themedStyles.paneSymbol}>{pane.symbol}</Text>
                </Pressable>

                <Pressable
                  testID={`chart-window-manager-move-${pane.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Move ${pane.symbol}, ${pane.timeframe}`}
                  accessibilityHint={canMove ? 'Swaps this chart with the other chart' : undefined}
                  accessibilityState={{ disabled: !canMove }}
                  disabled={!canMove}
                  onPress={() => handleMovePane(pane.id)}
                  activateOnPressIn
                  latencyLabel={`chart.windowManager.move.${pane.id}`}
                  unstable_pressDelay={0}
                  hitSlop={8}
                  style={({ pressed }) => [
                    themedStyles.reorderButton,
                    pressed && canMove && themedStyles.rowPressed,
                  ]}
                >
                  <Ionicons
                    name="reorder-three-outline"
                    size={25}
                    color={canMove ? T.textMuted : T.textFaint}
                  />
                </Pressable>
              </View>
            );
          })}
        </View>

        {panes.length > 1 ? (
          <>
            <View style={themedStyles.divider} />

            <Pressable
              testID="chart-window-manager-tile-horizontal"
              accessibilityRole="button"
              accessibilityLabel="Tile Horizontally"
              onPress={onSetHorizontal}
              activateOnPressIn
              latencyLabel="chart.windowManager.tileHorizontal"
              unstable_pressDelay={0}
              style={({ pressed }) => [themedStyles.actionRow, pressed && themedStyles.rowPressed]}
            >
              <TileLayoutIcon color={T.textSub} orientation="horizontal" />
              <Text style={themedStyles.actionText}>Tile Horizontally</Text>
            </Pressable>

            <Pressable
              testID="chart-window-manager-tile-vertical"
              accessibilityRole="button"
              accessibilityLabel="Tile Vertically"
              onPress={onSetVertical}
              activateOnPressIn
              latencyLabel="chart.windowManager.tileVertical"
              unstable_pressDelay={0}
              style={({ pressed }) => [themedStyles.actionRow, pressed && themedStyles.rowPressed]}
            >
              <TileLayoutIcon color={T.textSub} orientation="vertical" />
              <Text style={themedStyles.actionText}>Tile Vertically</Text>
            </Pressable>
          </>
        ) : null}

        <Pressable
          testID="chart-window-manager-remove"
          accessibilityRole="button"
          accessibilityLabel="Remove selected charts"
          accessibilityState={{ disabled: !removeEnabled }}
          disabled={!removeEnabled}
          onPress={handleRemove}
          activateOnPressIn
          latencyLabel="chart.windowManager.remove"
          unstable_pressDelay={0}
          style={({ pressed }) => [
            themedStyles.removeButton,
            !removeEnabled && themedStyles.removeButtonDisabled,
            pressed && removeEnabled && themedStyles.removeButtonPressed,
          ]}
        >
          <Ionicons
            name="trash-outline"
            size={19}
            color={removeEnabled ? '#FFFFFF' : T.textFaint}
          />
          <Text
            style={[
              themedStyles.removeText,
              !removeEnabled && themedStyles.removeTextDisabled,
            ]}
          >
            Remove
          </Text>
        </Pressable>
      </View>
    </View>
  );
});

const stylesBase = StyleSheet.create({
  tileIcon: {
    width: 23,
    height: 19,
    borderRadius: 2,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  tileDivider: {
    position: 'absolute',
  },
  tileDividerHorizontal: {
    left: 0,
    right: 0,
    top: 8,
    height: 1.5,
  },
  tileDividerVertical: {
    top: 0,
    bottom: 0,
    left: 9.75,
    width: 1.5,
  },
});

function makeStyles(T: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 150,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 20,
      backgroundColor: 'rgba(0,0,0,0.52)',
    },
    panel: {
      width: '100%',
      maxWidth: 360,
      overflow: 'hidden',
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: T.border,
      backgroundColor: T.bgSecondary,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.24,
      shadowRadius: 18,
      elevation: 12,
    },
    title: {
      paddingTop: 20,
      paddingHorizontal: 20,
      paddingBottom: 13,
      color: T.text,
      fontSize: 20,
      lineHeight: 26,
      fontWeight: '500',
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: T.border,
    },
    actionRow: {
      minHeight: 50,
      paddingHorizontal: 20,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 17,
    },
    newWindowRow: {
      minHeight: 52,
    },
    actionText: {
      flex: 1,
      color: T.text,
      fontSize: 16,
      lineHeight: 21,
      fontWeight: '400',
    },
    disabledText: {
      color: T.textFaint,
    },
    rowPressed: {
      backgroundColor: T.glass3,
    },
    paneList: {
      paddingVertical: 2,
    },
    paneRow: {
      minHeight: 54,
      marginLeft: 20,
      paddingRight: 12,
      flexDirection: 'row',
      alignItems: 'center',
    },
    paneRowBorder: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: T.borderSubtle,
    },
    paneSelection: {
      minHeight: 52,
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 5,
    },
    checkbox: {
      width: 21,
      height: 21,
      marginRight: 16,
      borderRadius: 2,
      borderWidth: 1.5,
      borderColor: T.textMuted,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    checkboxSelected: {
      borderColor: T.accent,
      backgroundColor: T.accent,
    },
    paneSymbol: {
      maxWidth: '57%',
      color: T.text,
      fontSize: 16,
      lineHeight: 21,
      fontWeight: '500',
    },
    paneTimeframe: {
      flexShrink: 1,
      color: T.textSub,
      fontSize: 16,
      lineHeight: 21,
      fontWeight: '400',
    },
    reorderButton: {
      width: 42,
      height: 42,
      marginLeft: 8,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    removeButton: {
      minHeight: 48,
      margin: 14,
      borderRadius: 28,
      flexDirection: 'row',
      gap: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: T.trading.sell.primary,
    },
    removeButtonDisabled: {
      backgroundColor: T.glass1,
    },
    removeButtonPressed: {
      backgroundColor: T.trading.sell.active,
    },
    removeText: {
      color: '#FFFFFF',
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '600',
      textTransform: 'uppercase',
    },
    removeTextDisabled: {
      color: T.textFaint,
    },
  });
}
