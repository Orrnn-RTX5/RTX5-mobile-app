import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  StyleSheet,
  Text,
  type GestureResponderEvent,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '../../i18n/useTranslation';
import { useThemeMode } from '../../state/themeMode';
import { FastPressable } from '../../ui/components/FastPressable';
import { useTheme, type ThemeColors } from '../../ui/theme/useTheme';

type SettingsRouteLaunchPreviewProps = {
  title: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  onBack?: (event: GestureResponderEvent) => void;
};

/**
 * A preview component displayed while a settings route is loading or animating into view.
 */
export function SettingsRouteLaunchPreview({
  title,
  subtitle,
  icon,
  onBack,
}: SettingsRouteLaunchPreviewProps) {
  const { t } = useTranslation();
  const T = useTheme();
  const themeMode = useThemeMode();
  const insets = useSafeAreaInsets();
  const isDark = themeMode === 'dark';
  const styles = React.useMemo(() => makeStyles(T, isDark, insets.top), [T, isDark, insets.top]);
  const accentColor = isDark ? T.accent : '#1D4ED8';

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <FastPressable
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={onBack}
          activateOnPressIn
          activateOnTouchStart
          latencyLabel="settings.route.preview.back"
          latencyBudgetMs={50}
          unstable_pressDelay={0}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={t('Back')}
        >
          <Ionicons name="arrow-back" size={24} color={T.text} />
        </FastPressable>
        <View style={styles.titleWrap}>
          <Text style={styles.title} numberOfLines={1}>{t(title)}</Text>
          {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{t(subtitle)}</Text> : null}
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.heroRow}>
        <View style={[styles.heroIcon, { backgroundColor: `${accentColor}1A` }]}>
          <Ionicons name={icon} size={24} color={accentColor} />
        </View>
        <View style={styles.heroCopy}>
          <View style={styles.skeletonTitle} />
          <View style={styles.skeletonSubtitle} />
        </View>
      </View>

      <View style={styles.sectionLabel} />
      {[0, 1, 2, 3].map((row) => (
        <View key={row} style={styles.previewRow}>
          <View style={styles.rowIcon} />
          <View style={styles.rowCopy}>
            <View style={styles.rowLineStrong} />
            <View style={styles.rowLineMuted} />
          </View>
          <Ionicons name="chevron-forward" size={16} color={T.textMuted} />
        </View>
      ))}
    </View>
  );
}

const makeStyles = (T: ThemeColors, isDark: boolean, safeTop: number) => {
  const background = T.bg;
  const surface = isDark ? '#1E1E1E' : '#FFFFFF';
  const border = isDark ? 'rgba(255,255,255,0.10)' : '#DFE7F1';
  const skeleton = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.08)';
  const skeletonMuted = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.05)';

  return StyleSheet.create({
    screen: {
      flex: 1,
      paddingTop: safeTop,
      backgroundColor: background,
    },
    header: {
      minHeight: 58,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: border,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    titleWrap: {
      flex: 1,
      minWidth: 0,
      alignItems: 'center',
    },
    title: {
      color: T.text,
      fontSize: 18,
      lineHeight: 24,
      fontWeight: '500',
      letterSpacing: 0,
    },
    subtitle: {
      color: T.textSub,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '500',
      letterSpacing: 0,
      marginTop: 1,
    },
    headerSpacer: {
      width: 40,
      height: 40,
    },
    heroRow: {
      minHeight: 82,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginHorizontal: 16,
      marginTop: 18,
      paddingHorizontal: 16,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: border,
      backgroundColor: surface,
    },
    heroIcon: {
      width: 44,
      height: 44,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroCopy: {
      flex: 1,
      minWidth: 0,
      gap: 9,
    },
    skeletonTitle: {
      width: '62%',
      height: 14,
      borderRadius: 7,
      backgroundColor: skeleton,
    },
    skeletonSubtitle: {
      width: '42%',
      height: 10,
      borderRadius: 5,
      backgroundColor: skeletonMuted,
    },
    sectionLabel: {
      width: 136,
      height: 12,
      borderRadius: 6,
      marginLeft: 20,
      marginTop: 26,
      marginBottom: 8,
      backgroundColor: skeletonMuted,
    },
    previewRow: {
      minHeight: 64,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginHorizontal: 16,
      marginBottom: 8,
      paddingHorizontal: 14,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: border,
      backgroundColor: surface,
    },
    rowIcon: {
      width: 36,
      height: 36,
      borderRadius: 8,
      backgroundColor: skeletonMuted,
    },
    rowCopy: {
      flex: 1,
      minWidth: 0,
      gap: 8,
    },
    rowLineStrong: {
      width: '54%',
      height: 12,
      borderRadius: 6,
      backgroundColor: skeleton,
    },
    rowLineMuted: {
      width: '36%',
      height: 9,
      borderRadius: 5,
      backgroundColor: skeletonMuted,
    },
  });
};
