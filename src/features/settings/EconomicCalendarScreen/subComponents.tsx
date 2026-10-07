import React, { useEffect, useRef } from 'react';
import { Animated, AppState, Text, View } from 'react-native';
import type { ImpactLevel } from '../../../dev/mock/calendarData';
import { COUNTRY_COLORS, DEFAULT_COUNTRY_COLOR, IMPACT_CONFIG } from './eventHelpers';

export function PulseDot({ color, size = 6, active = true }: { color: string; size?: number; active?: boolean }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active) { pulse.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.6, duration: 1200, useNativeDriver: true, isInteraction: false }),
        Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: true, isInteraction: false }),
      ])
    );
    const syncVisibility = (state: string) => {
      loop.stop();
      pulse.setValue(1);
      if (state === 'active') { loop.reset(); loop.start(); }
    };
    syncVisibility(AppState.currentState);
    const subscription = AppState.addEventListener('change', syncVisibility);
    return () => { subscription.remove(); loop.stop(); };
  }, [active, pulse]);
  return (
    <View style={{ width: size * 2.6, height: size * 2.6, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: size * 2.2, height: size * 2.2, borderRadius: 99, backgroundColor: color, opacity: 0.2, transform: [{ scale: pulse }] }} />
      <View style={{ width: size, height: size, borderRadius: 99, backgroundColor: color }} />
    </View>
  );
}

export function ImpactBadge({ impact, compact }: { impact: ImpactLevel; compact?: boolean }) {
  const config = IMPACT_CONFIG[impact];
  if (compact) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: 18 }}>
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: config.color + '30', alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: config.color }} />
        </View>
      </View>
    );
  }
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
      backgroundColor: config.color + '15',
    }}>
      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: config.color + '30', alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: config.color }} />
      </View>
      <Text style={{ color: config.color, fontSize: 10, fontWeight: '600', letterSpacing: 0.4 }}>{config.label.toUpperCase()}</Text>
    </View>
  );
}

export function CountryBadge({ country }: { country: string }) {
  const cfg = COUNTRY_COLORS[country] || DEFAULT_COUNTRY_COLOR;
  return (
    <View style={{
      width: 22, height: 16, borderRadius: 3, alignItems: 'center', justifyContent: 'center',
      backgroundColor: cfg.bg, borderWidth: 1, borderColor: cfg.text + '30',
    }}>
      <Text style={{ color: cfg.text, fontSize: 8, fontWeight: '600', letterSpacing: 0.2 }}>{cfg.abbr}</Text>
    </View>
  );
}
