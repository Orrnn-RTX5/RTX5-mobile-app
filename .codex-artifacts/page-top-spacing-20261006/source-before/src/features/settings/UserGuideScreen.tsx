/**
 * Settings Feature UI: UserGuideScreen
 *
 * About-screen user guide destination for the RTX5 mobile app.
 */

import { Ionicons } from '@expo/vector-icons';
import { AppMenuIcon } from '../../ui/components/AppMenuIcon';
import { useIsFocused } from '@react-navigation/native';
import Constants from 'expo-constants';
import { memo, useCallback, useMemo } from 'react';
import { ScrollView, Text, View, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsDarkTheme } from '../../state/themeMode';
import { useUIState } from '../../state/uiState';
import { Screen } from '../../ui/components/Screen';
import { useDeferredRouteContentReady } from '../../ui/components/DeferredRouteMount';
import { FastPressable } from '../../ui/components/FastPressable';
import { AppLogo } from '../../ui/components/AppLogo';
import { openSidebarDrawerImmediately, scheduleAfterSidebarOpenVisual } from '../../ui/components/sidebarDrawerController';
import { makeUserGuideStyles, type UserGuideStyles } from './UserGuideScreen.styles';
import { useNextFrameValue } from '../../hooks/useNextFrameValue';
import { useTranslation } from '../../i18n/useTranslation';
import {
  GUIDE_FOOTER_NOTE,
  GUIDE_MANUAL_INTRO,
  GUIDE_MANUAL_SECTIONS,
  buildGuideSummary,
  type GuideManualSection,
} from './userGuideViewModel';

// Build the static manual in the retained host before it is selected so the
// first sidebar reveal is complete.
const USER_GUIDE_BODY_PREWARM_DELAY_MS = 0;

/**
 * Displays tutorials, documentation, and user guides on how to use the trading platform.
 */
export const UserGuideScreenInner = memo(function UserGuideScreenInner({ isScreenFocused }: { isScreenFocused: boolean }) {
  const insets = useSafeAreaInsets();
  const isDark = useIsDarkTheme();
  const { t } = useTranslation();
  const hideActionSheet = useUIState((s) => s.hideActionSheet);
  const styles = useMemo(() => makeUserGuideStyles(isDark), [isDark]);
  const summary = useMemo(() => buildGuideSummary(), []);
  const routeBodyReady = useDeferredRouteContentReady(
    isScreenFocused ? 0 : USER_GUIDE_BODY_PREWARM_DELAY_MS,
  );
  const visibleSections = GUIDE_MANUAL_SECTIONS;
  const menuIconColor = isDark ? '#F8FAFC' : '#050505';
  const sectionIconColor = isDark ? '#60A5FA' : '#0A6EEB';
  const appName = Constants.expoConfig?.name ?? 'RTX5';
  const handleOpenMenu = useCallback(() => {
    openSidebarDrawerImmediately();
    scheduleAfterSidebarOpenVisual(hideActionSheet);
  }, [hideActionSheet]);

  return (
    <Screen noBottomInset style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 0) + 14 }]}>
        <FastPressable
          onPress={handleOpenMenu}
          activateOnTouchStart
          latencyLabel="userGuide.menu"
          hitSlop={12}
          style={styles.menuButton}
          accessibilityRole="button"
          accessibilityLabel="Open menu"
        >
          <AppMenuIcon color={menuIconColor} />
        </FastPressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{t('User Guide')}</Text>
      </View>

      {routeBodyReady ? <ScrollView
        keyboardShouldPersistTaps="always"
        canCancelContentTouches={Platform.OS === 'ios'}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <AppLogo style={styles.logo} />
          <AppNameTitle appName={appName} styles={styles} />
          <Text style={styles.heroSubtitle}>{t(GUIDE_MANUAL_INTRO.subtitle)}</Text>
          <Text style={styles.introText}>{GUIDE_MANUAL_INTRO.body}</Text>

          <View style={styles.summaryRow}>
            <SummaryCard value={summary.sectionCount} label={t('Sections')} styles={styles} />
            <SummaryCard value={summary.bulletCount} label={t('Guide points')} styles={styles} />
            <SummaryCard value={t(summary.localStateLabel)} label={t('Preferences')} styles={styles} />
          </View>
        </View>

        <View style={styles.guideList}>
          {visibleSections.map((section, index) => (
            <GuideSectionRow
              key={section.id}
              section={section}
              isLast={index === GUIDE_MANUAL_SECTIONS.length - 1}
              styles={styles}
              iconColor={sectionIconColor}
            />
          ))}
        </View>

        <Text style={styles.footerNote}>{GUIDE_FOOTER_NOTE}</Text>
      </ScrollView> : <View style={styles.scroll} />}

    </Screen>
  );
});

export function UserGuideScreen() {
  const isScreenFocused = useIsFocused();
  const deferredScreenFocused = useNextFrameValue(isScreenFocused);
  return <UserGuideScreenInner isScreenFocused={deferredScreenFocused} />;
}

function AppNameTitle({ appName, styles }: { appName: string; styles: UserGuideStyles }) {
  const accentMatch = appName.match(/^(.*?)(5)$/);

  if (!accentMatch) {
    return <Text style={styles.heroTitle}>{appName}</Text>;
  }

  return (
    <Text style={styles.heroTitle}>
      {accentMatch[1]}
      <Text style={styles.heroAccent}>{accentMatch[2]}</Text>
      {' Mobile App'}
    </Text>
  );
}

function SummaryCard({
  value,
  label,
  styles,
}: {
  value: number | string;
  label: string;
  styles: UserGuideStyles;
}) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.summaryLabel} numberOfLines={2}>{label}</Text>
    </View>
  );
}

function GuideSectionRow({
  section,
  isLast,
  styles,
  iconColor,
}: {
  section: GuideManualSection;
  isLast: boolean;
  styles: UserGuideStyles;
  iconColor: string;
}) {
  const { t } = useTranslation();

  return (
    <View style={styles.sectionRow}>
      <View style={styles.indexRail}>
        <View style={styles.indexCircle}>
          <Text style={styles.indexText}>{section.index}</Text>
        </View>
        {!isLast ? <View style={styles.railLine} /> : null}
      </View>

      <View style={styles.sectionContent}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionIcon}>
            <Ionicons name={section.icon} size={18} color={iconColor} />
          </View>
          <Text style={styles.sectionTitle} numberOfLines={2}>{t(section.title)}</Text>
        </View>
        <Text style={styles.sectionSummary}>{section.summary}</Text>
        {section.bullets.map((bullet) => (
          <View key={bullet} style={styles.bulletRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>{bullet}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
