import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Alert, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getConfiguredPrivacyPolicyUrl, resolveLegalUrl } from '../../config/legalLinks';
import { useIsDarkTheme } from '../../state/themeMode';
import { FastPressable } from '../../ui/components/FastPressable';
import { Screen } from '../../ui/components/Screen';
import { safeRouterBack } from '../../utils/navigation';
import { getLegalDocument, type LegalDocument } from './legalDocumentViewModel';

export type LegalDocumentKind = 'terms' | 'privacy';

export type LegalDocumentScreenProps = Readonly<{
  document: LegalDocumentKind;
  /** When true, shown from AboutDetailDestinationHost over About. */
  hosted?: boolean;
  hostedActive?: boolean;
  onHostedBack?: () => void;
}>;

/**
 * Displays legal agreements, privacy policies, and terms of service.
 */
export function LegalDocumentScreen({
  document,
  hosted = false,
  hostedActive = false,
  onHostedBack,
}: LegalDocumentScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const themeActive = !hosted || hostedActive;
  const isDark = useIsDarkTheme({ active: themeActive });
  const styles = useMemo(() => makeStyles(isDark), [isDark]);
  const legalDocument = useMemo(() => getLegalDocument(document), [document]);
  const privacyPolicyUrl = useMemo(
    () => resolveLegalUrl(getConfiguredPrivacyPolicyUrl(), 'https://rtx5.orrnn.com/privacy-policy'),
    [],
  );
  const iconColor = isDark ? '#60A5FA' : '#1D4ED8';
  const backIconColor = isDark ? '#F8FAFC' : '#050505';
  const isTermsDocument = document === 'terms';

  const handleBack = useCallback(() => {
    if (hosted && onHostedBack) {
      onHostedBack();
      return;
    }
    safeRouterBack(router, '/settings/about');
  }, [hosted, onHostedBack, router]);

  const openPrivacyPolicy = useCallback(async () => {
    if (!privacyPolicyUrl) {
      return;
    }

    try {
      await Linking.openURL(privacyPolicyUrl);
    } catch {
      Alert.alert('Privacy Policy', privacyPolicyUrl);
    }
  }, [privacyPolicyUrl]);

  return (
    <Screen noBottomInset style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 0) + 12 }]}>
        <FastPressable
          onPress={handleBack}
          activateOnPressIn
          activateOnTouchStart
          latencyLabel="legal.back"
          unstable_pressDelay={0}
          hitSlop={12}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={28} color={backIconColor} />
        </FastPressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{legalDocument.title}</Text>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="always"
        canCancelContentTouches={Platform.OS === 'ios'}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <LegalHero document={legalDocument} iconColor={iconColor} styles={styles} />
        {isTermsDocument ? (
          <View style={styles.noticePanel}>
            <View style={styles.noticeIcon}>
              <Ionicons name="warning-outline" size={18} color={isDark ? '#FBBF24' : '#B45309'} />
            </View>
            <View style={styles.noticeCopy}>
              <Text style={styles.noticeTitle}>Trading Risk Notice</Text>
              <Text style={styles.noticeText}>
                Trading involves risk. Demo and live account outcomes can differ, and every order decision remains your responsibility.
              </Text>
            </View>
          </View>
        ) : null}
        <View style={styles.sectionList}>
          {legalDocument.sections.map((section, index) => (
            <View key={section.title} style={styles.section}>
              <View style={styles.sectionNumber}>
                <Text style={styles.sectionNumberText}>{String(index + 1).padStart(2, '0')}</Text>
              </View>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionBody}>{section.body}</Text>
            </View>
          ))}
        </View>
        {isTermsDocument && privacyPolicyUrl ? (
          <FastPressable
            style={styles.privacyLink}
            onPress={openPrivacyPolicy}
            latencyLabel="legal.privacyPolicy.open"
            hitSlop={8}
            accessibilityRole="link"
            accessibilityLabel="Privacy Policy"
          >
            <Ionicons name="shield-checkmark-outline" size={18} color={iconColor} />
            <Text style={styles.privacyLinkText}>Privacy Policy</Text>
            <Ionicons name="open-outline" size={16} color={iconColor} />
          </FastPressable>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function LegalHero({
  document,
  iconColor,
  styles,
}: {
  document: LegalDocument;
  iconColor: string;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.hero}>
      <View style={styles.heroIcon}>
        <Ionicons name={document.icon} size={28} color={iconColor} />
      </View>
      <View style={styles.heroCopy}>
        <Text style={styles.heroTitle}>{document.title}</Text>
        <Text style={styles.heroSubtitle}>{document.subtitle}</Text>
        <Text style={styles.updatedLabel}>{document.updatedLabel}</Text>
      </View>
    </View>
  );
}

const makeStyles = (isDark: boolean) => {
  const palette = {
    bg: isDark ? '#121212' : '#F6F8FB',
    surface: isDark ? '#1E1E1E' : '#FFFFFF',
    text: isDark ? '#F8FAFC' : '#101828',
    muted: isDark ? '#94A3B8' : '#667085',
    soft: isDark ? '#CBD5E1' : '#344054',
    border: isDark ? 'rgba(148,163,184,0.18)' : '#E4E7EC',
    accentSoft: isDark ? 'rgba(96,165,250,0.14)' : '#EEF4FF',
    accent: isDark ? '#60A5FA' : '#1D4ED8',
    warningBg: isDark ? 'rgba(251,191,36,0.12)' : '#FFFBEB',
    warningBorder: isDark ? 'rgba(251,191,36,0.24)' : '#FDE68A',
  };

  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: palette.bg,
    },
    header: {
      minHeight: 72,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 18,
      paddingBottom: 12,
      backgroundColor: palette.surface,
      borderBottomWidth: 1,
      borderBottomColor: palette.border,
    },
    backButton: {
      width: 40,
      height: 42,
      alignItems: 'flex-start',
      justifyContent: 'center',
      marginRight: 10,
    },
    headerTitle: {
      flex: 1,
      color: palette.text,
      fontSize: 21,
      lineHeight: 27,
      fontWeight: '500',
      letterSpacing: 0,
    },
    scroll: {
      flex: 1,
      backgroundColor: palette.bg,
    },
    content: {
      padding: 16,
      paddingBottom: 34,
    },
    hero: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 13,
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surface,
      shadowColor: isDark ? '#000000' : '#101828',
      shadowOpacity: isDark ? 0.2 : 0.06,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: isDark ? 2 : 1,
    },
    heroIcon: {
      width: 52,
      height: 52,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.accentSoft,
    },
    heroCopy: {
      flex: 1,
      minWidth: 0,
    },
    heroTitle: {
      color: palette.text,
      fontSize: 18,
      lineHeight: 24,
      fontWeight: '600',
      letterSpacing: 0,
    },
    heroSubtitle: {
      color: palette.muted,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '600',
      letterSpacing: 0,
      marginTop: 3,
    },
    updatedLabel: {
      color: palette.soft,
      fontSize: 11,
      lineHeight: 15,
      fontWeight: '600',
      letterSpacing: 0,
      marginTop: 7,
      textTransform: 'uppercase',
    },
    noticePanel: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginTop: 14,
      padding: 14,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: palette.warningBorder,
      backgroundColor: palette.warningBg,
    },
    noticeIcon: {
      width: 34,
      height: 34,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(251,191,36,0.12)' : '#FEF3C7',
    },
    noticeCopy: {
      flex: 1,
      minWidth: 0,
    },
    noticeTitle: {
      color: palette.text,
      fontSize: 14,
      lineHeight: 19,
      fontWeight: '600',
      letterSpacing: 0,
    },
    noticeText: {
      color: palette.soft,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '600',
      letterSpacing: 0,
      marginTop: 3,
    },
    sectionList: {
      marginTop: 14,
      gap: 10,
    },
    section: {
      padding: 15,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surface,
    },
    sectionNumber: {
      alignSelf: 'flex-start',
      minWidth: 32,
      height: 22,
      paddingHorizontal: 7,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 9,
      backgroundColor: palette.accentSoft,
    },
    sectionNumberText: {
      color: palette.accent,
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '600',
      letterSpacing: 0,
    },
    sectionTitle: {
      color: palette.text,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '600',
      letterSpacing: 0,
      marginBottom: 6,
    },
    sectionBody: {
      color: palette.soft,
      fontSize: 14,
      lineHeight: 21,
      fontWeight: '500',
      letterSpacing: 0,
    },
    privacyLink: {
      marginTop: 14,
      minHeight: 50,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surface,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 9,
    },
    privacyLinkText: {
      color: palette.accent,
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '600',
      letterSpacing: 0,
    },
  });
};
