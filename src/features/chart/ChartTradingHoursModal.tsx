import { FastPressable as Pressable } from '../../ui/components/FastPressable';
/**
 * Chart Feature UI: ChartTradingHoursModal
 *
 * Displays the specific open and close market sessions for the active symbol,
 * with a toggle between GMT (server) time and the user's local time zone.
 *
 * Sessions data comes from the instrument specification API via the parent.
 * Local times are computed dynamically from the GMT sessions.
 */

import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, ScrollView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsDarkTheme } from '../../state/themeMode';
import { useTheme, ThemeColors } from '../../ui/theme/useTheme';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Sessions from instrument spec API: [day, hours] tuples in GMT */
  sessions?: Array<[string, string]>;
  isLoading?: boolean;
};

const ALL_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Convert a single "HH:MM" string from GMT to the user's local timezone.
 * Returns the adjusted time string and a day offset (-1, 0, +1).
 */
function gmtTimeToLocal(timeStr: string): { time: string; dayOffset: number } {
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return { time: timeStr, dayOffset: 0 };

  // Get the user's UTC offset in minutes
  const now = new Date();
  const offsetMinutes = -now.getTimezoneOffset(); // positive = ahead of UTC

  let totalMinutes = h * 60 + m + offsetMinutes;
  let dayOffset = 0;

  if (totalMinutes >= 24 * 60) {
    totalMinutes -= 24 * 60;
    dayOffset = 1;
  } else if (totalMinutes < 0) {
    totalMinutes += 24 * 60;
    dayOffset = -1;
  }

  const localH = Math.floor(totalMinutes / 60);
  const localM = totalMinutes % 60;
  return {
    time: `${String(localH).padStart(2, '0')}:${String(localM).padStart(2, '0')}`,
    dayOffset,
  };
}

/**
 * Convert a GMT hours string like "03:31 - 24:00" or "00:00 - 02:28, 03:30 - 24:00"
 * to local time. Returns the converted string and any day shifts.
 */
function convertSessionToLocal(hoursStr: string): string {
  if (hoursStr === '-' || hoursStr === '—' || !hoursStr.trim()) return '-';

  // Handle multiple comma-separated sessions
  const segments = hoursStr.split(',').map((s) => s.trim());
  const converted = segments.map((seg) => {
    const parts = seg.split(/\s*[-–]\s*/);
    if (parts.length !== 2) return seg;
    const start = gmtTimeToLocal(parts[0]);
    const end = gmtTimeToLocal(parts[1]);
    return `${start.time} - ${end.time}`;
  });

  return converted.join(', ');
}

/**
 * Build the schedule for display from raw API sessions.
 * Ensures all 7 days are present, filling missing days with '-'.
 */
function buildSchedule(
  sessions: Array<[string, string]>,
  mode: 'GMT' | 'Local time',
): Array<{ day: string; hours: string }> {
  const map = new Map<string, string>();
  for (const [day, hours] of sessions) {
    map.set(day, hours);
  }

  return ALL_DAYS.map((day) => {
    const gmtHours = map.get(day) ?? '-';
    return {
      day,
      hours: mode === 'GMT' ? gmtHours : convertSessionToLocal(gmtHours),
    };
  });
}

const FALLBACK_SESSIONS: Array<[string, string]> = [
  ['Sunday',    '23:05 - 24:00'],
  ['Monday',    '00:00 - 24:00'],
  ['Tuesday',   '00:00 - 24:00'],
  ['Wednesday', '00:00 - 24:00'],
  ['Thursday',  '00:00 - 24:00'],
  ['Friday',    '00:00 - 22:59'],
  ['Saturday',  '-'],
];

export function ChartTradingHoursModal({ visible, onClose, sessions, isLoading }: Props) {
  const T = useTheme();
  const isDark = useIsDarkTheme();
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);

  const [segment, setSegment] = useState<'GMT' | 'Local time'>('GMT');
  const insets = useSafeAreaInsets();

  const schedule = useMemo(
    () => buildSchedule(sessions ?? FALLBACK_SESSIONS, segment),
    [sessions, segment],
  );

  if (!visible) return null;

  return (
    <View style={styles.modalOverlay} pointerEvents="box-none">
      {/* Tap outside to dismiss */}
      <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />

      <View style={styles.modalContainer}>
        {/* Drag Handle */}
        <View style={styles.dragHandleContainer}>
          <View style={styles.dragHandle} />
        </View>

        <View style={styles.content}>
          <Text style={styles.modalTitle}>Trading hours</Text>

          {/* Segmented Control */}
          <View style={styles.segmentContainer}>
            <Pressable
              style={[styles.segmentBtn, segment === 'GMT' && styles.segmentBtnActive]}
              onPress={() => setSegment('GMT')}
            >
              <Text style={[styles.segmentText, segment === 'GMT' && styles.segmentTextActive]}>GMT</Text>
            </Pressable>
            <Pressable
              style={[styles.segmentBtn, segment === 'Local time' && styles.segmentBtnActive]}
              onPress={() => setSegment('Local time')}
            >
              <Text style={[styles.segmentText, segment === 'Local time' && styles.segmentTextActive]}>Local time</Text>
            </Pressable>
          </View>

          {/* Schedule List */}
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={T.accent} />
            </View>
          ) : (
            <ScrollView
              keyboardShouldPersistTaps="always"
              canCancelContentTouches={Platform.OS === 'ios'} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scheduleList}>
              {schedule.map((item) => (
                <View key={item.day} style={styles.scheduleRow}>
                  <Text style={styles.dayText}>{item.day}</Text>
                  <Text style={styles.hoursText}>{item.hours}</Text>
                </View>
              ))}
              <View style={{ height: Math.max(insets.bottom, 24) }} />
            </ScrollView>
          )}
        </View>
      </View>
    </View>
  );
}

function makeStyles(T: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    modalOverlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 9999,
      elevation: 9999,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'flex-end',
    },
    modalContainer: {
      backgroundColor: isDark ? T.bg : '#FFFFFF',
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: '90%',
    },
    dragHandleContainer: {
      alignItems: 'center',
      paddingVertical: 12,
    },
    dragHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : '#CBD5E1',
    },
    content: {
      paddingHorizontal: 20,
      paddingBottom: 20,
    },
    modalTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: T.text,
      marginBottom: 24,
    },
    segmentContainer: {
      flexDirection: 'row',
      backgroundColor: isDark ? '#1E1E1E' : '#FFFFFF',
      borderRadius: 8,
      padding: 2,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0',
      marginBottom: 24,
    },
    segmentBtn: {
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
      borderRadius: 6,
    },
    segmentBtnActive: {
      backgroundColor: isDark ? T.glass2 : '#F8FAFC',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 1,
      elevation: 1,
    },
    segmentText: {
      fontSize: 15,
      color: T.textMuted,
      fontWeight: '500',
    },
    segmentTextActive: {
      color: T.text,
      fontWeight: '600',
    },
    loadingContainer: {
      paddingVertical: 40,
      alignItems: 'center',
    },
    scheduleList: {
      paddingBottom: 20,
    },
    scheduleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 16,
    },
    dayText: {
      fontSize: 15,
      color: T.text,
      fontWeight: '400',
    },
    hoursText: {
      fontSize: 14,
      color: T.textMuted,
      fontWeight: '400',
      textAlign: 'right',
      flexShrink: 1,
      marginLeft: 16,
    },
  });
}
