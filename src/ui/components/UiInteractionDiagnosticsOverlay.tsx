import { FastPressable as Pressable } from './FastPressable';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUiInteractionDiagnostics } from '../../dev/uiInteractionDiagnostics';
import {
  buildUiPerformanceTraceMetrics,
  formatUiPerformanceSampleKind,
  formatUiPerformanceSampleMetrics,
} from '../../dev/uiPerformanceDiagnostics.helpers';
import { useTheme } from '../theme/useTheme';
import { useIsDarkTheme } from '../../state/themeMode';

const DEV_ENABLED = typeof __DEV__ !== 'undefined' && __DEV__;

const formatMetric = (value: number) => `${Math.round(value)}ms`;

export function UiInteractionDiagnosticsOverlay() {
  const enabled = useUiInteractionDiagnostics((state) => state.enabled);
  const samples = useUiInteractionDiagnostics((state) => state.samples);
  const clearSamples = useUiInteractionDiagnostics((state) => state.clearSamples);
  const [expanded, setExpanded] = useState(false);
  const [selectedSampleId, setSelectedSampleId] = useState<string | null>(null);
  const T = useTheme();
  const isDark = useIsDarkTheme();
  const insets = useSafeAreaInsets();

  const latest = samples[0] ?? null;
  const selectedSample = useMemo(
    () => samples.find((sample) => sample.id === selectedSampleId) ?? null,
    [samples, selectedSampleId],
  );
  const tone = useMemo(() => {
    if (!latest) return '#64748B';
    if (latest.severity === 'slow') return '#DC2626';
    if (latest.severity === 'warning') return '#D97706';
    return '#059669';
  }, [latest]);

  useEffect(() => {
    if (!expanded && selectedSampleId !== null) {
      setSelectedSampleId(null);
      return;
    }

    if (selectedSampleId && !samples.some((sample) => sample.id === selectedSampleId)) {
      setSelectedSampleId(null);
    }
  }, [expanded, samples, selectedSampleId]);

  if (!DEV_ENABLED || !enabled) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View
        pointerEvents="box-none"
        style={[
          styles.anchor,
          {
            top: Math.max(insets.top, 12) + 8,
          },
        ]}
      >
        <Pressable
          onPress={() => setExpanded((current) => !current)}
          onLongPress={() => {
            clearSamples();
            setExpanded(false);
          }}
          delayLongPress={250}
          style={[
            styles.badge,
            {
              backgroundColor: isDark ? 'rgba(14,20,31,0.96)' : 'rgba(255,255,255,0.96)',
              borderColor: tone,
            },
          ]}
        >
          <Text style={[styles.badgeTitle, { color: T.text }]}>
            UI {latest ? formatMetric(latest.nextFrameMs) : '--'}
          </Text>
          <Text style={[styles.badgeSubtitle, { color: T.textMuted }]}>
            {latest ? latest.label : 'Waiting for taps'}
          </Text>
        </Pressable>

        {expanded ? (
          <View
            style={[
              styles.panel,
              {
                backgroundColor: isDark ? 'rgba(14,20,31,0.98)' : 'rgba(255,255,255,0.98)',
                borderColor: isDark ? 'rgba(255,255,255,0.08)' : T.border,
              },
            ]}
          >
            <View style={styles.panelHeader}>
              <Text style={[styles.panelTitle, { color: T.text }]}>Interaction Diagnostics</Text>
              <View style={styles.panelActions}>
                <Pressable
                  onPress={() => {
                    setSelectedSampleId(null);
                    setExpanded(false);
                  }}
                  hitSlop={8}
                  style={styles.panelAction}
                >
                  <Text style={[styles.panelActionText, { color: T.textMuted }]}>Hide</Text>
                </Pressable>
                <Pressable
                  onPress={clearSamples}
                  hitSlop={8}
                  style={styles.panelAction}
                >
                  <Text style={[styles.panelActionText, { color: T.textMuted }]}>Clear</Text>
                </Pressable>
              </View>
            </View>
            <Text style={[styles.panelHint, { color: T.textDimmed }]}>
              Samples persist on this device in dev mode, so slow paths can be checked later without reproducing everything again.
            </Text>
            {samples.length === 0 ? (
              <Text style={[styles.emptyText, { color: T.textMuted }]}>
                No samples yet. Tap around the app on device and this panel will fill in.
              </Text>
            ) : (
              samples.slice(0, 8).map((sample) => (
                <Pressable
                  key={sample.id}
                  onPress={() =>
                    setSelectedSampleId((current) => (current === sample.id ? null : sample.id))
                  }
                  style={[
                    styles.sampleRow,
                    selectedSampleId === sample.id && {
                      backgroundColor: isDark ? 'rgba(37,99,235,0.14)' : 'rgba(37,99,235,0.08)',
                      borderColor: isDark ? 'rgba(96,165,250,0.45)' : 'rgba(37,99,235,0.18)',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.sampleKind,
                      {
                        color:
                          sample.kind === 'stall'
                            ? '#DC2626'
                            : sample.kind === 'feed'
                              ? '#B45309'
                              : sample.kind === 'navigation'
                                ? T.accent
                                : T.textMuted,
                      },
                    ]}
                  >
                    {formatUiPerformanceSampleKind(sample)}
                  </Text>
                  <Text style={[styles.sampleLabel, { color: T.text }]} numberOfLines={1}>
                    {sample.label}
                  </Text>
                  <Text
                    style={[
                      styles.sampleMetrics,
                      { color: sample.severity === 'slow' ? '#DC2626' : sample.severity === 'warning' ? '#D97706' : T.textMuted },
                    ]}
                    numberOfLines={1}
                  >
                    {formatUiPerformanceSampleMetrics(sample)}
                  </Text>
                  {sample.context ? (
                    <Text style={[styles.sampleContext, { color: T.textDimmed }]} numberOfLines={1}>
                      {sample.context}
                    </Text>
                  ) : null}
                </Pressable>
              ))
            )}
            {selectedSample ? (
              <View
                style={[
                  styles.traceCard,
                  {
                    backgroundColor: isDark ? 'rgba(2,6,23,0.72)' : 'rgba(248,250,252,0.92)',
                    borderColor: isDark ? 'rgba(148,163,184,0.18)' : T.border,
                  },
                ]}
              >
                <Text style={[styles.traceTitle, { color: T.text }]}>
                  {selectedSample.label}
                </Text>
                {buildUiPerformanceTraceMetrics(selectedSample).map((metric) => (
                  <View key={`${selectedSample.id}-${metric.label}`} style={styles.traceRow}>
                    <Text style={[styles.traceLabel, { color: T.textMuted }]}>{metric.label}</Text>
                    <Text style={[styles.traceValue, { color: T.text }]}>{metric.value}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            <Text style={[styles.panelHint, { color: T.textDimmed }]}>
              Tap a sample to open its full time trace. `ACT` action, `NAV` navigation, `STALL` JS thread blocked, `FEED` quote gap. Long-press the badge to clear.
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    right: 12,
    alignItems: 'flex-end',
    zIndex: 99999,
    elevation: 99999,
  },
  badge: {
    maxWidth: 220,
    minWidth: 124,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  badgeTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  badgeSubtitle: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '600',
  },
  panel: {
    width: 300,
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  panelActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  panelTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  panelAction: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  panelActionText: {
    fontSize: 11,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 11,
    lineHeight: 16,
  },
  sampleRow: {
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 12,
    marginBottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  sampleKind: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  sampleLabel: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '700',
  },
  sampleMetrics: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '700',
  },
  sampleContext: {
    marginTop: 1,
    fontSize: 10,
    lineHeight: 13,
  },
  traceCard: {
    marginTop: 4,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  traceTitle: {
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 8,
  },
  traceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 5,
  },
  traceLabel: {
    flexShrink: 0,
    fontSize: 10,
    fontWeight: '700',
  },
  traceValue: {
    flex: 1,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
    textAlign: 'right',
  },
  panelHint: {
    marginTop: 8,
    fontSize: 10,
    lineHeight: 14,
  },
});
