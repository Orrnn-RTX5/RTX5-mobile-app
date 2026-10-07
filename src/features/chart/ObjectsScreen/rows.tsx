import { FastPressable as Pressable } from '../../../ui/components/FastPressable';
import React from 'react';
import { Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { DrawingIconComponent } from './drawingMeta';
import type { ObjectsScreenStyles } from './styles';

export function ActionRow({
  label,
  description,
  accent,
  Icon,
  onPress,
  showDivider,
  styles,
  isDark,
}: {
  label: string;
  description: string;
  accent: string;
  Icon: DrawingIconComponent;
  onPress: () => void;
  showDivider?: boolean;
  styles: ObjectsScreenStyles;
  isDark: boolean;
}) {
  return (
    <>
      <Pressable style={({ pressed }) => [styles.actionRow, pressed && styles.rowPressed]} onPress={onPress}>
        <View style={styles.rowLeft}>
          <View style={[styles.rowIconWrap, { backgroundColor: `${accent}18` }]}>
            <Icon color={accent} />
          </View>
          <View style={styles.rowCopy}>
            <Text style={styles.rowTitle}>{label}</Text>
            <Text style={styles.rowSubtitle}>{description}</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={isDark ? '#475569' : '#94A3B8'} />
      </Pressable>
      {showDivider ? <View style={styles.panelDivider} /> : null}
    </>
  );
}

export function ToggleRow({
  label,
  description,
  value,
  onValueChange,
  styles,
  isDark,
}: {
  label: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  styles: ObjectsScreenStyles;
  isDark: boolean;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{label}</Text>
        <Text style={styles.rowSubtitle}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: isDark ? '#1E1E1E' : '#CBD5E1', true: '#3B82F6' }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}
