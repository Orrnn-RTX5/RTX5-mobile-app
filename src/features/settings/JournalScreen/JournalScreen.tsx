import { AppMenuIcon } from '../../../ui/components/AppMenuIcon';
import { useIsFocused } from '@react-navigation/native';
import React, { useCallback, useMemo } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FastPressable as Pressable } from '../../../ui/components/FastPressable';
import { Screen } from '../../../ui/components/Screen';
import { useRetainedRouteContentReady } from '../../../ui/components/DeferredRouteMount';
import { useUIState } from '../../../state/uiState';
import { openSidebarDrawerImmediately, scheduleAfterSidebarOpenVisual } from '../../../ui/components/sidebarDrawerController';
import { useTheme } from '../../../ui/theme/useTheme';
import { useIsDarkTheme } from '../../../state/themeMode';
import { useActiveBrokerQuerySession } from '../../../query/authenticatedQueryScope';
import { buildJournalSessionScopeKey } from '../../../state/journalSessionScope';
import { makeJournalStyles } from './styles';
import { useNextFrameValue } from '../../../hooks/useNextFrameValue';
import { useTranslation } from '../../../i18n/useTranslation';
import { ServerJournalPanel } from './serverJournal/ServerJournalPanel';

// Mount the retained Journal body before it is selected so the first sidebar
// reveal is complete. Live queries and journal requests remain focus-only.
const JOURNAL_BODY_PREWARM_DELAY_MS = 0;

/**
 * MT5-style server journal: authenticated GET /api/v2/journal for the active
 * broker account. All visible journal rows come from the server response.
 */
export const JournalScreenInner = React.memo(function JournalScreenInner({ isScreenFocused }: { isScreenFocused: boolean }) {
  const routeBodyReady = useRetainedRouteContentReady(
    isScreenFocused, JOURNAL_BODY_PREWARM_DELAY_MS,
  );
  const T = useTheme();
  const isDark = useIsDarkTheme();
  const { t } = useTranslation();
  const styles = useMemo(() => makeJournalStyles(T), [T]);
  const insets = useSafeAreaInsets();
  const hideActionSheet = useUIState((state) => state.hideActionSheet);

  // Session scope: changes on login/logout, account or broker/server switch only.
  const querySession = useActiveBrokerQuerySession();
  const sessionScope = useMemo(() => buildJournalSessionScopeKey(querySession), [querySession]);

  /**
   * Opens the sidebar navigation drawer.
   */
  const handleOpenMenu = useCallback(() => {
    openSidebarDrawerImmediately();
    scheduleAfterSidebarOpenVisual(hideActionSheet);
  }, [hideActionSheet]);

  return (
    <Screen style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Pressable
          onPress={handleOpenMenu}
          activateOnTouchStart
          hitSlop={15}
          style={styles.backButton}
          latencyLabel="journal.menu"
          accessibilityRole="button"
          accessibilityLabel={t('Open menu')}
        >
          <AppMenuIcon color={T.text} />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>{t('Journal')}</Text>
          <Text style={styles.headerSub}>{t('Terminal logs and connection events')}</Text>
        </View>
      </View>

      {routeBodyReady ? (
        <ServerJournalPanel
          isScreenFocused={isScreenFocused}
          isAuthenticated={querySession !== null}
          sessionScope={sessionScope}
          isDark={isDark}
          t={t}
          bottomInset={insets.bottom}
        />
      ) : <View style={styles.container} />}
    </Screen>
  );
});

export function JournalScreen() {
  const isScreenFocused = useIsFocused();
  const deferredScreenFocused = useNextFrameValue(isScreenFocused);
  return <JournalScreenInner isScreenFocused={deferredScreenFocused} />;
}
