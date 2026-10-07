import { FastPressable as Pressable } from '../../../ui/components/FastPressable';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ActionSheet } from '../../../ui/components/ActionSheet';
import { TvLayers } from './ChartToolbarIcons';

type ChartToolbarObjectsButtonProps = {
  isDark: boolean;
  onPress: () => void;
  textMutedColor: string;
};

type ChartToolbarMoreButtonProps = {
  isDark: boolean;
  onPress: () => void;
  textMutedColor: string;
};

type ChartToolbarMoreActionSheetProps = {
  onClose: () => void;
  onOpenAnalytics: () => void;
  onOpenSpecification: () => void;
  onOpenTradingCalculator: () => void;
  onRemoveFromFavorites: () => void;
  textMutedColor: string;
  visible: boolean;
};

const baseStyles = StyleSheet.create({
  toolbarSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
  },
  toolbarIconButton: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const lightStyles = StyleSheet.create({
  toolbarSlot: {
    borderLeftColor: 'rgba(0,0,0,0.08)',
  },
});

const darkStyles = StyleSheet.create({
  toolbarSlot: {
    borderLeftColor: 'rgba(255,255,255,0.08)',
  },
});

export function ChartToolbarObjectsButton({
  isDark,
  onPress,
  textMutedColor,
}: ChartToolbarObjectsButtonProps) {
  const themeStyles = isDark ? darkStyles : lightStyles;

  return (
    <View style={[baseStyles.toolbarSlot, themeStyles.toolbarSlot]}>
      <Pressable
        style={baseStyles.toolbarIconButton}
        onPressIn={onPress}
        hitSlop={8}
        unstable_pressDelay={0}
      >
        <TvLayers color={textMutedColor} size={16} />
      </Pressable>
    </View>
  );
}

export function ChartToolbarMoreButton({
  isDark,
  onPress,
  textMutedColor,
}: ChartToolbarMoreButtonProps) {
  const themeStyles = isDark ? darkStyles : lightStyles;

  return (
    <View style={[baseStyles.toolbarSlot, themeStyles.toolbarSlot]}>
      <Pressable
        style={baseStyles.toolbarIconButton}
        onPressIn={onPress}
        hitSlop={8}
        unstable_pressDelay={0}
      >
        <Ionicons name="ellipsis-vertical" size={16} color={textMutedColor} />
      </Pressable>
    </View>
  );
}

export function ChartToolbarMoreActionSheet({
  onClose,
  onOpenAnalytics,
  onOpenSpecification,
  onOpenTradingCalculator,
  onRemoveFromFavorites,
  textMutedColor,
  visible,
}: ChartToolbarMoreActionSheetProps) {
  return (
    <ActionSheet
      visible={visible}
      onClose={onClose}
      presentation="mt5Plain"
      showActionIcons
      detent="adaptive"
      instantOpen
      actions={[
        {
          label: 'Remove from favorites',
          icon: <Ionicons name="star" size={20} color={textMutedColor} />,
          onPress: onRemoveFromFavorites,
        },
        {
          label: 'Trading calculator',
          icon: <Ionicons name="calculator-outline" size={20} color={textMutedColor} />,
          onPress: onOpenTradingCalculator,
        },
        {
          label: 'Analytics',
          icon: <Ionicons name="analytics-outline" size={20} color={textMutedColor} />,
          onPress: onOpenAnalytics,
        },
        {
          label: 'Specification',
          icon: <Ionicons name="clipboard-outline" size={20} color={textMutedColor} />,
          onPress: onOpenSpecification,
        },
      ]}
    />
  );
}
