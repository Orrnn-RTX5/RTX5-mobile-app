import { FastPressable as Pressable } from '../../../ui/components/FastPressable';
/**
 * Chart Feature UI: PriceAlertsScreen
 *
 * Lists all active price alerts and provides a form to create new ones.
 * Each alert fires when the market price crosses the target in the chosen
 * direction (above / below). Alerts are stored server-side and persist
 * across devices and sessions.
 *
 * API:
 *  GET    /api/v2/alerts       — list alerts
 *  POST   /api/v2/alerts       — create alert
 *  DELETE /api/v2/alerts/{id}  — delete alert
 */

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsDarkTheme } from '../../../state/themeMode';
import { useTheme } from '../../../ui/theme/useTheme';
import { useUserPreferences } from '../../../state/userPreferences';
import { useTranslation } from '../../../i18n/useTranslation';
import {
  useAlertsQuery,
  useCreateAlertMutation,
  useDeleteAlertMutation,
} from '../../../query/alerts';
import type { AlertCondition } from '../../../api/alerts';
import { safeRouterBack } from '../../../utils/navigation';
import { AlertRow } from './AlertRow';
import { makePriceAlertsStyles } from './styles';

type PriceAlertRouteParams = {
  condition?: string | string[];
  drawingId?: string | string[];
  drawingKind?: string | string[];
  message?: string | string[];
  price?: string | string[];
  symbol?: string | string[];
};

const firstRouteParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const normalizeRouteSymbol = (value: string | string[] | undefined) =>
  (firstRouteParam(value) ?? '').replace(/\//g, '').trim().toUpperCase();

const normalizeRoutePrice = (value: string | string[] | undefined) => {
  const raw = (firstRouteParam(value) ?? '').trim().replace(',', '.');
  if (!raw) {
    return '';
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? raw : '';
};

const normalizeRouteCondition = (value: string | string[] | undefined): AlertCondition | undefined => {
  const raw = (firstRouteParam(value) ?? '').trim().toLowerCase();
  return raw === 'above' || raw === 'below' ? raw : undefined;
};

const normalizeRouteMessage = (value: string | string[] | undefined) =>
  (firstRouteParam(value) ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();

export type PriceAlertsScreenProps = Readonly<{
  hosted?: boolean;
  hostedActive?: boolean;
  onHostedBack?: () => void;
}>;

export function PriceAlertsScreen({
  hosted = false,
  hostedActive = false,
  onHostedBack,
}: PriceAlertsScreenProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const routeParams = useLocalSearchParams<PriceAlertRouteParams>();
  const T = useTheme();
  const isDark = useIsDarkTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makePriceAlertsStyles(T, isDark), [T, isDark]);
  const navigationFocused = useIsFocused();
  // Host instances mount outside any navigator screen, where useIsFocused()
  // is always true — hostedActive is the only truthful signal for them.
  const isScreenFocused = hosted ? hostedActive : navigationFocused;

  // Current chart symbol pre-fills the symbol field
  const chartSymbol = useUserPreferences((s) => s.chartSymbol);
  const routePrefillSymbol = useMemo(() => normalizeRouteSymbol(routeParams.symbol), [routeParams.symbol]);
  const routePrefillPrice = useMemo(() => normalizeRoutePrice(routeParams.price), [routeParams.price]);
  const routePrefillCondition = useMemo(() => normalizeRouteCondition(routeParams.condition), [routeParams.condition]);
  const routePrefillMessage = useMemo(() => normalizeRouteMessage(routeParams.message), [routeParams.message]);
  const routePrefillKey = useMemo(
    () => [
      routePrefillSymbol,
      routePrefillPrice,
      routePrefillCondition ?? '',
      routePrefillMessage,
      firstRouteParam(routeParams.drawingId) ?? '',
      firstRouteParam(routeParams.drawingKind) ?? '',
    ].join('|'),
    [
      routeParams.drawingId,
      routeParams.drawingKind,
      routePrefillCondition,
      routePrefillMessage,
      routePrefillPrice,
      routePrefillSymbol,
    ],
  );

  // ── Alert list ───────────────────────────────────────────────────────────
  const { data: alerts = [], isLoading, refetch, isRefetching } = useAlertsQuery({
    enabled: isScreenFocused,
  });
  const { mutate: deleteAlert } = useDeleteAlertMutation();

  // ── Create form state ────────────────────────────────────────────────────
  const [symbol, setSymbol] = useState(routePrefillSymbol || chartSymbol || '');
  const [condition, setCondition] = useState<AlertCondition>(routePrefillCondition ?? 'above');
  const [price, setPrice] = useState(routePrefillPrice);
  const [message, setMessage] = useState(routePrefillMessage);
  const [formError, setFormError] = useState('');
  const [appliedRoutePrefillKey, setAppliedRoutePrefillKey] = useState(routePrefillKey);
  const createAlertInFlightRef = React.useRef(false);
  const deletingAlertIdsRef = React.useRef<Set<number>>(new Set());
  const [deletingAlertIds, setDeletingAlertIds] = useState<Set<number>>(() => new Set());

  const { mutate: createAlert, isPending: isCreating } = useCreateAlertMutation();

  useEffect(() => {
    if (!routePrefillKey || routePrefillKey === appliedRoutePrefillKey) {
      return;
    }

    if (routePrefillSymbol) {
      setSymbol(routePrefillSymbol);
    }
    if (routePrefillCondition) {
      setCondition(routePrefillCondition);
    }
    if (routePrefillPrice) {
      setPrice(routePrefillPrice);
    }
    setMessage(routePrefillMessage);
    setFormError('');
    setAppliedRoutePrefillKey(routePrefillKey);
  }, [
    appliedRoutePrefillKey,
    routePrefillCondition,
    routePrefillKey,
    routePrefillMessage,
    routePrefillPrice,
    routePrefillSymbol,
  ]);

  const handleCreate = () => {
    if (createAlertInFlightRef.current || isCreating) {
      return;
    }

    const trimmedSymbol = symbol.trim().toUpperCase();
    const parsedPrice = parseFloat(price);

    if (!trimmedSymbol) { setFormError('Symbol is required'); return; }
    if (!price.trim() || isNaN(parsedPrice) || parsedPrice <= 0) {
      setFormError('Enter a valid price greater than 0');
      return;
    }
    setFormError('');
    createAlertInFlightRef.current = true;

    createAlert(
      {
        symbol: trimmedSymbol,
        condition,
        price: parsedPrice,
        message: message.trim() || undefined,
      },
      {
        onSuccess: () => {
          // Clear form on success, keep symbol for follow-up alerts
          setPrice('');
          setMessage('');
        },
        onError: () => {
          setFormError('Failed to create alert. Please try again.');
        },
        onSettled: () => {
          createAlertInFlightRef.current = false;
        },
      },
    );
  };

  const handleDelete = (id: number) => {
    if (deletingAlertIdsRef.current.has(id)) {
      return;
    }

    const nextDeletingIds = new Set(deletingAlertIdsRef.current);
    nextDeletingIds.add(id);
    deletingAlertIdsRef.current = nextDeletingIds;
    setDeletingAlertIds(nextDeletingIds);

    deleteAlert(id, {
      onSettled: () => {
        const next = new Set(deletingAlertIdsRef.current);
        next.delete(id);
        deletingAlertIdsRef.current = next;
        setDeletingAlertIds(next);
      },
    });
  };

  // Sort: active (not triggered) first, then triggered
  const sorted = useMemo(
    () => [...alerts].sort((a, b) => Number(a.triggered) - Number(b.triggered)),
    [alerts],
  );

  const screenBg = T.bg;
  const placeholderColor = isDark ? T.textFaint : '#94A3B8';
  const sectionIconColor = isDark ? T.textMuted : '#64748B';

  return (
    <View style={[styles.screen, { backgroundColor: screenBg }]}>
      {/* ── Status bar spacer ── */}
      <View style={{ height: insets.top, backgroundColor: screenBg }} />

      {/* ── Header ── */}
      <View style={[styles.header, { backgroundColor: screenBg }]}>
        <Pressable
          onPress={() => {
            if (hosted && onHostedBack) {
              onHostedBack();
              return;
            }
            safeRouterBack(router, '/chart/settings');
          }}
          activateOnPressIn
          activateOnTouchStart
          unstable_pressDelay={0}
          hitSlop={16}
          style={styles.headerBtn}
        >
          <Ionicons name="arrow-back" size={22} color={T.text} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: T.text }]} numberOfLines={1}>
          {t('Price Alerts')}
        </Text>
        <View style={styles.headerBtn} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          canCancelContentTouches={Platform.OS === 'ios'}
          style={styles.flex1}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 16) + 32 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={isDark ? T.textSub : '#131722'}
              colors={[T.accent]}
              progressBackgroundColor={isDark ? T.glass2 : '#FFFFFF'}
            />
          }
        >

          {/* ── Create Alert Form ── */}
          <View style={styles.sectionHeader}>
            <Ionicons name="add-circle-outline" size={14} color={sectionIconColor} />
            <Text style={styles.sectionTitle}>{t('NEW ALERT')}</Text>
          </View>
          <View style={styles.card}>
            {/* Symbol */}
            <View style={styles.fieldRow}>
              <Text style={[styles.fieldLabel, { color: T.textMuted }]}>{t('Symbol')}</Text>
              <TextInput
                style={[styles.fieldInput, { color: T.text }]}
                value={symbol}
                onChangeText={(v) => setSymbol(v.toUpperCase())}
                placeholder={t('e.g. EURUSD')}
                placeholderTextColor={placeholderColor}
                autoCapitalize="characters"
                returnKeyType="next"
              />
            </View>
            <View style={styles.separator} />

            {/* Condition toggle */}
            <View style={styles.fieldRow}>
              <Text style={[styles.fieldLabel, { color: T.textMuted }]}>{t('Condition')}</Text>
              <View style={styles.conditionToggle}>
                {(['above', 'below'] as AlertCondition[]).map((c) => (
                  <Pressable
                    key={c}
                    style={[
                      styles.conditionPill,
                      condition === c && {
                        backgroundColor: c === 'above' ? T.trading.buy.primary : T.trading.sell.primary,
                        borderColor: c === 'above' ? T.trading.buy.primary : T.trading.sell.primary,
                      },
                    ]}
                    onPress={() => setCondition(c)}
                  >
                    <Text style={[
                      styles.conditionPillText,
                      { color: condition === c ? '#FFFFFF' : T.textMuted },
                    ]}>
                      {c === 'above' ? `▲ ${t('Above')}` : `▼ ${t('Below')}`}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={styles.separator} />

            {/* Price */}
            <View style={styles.fieldRow}>
              <Text style={[styles.fieldLabel, { color: T.textMuted }]}>{t('Price')}</Text>
              <TextInput
                style={[styles.fieldInput, { color: T.text }]}
                value={price}
                onChangeText={setPrice}
                placeholder="0.00000"
                placeholderTextColor={placeholderColor}
                keyboardType="decimal-pad"
                returnKeyType="next"
              />
            </View>
            <View style={styles.separator} />

            {/* Message (optional) */}
            <View style={styles.fieldRow}>
              <Text style={[styles.fieldLabel, { color: T.textMuted }]}>{t('Note')}</Text>
              <TextInput
                style={[styles.fieldInput, { color: T.text }]}
                value={message}
                onChangeText={setMessage}
                placeholder={t('Optional notification note')}
                placeholderTextColor={placeholderColor}
                returnKeyType="done"
              />
            </View>

            {/* Error */}
            {!!formError && (
              <View style={styles.errorRow}>
                <Ionicons name="warning-outline" size={14} color={T.down} />
                <Text style={[styles.errorText, { color: T.down }]}>{t(formError)}</Text>
              </View>
            )}

            {/* Submit */}
            <Pressable
              style={[styles.createBtn, { backgroundColor: T.accent }, isCreating && { opacity: 0.6 }]}
              onPress={handleCreate}
              disabled={isCreating}
            >
              {isCreating
                ? <ActivityIndicator size="small" color="#FFFFFF" />
                : <Text style={styles.createBtnText}>{t('Set Alert')}</Text>
              }
            </Pressable>
          </View>

          {/* ── Active Alerts ── */}
          <View style={styles.sectionHeader}>
            <Ionicons name="notifications-outline" size={14} color={sectionIconColor} />
            <Text style={styles.sectionTitle}>
              {t('MY ALERTS')}{alerts.length > 0 ? ` (${alerts.length})` : ''}
            </Text>
          </View>

          {isLoading ? (
            <ActivityIndicator size="small" color={T.accent} style={{ marginTop: 24 }} />
          ) : sorted.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="notifications-off-outline" size={36} color={isDark ? T.textDimmed : '#CBD5E1'} />
              <Text style={[styles.emptyText, { color: T.textMuted }]}>{t('No alerts set')}</Text>
              <Text style={[styles.emptySubText, { color: isDark ? T.textMuted : '#94A3B8' }]}>
                {t('Create an alert above to get notified when a price level is reached')}
              </Text>
            </View>
          ) : (
            <View style={styles.card}>
              {sorted.map((alert, idx) => (
                <AlertRow
                  key={alert.id}
                  alert={alert}
                  onDelete={() => handleDelete(alert.id)}
                  isDeleting={deletingAlertIds.has(alert.id)}
                  isLast={idx === sorted.length - 1}
                  T={T}
                  isDark={isDark}
                  styles={styles}
                />
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
