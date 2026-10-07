import { FastPressable as Pressable } from '../../ui/components/FastPressable';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import type { ThemeColors } from '../../ui/theme/glass';
import { useResponsiveLayout } from '../../ui/layout/useResponsiveLayout';
import {
  getHeaderGradient,
  type SettingsEnterpriseScreenStyles,
} from './SettingsEnterpriseScreen.styles';

export type SettingsIconName = keyof typeof Ionicons.glyphMap;

export type SettingsMetric = {
  label: string;
  value: number | string;
  accent?: string;
};

export type SettingsStatus = {
  label: string;
  color: string;
  icon?: SettingsIconName;
};

export type SettingsGuardrail = {
  label: string;
  value: string;
  icon: SettingsIconName;
};

type SearchConfig = {
  value: string;
  placeholder: string;
  onChangeText: (value: string) => void;
};

export function SettingsEnterpriseHeader({
  T,
  isDark,
  styles,
  title,
  eyebrow,
  subtitle,
  icon,
  accent,
  status,
  search,
  metrics,
}: {
  T: ThemeColors;
  isDark: boolean;
  styles: SettingsEnterpriseScreenStyles;
  title: string;
  eyebrow: string;
  subtitle: string;
  icon: SettingsIconName;
  accent: string;
  status: SettingsStatus;
  search?: SearchConfig;
  metrics: SettingsMetric[];
}) {
  const layout = useResponsiveLayout();
  const compactHeader = layout.availableWidth / Math.max(1, layout.fontScale) < 600;
  const headerIcon = (
    <View style={[styles.headerIcon, { backgroundColor: tintFor(accent), borderColor: borderFor(accent) }]}>
      <Ionicons name={icon} size={21} color={accent} />
    </View>
  );
  const headerCopy = <>
    <View style={styles.eyebrowRow}>
      <View style={[styles.eyebrowBullet, { backgroundColor: accent }]} />
      <Text style={styles.eyebrow}>{eyebrow}</Text>
    </View>
    <Text style={styles.title}>{title}</Text>
    <Text style={styles.headerSubtitle}>{subtitle}</Text>
  </>;
  const statusBadge = (
    <View style={styles.statusBadge}>
      {status.icon ? <Ionicons name={status.icon} size={12} color={status.color} /> : <View style={[styles.statusDot, { backgroundColor: status.color }]} />}
      <Text style={styles.statusText}>{status.label}</Text>
    </View>
  );
  return (
    <View style={styles.commandHeader}>
      <LinearGradient
        colors={getHeaderGradient(isDark)}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.commandHeaderGradient}
      >
        <View style={[styles.headerAccentBar, { backgroundColor: accent }]} />
        {compactHeader ? <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            {headerIcon}{statusBadge}
          </View>
          <View style={[styles.headerCenter, { flex: 0, width: '100%' }]}>{headerCopy}</View>
        </View> : <View style={styles.centeredHeaderRow}>
          <View style={styles.headerSide}>{headerIcon}</View>
          <View style={styles.headerCenter}>{headerCopy}</View>
          <View style={styles.headerSideRight}>{statusBadge}</View>
        </View>}

        {search ? (
          <View style={styles.searchBox}>
            <Ionicons name="search" size={17} color={T.textMuted} />
            <TextInput
              value={search.value}
              onChangeText={search.onChangeText}
              placeholder={search.placeholder}
              placeholderTextColor={T.textMuted}
              style={styles.searchInput}
              selectionColor={accent}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {search.value.length > 0 && (
              <Pressable onPress={() => search.onChangeText('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={T.textMuted} />
              </Pressable>
            )}
          </View>
        ) : null}

        <View style={styles.telemetryRow}>
          {metrics.map((metric) => (
            <EnterpriseMetric key={metric.label} metric={metric} styles={styles} />
          ))}
        </View>
      </LinearGradient>
    </View>
  );
}

export function EnterpriseMetric({
  metric,
  styles,
}: {
  metric: SettingsMetric;
  styles: SettingsEnterpriseScreenStyles;
}) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricValue, metric.accent ? { color: metric.accent } : null]}>
        {metric.value}
      </Text>
      <Text style={styles.metricLabel}>{metric.label}</Text>
    </View>
  );
}

export function EnterpriseFilterRail<TFilter extends string>({
  filters,
  selectedFilter,
  onSelect,
  styles,
}: {
  filters: readonly TFilter[];
  selectedFilter: TFilter;
  onSelect: (filter: TFilter) => void;
  styles: SettingsEnterpriseScreenStyles;
}) {
  return (
    <ScrollView
      keyboardShouldPersistTaps="always" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRail}>
      {filters.map((filter) => {
        const selected = filter === selectedFilter;

        return (
          <Pressable
            key={filter}
            style={[styles.filterPill, selected && styles.filterPillActive]}
            onPress={() => onSelect(filter)}
          >
            <Text style={[styles.filterPillText, selected && styles.filterPillTextActive]} numberOfLines={1}>
              {filter}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function EnterpriseCoverageStrip({
  value,
  label,
  title,
  text,
  styles,
}: {
  value: string | number;
  label: string;
  title: string;
  text: string;
  styles: SettingsEnterpriseScreenStyles;
}) {
  return (
    <View style={styles.coverageStrip}>
      <View style={styles.coverageBlock}>
        <Text style={styles.coverageValue} numberOfLines={1}>{value}</Text>
        <Text style={styles.coverageLabel}>{label}</Text>
      </View>
      <View style={styles.coverageDivider} />
      <View style={styles.coverageBlockWide}>
        <Text style={styles.coverageTitle}>{title}</Text>
        <Text style={styles.coverageText}>{text}</Text>
      </View>
    </View>
  );
}

export function EnterpriseSectionHeader({
  title,
  subtitle,
  count,
  styles,
}: {
  title: string;
  subtitle: string;
  count: number | string;
  styles: SettingsEnterpriseScreenStyles;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      </View>
      <Text style={styles.sectionCount} numberOfLines={1}>{count}</Text>
    </View>
  );
}

export function EnterpriseTag({
  label,
  styles,
}: {
  label: string;
  styles: SettingsEnterpriseScreenStyles;
}) {
  return (
    <View style={styles.tagChip}>
      <Text style={styles.tagText} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export function EnterpriseTagRail({
  labels,
  styles,
  limit,
}: {
  labels: readonly string[];
  styles: SettingsEnterpriseScreenStyles;
  limit?: number;
}) {
  const visibleLabels = typeof limit === 'number' ? labels.slice(0, limit) : labels;

  if (visibleLabels.length === 0) return null;

  return (
    <View style={styles.tagRail}>
      {visibleLabels.map((label) => (
        <EnterpriseTag key={label} label={label} styles={styles} />
      ))}
    </View>
  );
}

export function EnterpriseGuardrailList({
  items,
  T,
  styles,
  accent,
}: {
  items: readonly SettingsGuardrail[];
  T: ThemeColors;
  styles: SettingsEnterpriseScreenStyles;
  accent?: string;
}) {
  return (
    <View style={styles.guardrailList}>
      {items.map((item) => (
        <View key={item.label} style={styles.guardrailRow}>
          <View style={[styles.guardrailIcon, accent ? { backgroundColor: tintFor(accent), borderColor: borderFor(accent) } : null]}>
            <Ionicons name={item.icon} size={17} color={accent ?? T.accent} />
          </View>
          <View style={styles.guardrailBody}>
            <Text style={styles.guardrailTitle} numberOfLines={1}>{item.label}</Text>
            <Text style={styles.guardrailText}>{item.value}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export function EnterpriseEmptyState({
  T,
  styles,
  title,
  subtitle,
}: {
  T: ThemeColors;
  styles: SettingsEnterpriseScreenStyles;
  title: string;
  subtitle: string;
}) {
  return (
    <View style={styles.emptyCard}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name="file-tray-outline" size={22} color={T.textMuted} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySubtitle}>{subtitle}</Text>
    </View>
  );
}

export function EnterpriseTrustFooter({
  T,
  styles,
  icon,
  title,
  text,
  color,
}: {
  T: ThemeColors;
  styles: SettingsEnterpriseScreenStyles;
  icon: SettingsIconName;
  title: string;
  text: string;
  color?: string;
}) {
  const iconColor = color ?? T.up;

  return (
    <View style={styles.trustFooter}>
      <View style={[styles.trustIcon, { backgroundColor: tintFor(iconColor) }]}>
        <Ionicons name={icon} size={15} color={iconColor} />
      </View>
      <View style={styles.trustBody}>
        <Text style={styles.trustTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.trustText}>{text}</Text>
      </View>
    </View>
  );
}

export function EnterpriseMetaSeparator({
  styles,
}: {
  styles: SettingsEnterpriseScreenStyles;
}) {
  return <View style={styles.metaSeparator} />;
}

export function tintFor(color: string): string {
  if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
    const r = Number.parseInt(color.slice(1, 3), 16);
    const g = Number.parseInt(color.slice(3, 5), 16);
    const b = Number.parseInt(color.slice(5, 7), 16);

    return `rgba(${r},${g},${b},0.14)`;
  }

  return 'rgba(59,130,246,0.14)';
}

export function borderFor(color: string): string {
  if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
    const r = Number.parseInt(color.slice(1, 3), 16);
    const g = Number.parseInt(color.slice(3, 5), 16);
    const b = Number.parseInt(color.slice(5, 7), 16);

    return `rgba(${r},${g},${b},0.28)`;
  }

  return 'rgba(59,130,246,0.28)';
}

export function LeadMeta({
  children,
  styles,
}: {
  children: ReactNode;
  styles: SettingsEnterpriseScreenStyles;
}) {
  return <View style={styles.leadMetaRow}>{children}</View>;
}
