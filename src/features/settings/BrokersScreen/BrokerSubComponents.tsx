import { FastPressable as Pressable } from '../../../ui/components/FastPressable';
import React, { useMemo } from 'react';
import { Image, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../ui/theme/useTheme';
import { makeBrokersStyles } from './styles';
import type { BrokerRecord } from './brokerData';

export function FilterPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const T = useTheme();
  const styles = useMemo(() => makeBrokersStyles(T), [T]);
  return (
    <Pressable
      style={({ pressed }) => [
        styles.filterPill,
        active && styles.filterPillActive,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
    >
      <Text style={[styles.filterLabel, active && styles.filterLabelActive]}>{label}</Text>
    </Pressable>
  );
}

export function MetaBadge({
  icon,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}) {
  const T = useTheme();
  const styles = useMemo(() => makeBrokersStyles(T), [T]);
  return (
    <View style={styles.metaBadge}>
      <Ionicons name={icon} size={11} color='#7e97bc' />
      <Text style={styles.metaBadgeText}>{label}</Text>
    </View>
  );
}

export function BrokerLogo({
  broker,
  failed,
  onError,
}: {
  broker: BrokerRecord | null;
  failed: boolean;
  onError: (domain: string) => void;
}) {
  const T = useTheme();
  const styles = useMemo(() => makeBrokersStyles(T), [T]);
  if (!broker) {
    return <View style={styles.logoFallback} />;
  }

  if (!broker.domain || failed) {
    return (
      <View style={styles.logoFallback}>
        <Ionicons name='business-outline' size={20} color='#dbe9ff' />
      </View>
    );
  }

  return (
    <View style={styles.logoImageWrap}>
      <Image
        source={{ uri: `https://logo.clearbit.com/${broker.domain}` }}
        style={styles.logoImage}
        resizeMode='contain'
        onError={() => onError(broker.domain as string)}
      />
    </View>
  );
}

export function DetailStat({ label, value }: { label: string; value: string }) {
  const T = useTheme();
  const styles = useMemo(() => makeBrokersStyles(T), [T]);
  return (
    <View style={styles.detailStat}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}
