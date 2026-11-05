import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FastPressable } from '../../../ui/components/FastPressable';
import type { ThemeColors } from '../../../ui/theme/glass';
import type { SettingsStyles } from './styles';

const SETTINGS_ROW_PRESS_RETENTION_OFFSET = { top: 8, bottom: 8, left: 18, right: 18 } as const;

/**
 * A reusable UI list row component used across the settings screens to display individual configurable options.
 */
export function SettingRow({
  icon,
  color,
  title,
  sub,
  badge,
  rightElement,
  onPress,
  onPressIn,
  onTouchStart,
  activateOnPressIn,
  activateOnTouchStart,
  T,
  styles,
}: {
  icon: any;
  color: string;
  title: string;
  sub?: string;
  badge?: string;
  rightElement?: React.ReactNode;
  onPress?: () => void;
  onPressIn?: () => void;
  onTouchStart?: () => void;
  activateOnPressIn?: boolean;
  activateOnTouchStart?: boolean;
  T: ThemeColors;
  styles: SettingsStyles;
}) {
  return (
    <FastPressable
      style={({ pressed }) => [
        styles.row,
        pressed && styles.rowPressed,
      ]}
      latencyLabel={`settings.row.${title}`}
      onPress={onPress}
      onPressIn={onPressIn}
      onTouchStart={onTouchStart}
      activateOnPressIn={activateOnPressIn}
      activateOnTouchStart={activateOnTouchStart}
      pressRetentionOffset={SETTINGS_ROW_PRESS_RETENTION_OFFSET}
      unstable_pressDelay={0}
      android_ripple={{ color: `${color}24` }}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      <View style={[styles.iconBox, { backgroundColor: `${color}1A` }, styles.iconBoxTint]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <View style={styles.rowTextWrap}>
        <Text style={styles.rowTitle}>{title}</Text>
        {sub && <Text style={styles.rowSub}>{sub}</Text>}
      </View>
      <View style={styles.rowRight}>
        {rightElement ? rightElement : (
          <>
            {badge && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{badge}</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={16} color={T.textMuted} />
          </>
        )}
      </View>
    </FastPressable>
  );
}
