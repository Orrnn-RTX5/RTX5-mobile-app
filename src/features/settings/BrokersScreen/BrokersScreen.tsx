import { FastPressable as Pressable } from '../../../ui/components/FastPressable';
/**
 * Settings Feature UI: BrokersScreen
 *
 * MT5-style searchable broker directory. Users tap the "+" on the Accounts
 * screen, search a broker by name, and proceed to the broker-detail screen
 * where they can open a demo / real account or sign into an existing one.
 */
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  Image,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  type GestureResponderEvent,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../../../ui/components/Screen';
import {
  hideSidebarDestination,
  showSidebarDestination,
} from '../../../ui/components/sidebarDestinationHostController';
import { useTheme } from '../../../ui/theme/useTheme';
import type { ThemeColors } from '../../../ui/theme/glass';
import { useIsDarkTheme } from '../../../state/themeMode';
import { useUserPreferences } from '../../../state/userPreferences';
import { useTranslation } from '../../../i18n/useTranslation';
import {
  safeRouterBack,
  scheduleBackNavigationAfterVisualFrame,
} from '../../../utils/navigation';
import { useBrokerDirectory } from '../../../query/broker';
import { selectGuestBroker } from '../../../services/selectGuestBroker';
import type { ValidatedBrokerServer } from '../../../api/broker';
import {
  brokersLaunchController,
  hideBrokersLaunch,
  scheduleBrokersLaunchCoverRemoval,
} from '../brokersLaunchController';
import {
  scheduleBrokerDetailLaunchNavigation,
  showBrokerDetailLaunch,
  toBrokerDetailLaunchSelection,
  type BrokerDetailLaunchSelection,
} from '../brokerDetailLaunchController';
import {
  buildBrokerDirectoryRows,
  buildBrokerDomainLogoUrl,
  formatBrokerInitials,
  sortBrokerDirectoryRows,
  type BrokerDirectoryRow,
} from './brokerDirectoryRows';
import {
  BROKER_DIRECTORY_HEALTH_REFRESH_INTERVAL_MS,
  BROKER_DIRECTORY_HEALTH_RESULT_MAX_AGE_MS,
  probeBrokerDirectoryHealth,
  type BrokerDirectoryHealthResult,
} from './brokerDirectoryHealth';
import {
  SELECTED_BROKER_UNAVAILABLE_MESSAGE,
  selectedBrokerHealthGate,
} from './selectedBrokerHealthGate';

const BROKER_ROW_PRESS_CANCEL_MOVE_PX = 14;

type BrokerRow = BrokerDirectoryRow;

type BrokerPressPoint = {
  pageX: number;
  pageY: number;
};

type BrokerPressGesture = {
  start: BrokerPressPoint | null;
  handled: boolean;
  cancelled: boolean;
  selection: BrokerDetailLaunchSelection | null;
};

function getBrokerPressPoint(event: GestureResponderEvent): BrokerPressPoint | null {
  const { pageX, pageY } = event.nativeEvent;
  if (!Number.isFinite(pageX) || !Number.isFinite(pageY)) {
    return null;
  }
  return { pageX, pageY };
}

function hasBrokerPressMovedBeyondThreshold(start: BrokerPressPoint, end: BrokerPressPoint) {
  const deltaX = end.pageX - start.pageX;
  const deltaY = end.pageY - start.pageY;
  return (
    deltaX * deltaX + deltaY * deltaY >
    BROKER_ROW_PRESS_CANCEL_MOVE_PX * BROKER_ROW_PRESS_CANCEL_MOVE_PX
  );
}

/**
 * Screen for searching and selecting a broker from a predefined list or remote API directory.
 */
export function BrokersScreen() {
  const isScreenFocused = useIsFocused();
  return <BrokerDirectoryScreen isScreenFocused={isScreenFocused} />;
}

type GuestBrokerPickerProps = {
  onSelectBroker: (broker: ValidatedBrokerServer) => void;
  onBack: () => void;
  selectionError?: string;
};

/** The existing directory presentation can also run inside the root guest modal. */
export function GuestBrokerPicker(props: GuestBrokerPickerProps) {
  return <BrokerDirectoryScreen {...props} isScreenFocused />;
}

function BrokerDirectoryScreen({ isScreenFocused, onSelectBroker, onBack, selectionError }: Partial<GuestBrokerPickerProps> & { isScreenFocused: boolean }) {
  const setBrokerConnection = useUserPreferences((state) => state.setBrokerConnection);
  const [search, setSearch] = useState('');
  const [logoFailed, setLogoFailed] = useState<Record<string, boolean>>({});
  const T = useTheme();
  const { t } = useTranslation();
  const isDark = useIsDarkTheme();
  const insets = useSafeAreaInsets();
  const routerInstance = useRouter();
  const brokerPickerFocusedRef = useRef(isScreenFocused);
  brokerPickerFocusedRef.current = isScreenFocused;
  const brokerPressGestureRef = useRef<BrokerPressGesture>({
    start: null,
    handled: false,
    cancelled: false,
    selection: null,
  });
  const coveredLaunchRevisionRef = useRef<number | null>(null);
  const styles = useMemo(() => makeStyles(T, isDark, insets.top), [T, isDark, insets.top]);
  // ── GET /broker/servers — live broker directory ──────────────────────────
  // The endpoint is public, so the query is always enabled. The screen is
  // reachable from the Accounts "+" icon both before and after login, and
  // either way the user needs the full broker list to pick from.
  const {
    data: brokerDirectory,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useBrokerDirectory(isScreenFocused);

  // Shared with the retained launch shell so its first frame and this live
  // list always resolve the same backend rows and logo URLs.
  const brokerRecords = useMemo(
    () => buildBrokerDirectoryRows(brokerDirectory?.entries),
    [brokerDirectory?.entries],
  );
  const isIdentityOnlyDirectory = brokerDirectory?.mode === 'identity_only';

  useLayoutEffect(() => {
    if (!isScreenFocused) {
      return;
    }
    if (onSelectBroker) return;
    const launchSnapshot = brokersLaunchController.getSnapshot();
    if (
      !launchSnapshot.visible
      || coveredLaunchRevisionRef.current === launchSnapshot.revision
    ) {
      return;
    }
    coveredLaunchRevisionRef.current = launchSnapshot.revision;
    // The mounted route owns loading, identity-only, empty, and error states.
    // Remove an empty retained shell immediately so the user sees the real
    // loader/error instead of a blank list for the request timeout window.
    hideSidebarDestination();
    scheduleBrokersLaunchCoverRemoval(launchSnapshot.revision);
  }, [isScreenFocused, onSelectBroker]);

  const trimmedQuery = search.trim().toLowerCase();
  const isSearching = trimmedQuery.length > 0;

  const visibleBrokers = useMemo(() => {
    if (!isSearching) {
      // Show the full directory by default. Pinned brokers (e.g. MetaQuotes
      // Ltd.) bubble to the top when present so the screen mirrors MT5's
      // landing state, but we never hide the rest of the list.
      return sortBrokerDirectoryRows(brokerRecords);
    }
    return brokerRecords.filter((broker) => {
      return (
        broker.name.toLowerCase().includes(trimmedQuery) ||
        broker.brokerId.toLowerCase().includes(trimmedQuery) ||
        broker.server.toLowerCase().includes(trimmedQuery) ||
        (broker.region ?? '').toLowerCase().includes(trimmedQuery)
      );
    });
  }, [brokerRecords, isSearching, trimmedQuery]);

  /**
   * Navigates to the Broker Detail (login) screen for the chosen broker.
   */
  const openBrokerDetail = (selection: BrokerDetailLaunchSelection) => {
    const record = brokerDirectory?.selectableServers.find(row => row.broker_id === selection.brokerId);
    if (!record) return;
    if (onSelectBroker) { onSelectBroker(record); return; }
    void selectGuestBroker(record).then(() => {
      hideBrokersLaunch(); hideSidebarDestination();
      routerInstance.replace('/(tabs)/quotes');
    }).catch(error => Alert.alert('Broker unavailable', error.message));
  };

  const recordBrokerRowPressStart = (broker: BrokerRow, event: GestureResponderEvent) => {
    if (!broker.selectable) {
      brokerPressGestureRef.current = {
        start: null,
        handled: false,
        cancelled: true,
        selection: null,
      };
      return;
    }
    const selection = toBrokerDetailLaunchSelection(broker);
    brokerPressGestureRef.current = {
      start: getBrokerPressPoint(event),
      handled: false,
      cancelled: false,
      selection,
    };
  };

  const cancelBrokerRowPressForScroll = () => {
    const gesture = brokerPressGestureRef.current;
    if (!gesture.start && gesture.cancelled) {
      return;
    }

    brokerPressGestureRef.current = {
      start: null,
      handled: false,
      cancelled: true,
      selection: null,
    };
  };

  const recordBrokerRowPressMove = (event: GestureResponderEvent) => {
    const gesture = brokerPressGestureRef.current;
    const current = getBrokerPressPoint(event);
    if (!gesture.start || !current) {
      return;
    }

    if (hasBrokerPressMovedBeyondThreshold(gesture.start, current)) {
      cancelBrokerRowPressForScroll();
    }
  };

  const shouldIgnoreBrokerRowPress = (event: GestureResponderEvent) => {
    const gesture = brokerPressGestureRef.current;
    if (gesture.cancelled || gesture.handled) {
      return true;
    }

    const end = getBrokerPressPoint(event);
    if (gesture.start && end && hasBrokerPressMovedBeyondThreshold(gesture.start, end)) {
      brokerPressGestureRef.current = {
        start: null,
        handled: false,
        cancelled: true,
        selection: null,
      };
      return true;
    }

    brokerPressGestureRef.current = {
      start: null,
      handled: true,
      cancelled: false,
      selection: gesture.selection,
    };
    return false;
  };

  /**
   * Triggered when the user taps on a specific broker row in the search results.
   */
  const handleBrokerRowPress = (broker: BrokerRow, event: GestureResponderEvent) => {
    if (!broker.selectable) {
      cancelBrokerRowPressForScroll();
      return;
    }
    if (shouldIgnoreBrokerRowPress(event)) {
      return;
    }
    const selection = toBrokerDetailLaunchSelection(broker);
    void selectedBrokerHealthGate.run({
      serverUrl: broker.serverUrl,
      onAvailable: () => {
        if (!brokerPickerFocusedRef.current) return;
        // Activate only the exact verified directory record for guest browsing.
        openBrokerDetail(selection);
      },
      onUnavailable: () => {
        if (!brokerPickerFocusedRef.current) return;
        Alert.alert(SELECTED_BROKER_UNAVAILABLE_MESSAGE);
      },
    });
  };

  /**
   * Returns to the Accounts management screen.
   */
  const handleBack = useCallback(() => {
    if (onBack) { onBack(); return; }
    // Restore the already-mounted Accounts pixels immediately, while its
    // focus/query work waits until after the native Brokers pop.
    showSidebarDestination('accounts', 'route-sync');
    if (brokersLaunchController.isVisible()) {
      hideBrokersLaunch();
    }
    scheduleBackNavigationAfterVisualFrame(() => {
      safeRouterBack(routerInstance, '/(tabs)/quotes');
    });
  }, [routerInstance, onBack]);

  useEffect(() => {
    if (!isScreenFocused || onSelectBroker) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });
    return () => subscription.remove();
  }, [handleBack, isScreenFocused, onSelectBroker]);

  return (
    <Screen>
      <View style={styles.page}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <Pressable
            style={styles.iconBtn}
            hitSlop={15}
            onPress={handleBack}
            activateOnPressIn
            activateOnTouchStart
            latencyLabel="brokers.back"
            latencyBudgetMs={50}
            unstable_pressDelay={0}
          >
            <Ionicons name="arrow-back" size={26} color={T.text} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('Brokers')}</Text>
          <View style={styles.iconBtn} />
        </View>

        {/* ── Search ── */}
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={20} color={T.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('Find broker')}
            placeholderTextColor={T.textMuted}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
            underlineColorAndroid="transparent"
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable
              style={styles.searchClearBtn}
              onPress={() => setSearch('')}
              hitSlop={10}
              activateOnPressIn
              latencyLabel="brokers.search.clear"
              unstable_pressDelay={0}
            >
              <Ionicons name="close" size={16} color={T.textMuted} />
            </Pressable>
          )}
        </View>

        {/* ── Results ── */}
        {selectionError ? <View style={styles.contractWarning} accessibilityRole="alert"><Text style={styles.contractWarningText}>{selectionError}</Text></View> : null}
        {isIdentityOnlyDirectory && (
          <View style={styles.contractWarning} accessibilityRole="alert">
            <Ionicons name="warning-outline" size={18} color="#F59E0B" />
            <Text style={styles.contractWarningText}>
              {t('Broker identities are visible, but connection configuration is pending.')}
            </Text>
          </View>
        )}
        <FlatList
          keyboardShouldPersistTaps="always"
          canCancelContentTouches={Platform.OS === 'ios'}
          style={styles.brokerList}
          data={visibleBrokers}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          onScrollBeginDrag={cancelBrokerRowPressForScroll}
          onMomentumScrollBegin={cancelBrokerRowPressForScroll}
          ItemSeparatorComponent={() => <View style={styles.cardGap} />}
          renderItem={({ item }) => (
            item.selectable ? (
              <Pressable
                style={({ pressed }) => [
                  styles.brokerRow,
                  pressed && styles.brokerRowPressed,
                ]}
                onPressIn={(event) => recordBrokerRowPressStart(item, event)}
                onTouchMove={recordBrokerRowPressMove}
                onPress={(event) => handleBrokerRowPress(item, event)}
                latencyLabel={`brokers.row.${item.brokerId}`}
                unstable_pressDelay={0}
              >
                <BrokerDirectoryCardContent
                  broker={item}
                  failed={Boolean(
                    logoFailed[item.logoUrl || buildBrokerDomainLogoUrl(item.domain)]
                  )}
                  onError={(logoKey) => setLogoFailed((prev) => ({ ...prev, [logoKey]: true }))}
                  healthEnabled={isScreenFocused}
                  pendingLabel={t('Connection configuration pending')}
                  iconColor={T.textSub}
                  styles={styles}
                />
              </Pressable>
            ) : (
              <View
                style={[styles.brokerRow, styles.brokerRowDisabled]}
                pointerEvents="none"
                accessible
                accessibilityLabel={`${item.name}. ${t('Connection configuration pending')}`}
                accessibilityState={{ disabled: true }}
              >
                <BrokerDirectoryCardContent
                  broker={item}
                  failed={false}
                  onError={() => undefined}
                  healthEnabled={false}
                  pendingLabel={t('Connection configuration pending')}
                  iconColor="#F59E0B"
                  styles={styles}
                />
              </View>
            )
          )}
          ListEmptyComponent={
            <View style={styles.emptyState} pointerEvents="box-none">
              {isLoading || isFetching ? (
                <>
                  <ActivityIndicator size="large" color={T.accent} />
                  <Text style={styles.emptyTitle}>{t('Loading brokers…')}</Text>
                </>
              ) : isError ? (
                <>
                  <Ionicons name="cloud-offline-outline" size={48} color={T.textDimmed} />
                  <Text style={styles.emptyTitle}>{t('Failed to load brokers')}</Text>
                  <Text style={styles.emptyText}>{error?.message || t('Please try again.')}</Text>
                  <Pressable
                    style={styles.retryBtn}
                    onPress={() => refetch()}
                    activateOnPressIn
                    latencyLabel="brokers.retry"
                    unstable_pressDelay={0}
                  >
                    <Text style={styles.retryText}>{t('Retry')}</Text>
                  </Pressable>
                </>
              ) : isSearching ? (
                <>
                  <Ionicons name="search-outline" size={48} color={T.textDimmed} />
                  <Text style={styles.emptyTitle}>{t('No broker matched your search')}</Text>
                </>
              ) : (
                <>
                  <Ionicons name="search-outline" size={48} color={T.textDimmed} />
                  <Text style={styles.emptyTitle}>{t('Use search to find a company')}</Text>
                  <Text style={styles.emptyText}>
                    {t('The application may feature brokerage companies which may not be regulated in your country. Exercise caution and responsibility before opening an account with any brokerage company.')}
                  </Text>
                  <Text style={styles.emptyText}>
                    {t('Contact details are provided for each company. Use them to further research their regulatory status and services. We may not possess complete and updated information about the regulation status of brokerage companies in particular countries and does not guarantee their reliability or reputation.')}
                  </Text>
                </>
              )}
            </View>
          }
        />

        {/* ── Footer ── */}
        <Pressable
          style={styles.footerBtn}
          onPress={() => {
            const selection: BrokerDetailLaunchSelection = {
              brokerId: 'custom',
              brokerName: t("Can't find your broker?"),
              brokerServer: '',
              brokerServerUrl: '',
              brokerLogoUrl: '',
              brokerDomain: '',
            };
            void selectedBrokerHealthGate.run({
              serverUrl: selection.brokerServerUrl,
              onAvailable: () => {
                if (!brokerPickerFocusedRef.current) return;
                openBrokerDetail(selection);
              },
              onUnavailable: () => {
                if (!brokerPickerFocusedRef.current) return;
                Alert.alert(SELECTED_BROKER_UNAVAILABLE_MESSAGE);
              },
            });
          }}
          activateOnPressIn
          latencyLabel="brokers.custom"
          unstable_pressDelay={0}
        >
          <Ionicons name="add-circle-outline" size={19} color={T.text} />
          <Text style={styles.footerText}>{t("Can't find your broker?")}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

function BrokerDirectoryCardContent({
  broker,
  failed,
  onError,
  healthEnabled,
  pendingLabel,
  iconColor,
  styles,
}: {
  broker: BrokerRow;
  failed: boolean;
  onError: (logoKey: string) => void;
  healthEnabled: boolean;
  pendingLabel: string;
  iconColor: string;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <>
      <BrokerAvatar
        broker={broker}
        failed={failed}
        onError={onError}
        styles={styles}
      />
      <View style={styles.brokerInfo}>
        <Text style={styles.brokerName} numberOfLines={1}>{broker.name}</Text>
        <View style={styles.brokerIdRow}>
          <Text style={styles.brokerIdLabel} numberOfLines={1}>{broker.brokerId}</Text>
        </View>
        {broker.selectable ? (
          <BrokerDirectoryHealthBadge
            broker={broker}
            enabled={healthEnabled}
            styles={styles}
          />
        ) : (
          <View style={styles.pendingConfigurationRow} pointerEvents="none">
            <Text style={styles.pendingConfigurationText} numberOfLines={2}>
              {pendingLabel}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.selectBtn} pointerEvents="none">
        <Ionicons
          name={broker.selectable ? 'chevron-forward' : 'lock-closed'}
          size={20}
          color={iconColor}
        />
      </View>
    </>
  );
}

/**
 * Displays the broker's logo in a standardized circular format for the search list.
 */
function BrokerAvatar({
  broker,
  failed,
  onError,
  styles,
}: {
  broker: BrokerRow;
  failed: boolean;
  onError: (logoKey: string) => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  const logoUri = broker.selectable
    ? broker.logoUrl || buildBrokerDomainLogoUrl(broker.domain)
    : '';
  if (!logoUri || failed) {
    return (
      <View style={[styles.avatar, styles.avatarFallback]}>
        <Text style={styles.avatarInitials}>{formatBrokerInitials(broker.name)}</Text>
      </View>
    );
  }
  return (
    <View style={styles.avatar}>
      <Image
        source={{ uri: logoUri, cache: 'reload' }}
        style={styles.avatarImage}
        resizeMode="contain"
        fadeDuration={0}
        onError={() => onError(logoUri)}
      />
    </View>
  );
}

function BrokerDirectoryHealthBadge({
  broker,
  enabled,
  styles,
}: {
  broker: BrokerRow;
  enabled: boolean;
  styles: ReturnType<typeof makeStyles>;
}) {
  const T = useTheme({ active: enabled });
  const [health, setHealth] = useState<BrokerDirectoryHealthResult | null>(null);

  useEffect(() => {
    if (!enabled || !broker.feedStatusUrl) {
      setHealth(null);
      return undefined;
    }

    let stopped = false;
    let controller: AbortController | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    let expiryTimer: ReturnType<typeof setTimeout> | null = null;

    const runProbe = async () => {
      if (stopped) return;
      const activeController = new AbortController();
      controller = activeController;
      const result = await probeBrokerDirectoryHealth(
        broker.feedStatusUrl,
        activeController.signal,
      );
      if (stopped || activeController.signal.aborted) return;
      if (controller === activeController) controller = null;

      setHealth(result);
      if (expiryTimer !== null) clearTimeout(expiryTimer);
      expiryTimer = setTimeout(() => {
        expiryTimer = null;
        if (!stopped) setHealth(null);
      }, BROKER_DIRECTORY_HEALTH_RESULT_MAX_AGE_MS);

      // Schedule only after completion so slow probes cannot overlap or create
      // an unbounded request queue while the directory remains focused.
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        void runProbe();
      }, BROKER_DIRECTORY_HEALTH_REFRESH_INTERVAL_MS);
    };

    setHealth(null);
    void runProbe();
    return () => {
      stopped = true;
      if (refreshTimer !== null) clearTimeout(refreshTimer);
      if (expiryTimer !== null) clearTimeout(expiryTimer);
      controller?.abort();
    };
  }, [broker.feedStatusUrl, enabled]);

  const label = health?.label ?? (broker.feedStatusUrl ? 'Checking market data…' : 'Status not configured');
  const dotColor = health?.state === 'healthy'
    ? T.trading.profit
    : health?.state === 'provider_down'
      ? '#F87171'
      : '#F59E0B';

  return (
    <View
      style={styles.brokerHealthRow}
      pointerEvents="none"
      accessibilityLabel={`${broker.name}: ${label}`}
    >
      <View style={[styles.brokerHealthDot, { backgroundColor: dotColor }]} />
      <Text style={styles.brokerHealthLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const MT5_BLUE = '#0a84ff';

const makeStyles = (T: ThemeColors, isDark: boolean, safeTop: number) => {
  const pageBg = T.bg;
  const surface = isDark ? T.glass2 : '#FFFFFF';
  const softSurface = isDark ? 'rgba(255,255,255,0.045)' : '#F8FAFC';
  const dividerColor = isDark ? T.borderSubtle : 'rgba(15,23,42,0.08)';
  const cardBorder = isDark ? T.border : 'rgba(15,23,42,0.08)';
  return StyleSheet.create({
    page: {
      flex: 1,
      backgroundColor: pageBg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: 16,
      paddingRight: 16,
      paddingTop: safeTop + 8,
      paddingBottom: 8,
      gap: 8,
      backgroundColor: pageBg,
    },
    iconBtn: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      flex: 1,
      color: T.text,
      fontSize: 20,
      fontWeight: '500',
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 48,
      marginHorizontal: 12,
      marginTop: 4,
      marginBottom: 10,
      paddingHorizontal: 12,
      gap: 12,
      borderRadius: 14,
      backgroundColor: surface,
      borderWidth: 1,
      borderColor: cardBorder,
    },
    searchInput: {
      flex: 1,
      color: T.text,
      fontSize: 16,
      paddingVertical: 6,
      backgroundColor: 'transparent',
    },
    searchClearBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(148,163,184,0.12)' : 'rgba(148,163,184,0.16)',
    },
    contractWarning: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 12,
      marginBottom: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(245,158,11,0.38)' : 'rgba(217,119,6,0.30)',
      backgroundColor: isDark ? 'rgba(245,158,11,0.10)' : 'rgba(245,158,11,0.08)',
    },
    contractWarningText: {
      flex: 1,
      color: T.textMuted,
      fontSize: 12,
      fontWeight: '600',
      lineHeight: 17,
    },
    divider: {
      height: 1,
      backgroundColor: dividerColor,
      marginHorizontal: 20,
    },
    brokerList: {
      flex: 1,
      backgroundColor: pageBg,
    },
    listContent: {
      paddingHorizontal: 12,
      paddingBottom: 14,
      backgroundColor: pageBg,
      flexGrow: 1,
    },
    cardGap: {
      height: 10,
    },
    brokerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 76,
      padding: 12,
      gap: 12,
      borderRadius: 16,
      backgroundColor: surface,
      borderWidth: 1,
      borderColor: T.border,
      shadowColor: isDark ? '#000000' : '#64748B',
      shadowOffset: { width: 0, height: isDark ? 4 : 2 },
      shadowOpacity: isDark ? 0.08 : 0.06,
      shadowRadius: isDark ? 16 : 8,
      elevation: isDark ? 4 : 1,
    },
    brokerRowPressed: {
      backgroundColor: isDark ? '#1E1E1E' : '#F8FAFC',
    },
    brokerRowDisabled: {
      borderColor: isDark ? 'rgba(245,158,11,0.30)' : 'rgba(217,119,6,0.22)',
      shadowOpacity: 0,
      elevation: 0,
    },
    rowDivider: {
      height: 1,
      backgroundColor: dividerColor,
      marginLeft: 64,
    },
    avatar: {
      width: 46,
      height: 46,
      borderRadius: 14,
      backgroundColor: softSurface,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    avatarFallback: {
      backgroundColor: '#2563EB',
    },
    avatarInitials: {
      color: '#FFFFFF',
      fontSize: 17,
      fontWeight: '700',
      letterSpacing: 0,
    },
    avatarImage: {
      width: 36,
      height: 36,
    },
    brokerInfo: {
      flex: 1,
      minWidth: 0,
    },
    brokerName: {
      color: T.text,
      fontSize: 17,
      fontWeight: '600',
    },
    brokerIdRow: {
      alignSelf: 'flex-start',
      maxWidth: '100%',
      marginTop: 5,
      paddingHorizontal: 8,
      minHeight: 24,
      borderRadius: 12,
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(37,99,235,0.16)' : 'rgba(37,99,235,0.10)',
    },
    brokerIdLabel: {
      color: MT5_BLUE,
      fontSize: 12,
      fontWeight: '700',
    },
    pendingConfigurationRow: {
      marginTop: 6,
      maxWidth: '100%',
    },
    pendingConfigurationText: {
      color: '#F59E0B',
      fontSize: 11,
      fontWeight: '700',
      lineHeight: 15,
    },
    brokerHealthRow: {
      marginTop: 6,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      maxWidth: '100%',
    },
    brokerHealthDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
    },
    brokerHealthLabel: {
      flexShrink: 1,
      color: T.textMuted,
      fontSize: 11,
      fontWeight: '600',
    },
    selectBtn: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyState: {
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingTop: 56,
      gap: 16,
    },
    emptyTitle: {
      color: T.textSub,
      fontSize: 16,
      fontWeight: '600',
      textAlign: 'center',
    },
    emptyText: {
      color: T.textMuted,
      fontSize: 13,
      fontWeight: '500',
      lineHeight: 18,
      textAlign: 'center',
    },
    retryBtn: {
      marginTop: 8,
      backgroundColor: MT5_BLUE,
      paddingHorizontal: 24,
      paddingVertical: 10,
      borderRadius: 22,
    },
    retryText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '600',
      letterSpacing: 0,
    },
    footerBtn: {
      flexDirection: 'row',
      minHeight: 56,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderTopWidth: 1,
      borderTopColor: dividerColor,
      backgroundColor: surface,
    },
    footerText: {
      color: T.text,
      fontSize: 14,
      fontWeight: '600',
      letterSpacing: 0,
    },
  });
};

// Preserve the original named export for any legacy router.push references.
export default BrokersScreen;
