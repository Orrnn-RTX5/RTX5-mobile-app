import { FastPressable as Pressable } from '../../ui/components/FastPressable';
/**
 * Settings -> Language Preference (Language picker)
 *
 * Selection is optimistic on the list (checkmark), then the global language
 * preference is committed after that paint so app-wide useTranslation()
 * re-renders do not steal the press frame.
 */
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../../ui/components/Screen';
import { hideSidebarDestination } from '../../ui/components/sidebarDestinationHostController';
import { useTheme } from '../../ui/theme/useTheme';
import { ThemeColors } from '../../ui/theme/glass';
import { useIsDarkTheme } from '../../state/themeMode';
import { useUserPreferences, type LanguageCode } from '../../state/userPreferences';
import {
  SUPPORTED_LANGUAGES,
  normalizeLanguageCode,
  translate,
} from '../../i18n/translations';
import {
  cancelPendingLanguagePreferenceCommit,
  flushPendingLanguagePreferenceCommit,
  scheduleLanguagePreferenceCommit,
} from '../../i18n/languageCommit';
import { safeRouterBack } from '../../utils/navigation';

/**
 * Allows the user to customize the application's UI language.
 * Route entry point — body lives in InterfaceScreenInner for the sidebar host.
 */
export function InterfaceScreen() {
  const isScreenFocused = useIsFocused();
  return <InterfaceScreenInner isScreenFocused={isScreenFocused} />;
}

type LanguageRowProps = {
  code: LanguageCode;
  nativeName: string;
  englishName: string;
  selected: boolean;
  styles: ReturnType<typeof makeStyles>;
  accentColor: string;
  onSelect: (code: LanguageCode) => void;
};

const LanguageRow = memo(function LanguageRow({
  code,
  nativeName,
  englishName,
  selected,
  styles,
  accentColor,
  onSelect,
}: LanguageRowProps) {
  return (
    <Pressable
      onPress={() => onSelect(code)}
      activateOnPressIn
      activateOnTouchStart
      latencyBudgetMs={32}
      latencyLabel={`interface.language.${code}`}
      unstable_pressDelay={0}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={styles.row}
    >
      <View style={styles.rowText}>
        <Text style={styles.nativeName}>{nativeName}</Text>
        <Text style={styles.englishName}>{englishName}</Text>
      </View>
      {selected ? <Ionicons name="checkmark" size={22} color={accentColor} /> : null}
    </Pressable>
  );
}, (prev, next) => (
  prev.selected === next.selected
  && prev.styles === next.styles
  && prev.accentColor === next.accentColor
  && prev.onSelect === next.onSelect
  && prev.nativeName === next.nativeName
  && prev.englishName === next.englishName
  && prev.code === next.code
));

export const InterfaceScreenInner = memo(function InterfaceScreenInner({
  isScreenFocused,
}: {
  isScreenFocused: boolean;
}) {
  const T = useTheme();
  const isDark = useIsDarkTheme();
  const insets = useSafeAreaInsets();
  // Read store language without useTranslation() so this screen is not forced
  // through the shared t() callback identity churn on every language field tick.
  const storedLanguage = useUserPreferences((s) => s.language);
  const setStoredLanguage = useUserPreferences((s) => s.setLanguage);
  const language = normalizeLanguageCode(storedLanguage);
  const [visualLanguage, setVisualLanguage] = useState<LanguageCode>(language);
  const styles = useMemo(() => makeStyles(T, isDark, insets.top), [T, isDark, insets.top]);
  const accentColor = T.accent ?? '#2563EB';
  // Section title follows optimistic language without waiting on the store.
  const sectionLabel = useMemo(
    () => translate('Select language', visualLanguage),
    [visualLanguage],
  );

  useEffect(() => {
    setVisualLanguage(language);
  }, [language]);

  useEffect(() => () => {
    // Leaving the screen must still persist the last tapped language.
    flushPendingLanguagePreferenceCommit();
  }, []);

  // Stable handler so unselected rows do not re-render when only the tick moves.
  const visualLanguageRef = useRef(visualLanguage);
  visualLanguageRef.current = visualLanguage;
  const languageRef = useRef(language);
  languageRef.current = language;

  const handleLanguagePress = useCallback((nextLanguage: LanguageCode) => {
    if (visualLanguageRef.current === nextLanguage && languageRef.current === nextLanguage) {
      return;
    }

    // 1) Paint the checkmark in this turn only (local state).
    setVisualLanguage(nextLanguage);

    if (languageRef.current === nextLanguage) {
      cancelPendingLanguagePreferenceCommit();
      return;
    }

    // 2) After this frame, commit the preference. That notifies every
    // useTranslation() consumer app-wide; doing it here freezes the list.
    scheduleLanguagePreferenceCommit(nextLanguage, (code) => {
      setStoredLanguage(code);
    });
  }, [setStoredLanguage]);

  const closeInterfaceScreen = useCallback(() => {
    if (hideSidebarDestination()) {
      return;
    }
    safeRouterBack(router, '/(tabs)/settings');
  }, []);

  return (
    <Screen style={isDark ? { backgroundColor: '#121212' } : undefined}>
      <View style={styles.header}>
        <Pressable
          onPress={closeInterfaceScreen}
          activateOnPressIn
          activateOnTouchStart
          latencyLabel="interface.back"
          latencyBudgetMs={50}
          unstable_pressDelay={0}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={24} color={T.text} />
        </Pressable>
        <View style={styles.headerTitleSpacer} />
        <View style={{ width: 40 }} />
      </View>

      {isScreenFocused ? (
        <>
          <Text style={styles.sectionLabel}>{sectionLabel}</Text>

          <ScrollView
            keyboardShouldPersistTaps="always"
            canCancelContentTouches={false}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {SUPPORTED_LANGUAGES.map((item) => (
              <LanguageRow
                key={item.code}
                code={item.code}
                nativeName={item.nativeName}
                englishName={item.englishName}
                selected={item.code === visualLanguage}
                styles={styles}
                accentColor={accentColor}
                onSelect={handleLanguagePress}
              />
            ))}
          </ScrollView>
        </>
      ) : <View style={styles.inactiveBody} />}
    </Screen>
  );
});

function makeStyles(T: ThemeColors, isDark: boolean, safeTop: number) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: safeTop + 8,
      paddingBottom: 12,
      backgroundColor: isDark ? '#121212' : T.bg,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: T.glass1,
    },
    headerTitleSpacer: { flex: 1 },
    inactiveBody: { flex: 1 },
    sectionLabel: {
      fontSize: 12,
      fontWeight: '500',
      letterSpacing: 1,
      color: T.textMuted,
      textTransform: 'uppercase',
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    listContent: { paddingHorizontal: 16, paddingBottom: 40 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: 16,
      backgroundColor: isDark ? T.glass2 : T.glass1,
      borderRadius: 12,
      marginVertical: 4,
      borderWidth: 1,
      borderColor: T.border,
    },
    rowText: { flex: 1 },
    nativeName: { fontSize: 16, fontWeight: '600', color: T.text },
    englishName: { fontSize: 12, color: T.textMuted, marginTop: 2 },
  });
}
