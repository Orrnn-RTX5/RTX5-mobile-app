import { Ionicons } from '@expo/vector-icons';
import { memo, useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '../../i18n/useTranslation';
import { useBrokerDirectory } from '../../query/broker';
import { useIsDarkTheme } from '../../state/themeMode';
import { FastPressable } from '../../ui/components/FastPressable';
import { useTheme, type ThemeColors } from '../../ui/theme/useTheme';
import {
  buildBrokerDirectoryRows,
  buildBrokerDomainLogoUrl,
  formatBrokerInitials,
  sortBrokerDirectoryRows,
  type BrokerDirectoryRow,
} from './BrokersScreen/brokerDirectoryRows';

type BrokersLaunchShellProps = Readonly<{
  onBack: () => void;
  onSelectBroker?: (broker: BrokerDirectoryRow) => void;
  backLatencyLabel?: string;
  dataActive?: boolean;
}>;

/**
 * Ready Brokers first frame kept mounted for the Accounts "+" action.
 * Backend-managed logos bypass stale native bytes when the backend replaces an
 * image at the same URL.
 */
export const BrokersLaunchShell = memo(function BrokersLaunchShell({
  onBack,
  onSelectBroker,
  backLatencyLabel = 'brokers.launch.back',
  dataActive = true,
}: BrokersLaunchShellProps) {
  const T = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const isDark = useIsDarkTheme();
  const { data: brokerDirectory } = useBrokerDirectory(dataActive);
  const styles = useMemo(
    () => makeStyles(T, isDark, insets.top),
    [T, insets.top, isDark],
  );
  const previewRows = useMemo(() => {
    const liveRows = sortBrokerDirectoryRows(
      buildBrokerDirectoryRows(brokerDirectory?.entries),
    );
    // A launch shell may render only directory-validated identities. Showing
    // invented broker rows while discovery is loading would be a UI fallback
    // that users could mistake for a live universal directory.
    return liveRows.slice(0, 8);
  }, [brokerDirectory?.entries]);
  const isIdentityOnlyDirectory = brokerDirectory?.mode === 'identity_only';

  return (
    <View style={styles.root} testID="brokers-launch-shell">
      <View style={styles.header}>
        <FastPressable
          style={styles.iconButton}
          hitSlop={15}
          onPress={onBack}
          activateOnPressIn
          activateOnTouchStart
          latencyLabel={backLatencyLabel}
          latencyBudgetMs={50}
          unstable_pressDelay={0}
          accessibilityRole="button"
          accessibilityLabel={t('Back')}
        >
          <Ionicons name="arrow-back" size={26} color={T.text} />
        </FastPressable>

        <Text style={styles.headerTitle}>{t('Brokers')}</Text>
        <View style={styles.iconButton} pointerEvents="none" />
      </View>

      <View style={styles.searchRow} pointerEvents="none">
        <Ionicons name="search-outline" size={20} color={T.textMuted} />
        <Text style={styles.searchPlaceholder}>{t('Find broker')}</Text>
      </View>

      {isIdentityOnlyDirectory && (
        <View style={styles.contractWarning} pointerEvents="none" accessibilityRole="alert">
          <Ionicons name="warning-outline" size={18} color="#F59E0B" />
          <Text style={styles.contractWarningText}>
            {t('Broker identities are visible, but connection configuration is pending.')}
          </Text>
        </View>
      )}

      <View style={styles.list} pointerEvents={onSelectBroker ? 'auto' : 'none'}>
        {previewRows.map((row) => {
          const logoUri = row.selectable
            ? row.logoUrl || buildBrokerDomainLogoUrl(row.domain)
            : '';
          const rowContent = (
            <>
              <View style={styles.avatar}>
                {logoUri ? (
                  <Image
                    source={{ uri: logoUri, cache: 'reload' }}
                    style={styles.avatarImage}
                    resizeMode="contain"
                    fadeDuration={0}
                  />
                ) : (
                  <Text style={styles.avatarFallbackText}>{formatBrokerInitials(row.name)}</Text>
                )}
              </View>
              <View style={styles.brokerCopy}>
                <Text style={styles.brokerName} numberOfLines={1}>{row.name}</Text>
                <View style={styles.brokerIdPill}>
                  <Text style={styles.brokerIdText} numberOfLines={1}>{row.brokerId}</Text>
                </View>
                {!row.selectable && (
                  <Text style={styles.pendingConfigurationText} numberOfLines={2}>
                    {t('Connection configuration pending')}
                  </Text>
                )}
              </View>
              <View style={styles.chevronSpace}>
                <Ionicons
                  name={row.selectable ? 'chevron-forward' : 'lock-closed'}
                  size={20}
                  color={row.selectable ? T.textSub : '#F59E0B'}
                />
              </View>
            </>
          );

          if (onSelectBroker && row.selectable) {
            return (
              <FastPressable
                key={row.brokerId}
                style={styles.brokerRow}
                onPress={() => {
                  if (!row.selectable) return;
                  onSelectBroker(row);
                }}
                activateOnPressIn
                latencyLabel={`brokers.launch.row.${row.brokerId}`}
                latencyBudgetMs={50}
                unstable_pressDelay={0}
                accessibilityRole="button"
                accessibilityLabel={row.name}
              >
                {rowContent}
              </FastPressable>
            );
          }

          return (
            <View
              key={row.brokerId}
              style={[styles.brokerRow, !row.selectable && styles.brokerRowDisabled]}
              pointerEvents="none"
              accessible
              accessibilityLabel={!row.selectable
                ? `${row.name}. ${t('Connection configuration pending')}`
                : row.name}
              accessibilityState={{ disabled: !row.selectable }}
            >
              {rowContent}
            </View>
          );
        })}
      </View>

      <View style={styles.footer} pointerEvents="none">
        <Ionicons name="add-circle-outline" size={19} color={T.text} />
        <Text style={styles.footerText}>{t("Can't find your broker?")}</Text>
      </View>
    </View>
  );
});

function makeStyles(T: ThemeColors, isDark: boolean, safeTop: number) {
  const surface = isDark ? T.glass2 : '#FFFFFF';
  const softSurface = isDark ? 'rgba(255,255,255,0.045)' : '#F8FAFC';
  const dividerColor = isDark ? T.borderSubtle : 'rgba(15,23,42,0.08)';
  const cardBorder = isDark ? T.border : 'rgba(15,23,42,0.08)';

  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: T.bg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: 16,
      paddingRight: 16,
      paddingTop: safeTop + 8,
      paddingBottom: 8,
      gap: 8,
      backgroundColor: T.bg,
    },
    iconButton: {
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
    searchPlaceholder: {
      flex: 1,
      color: T.textMuted,
      fontSize: 16,
      paddingVertical: 6,
      backgroundColor: 'transparent',
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
    list: {
      flex: 1,
      paddingHorizontal: 12,
      paddingBottom: 14,
      gap: 10,
      overflow: 'hidden',
      backgroundColor: T.bg,
    },
    brokerRow: {
      minHeight: 76,
      flexDirection: 'row',
      alignItems: 'center',
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
    brokerRowDisabled: {
      borderColor: isDark ? 'rgba(245,158,11,0.30)' : 'rgba(217,119,6,0.22)',
      shadowOpacity: 0,
      elevation: 0,
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
    avatarImage: {
      width: 36,
      height: 36,
    },
    avatarFallbackText: {
      color: T.text,
      fontSize: 13,
      fontWeight: '700',
    },
    brokerCopy: {
      flex: 1,
      minWidth: 0,
    },
    brokerName: {
      color: T.text,
      fontSize: 17,
      fontWeight: '600',
    },
    brokerIdPill: {
      alignSelf: 'flex-start',
      maxWidth: '100%',
      marginTop: 5,
      paddingHorizontal: 8,
      minHeight: 24,
      borderRadius: 12,
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(37,99,235,0.16)' : 'rgba(37,99,235,0.10)',
    },
    brokerIdText: {
      color: '#0A84FF',
      fontSize: 12,
      fontWeight: '700',
    },
    pendingConfigurationText: {
      marginTop: 6,
      color: '#F59E0B',
      fontSize: 11,
      fontWeight: '700',
      lineHeight: 15,
    },
    chevronSpace: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    footer: {
      minHeight: 56,
      flexDirection: 'row',
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
    },
  });
}
