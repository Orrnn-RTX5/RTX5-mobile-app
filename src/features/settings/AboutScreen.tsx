/**
 * Settings Feature UI: AboutScreen
 *
 * Reference-style app About screen with RTX5 identity, rating, guide, and
 * developer contact actions.
 */

import { Ionicons } from '@expo/vector-icons';
import { AppMenuIcon } from '../../ui/components/AppMenuIcon';
import { useIsFocused } from '@react-navigation/native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { usePathname, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
  type KeyboardEvent,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { resolveAppDisplayVersion } from '../../config/appDisplayVersion';
import { getConfiguredDeveloperEmail, getConfiguredPrivacyPolicyUrl, resolveLegalUrl } from '../../config/legalLinks';
import { useIsDarkTheme } from '../../state/themeMode';
import { useUserPreferences } from '../../state/userPreferences';
import { useUIState } from '../../state/uiState';
import { AppLogo } from '../../ui/components/AppLogo';
import { FastPressable } from '../../ui/components/FastPressable';
import { Screen } from '../../ui/components/Screen';
import { useRetainedRouteContentReady } from '../../ui/components/DeferredRouteMount';
import { openSidebarDrawerImmediately, scheduleAfterSidebarOpenVisual } from '../../ui/components/sidebarDrawerController';
import { showSidebarDestination } from '../../ui/components/sidebarDestinationHostController';
import { GDark } from '../../ui/theme/glass';
import { safeRouterBack } from '../../utils/navigation';
import { runImmediateAction } from '../../utils/actionLatency';
import { useNextFrameValue } from '../../hooks/useNextFrameValue';
import { useTranslation } from '../../i18n/useTranslation';
import { BugReportScreen } from './BugReportScreen';
import { primeBugReportContext } from './bugReportRuntime';
import {
  hideAboutDetailDestination,
  showAboutDetailDestination,
} from './aboutDetailDestinationController';
import {
  ABOUT_LINK_CHEVRON,
  ABOUT_STAR,
  makeAboutStyles,
  type AboutStyles,
} from './AboutScreen.styles';
import {
  ABOUT_ACTIONS,
  ABOUT_CONTACT_CATEGORIES,
  ABOUT_EXTERNAL_LINKS,
  buildAccountDeletionRequestMessage,
  buildDeveloperMailto,
  formatAboutPlatform,
  getAboutContactCategory,
  getAboutStoreTarget,
  isValidDeveloperContactEmail,
  resolveAboutBuildLabel,
  type AboutAction,
  type AboutContactCategory,
} from './aboutViewModel';

type ExpoAndroidConfig = {
  package?: string;
};

const RATING_STARS = [0, 1, 2, 3, 4] as const;
const CONTACT_FORM_BASE_BOTTOM_PADDING = 28;
const CONTACT_DETAILS_VISIBLE_GAP = 24;

type ContactDetailsLayout = {
  y: number;
  height: number;
};

type DeveloperContactMode = 'contact-developer' | 'account-deletion';

// Mount About's retained identity and action rows before it is selected so the
// first sidebar reveal is complete.
const ABOUT_BODY_PREWARM_DELAY_MS = 0;

/**
 * Displays information about the app version, copyright, and developer details.
 */
export const AboutScreenInner = memo(function AboutScreenInner({ isScreenFocused }: { isScreenFocused: boolean }) {
  const routeBodyReady = useRetainedRouteContentReady(
    isScreenFocused, ABOUT_BODY_PREWARM_DELAY_MS,
  );
  const router = useRouter();
  const pathname = usePathname();
  const isDark = useIsDarkTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => makeAboutStyles(isDark), [isDark]);
  const insets = useSafeAreaInsets();
  const hideActionSheet = useUIState((s) => s.hideActionSheet);
  const menuIconColor = isDark ? GDark.text : '#050505';
  const actionChevronColor = isDark ? GDark.textMuted : ABOUT_LINK_CHEVRON;
  const androidConfig = Constants.expoConfig?.android as ExpoAndroidConfig | undefined;
  const appName = Constants.expoConfig?.name ?? 'RTX5';
  const nativeAppVersion = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? 'Local';
  const appBuildVersion = Application.nativeBuildVersion ?? Constants.nativeBuildVersion ?? '';
  const appVersion = resolveAppDisplayVersion(nativeAppVersion);
  const androidPackageName = androidConfig?.package ?? ABOUT_EXTERNAL_LINKS.androidPackageName;
  const buildLabel = resolveAboutBuildLabel({
    appVersion,
    appBuildVersion,
  });

  const handleOpenMenu = useCallback(() => {
    openSidebarDrawerImmediately();
    scheduleAfterSidebarOpenVisual(hideActionSheet);
  }, [hideActionSheet]);

  const openExternalUrl = async (url: string, failureTitle: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(failureTitle, t('No installed app can open this link on the current device.'));
    }
  };

  const handleRateExperience = useCallback(async () => {
    const target = getAboutStoreTarget(Platform.OS, {
      ...ABOUT_EXTERNAL_LINKS,
      androidPackageName,
      iosAppStoreId: process.env.EXPO_PUBLIC_IOS_APP_STORE_ID,
    });

    try {
      await Linking.openURL(target.primaryUrl);
    } catch {
      try {
        await Linking.openURL(target.fallbackUrl);
      } catch {
        Alert.alert(`Open ${target.storeLabel}`, t('The store listing could not be opened on this device.'));
      }
    }
  }, [androidPackageName, t]);

  const handleOpenPrivacyPolicy = useCallback(() => {
    const privacyPolicyUrl = resolveLegalUrl(undefined, getConfiguredPrivacyPolicyUrl());
    if (privacyPolicyUrl) {
      void openExternalUrl(privacyPolicyUrl, t('Open Privacy Policy'));
      return;
    }

    // In-app legal screen via retained host — no stack push on the tap path.
    showAboutDetailDestination('privacy-policy');
  }, [t]);

  /**
   * Sidebar-class open: reveal a pre-mounted destination in this press turn.
   * User Guide is already a root sidebar host layer; the other rows use
   * AboutDetailDestinationHost. Rate opens the store URL immediately.
   */
  const handleAboutAction = useCallback((action: AboutAction) => {
    runImmediateAction(`about.${action.id}.open`, () => {
      switch (action.id) {
        case 'rate-experience':
          void handleRateExperience();
          return;
        case 'user-guide':
          hideAboutDetailDestination();
          // Swap to the retained User Guide layer (same as the drawer item).
          if (!showSidebarDestination('user-guide', 'programmatic')) {
            router.push('/settings/user-guide');
          }
          return;
        case 'privacy-policy':
          handleOpenPrivacyPolicy();
          return;
        case 'account-deletion':
          showAboutDetailDestination('account-deletion');
          return;
        case 'contact-developer':
          primeBugReportContext(pathname);
          showAboutDetailDestination('contact-developer');
          return;
      }
    });
  }, [handleOpenPrivacyPolicy, handleRateExperience, pathname, router]);

  return (
    <Screen noBottomInset style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 0) + 6 }]}>
        <FastPressable
          onPress={handleOpenMenu}
          activateOnTouchStart
          latencyLabel="about.menu"
          hitSlop={12}
          style={styles.menuButton}
          accessibilityRole="button"
          accessibilityLabel="Open menu"
        >
          <AppMenuIcon color={menuIconColor} />
        </FastPressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{t('About')}</Text>
      </View>

      {routeBodyReady ? <View style={styles.content}>
        <View style={styles.identity}>
          <AppLogo style={styles.logo} />
          <AppNameMark appName={appName} styles={styles} />
          <Text style={styles.buildLabel} numberOfLines={1}>{buildLabel}</Text>
        </View>

        <View style={styles.actions}>
          {ABOUT_ACTIONS.map((action) => (
            <AboutActionRow
              key={action.id}
              action={action}
              onPress={() => handleAboutAction(action)}
              styles={styles}
              chevronColor={actionChevronColor}
            />
          ))}
        </View>
      </View> : <View style={styles.content} />}

    </Screen>
  );
});

export function AboutScreen() {
  const isScreenFocused = useIsFocused();
  const deferredScreenFocused = useNextFrameValue(isScreenFocused);
  return <AboutScreenInner isScreenFocused={deferredScreenFocused} />;
}

export type DeveloperContactRequestScreenProps = Readonly<{
  mode: DeveloperContactMode;
  hosted?: boolean;
  hostedActive?: boolean;
  onHostedBack?: () => void;
}>;

export function DeveloperContactRequestScreen({
  mode,
  hosted = false,
  hostedActive = false,
  onHostedBack,
}: DeveloperContactRequestScreenProps) {
  const router = useRouter();
  const themeActive = !hosted || hostedActive;
  const isDark = useIsDarkTheme({ active: themeActive });
  const { t } = useTranslation();
  const styles = useMemo(() => makeAboutStyles(isDark), [isDark]);
  const insets = useSafeAreaInsets();
  const appName = Constants.expoConfig?.name ?? 'RTX5';
  const nativeAppVersion = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? 'Local';
  const appBuildVersion = Application.nativeBuildVersion ?? Constants.nativeBuildVersion ?? '';
  const appVersion = resolveAppDisplayVersion(nativeAppVersion);
  const platformLabel = formatAboutPlatform(Platform.OS);
  const accountDetails = useUserPreferences((s) => s.accountDetails);
  const isAccountDeletion = mode === 'account-deletion';
  const [categorySheetOpen, setCategorySheetOpen] = useState(false);
  const [selectedContactCategory, setSelectedContactCategory] = useState<AboutContactCategory | null>(() =>
    isAccountDeletion ? getAboutContactCategory('account-deletion') : null,
  );
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactTitle, setContactTitle] = useState(() => (isAccountDeletion ? 'Account deletion request' : ''));
  const buildDeletionMessage = useCallback(
    () =>
      buildAccountDeletionRequestMessage({
        accountId: accountDetails?.id,
        server: accountDetails?.server,
      }),
    [accountDetails?.id, accountDetails?.server],
  );
  const [contactMessage, setContactMessage] = useState(() => (isAccountDeletion ? buildDeletionMessage() : ''));
  const [contactConsent, setContactConsent] = useState(false);
  const accountDeletionSeedRef = useRef(isAccountDeletion ? contactMessage : '');

  useEffect(() => {
    if (!isAccountDeletion) {
      return;
    }

    const nextMessage = buildDeletionMessage();
    const previousSeed = accountDeletionSeedRef.current;

    setSelectedContactCategory(getAboutContactCategory('account-deletion'));
    setContactTitle((current) => (current.trim().length > 0 ? current : 'Account deletion request'));
    setContactMessage((current) => {
      if (current.trim().length === 0 || current === previousSeed) {
        accountDeletionSeedRef.current = nextMessage;
        return nextMessage;
      }

      accountDeletionSeedRef.current = nextMessage;
      return current;
    });
  }, [buildDeletionMessage, isAccountDeletion]);

  const openExternalUrl = async (url: string, failureTitle: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(failureTitle, t('No installed app can open this link on the current device.'));
    }
  };

  const handleOpenPrivacyPolicy = useCallback(() => {
    const privacyPolicyUrl = resolveLegalUrl(undefined, getConfiguredPrivacyPolicyUrl());
    if (privacyPolicyUrl) {
      void openExternalUrl(privacyPolicyUrl, t('Open Privacy Policy'));
      return;
    }

    if (hosted && onHostedBack) {
      // Stay in the retained stack: swap About detail to the privacy layer.
      showAboutDetailDestination('privacy-policy');
      return;
    }

    router.push({ pathname: '/settings/legal', params: { document: 'privacy' } });
  }, [hosted, onHostedBack, router, t]);

  const handleSendDeveloperMessage = () => {
    if (!isValidDeveloperContactEmail(contactEmail)) {
      Alert.alert(t('Contact Developer'), t('Please enter a valid email address before sending.'));
      return;
    }

    const mailtoUrl = buildDeveloperMailto({
      appName,
      appVersion,
      appBuildVersion,
      platform: platformLabel,
      category: selectedContactCategory,
      requesterName: contactName,
      requesterEmail: contactEmail,
      title: contactTitle,
      message: contactMessage,
      developerEmail: getConfiguredDeveloperEmail(),
    });

    void openExternalUrl(mailtoUrl, isAccountDeletion ? t('Request Account Deletion') : t('Contact Developer'));
  };

  const handleClose = useCallback(() => {
    setCategorySheetOpen(false);
    if (hosted && onHostedBack) {
      onHostedBack();
      return;
    }
    safeRouterBack(router, '/settings/about');
  }, [hosted, onHostedBack, router]);

  if (!isAccountDeletion) {
    return (
      <BugReportScreen
        active={!hosted || hostedActive}
        insetsTop={insets.top}
        insetsBottom={insets.bottom}
        onClose={handleClose}
      />
    );
  }

  return (
    <ContactDeveloperScreen
      appName={appName}
      appVersion={appVersion}
      appBuildVersion={appBuildVersion}
      screenTitle={isAccountDeletion ? t('Request Account Deletion') : t('Contact Developer')}
      heroTitle={isAccountDeletion ? `${appName} ${t('account deletion')}` : `${appName} ${t('support')}`}
      heroText={
        isAccountDeletion
          ? t('Send a dedicated request to delete your app account and related personal data.')
          : t('Send a structured request to the developer team. Include the area, title, and details so the issue can be reviewed clearly.')
      }
      detailsPlaceholder={
        isAccountDeletion
          ? t('Add any extra account deletion details here')
          : t('Describe your problem in detail here')
      }
      categoryLocked={isAccountDeletion}
      name={contactName}
      email={contactEmail}
      title={contactTitle}
      message={contactMessage}
      consentAccepted={contactConsent}
      selectedCategory={selectedContactCategory}
      categorySheetOpen={categorySheetOpen}
      insetsTop={insets.top}
      insetsBottom={insets.bottom}
      isDark={isDark}
      onChangeName={setContactName}
      onChangeEmail={setContactEmail}
      onChangeTitle={setContactTitle}
      onChangeMessage={setContactMessage}
      onToggleConsent={() => setContactConsent((value) => !value)}
      onOpenCategorySheet={() => setCategorySheetOpen(true)}
      onCloseCategorySheet={() => setCategorySheetOpen(false)}
      onSelectCategory={(category) => {
        setSelectedContactCategory(category);
        setCategorySheetOpen(false);
      }}
      onOpenPrivacyPolicy={handleOpenPrivacyPolicy}
      onClose={handleClose}
      onSend={handleSendDeveloperMessage}
      sendAccessibilityLabel={
        isAccountDeletion ? 'Send account deletion request' : 'Send developer support request'
      }
      styles={styles}
    />
  );
}

function AppNameMark({ appName, styles }: { appName: string; styles: AboutStyles }) {
  const accentMatch = appName.match(/^(.*?)(5)$/);

  if (!accentMatch) {
    return <Text style={styles.appName} numberOfLines={1}>{appName}</Text>;
  }

  return (
    <Text style={styles.appName} numberOfLines={1}>
      {accentMatch[1]}
      <Text style={styles.appNameAccent}>{accentMatch[2]}</Text>
    </Text>
  );
}

function AboutActionRow({
  action,
  onPress,
  styles,
  chevronColor,
}: {
  action: AboutAction;
  onPress: () => void;
  styles: AboutStyles;
  chevronColor: string;
}) {
  const { t } = useTranslation();
  const isRating = action.id === 'rate-experience';

  return (
    <FastPressable
      onPress={onPress}
      activateOnPressIn
      activateOnTouchStart
      unstable_pressDelay={0}
      latencyLabel={`about.${action.id}`}
      style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
      accessibilityRole="button"
      accessibilityLabel={action.title}
    >
      <Text style={styles.actionLabel} numberOfLines={1}>{t(action.title)}</Text>
      {isRating ? (
        <View style={styles.stars} pointerEvents="none">
          {RATING_STARS.map((star) => (
            <Ionicons key={star} name="star" size={30} color={ABOUT_STAR} />
          ))}
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={30} color={chevronColor} />
      )}
    </FastPressable>
  );
}

function ContactDeveloperScreen({
  appName,
  appVersion,
  appBuildVersion,
  screenTitle,
  heroTitle,
  heroText,
  detailsPlaceholder,
  categoryLocked = false,
  name,
  email,
  title,
  message,
  consentAccepted,
  selectedCategory,
  categorySheetOpen,
  insetsTop,
  insetsBottom,
  isDark,
  onChangeName,
  onChangeEmail,
  onChangeTitle,
  onChangeMessage,
  onToggleConsent,
  onOpenCategorySheet,
  onCloseCategorySheet,
  onSelectCategory,
  onOpenPrivacyPolicy,
  onClose,
  onSend,
  sendAccessibilityLabel,
  styles,
}: {
  appName: string;
  appVersion: string;
  appBuildVersion: string | null;
  screenTitle?: string;
  heroTitle?: string;
  heroText?: string;
  detailsPlaceholder?: string;
  categoryLocked?: boolean;
  name: string;
  email: string;
  title: string;
  message: string;
  consentAccepted: boolean;
  selectedCategory: AboutContactCategory | null;
  categorySheetOpen: boolean;
  insetsTop: number;
  insetsBottom: number;
  isDark: boolean;
  onChangeName: (value: string) => void;
  onChangeEmail: (value: string) => void;
  onChangeTitle: (value: string) => void;
  onChangeMessage: (value: string) => void;
  onToggleConsent: () => void;
  onOpenCategorySheet: () => void;
  onCloseCategorySheet: () => void;
  onSelectCategory: (category: AboutContactCategory) => void;
  onOpenPrivacyPolicy: () => void;
  onClose: () => void;
  onSend: () => void;
  sendAccessibilityLabel?: string;
  styles: AboutStyles;
}) {
  const { t } = useTranslation();
  const iconColor = isDark ? GDark.text : '#050505';
  const supportIconColor = isDark ? GDark.textMuted : '#64748B';
  const placeholderColor = isDark ? GDark.textFaint : '#9CA3AF';
  const categoryChevronColor = isDark ? GDark.textMuted : '#7B7B7B';
  const categoryCheckColor = isDark ? GDark.accent : '#2563EB';
  const contactScrollRef = useRef<ScrollView>(null);
  const contactScrollViewportRef = useRef<View>(null);
  const detailsFieldRef = useRef<View>(null);
  const contactScrollYRef = useRef(0);
  const detailsFocusedRef = useRef(false);
  const detailsLayoutRef = useRef<ContactDetailsLayout | null>(null);
  const keyboardInsetRef = useRef(0);
  const keyboardTopRef = useRef(Number.POSITIVE_INFINITY);
  const scrollViewportHeightRef = useRef(0);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const trimmedEmail = email.trim();
  const isEmailValid = isValidDeveloperContactEmail(email);
  const emailError =
    trimmedEmail.length > 0 && !isEmailValid
      ? t('Enter a valid email address.')
      : undefined;
  const canSend =
    name.trim().length > 0 &&
    isEmailValid &&
    selectedCategory !== null &&
    title.trim().length > 0 &&
    message.trim().length > 0 &&
    consentAccepted;
  const resolvedScreenTitle = screenTitle ?? t('Contact Developer');
  const resolvedHeroTitle = heroTitle ?? `${appName} ${t('support')}`;
  const resolvedHeroText =
    heroText ??
    t('Send a structured request to the developer team. Include the area, title, and details so the issue can be reviewed clearly.');
  const resolvedDetailsPlaceholder = detailsPlaceholder ?? t('Describe your problem in detail here');
  const resolvedSendAccessibilityLabel = sendAccessibilityLabel ?? 'Send developer support request';

  const scrollDetailsFromLayout = useCallback((animated = true) => {
    const layout = detailsLayoutRef.current;
    const viewportHeight = scrollViewportHeightRef.current;

    if (!layout || viewportHeight <= 0) {
      return;
    }

    const visibleHeight = Math.max(
      0,
      viewportHeight - keyboardInsetRef.current - CONTACT_DETAILS_VISIBLE_GAP,
    );
    const nextY = Math.max(0, layout.y + layout.height - visibleHeight);
    contactScrollRef.current?.scrollTo({ y: nextY, animated });
  }, []);

  const scrollDetailsAboveKeyboard = useCallback((animated = true) => {
    const scrollView = contactScrollRef.current;
    const scrollViewport = contactScrollViewportRef.current;
    const detailsField = detailsFieldRef.current;

    if (!scrollView || !scrollViewport || !detailsField) {
      scrollDetailsFromLayout(animated);
      return;
    }

    scrollViewport.measureInWindow((_scrollX, scrollY, _scrollWidth, scrollHeight) => {
      detailsField.measureInWindow((_fieldX, fieldY, _fieldWidth, fieldHeight) => {
        if (scrollHeight <= 0 || fieldHeight <= 0) {
          scrollDetailsFromLayout(animated);
          return;
        }

        const keyboardTop = keyboardTopRef.current;
        const scrollViewportBottom = scrollY + scrollHeight;
        const visibleBottom = Math.min(scrollViewportBottom, keyboardTop) - CONTACT_DETAILS_VISIBLE_GAP;
        const overlap = fieldY + fieldHeight - visibleBottom;

        if (overlap > 0) {
          scrollView.scrollTo({ y: Math.max(0, contactScrollYRef.current + overlap), animated });
        }
      });
    });
  }, [scrollDetailsFromLayout]);

  const scheduleDetailsScrollAboveKeyboard = useCallback((animated = true) => {
    requestAnimationFrame(() => {
      scrollDetailsAboveKeyboard(animated);
    });
  }, [scrollDetailsAboveKeyboard]);

  const handleKeyboardShow = useCallback((event: KeyboardEvent) => {
    const nextKeyboardInset = Math.max(event.endCoordinates.height, 0);
    keyboardInsetRef.current = nextKeyboardInset;
    keyboardTopRef.current = event.endCoordinates.screenY;
    setKeyboardInset(nextKeyboardInset);

    if (detailsFocusedRef.current) {
      scheduleDetailsScrollAboveKeyboard();
    }
  }, [scheduleDetailsScrollAboveKeyboard]);

  const handleKeyboardHide = useCallback(() => {
    keyboardInsetRef.current = 0;
    keyboardTopRef.current = Number.POSITIVE_INFINITY;
    setKeyboardInset(0);
  }, []);

  useEffect(() => {
    const keyboardShowSubscription = Keyboard.addListener('keyboardDidShow', handleKeyboardShow);
    const keyboardHideSubscription = Keyboard.addListener('keyboardDidHide', handleKeyboardHide);

    return () => {
      keyboardShowSubscription.remove();
      keyboardHideSubscription.remove();
    };
  }, [handleKeyboardHide, handleKeyboardShow]);

  const handleContactScrollLayout = useCallback((event: LayoutChangeEvent) => {
    scrollViewportHeightRef.current = event.nativeEvent.layout.height;
  }, []);

  const handleContactScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    contactScrollYRef.current = event.nativeEvent.contentOffset.y;
  }, []);

  const handleDetailsLayout = useCallback((event: LayoutChangeEvent) => {
    const { height, y } = event.nativeEvent.layout;
    detailsLayoutRef.current = { y, height };
  }, []);

  const handleDetailsFocus = useCallback(() => {
    detailsFocusedRef.current = true;
    scheduleDetailsScrollAboveKeyboard();
  }, [scheduleDetailsScrollAboveKeyboard]);

  const handleDetailsBlur = useCallback(() => {
    detailsFocusedRef.current = false;
  }, []);

  return (
    <Screen noBottomInset style={styles.contactScreen}>
      <View style={[styles.contactPageHeader, { paddingTop: Math.max(insetsTop, 0) + 8 }]}>
        <FastPressable
          onPress={onClose}
          activateOnPressIn
          activateOnTouchStart
          unstable_pressDelay={0}
          latencyLabel="about.contact.back"
          hitSlop={12}
          style={styles.contactBackButton}
          accessibilityRole="button"
          accessibilityLabel="Back to About"
        >
          <Ionicons name="arrow-back" size={30} color={iconColor} />
        </FastPressable>
        <Text style={styles.contactPageTitle} numberOfLines={1}>{resolvedScreenTitle}</Text>
      </View>

      <KeyboardAvoidingView
        style={styles.contactKeyboardAvoider}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View ref={contactScrollViewportRef} style={styles.contactPageBody}>
          <ScrollView
            ref={contactScrollRef}
            canCancelContentTouches={Platform.OS === 'ios'}
            style={styles.contactFormScroll}
            contentContainerStyle={[
              styles.contactFormContent,
              keyboardInset > 0
                ? { paddingBottom: CONTACT_FORM_BASE_BOTTOM_PADDING + keyboardInset + Math.max(insetsBottom, 0) }
                : null,
            ]}
            keyboardShouldPersistTaps="always"
            onLayout={handleContactScrollLayout}
            onScroll={handleContactScroll}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.contactHeroCard}>
              <AppLogo style={styles.contactHeroLogo} />
              <View style={styles.contactHeroCopy}>
                <Text style={styles.contactHeroTitle} numberOfLines={1}>{resolvedHeroTitle}</Text>
                <Text style={styles.contactHeroText}>
                  {resolvedHeroText}
                </Text>
                <Text style={styles.contactHeroMeta} numberOfLines={1}>
                  {t('App version')} {appVersion}
                </Text>
              </View>
            </View>

            <LineTextInput
              label="Your Name"
              value={name}
              onChangeText={onChangeName}
              placeholder="Enter your full name"
              icon="person-outline"
              keyboardType="default"
              iconColor={supportIconColor}
              placeholderColor={placeholderColor}
              styles={styles}
            />
            <LineTextInput
              label="Your Email"
              value={email}
              onChangeText={onChangeEmail}
              placeholder="Enter your email address"
              icon="mail-outline"
              keyboardType="email-address"
              iconColor={supportIconColor}
              placeholderColor={placeholderColor}
              error={emailError}
              styles={styles}
            />

            <View style={styles.formField}>
              <Text style={styles.formFieldLabel}>{t('Category')}</Text>
              <FastPressable
                onPress={categoryLocked ? undefined : onOpenCategorySheet}
                activateOnPressIn
                disabled={categoryLocked}
                latencyLabel="about.contact.category.open"
                style={({ pressed }) => [
                  styles.categorySelectCard,
                  pressed && !categoryLocked && styles.contactLinePressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Select category"
                accessibilityState={{ disabled: categoryLocked }}
              >
                <View style={styles.categorySelectCopy}>
                  <Text style={styles.categorySelectValue} numberOfLines={1}>
                    {selectedCategory ? t(selectedCategory.label) : t('Select Category')}
                  </Text>
                  <Text style={styles.categorySelectHint} numberOfLines={1}>
                    {selectedCategory ? t(selectedCategory.subtitle) : t('Choose the closest request type')}
                  </Text>
                </View>
                <Ionicons
                  name={categoryLocked ? 'lock-closed-outline' : 'chevron-down'}
                  size={categoryLocked ? 22 : 27}
                  color={categoryChevronColor}
                />
              </FastPressable>
              {categorySheetOpen && !categoryLocked ? (
                <ContactCategoryDropdown
                  selectedCategory={selectedCategory}
                  onSelect={onSelectCategory}
                  onClose={onCloseCategorySheet}
                  checkColor={categoryCheckColor}
                  styles={styles}
                />
              ) : null}
            </View>

            <LineTextInput
              label="Title"
              value={title}
              onChangeText={onChangeTitle}
              placeholder="Short summary"
              icon="create-outline"
              keyboardType="default"
              iconColor={supportIconColor}
              placeholderColor={placeholderColor}
              styles={styles}
            />

            <View ref={detailsFieldRef} style={styles.formField} onLayout={handleDetailsLayout}>
              <Text style={styles.formFieldLabel}>{t('Details')}</Text>
              <TextInput
                value={message}
                onChangeText={onChangeMessage}
                placeholder={resolvedDetailsPlaceholder}
                placeholderTextColor={placeholderColor}
                style={styles.problemInput}
                multiline
                scrollEnabled
                blurOnSubmit={false}
                textAlignVertical="top"
                onFocus={handleDetailsFocus}
                onBlur={handleDetailsBlur}
              />
            </View>

            <View style={styles.consentBlock}>
              <Text style={styles.consentText}>
                {t('I agree to the processing of my personal data by RTX5 for request handling purposes.')}
              </Text>
              <FastPressable
                onPress={onToggleConsent}
                latencyLabel="about.contact.consent"
                hitSlop={12}
                style={styles.checkbox}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: consentAccepted }}
                accessibilityLabel="Agree to personal data processing"
              >
                {consentAccepted ? <Ionicons name="checkmark" size={22} color={iconColor} /> : null}
              </FastPressable>
            </View>

            <View style={styles.privacyRow}>
              <Text style={styles.privacyText}>{t('Please have a look at our')}{' '}</Text>
              <FastPressable
                onPress={onOpenPrivacyPolicy}
                latencyLabel="about.contact.privacy"
                accessibilityRole="link"
                accessibilityLabel="Privacy Policy"
              >
                <Text style={styles.privacyLink}>{t('Privacy Policy')}</Text>
              </FastPressable>
            </View>
          </ScrollView>
        </View>

        <View style={[styles.contactPageFooter, { paddingBottom: Math.max(insetsBottom, 8) + 6 }]}>
          <Text style={styles.contactDisclaimer}>
            {t('RTX5 is a software application and does not provide any financial, investment, brokerage or trading services.')}
          </Text>
          <FastPressable
            onPress={canSend ? onSend : undefined}
            disabled={!canSend}
            latencyLabel="about.contact.send"
            style={[styles.contactSendButton, canSend && styles.contactSendButtonEnabled]}
            accessibilityRole="button"
            accessibilityLabel={resolvedSendAccessibilityLabel}
            accessibilityState={{ disabled: !canSend }}
          >
            <Text style={[styles.contactSendText, canSend && styles.contactSendTextEnabled]}>{t('SEND')}</Text>
          </FastPressable>
        </View>
      </KeyboardAvoidingView>

    </Screen>
  );
}

function LineTextInput({
  label,
  value,
  onChangeText,
  placeholder,
  icon,
  keyboardType,
  iconColor,
  placeholderColor,
  error,
  styles,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  icon: keyof typeof Ionicons.glyphMap;
  keyboardType: 'default' | 'email-address';
  iconColor: string;
  placeholderColor: string;
  error?: string;
  styles: AboutStyles;
}) {
  const { t } = useTranslation();
  const hasError = Boolean(error);

  return (
    <View style={styles.formField}>
      <Text style={styles.formFieldLabel}>{t(label)}</Text>
      <View style={[styles.textFieldCard, hasError && styles.textFieldCardError]}>
        <Ionicons name={icon} size={18} color={iconColor} style={styles.textFieldIcon} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={t(placeholder)}
          placeholderTextColor={placeholderColor}
          keyboardType={keyboardType}
          autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
          autoCorrect={keyboardType === 'email-address' ? false : undefined}
          style={styles.lineInput}
        />
      </View>
      {hasError ? <Text style={styles.formFieldError}>{error}</Text> : null}
    </View>
  );
}

function ContactCategoryDropdown({
  selectedCategory,
  onSelect,
  onClose,
  checkColor,
  styles,
}: {
  selectedCategory: AboutContactCategory | null;
  onSelect: (category: AboutContactCategory) => void;
  onClose: () => void;
  checkColor: string;
  styles: AboutStyles;
}) {
  return (
    <View style={styles.inlineCategoryDropdown}>
      <CategoryDropdownRow
        label="Select Category"
        selected={selectedCategory === null}
        onPress={onClose}
        checkColor={checkColor}
        styles={styles}
      />
      {ABOUT_CONTACT_CATEGORIES.map((category) => (
        <CategoryDropdownRow
          key={category.id}
          label={category.label}
          selected={category.id === selectedCategory?.id}
          onPress={() => onSelect(category)}
          checkColor={checkColor}
          styles={styles}
        />
      ))}
    </View>
  );
}

function CategoryDropdownRow({
  label,
  selected,
  onPress,
  checkColor,
  styles,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  checkColor: string;
  styles: AboutStyles;
}) {
  const { t } = useTranslation();

  return (
    <FastPressable
      onPress={onPress}
      latencyLabel={`about.contact.category.${label}`}
      style={({ pressed }) => [styles.inlineCategoryOption, pressed && styles.contactLinePressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
    >
      <Text style={[styles.inlineCategoryText, selected && styles.inlineCategoryTextSelected]} numberOfLines={1}>
        {t(label)}
      </Text>
      {selected ? <Ionicons name="checkmark-circle" size={18} color={checkColor} /> : null}
    </FastPressable>
  );
}
