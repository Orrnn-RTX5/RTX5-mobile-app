import { FastPressable as Pressable } from '../../../ui/components/FastPressable';
/**
 * Shared primitives for MT5-style indicator configuration screens.
 * Line preview, row chrome, section headers, and MT5 color palette.
 */

import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { ThemeColors } from '../../../ui/theme/glass';
import { LineStyle } from '../indicatorRegistry';

export function LinePreview({
  color,
  style,
  width,
  previewWidth = 60,
}: {
  color: string;
  style: LineStyle;
  width: number;
  previewWidth?: number;
}) {
  const strokeDasharray =
    style === 'solid' ? undefined
    : style === 'dashed' ? '6,4'
    : style === 'dotted' ? '2,3'
    : style === 'dashdot' ? '6,3,2,3'
    : '6,3,2,3,2,3';
  return (
    <Svg width={previewWidth} height={12}>
      <Line
        x1={0}
        y1={6}
        x2={previewWidth}
        y2={6}
        stroke={color}
        strokeWidth={width}
        strokeDasharray={strokeDasharray}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function SectionHeader({
  title,
  isDark,
}: {
  title: string;
  isDark: boolean;
}) {
  return (
    <View style={s.sectionHeader}>
      <Text style={[s.sectionTitle, { color: isDark ? '#94A3B8' : '#64748B' }]}>
        {title.toUpperCase()}
      </Text>
    </View>
  );
}

export function Card({
  children,
  isDark,
  style,
}: {
  children: React.ReactNode;
  isDark: boolean;
  style?: ViewStyle;
}) {
  return (
    <View
      style={[
        s.card,
        {
          backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF',
          borderColor: isDark ? 'rgba(255,255,255,0.10)' : '#EEF2F7',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Separator({ isDark, inset = 14 }: { isDark: boolean; inset?: number }) {
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#EEF2F7',
        marginLeft: inset,
      }}
    />
  );
}

export function Row({
  label,
  rightText,
  rightNode,
  onPress,
  T,
  isDark,
  showChevron = true,
}: {
  label: string;
  rightText?: string;
  rightNode?: React.ReactNode;
  onPress?: () => void;
  T: ThemeColors;
  isDark: boolean;
  showChevron?: boolean;
}) {
  const content = (
    <>
      <Text style={[s.rowLabel, { color: T.text }]}>{label}</Text>
      <View style={s.rowRight}>
        {rightText !== undefined && (
          <Text style={[s.rowValue, { color: isDark ? '#94A3B8' : '#64748B' }]}>
            {rightText}
          </Text>
        )}
        {rightNode}
        {showChevron && onPress && (
          <Ionicons name="chevron-forward" size={16} color="#64748B" />
        )}
      </View>
    </>
  );
  if (!onPress) {
    return <View style={s.row}>{content}</View>;
  }
  return (
    <Pressable
      style={({ pressed }) => [
        s.row,
        pressed && {
          backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
        },
      ]}
      onPress={onPress}
    >
      {content}
    </Pressable>
  );
}

// MT5 preset color palette
export const MT5_COLOR_PALETTE: string[] = [
  '#000000', '#7F7F7F', '#880015', '#ED1C24', '#FF7F27', '#FFF200',
  '#22B14C', '#00A2E8', '#3F48CC', '#A349A4', '#FFFFFF', '#C3C3C3',
  '#B97A57', '#FFAEC9', '#FFC90E', '#EFE4B0', '#B5E61D', '#99D9EA',
  '#7092BE', '#C8BFE7', '#FF0000', '#00FF00', '#0000FF', '#FFFF00',
  '#FF00FF', '#00FFFF', '#FFA500', '#800080', '#008000', '#000080',
  '#800000', '#808000',
];

const s = StyleSheet.create({
  sectionHeader: {
    paddingHorizontal: 20,
    marginTop: 24,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.1,
  },
  card: {
    marginHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    minHeight: 52,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
});
