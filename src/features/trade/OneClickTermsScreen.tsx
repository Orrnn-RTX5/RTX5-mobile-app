import { FastPressable as Pressable } from '../../ui/components/FastPressable';
/**
 * Trade Feature UI: OneClickTermsScreen
 * 
 * Disclaimer and terms acceptance screen for enabling "One-Click Trading"
 * which bypasses the standard confirmation prompts for faster execution.
 */

import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { Screen } from '../../ui/components/Screen';
import { useUserPreferences } from '../../state/userPreferences';
import { spacing } from '../../ui/theme/index';
import { useTheme } from '../../ui/theme/useTheme';
import { ThemeColors } from '../../ui/theme/glass';
import { useCallback, useMemo } from 'react';
import { useTranslation } from '../../i18n/useTranslation';
import { requestOneClickPreferenceChange } from './oneClickDisableConfirmation';

export function OneClickTermsScreen() {
  const oneClickAccepted = useUserPreferences((s) => s.oneClickAccepted);
  const setOneClickAccepted = useUserPreferences((s) => s.setOneClickAccepted);
  const T = useTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => makeStyles(T), [T]);
  const handleOneClickPreferenceChange = useCallback((nextEnabled: boolean) => {
    requestOneClickPreferenceChange({
      nextEnabled,
      translate: t,
      commit: setOneClickAccepted,
      showAlert: (title, message, buttons) => Alert.alert(title, message, buttons),
    });
  }, [setOneClickAccepted, t]);

  return (
    <Screen scroll>
      <Text style={styles.title}>{t('One Click Trading')}</Text>
      <View style={styles.card}>
        <Text style={styles.text}>
          {t('You are about to activate One Click Trading mode. By clicking Accept the terms below, you acknowledge and agree to bound order submission behavior.')}
        </Text>
        <Text style={styles.text}>
          {t('There will be no subsequent confirmation prompt for one-click order actions once activated.')}
        </Text>
        <Text style={styles.text}>
          {t('You agree to accept all risks associated with one-click trading mode, including errors or omissions in submitting orders.')}
        </Text>
      </View>
      <View style={styles.row}>
        <Switch
          value={oneClickAccepted}
          onValueChange={handleOneClickPreferenceChange}
          trackColor={{ false: '#1E1E1E', true: 'rgba(59, 130, 246, 0.5)' }}
          thumbColor={oneClickAccepted ? '#3b82f6' : '#f4f3f4'}
          {...({ activeThumbColor: '#3b82f6', activeTrackColor: 'rgba(59, 130, 246, 0.5)', thumbTintColor: oneClickAccepted ? '#3b82f6' : '#f4f3f4' } as any)}
        />
        <Text style={styles.accept}>{t('I Accept these Terms and Conditions')}</Text>
      </View>
      <Pressable style={[styles.button, !oneClickAccepted && styles.buttonDisabled]} onPress={() => setOneClickAccepted(true)}>
        <Text style={styles.buttonText}>{t('Accept').toUpperCase()}</Text>
      </Pressable>
    </Screen>
  );
}

const makeStyles = (T: ThemeColors) => StyleSheet.create({
  title: {
    marginTop: spacing.md,
    textAlign: 'center',
    color: T.text,
    fontSize: 22,
    fontWeight: '500',
  },
  card: {
    margin: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.borderMedium,
    backgroundColor: T.glass1,
    padding: spacing.md,
  },
  text: {
    color: T.textSub,
    fontSize: 15,
    lineHeight: 23,
    marginBottom: spacing.md,
  },
  row: {
    marginTop: spacing.md,
    marginHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  accept: {
    color: T.textSub,
    fontSize: 16,
    flex: 1,
  },
  button: {
    margin: spacing.md,
    marginTop: spacing.lg,
    backgroundColor: '#1D4ED8',
    borderRadius: 8,
    alignItems: 'center',
    paddingVertical: 14,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: T.text,
    fontWeight: '700',
    fontSize: 20,
  },
});
