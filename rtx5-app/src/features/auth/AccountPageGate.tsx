import { useIsFocused } from '@react-navigation/native';
import React, { useEffect, useSyncExternalStore, type PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { subscribeActiveBrokerSession } from '../../state/activeBrokerSession';
import { getPublicBrokerContext, subscribePublicBrokerContext } from '../../state/publicBrokerContext';
import { useUserPreferences } from '../../state/userPreferences';
import { hasTradingSession, requireTradingSession } from '../trade/tradeAuthPrompt';
import { useTranslation } from '../../i18n/useTranslation';
import { AppHeader } from '../../ui/components/AppHeader';
import { FastPressable } from '../../ui/components/FastPressable';
import { Screen } from '../../ui/components/Screen';
import { useTheme } from '../../ui/theme/useTheme';

function subscribeAccountSession(listener: () => void) {
  const unsubscribePreferences = useUserPreferences.subscribe(listener);
  const unsubscribeSession = subscribeActiveBrokerSession(listener);
  return () => { unsubscribePreferences(); unsubscribeSession(); };
}

/** Protect direct links and remove retained account data as soon as logout occurs. */
export function AccountPageGate({ page, children }: PropsWithChildren<{ page: 'Trade' | 'History' }>) {
  const focused = useIsFocused();
  const authenticated = useSyncExternalStore(subscribeAccountSession, hasTradingSession, hasTradingSession);
  const context = useSyncExternalStore(subscribePublicBrokerContext, getPublicBrokerContext, getPublicBrokerContext);
  const { t } = useTranslation();
  const T = useTheme();
  const requestLogin = () => requireTradingSession({ kind: page === 'Trade' ? 'trade-tab' : 'history-tab' });
  useEffect(() => {
    if (focused && !authenticated && context) requestLogin();
  }, [focused, authenticated, context, page]);

  if (authenticated) return children;
  return (
    <Screen noBottomInset>
      <AppHeader title={t(page)} noBorder />
      <View style={styles.content}>
        <Text style={[styles.title, { color: T.text }]}>{t('Login required')}</Text>
        <Text style={[styles.message, { color: T.textSub }]}>{t('Sign in to your trading account')}</Text>
        <FastPressable accessibilityRole="button" onPress={requestLogin} style={[styles.button, { backgroundColor: T.accent }]}>
          <Text style={styles.buttonText}>{t('Login')}</Text>
        </FastPressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  title: { fontSize: 20, fontWeight: '600', textAlign: 'center' },
  message: { fontSize: 15, textAlign: 'center' },
  button: { minHeight: 48, minWidth: 160, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
