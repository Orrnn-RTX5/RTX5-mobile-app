import { FastPressable as Pressable } from '../../../ui/components/FastPressable';
/**
 * Shared sub-components for SymbolDetailsScreen — flag pair, section card,
 * key/value row, metric pill, range bar, and momentum (sentiment) bar.
 */
import React, { useMemo, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsDarkTheme } from '../../../state/themeMode';
import { useTheme } from '../../../ui/theme/useTheme';
import type { MarketSentimentSnapshot } from '../../../domain/marketSentiment';
import { ASSET_ICONS, CC, flagUrl } from './instrumentMeta';
import { makeSymbolDetailsStyles } from './styles';

export function SymbolFlags({ symbol }: { symbol: string }) {
  const T = useTheme();
  const isDark = useIsDarkTheme();
  const fl = useMemo(() => makeSymbolDetailsStyles(T, isDark).fl, [T, isDark]);

  const core = symbol.replace(/m$/i, '');
  const base3 = core.slice(0, 3);
  const quote3 = core.length >= 6 ? core.slice(3, 6) : '';
  const baseCC = CC[base3];
  const quoteCC = CC[quote3];
  const assetIcon = ASSET_ICONS[base3];

  if (baseCC && quoteCC && !assetIcon) {
    return (
      <View style={fl.wrap}>
        <View style={fl.ring}><Image source={{ uri: flagUrl(baseCC) }} style={fl.img} /></View>
        <View style={[fl.ring, fl.overlap]}><Image source={{ uri: flagUrl(quoteCC) }} style={fl.img} /></View>
      </View>
    );
  }
  if (assetIcon) {
    return (
      <View style={fl.iconWrap}>
        <Ionicons name={assetIcon} size={22} color="#3B82F6" />
      </View>
    );
  }
  return (
    <View style={fl.iconWrap}>
      <Ionicons name="globe-outline" size={22} color={T.textMuted} />
    </View>
  );
}

export function Section({ title, icon, children }: { title: string; icon: keyof typeof Ionicons.glyphMap; children: React.ReactNode }) {
  const T = useTheme();
  const isDark = useIsDarkTheme();
  const sec = useMemo(() => makeSymbolDetailsStyles(T, isDark).sec, [T, isDark]);
  const [expanded, setExpanded] = useState(true);

  return (
    <View style={sec.card}>
      <Pressable onPress={() => setExpanded(e => !e)}>
        <LinearGradient colors={isDark ? ['rgba(59,130,246,0.06)', 'rgba(59,130,246,0)'] : ['rgba(0,0,0,0.02)', 'rgba(0,0,0,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={sec.headerGrad}>
          <View style={sec.iconBox}>
            <Ionicons name={icon} size={13} color={isDark ? "#60A5FA" : T.trading.buy.primary} />
          </View>
          <Text style={sec.title}>{title}</Text>
          <View style={{ flex: 1 }} />
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={14} color={T.textMuted} />
        </LinearGradient>
      </Pressable>
      {expanded && children}
    </View>
  );
}

export function Row({ label, value, accent, last = false }: { label: string; value: string; accent?: string; last?: boolean }) {
  const T = useTheme();
  const isDark = useIsDarkTheme();
  const rw = useMemo(() => makeSymbolDetailsStyles(T, isDark).rw, [T, isDark]);

  return (
    <View style={[rw.row, last && { borderBottomWidth: 0 }]}>
      <Text style={rw.key}>{label}</Text>
      <Text style={[rw.val, accent ? { color: accent } : null]}>{value}</Text>
    </View>
  );
}

export function MetricPill({ label, value, accent, icon }: { label: string; value: string; accent?: string; icon: keyof typeof Ionicons.glyphMap }) {
  const T = useTheme();
  const isDark = useIsDarkTheme();
  const mp = useMemo(() => makeSymbolDetailsStyles(T, isDark).mp, [T, isDark]);

  return (
    <View style={mp.chip}>
      <View style={mp.iconRow}>
        <Ionicons name={icon} size={14} color={accent ?? T.textSub} />
        <Text style={mp.lbl}>{label}</Text>
      </View>
      <Text style={[mp.val, accent ? { color: accent } : null]}>{value}</Text>
    </View>
  );
}

export function RangeBar({ pos, color }: { pos: number; color: string }) {
  const T = useTheme();
  const isDark = useIsDarkTheme();
  const rangeB = useMemo(() => makeSymbolDetailsStyles(T, isDark).rangeB, [T, isDark]);

  return (
    <View style={rangeB.track}>
      <LinearGradient
        colors={['transparent', color]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={[rangeB.fill, { width: `${pos}%` as any }]}
      />
      <View style={[rangeB.knob, { left: `${pos}%` as any, borderColor: color, shadowColor: color, shadowOpacity: 0.15, shadowRadius: 2, shadowOffset: { width: 0, height: 0 } }]} />
    </View>
  );
}

export function MomentumBar({ sentiment }: { sentiment: MarketSentimentSnapshot }) {
  const T = useTheme();
  const isDark = useIsDarkTheme();
  const mom = useMemo(() => makeSymbolDetailsStyles(T, isDark).mom, [T, isDark]);
  const { buyPct, sellPct } = sentiment;

  return (
    <View style={mom.container}>
      <View style={mom.header}>
        <Text style={mom.title}>MARKET SENTIMENT</Text>
      </View>
      <View style={mom.barRow}>
        <Text style={[mom.pctText, { color: T.up }]}>{buyPct.toFixed(0)}%</Text>
        <View style={mom.barTrack}>
          <LinearGradient colors={[T.up, T.upGlow]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[mom.barFillLeft, { width: `${buyPct}%` as any }]} />
          <LinearGradient colors={[T.downGlow, T.down]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[mom.barFillRight, { width: `${sellPct}%` as any }]} />
        </View>
        <Text style={[mom.pctText, { color: T.down }]}>{sellPct.toFixed(0)}%</Text>
      </View>
      <View style={mom.labelRow}>
        <Text style={[mom.label, { color: T.up }]}>BUYERS</Text>
        <Text style={[mom.label, { color: T.down }]}>SELLERS</Text>
      </View>
    </View>
  );
}
