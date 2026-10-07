import { FastPressable as Pressable } from '../../ui/components/FastPressable';
import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ColorPicker, { HueSlider, Panel1, Preview, colorKit } from 'reanimated-color-picker';
import { Screen } from '../../ui/components/Screen';
import { useDeferredRouteContentReady } from '../../ui/components/DeferredRouteMount';
import { useTranslation } from '../../i18n/useTranslation';
import {
  safeRouterBack,
  scheduleBackNavigationAfterVisualFrame,
} from '../../utils/navigation';
import { CANDLE_HISTORY_TIMEFRAMES } from '../../domain/candles/core/timeframeUtils';
import { useLiveCandles } from '../../domain/candles/hooks/useLiveCandles';
import { useLiveSymbolQuote } from '../../query/websocket';
import { calculateQuoteSpreadPoints } from '../../utils/quoteSpread';
import {
  CHART_COLOR_SCHEME_PRESETS,
  ChartColorScheme,
  ChartColorsConfig,
  resolveChartColorsForTheme,
  useUserPreferences,
} from '../../state/userPreferences';
import { ThemeColors } from '../../ui/theme/glass';
import { useTheme } from '../../ui/theme/useTheme';
import { useIsDarkTheme } from '../../state/themeMode';
import { OVERLAY_MODAL_PROPS } from '../../ui/overlayModalProps';
import { ChartTimeframePickerOverlay } from '../chart/components/ChartTimeframePickerSheet';
import {
  createChartTimeframePickerController,
  type ChartTimeframePickerController,
} from '../chart/chartTimeframePickerController';
import { LiveChartPreview } from '../chart/preview';

/** Keep the chrome instant; only mount the WebView preview after this settle. */
const SCHEMA_COLORS_PREVIEW_DELAY_MS = 120;

// Match the app dark palette for the chart preferences shell and cards.
const SETTINGS_DARK_BACKGROUND = '#121212';
const SETTINGS_DARK_CARD_BACKGROUND = '#1E1E1E';

type ColorGroup = {
  title: string;
  fields: Array<{ key: keyof ChartColorsConfig; label: string; hint?: string }>;
};

/**
 * Configuration layout for the individual chart color settings.
 * Groups colors into logical sections (e.g., Canvas, Candles, Volumes) for the user interface.
 */
const COLOR_GROUPS: ColorGroup[] = [
  {
    title: 'CANVAS',
    fields: [
      { key: 'background', label: 'Background',     hint: 'Chart canvas backdrop' },
      { key: 'foreground', label: 'Axis & labels',  hint: 'Price/time axis text' },
      { key: 'grid',       label: 'Grid lines',     hint: 'Horizontal & vertical guides' },
    ],
  },
  {
    title: 'CANDLES',
    fields: [
      { key: 'candlesUptrend',   label: 'Bull candle',   hint: 'Body when close ≥ open' },
      { key: 'candlesDowntrend', label: 'Bear candle',   hint: 'Body when close < open' },
      { key: 'hollowBody',       label: 'Hollow body',   hint: 'Fill for hollow candles' },
      { key: 'lineBody',      label: 'Line chart', hint: 'Close-only line color' },
    ],
  },
];

/**
 * Maps main candle colors to secondary elements like bar charts or volume bars,
 * ensuring the chart looks consistent when the user changes the primary bull/bear color.
 */
const LINKED_CANDLE_COLOR_KEYS: Partial<Record<keyof ChartColorsConfig, keyof ChartColorsConfig>> = {
  candlesUptrend: 'barsUptrend',
  candlesDowntrend: 'barsDowntrend',
};

/**
 * Pre-defined chart color schemes. 
 * The 'Custom' scheme is activated automatically if the user manually overrides a specific color.
 */
const SCHEME_OPTIONS: Array<{ key: ChartColorScheme; label: string }> = [
  { key: 'green_on_black', label: CHART_COLOR_SCHEME_PRESETS.green_on_black.label },
  { key: 'black_on_white', label: CHART_COLOR_SCHEME_PRESETS.black_on_white.label },
  { key: 'yellow_on_black', label: CHART_COLOR_SCHEME_PRESETS.yellow_on_black.label },
  { key: 'custom', label: 'Custom' },
];

const normalizeHex = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '#000000';
  return trimmed.startsWith('#') ? trimmed.toUpperCase() : `#${trimmed}`.toUpperCase();
};

const normalizeChartColorInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === 'transparent') return 'transparent';
  if (/^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(trimmed)) return normalizeHex(trimmed);
  if (/^rgba?\(/i.test(trimmed)) return trimmed;
  return null;
};

const isTransparent = (color?: string) => typeof color === 'string' && color.toLowerCase() === 'transparent';

const formatQuote = (value?: number, digits = 2) =>
  Number.isFinite(value) ? Number(value).toFixed(Math.min(Math.max(digits, 2), 5)) : '--';

type ChartPropertiesTimeframePickerHostHandle = Readonly<{
  open: () => void;
}>;

type ChartPropertiesTimeframePickerHostProps = Readonly<{
  active: boolean;
  activeTimeframe: string;
  accentColor: string;
  isDark: boolean;
  textColor: string;
  mutedColor: string;
  onSelect: (timeframe: string) => void;
}>;

/**
 * Prewarmed route-local picker. Its visibility state is isolated from the live
 * preview so opening the dropdown never reconciles quotes, candles, or WebView.
 */
const ChartPropertiesTimeframePickerHost = React.memo(React.forwardRef<
  ChartPropertiesTimeframePickerHostHandle,
  ChartPropertiesTimeframePickerHostProps
>(function ChartPropertiesTimeframePickerHost({
  active,
  activeTimeframe,
  accentColor,
  isDark,
  textColor,
  mutedColor,
  onSelect,
}, ref) {
  const [controller] = useState<ChartTimeframePickerController>(
    createChartTimeframePickerController,
  );

  const open = useCallback(() => {
    if (!active) return;
    controller.show();
  }, [active, controller]);

  React.useImperativeHandle(ref, () => ({ open }), [open]);

  useEffect(() => {
    if (!active) {
      controller.hide();
    }
  }, [active, controller]);

  const handleSelect = useCallback((timeframe: string) => {
    controller.hide();
    onSelect(timeframe);
  }, [controller, onSelect]);

  return (
    <ChartTimeframePickerOverlay
      controller={controller}
      activeTimeframe={activeTimeframe}
      supportedTimeframes={CANDLE_HISTORY_TIMEFRAMES}
      accentColor={accentColor}
      isDark={isDark}
      textColor={textColor}
      mutedColor={mutedColor}
      onSelect={handleSelect}
    />
  );
}));

/**
 * Screen for configuring global chart visual properties and display preferences.
 */
export type ChartPropertiesScreenProps = Readonly<{
  /** When true, shown from ChartConfigDestinationHost over Chart Preferences. */
  hosted?: boolean;
  hostedActive?: boolean;
  onHostedBack?: () => void;
}>;

export function ChartPropertiesScreen({
  hosted = false,
  hostedActive = false,
  onHostedBack,
}: ChartPropertiesScreenProps) {
  // Hosted opens are active when the retained layer is visible; routed opens
  // still use navigation focus. Inactive host layers freeze theme so a theme
  // tap only repaints the visible Settings shell.
  const navigationFocused = useIsFocused();
  // Host instances mount outside any navigator screen, where useIsFocused()
  // is always true — hostedActive is the only truthful signal there. OR-ing
  // them kept the hidden host's live chart preview subscribed to every tick.
  const isScreenFocused = hosted ? hostedActive : navigationFocused;
  const themeActive = !hosted || hostedActive;
  const T = useTheme({ active: themeActive });
  const isDark = useIsDarkTheme({ active: themeActive });
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(T, isDark), [T, isDark]);
  const { width } = useWindowDimensions();
  const isCompact = width < 390;
  // Delay the live WebView preview so Schema & Colors chrome paints on the
  // first frame. Candles and WebView work start only after that settle; the
  // lightweight Bid quote is primed separately before the hosted reveal.
  const previewContentReady = useDeferredRouteContentReady(
    SCHEMA_COLORS_PREVIEW_DELAY_MS,
    isScreenFocused,
  );
  const { t } = useTranslation();



  const chartSymbol = useUserPreferences((s) => s.chartSymbol);
  const chartTimeframe = useUserPreferences((s) => s.chartTimeframe);
  const chartVisualType = useUserPreferences((s) => s.chartVisualType);
  const priceSource = useUserPreferences((s) => s.priceSource);
  const chartDisplay = useUserPreferences((s) => s.chartDisplay);
  const chartViewportShowVolumePane = useUserPreferences((s) => s.chartViewportShowVolumePane);
  const chartColors = useUserPreferences((s) => s.chartColors);
  const chartColorScheme = useUserPreferences((s) => s.chartColorScheme);
  const setChartColorScheme = useUserPreferences((s) => s.setChartColorScheme);
  const setChartColor = useUserPreferences((s) => s.setChartColor);
  const resolvedChartColors = useMemo(
    () => resolveChartColorsForTheme(chartColors, chartColorScheme, isDark),
    [chartColors, chartColorScheme, isDark],
  );

  const [schemeModalOpen, setSchemeModalOpen] = useState(false);
  const [activeColorKey, setActiveColorKey] = useState<keyof ChartColorsConfig | null>(null);
  const [draftColor, setDraftColor] = useState('');
  const livePickerFrameRef = useRef<number | null>(null);
  const pendingPickerDraftRef = useRef<string | null>(null);
  const backNavigationStartedRef = useRef(false);
  const timeframePickerHostRef = useRef<ChartPropertiesTimeframePickerHostHandle>(null);
  const colorEditorOpen = activeColorKey !== null;
  // A hosted destination exists only after the user selects it and mounts
  // behind Chart Preferences for its first layout. Prime the direct quote
  // during that hidden layout so cached/live Bid is ready on the first visible
  // frame; routed opens use navigation focus. Keep quote renders paused while
  // the color editor is handling gestures.
  const quoteActive = (hosted || navigationFocused) && !colorEditorOpen;
  const previewActive = previewContentReady && isScreenFocused && !colorEditorOpen;

  useEffect(() => {
    if (isScreenFocused) {
      backNavigationStartedRef.current = false;
    }
  }, [isScreenFocused]);

  const handleReturnFromSchema = useCallback(() => {
    if (backNavigationStartedRef.current) {
      return;
    }
    // Hosted path: hide the retained layer instantly (sidebar-style).
    if (hosted && onHostedBack) {
      onHostedBack();
      return;
    }
    backNavigationStartedRef.current = true;
    // Prefer Chart Preferences when that is the previous stack entry; fall
    // back to the chart tab when Schema was opened from elsewhere.
    scheduleBackNavigationAfterVisualFrame(() => {
      safeRouterBack(router, '/chart/settings');
    });
  }, [hosted, onHostedBack]);

  const handleOpenTimeframePicker = useCallback(() => {
    timeframePickerHostRef.current?.open();
  }, []);

  const handleTimeframeSelect = useCallback((nextTimeframe: string) => {
    const preferences = useUserPreferences.getState();
    if (nextTimeframe !== preferences.chartTimeframe) {
      preferences.setChartTimeframe(nextTimeframe);
    }
  }, []);

  // Direct per-symbol ticks keep the Bid and Spread preview cards live without waiting on the delayed chart preview.
  const liveQuote = useLiveSymbolQuote(chartSymbol, quoteActive, 0);
  const { candles } = useLiveCandles(chartSymbol, chartTimeframe, previewActive);

  useEffect(() => {
    return () => {
      if (livePickerFrameRef.current !== null) {
        cancelAnimationFrame(livePickerFrameRef.current);
      }
    };
  }, []);

  const isValidDraftColor = useMemo(() => {
    if (!draftColor || draftColor.length < 4) return false;
    if (draftColor.toLowerCase() === 'transparent') return false;
    // Accept hex colors like #FFF, #FFFFFF, #FFFFFFFF
    if (/^#[0-9a-f]{3}([0-9a-f]{3})?([0-9a-f]{2})?$/i.test(draftColor)) return true;
    // Accept rgba/rgb format
    if (/^rgba?\(/i.test(draftColor)) return true;
    return false;
  }, [draftColor]);

  const colorRgb = useMemo(() => {
    if (!isValidDraftColor) return { r: 0, g: 0, b: 0, a: 1 };
    try {
      return colorKit.RGB(draftColor).object();
    } catch {
      return { r: 0, g: 0, b: 0, a: 1 };
    }
  }, [draftColor, isValidDraftColor]);

  const colorHsv = useMemo(() => {
    if (!isValidDraftColor) return { h: 0, s: 0, v: 0, a: 1 };
    try {
      return colorKit.HSV(draftColor).object();
    } catch {
      return { h: 0, s: 0, v: 0, a: 1 };
    }
  }, [draftColor, isValidDraftColor]);

  const colorHsl = useMemo(() => {
    if (!isValidDraftColor) return { h: 0, s: 0, l: 0, a: 1 };
    try {
      return colorKit.HSL(draftColor).object();
    } catch {
      return { h: 0, s: 0, l: 0, a: 1 };
    }
  }, [draftColor, isValidDraftColor]);

  const pickerColorValue = useMemo(() => {
    const normalizedDraft = normalizeChartColorInput(draftColor);
    if (normalizedDraft && normalizedDraft !== 'transparent') return normalizedDraft;
    if (activeColorKey) {
      const storedColor = resolvedChartColors[activeColorKey];
      const normalizedStoredColor = storedColor ? normalizeChartColorInput(storedColor) : null;
      if (normalizedStoredColor && normalizedStoredColor !== 'transparent') return normalizedStoredColor;
    }
    // ColorPicker cannot accept incomplete HEX drafts, so keep rendering a safe color while the user types.
    return '#000000';
  }, [activeColorKey, draftColor, resolvedChartColors]);

  const liveSpreadPoints = calculateQuoteSpreadPoints(liveQuote?.bid, liveQuote?.ask, liveQuote?.digits);
  const snapshot = [
    {
      label: priceSource === 'bid' ? t('Bid') : t('Ask'),
      value: formatQuote(priceSource === 'bid' ? liveQuote?.bid : liveQuote?.ask, liveQuote?.digits),
    },
    {
      label: t('Spread'),
      value: Number.isFinite(liveSpreadPoints)
        ? Number(liveSpreadPoints).toFixed(1)
        : Number.isFinite(liveQuote?.spread)
          ? Number(liveQuote?.spread).toFixed(1)
          : '--',
    },
  ];
  const previewLastCandle = candles.length > 0 ? candles[candles.length - 1] : null;
  const livePreviewPrice = useMemo(() => {
    const primaryPrice = priceSource === 'ask' ? liveQuote?.ask : liveQuote?.bid;
    const fallbackPrice = priceSource === 'ask' ? liveQuote?.bid : liveQuote?.ask;
    if (typeof primaryPrice === 'number' && Number.isFinite(primaryPrice) && primaryPrice > 0) {
      return primaryPrice;
    }
    if (typeof fallbackPrice === 'number' && Number.isFinite(fallbackPrice) && fallbackPrice > 0) {
      return fallbackPrice;
    }
    return undefined;
  }, [liveQuote?.ask, liveQuote?.bid, priceSource]);
  const previewLiveCandle = useMemo(() => {
    if (!previewLastCandle && livePreviewPrice === undefined) return null;
    if (!previewLastCandle && livePreviewPrice !== undefined) {
      return {
        open: livePreviewPrice,
        high: livePreviewPrice,
        low: livePreviewPrice,
        close: livePreviewPrice,
      };
    }
    if (!previewLastCandle || livePreviewPrice === undefined) return previewLastCandle;

    // Blend the immediate live quote into the current preview candle between candle-stream updates.
    return {
      ...previewLastCandle,
      high: Math.max(previewLastCandle.high, livePreviewPrice),
      low: Math.min(previewLastCandle.low, livePreviewPrice),
      close: livePreviewPrice,
    };
  }, [livePreviewPrice, previewLastCandle]);
  const previewIsUp = previewLiveCandle ? previewLiveCandle.close >= previewLiveCandle.open : true;
  const previewOhlcItems = previewLiveCandle
    ? [
        { label: 'O', value: formatQuote(previewLiveCandle.open, liveQuote?.digits) },
        { label: 'H', value: formatQuote(previewLiveCandle.high, liveQuote?.digits) },
        { label: 'L', value: formatQuote(previewLiveCandle.low, liveQuote?.digits) },
        { label: 'C', value: formatQuote(previewLiveCandle.close, liveQuote?.digits) },
      ]
    : [];
  const previewFooterItems = [
    `${t('Scheme')}: ${t(SCHEME_OPTIONS.find((option) => option.key === chartColorScheme)?.label ?? 'Custom')}`,
    `${t('Source')}: ${priceSource === 'bid' ? t('Bid price') : t('Ask price')}`,
    `${t('Candles')}: ${candles.length}`,
  ];
  const previewDisplay = useMemo(
    () => ({
      ...chartDisplay,
      showTickVolumes: chartViewportShowVolumePane,
      showRealVolumes: false,
    }),
    [chartDisplay, chartViewportShowVolumePane],
  );

  const rgbaToHex = (rgba: string): string => {
    const match = rgba.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!match) return '#000000';
    const [, r, g, b] = match;
    return '#' + [r, g, b].map(c => Number(c).toString(16).padStart(2, '0')).join('').toUpperCase();
  };

  const openColorEditor = (key: keyof ChartColorsConfig) => {
    setActiveColorKey(key);
    let color = resolvedChartColors[key] || '#000000';
    // Convert rgba() to hex so colorKit can parse it
    if (/^rgba?\(/i.test(color)) {
      color = rgbaToHex(color);
    }
    setDraftColor(color);
  };

  const commitChartColor = (key: keyof ChartColorsConfig, color: string) => {
    // Entering Custom from a preset scheme: freeze the palette the user is
    // actually seeing (theme-resolved) before the first commit. Otherwise the
    // scheme flips to 'custom' and every OTHER structural color reverts to its
    // raw stored preset value — e.g. white axis text and white grid from a
    // dark preset rendered on the light theme's white canvas.
    if (chartColorScheme !== 'custom') {
      (Object.keys(resolvedChartColors) as Array<keyof ChartColorsConfig>).forEach((paletteKey) => {
        const paletteValue = resolvedChartColors[paletteKey];
        if (paletteKey !== key && typeof paletteValue === 'string') {
          setChartColor(paletteKey, paletteValue);
        }
      });
    }
    // Bar colors are hidden here, so keep OHLC bars aligned with the visible candle controls.
    setChartColor(key, color);
    const linkedBarKey = LINKED_CANDLE_COLOR_KEYS[key];
    if (linkedBarKey) {
      setChartColor(linkedBarKey, color);
    }
  };

  const applyDraftColor = (value: string) => {
    if (!activeColorKey) return;
    const normalized = normalizeChartColorInput(value);
    if (!normalized) return;
    setDraftColor(normalized);
    commitChartColor(activeColorKey, normalized);
    setActiveColorKey(null);
  };

  const handleDraftColorChange = (value: string) => {
    setDraftColor(value);
    if (!activeColorKey) return;
    const normalized = normalizeChartColorInput(value);
    if (normalized) {
      commitChartColor(activeColorKey, normalized);
    }
  };

  const handlePickerColorChange = (value: string) => {
    pendingPickerDraftRef.current = value;
    if (livePickerFrameRef.current !== null) return;

    // Update only the local HEX/RGB/HSV/HSL readouts during drag; chart persistence waits for release.
    livePickerFrameRef.current = requestAnimationFrame(() => {
      livePickerFrameRef.current = null;
      const nextDraft = pendingPickerDraftRef.current;
      if (nextDraft) {
        setDraftColor(nextDraft);
      }
    });
  };

  const handlePickerColorComplete = (value: string) => {
    pendingPickerDraftRef.current = null;
    if (livePickerFrameRef.current !== null) {
      cancelAnimationFrame(livePickerFrameRef.current);
      livePickerFrameRef.current = null;
    }
    setDraftColor(value);
    if (!activeColorKey) return;
    const normalized = normalizeChartColorInput(value);
    if (normalized) {
      commitChartColor(activeColorKey, normalized);
    }
  };

  return (
    <Screen style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 0) + 8 }]}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={handleReturnFromSchema}
            activateOnPressIn
            activateOnTouchStart
            unstable_pressDelay={0}
            latencyLabel="chartProperties.back"
            hitSlop={16}
            style={styles.headerBackBtn}
          >
            <Ionicons name="arrow-back" size={24} color={isDark ? '#F8FAFC' : '#0F172A'} />
          </Pressable>
          <View style={styles.headerTitleWrap} pointerEvents="none">
            <Text style={styles.headerTitle} numberOfLines={1}>{t('Chart Schema & Colors')}</Text>
          </View>
          <View style={styles.headerBackBtn} />
        </View>
      </View>
      <ScrollView
        keyboardShouldPersistTaps="always"
        canCancelContentTouches={Platform.OS === 'ios'} style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        <View style={styles.previewCard}>
          <View style={styles.previewHeader}>
            <View>
              <Text style={styles.previewTitle}>{t('Live chart preview')}</Text>
              <Text style={styles.previewSub}>{t('Chart colors with live updates.')}</Text>
            </View>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveBadgeText}>{t('Live')}</Text>
            </View>
          </View>

          <View style={styles.snapshotRow}>
            {snapshot.map((item) => (
              <View key={item.label} style={styles.snapshotCard}>
                <Text style={styles.snapshotLabel}>{item.label}</Text>
                <Text style={styles.snapshotValue}>{item.value}</Text>
              </View>
            ))}
          </View>

          {/* Renko boxes are price-driven and may combine several source
              candles, so a standard one-candle OHLC summary would be false. */}
          {(chartDisplay.showTicker || (chartDisplay.showOHLC && chartVisualType !== 'renko' && previewLastCandle)) && (
            <View style={styles.previewMetaRow}>
              {chartDisplay.showTicker && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('Select Timeframe')}
                  accessibilityHint={t('Opens timeframe options')}
                  accessibilityValue={{ text: chartTimeframe }}
                  onPress={handleOpenTimeframePicker}
                  activateOnPressIn
                  unstable_pressDelay={0}
                  latencyLabel="chartProperties.timeframePicker.open"
                  hitSlop={{ top: 6, right: 4, bottom: 6, left: 4 }}
                  style={({ pressed }) => [
                    styles.previewMetaTickerButton,
                    pressed && styles.previewMetaTickerButtonPressed,
                  ]}
                >
                  <Text style={styles.previewMetaTicker}>
                    {chartSymbol.replace(/\//g, '')},{chartTimeframe}
                  </Text>
                  <Ionicons
                    name="chevron-down"
                    size={12}
                    color={isDark ? '#94A3B8' : '#64748B'}
                  />
                </Pressable>
              )}
              {/* Repeat the Renko guard at the value row so ticker-only mode
                  can remain visible without accidentally restoring OHLC. */}
              {chartDisplay.showOHLC && chartVisualType !== 'renko' && previewLastCandle && (
                <View style={styles.previewMetaOhlc}>
                  {previewOhlcItems.map((item) => (
                    <View key={item.label} style={styles.previewMetaPair}>
                      <Text style={styles.previewMetaLabel}>{item.label}</Text>
                      <Text style={[styles.previewMetaValue, { color: previewIsUp ? resolvedChartColors.candlesUptrend : resolvedChartColors.candlesDowntrend }]}>
                        {item.value}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          <View style={[styles.previewChart, { backgroundColor: resolvedChartColors.background }]}>
            {/* Render the saved production type itself: Area must not fall back
                to Line, and Renko must not fall back to source candles. */}
            {previewContentReady ? (
              <LiveChartPreview
                symbol={chartSymbol}
                timeframe={chartTimeframe}
                chartType={chartVisualType}
                priceSource={priceSource}
                colors={resolvedChartColors}
                display={previewDisplay}
                isDark={isDark}
                active={previewActive}
              />
            ) : (
              <View
                testID="chart-live-preview-placeholder"
                pointerEvents="none"
                style={StyleSheet.absoluteFillObject}
              />
            )}
          </View>

          <View style={styles.previewFooter}>
            {previewFooterItems.map((item) => (
              <View key={item} style={styles.previewFooterBadge}>
                <Text style={styles.previewFooterText}>{item}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.panel}>
          <View style={styles.panelBody}>
              {/* ── Scheme presets — 2×2 visual grid ─────────────────────── */}
              <Text style={styles.colorGroupTitle}>{t('SCHEME')}</Text>
              <View style={styles.schemeGrid}>
                {SCHEME_OPTIONS.map((option) => {
                  const isActive = option.key === chartColorScheme;
                  const presetColors = option.key === 'custom'
                    ? null
                    : CHART_COLOR_SCHEME_PRESETS[option.key].colors;
                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => setChartColorScheme(option.key)}
                      style={[styles.schemeTile, isActive && styles.schemeTileActive]}
                    >
                      {/* Mini chart preview surface */}
                      <View style={[
                        styles.schemePreview,
                        { backgroundColor: presetColors?.background ?? (isDark ? SETTINGS_DARK_CARD_BACKGROUND : '#F1F5F9') },
                        isActive && styles.schemePreviewActive,
                      ]}>
                        {presetColors ? (
                          <View style={styles.schemeCandleRow}>
                            <View style={[styles.schemeMiniWick, { backgroundColor: presetColors.candlesUptrend, height: 26 }]} />
                            <View style={[styles.schemeMiniBody, { backgroundColor: presetColors.candlesUptrend, height: 14 }]} />
                            <View style={[styles.schemeMiniGap]} />
                            <View style={[styles.schemeMiniWick, { backgroundColor: presetColors.candlesDowntrend, height: 22 }]} />
                            <View style={[styles.schemeMiniBody, { backgroundColor: presetColors.candlesDowntrend, height: 11 }]} />
                            <View style={[styles.schemeMiniGap]} />
                            <View style={[styles.schemeMiniWick, { backgroundColor: presetColors.candlesUptrend, height: 18 }]} />
                            <View style={[styles.schemeMiniBody, { backgroundColor: presetColors.candlesUptrend, height: 9 }]} />
                          </View>
                        ) : (
                          <View style={styles.schemeCustomIconWrap}>
                            <Ionicons name="color-palette" size={22} color={isDark ? '#94A3B8' : '#64748B'} />
                          </View>
                        )}
                        {isActive && (
                          <View style={styles.schemeCheckBadge}>
                            <Ionicons name="checkmark" size={11} color="#FFFFFF" />
                          </View>
                        )}
                      </View>
                      {/* Label below the preview */}
                      <View style={styles.schemeTileFoot}>
                        <Text style={[styles.schemeTileLabel, isActive && styles.schemeTileLabelActive]} numberOfLines={1}>
                          {t(option.label)}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              {/* ── Grouped color fields ─────────────────────────────────── */}
              {COLOR_GROUPS.map((group) => (
                <View key={group.title} style={styles.colorGroup}>
                  <Text style={styles.colorGroupTitle}>{t(group.title)}</Text>
                  <View style={styles.colorGroupCard}>
                    {group.fields.map((item, index) => (
                      <View key={item.key}>
                        <Pressable
                          style={({ pressed }) => [styles.colorRowPro, pressed && styles.colorRowProPressed]}
                          onPress={() => openColorEditor(item.key)}
                        >
                          <View
                            style={[
                              styles.colorChipPro,
                              {
                                backgroundColor: isTransparent(resolvedChartColors[item.key]) ? 'transparent' : resolvedChartColors[item.key],
                                borderColor: isTransparent(resolvedChartColors[item.key])
                                  ? (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.18)')
                                  : (isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)'),
                              },
                            ]}
                          >
                            {isTransparent(resolvedChartColors[item.key]) && <View style={styles.transparentSlash} />}
                          </View>
                          <View style={styles.colorRowProText}>
                            <Text style={styles.colorRowProLabel}>{t(item.label)}</Text>
                            {item.hint ? <Text style={styles.colorRowProHint}>{t(item.hint)}</Text> : null}
                          </View>
                          <Text style={styles.colorRowProHex}>{resolvedChartColors[item.key]}</Text>
                          <Ionicons name="chevron-forward" size={14} color={isDark ? '#64748B' : '#94A3B8'} />
                        </Pressable>
                        {index < group.fields.length - 1 && <View style={styles.colorRowSeparator} />}
                      </View>
                    ))}
                  </View>
                </View>
              ))}
          </View>
        </View>
      </ScrollView>

      <ChartPropertiesTimeframePickerHost
        ref={timeframePickerHostRef}
        active={isScreenFocused}
        activeTimeframe={chartTimeframe}
        accentColor={T.trading.buy.primary}
        isDark={isDark}
        textColor={T.text}
        mutedColor={T.textMuted}
        onSelect={handleTimeframeSelect}
      />

      {/* Android Modal owns a separate native window. Do not allocate closed
          windows while the hosted destination is completing its first paint. */}
      {schemeModalOpen ? (
        <Modal
          transparent
          visible
          animationType="fade"
          {...OVERLAY_MODAL_PROPS}
          onRequestClose={() => setSchemeModalOpen(false)}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setSchemeModalOpen(false)}>
            <View style={styles.modalCard}>
              {SCHEME_OPTIONS.map((option) => (
                <Pressable
                  key={option.key}
                  style={styles.modalRow}
                  onPress={() => {
                    setChartColorScheme(option.key);
                    setSchemeModalOpen(false);
                  }}
                >
                  <Text style={[styles.modalRowText, option.key === chartColorScheme && styles.modalRowTextActive]}>{t(option.label)}</Text>
                  {option.key === chartColorScheme && <Ionicons name="checkmark" size={16} color={T.trading.buy.primary} />}
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Modal>
      ) : null}

      {activeColorKey !== null ? (
        <Modal
          transparent
          visible
          animationType="none"
          {...OVERLAY_MODAL_PROPS}
          // The very FIRST translucent-nav modal of an Android app process lays
          // out extending under the opaque nav bar (later opens get the proper
          // inset), which read as the sheet "dropping" on fresh app starts.
          // Keeping this window out of the nav-bar area gives every open —
          // first or later — identical geometry.
          navigationBarTranslucent={false}
          statusBarTranslucent={false}
          onRequestClose={() => applyDraftColor(draftColor)}
        >
          <KeyboardAvoidingView behavior="padding" style={styles.modalBackdropBottom}>
            {/* Keep the backdrop outside the sheet so color-picker drags cannot bubble out and dismiss the modal. */}
            <Pressable style={StyleSheet.absoluteFillObject} onPress={() => applyDraftColor(draftColor)} />
            <View
              style={[
                styles.bottomSheet,
                { paddingBottom: Platform.OS === 'ios' ? 18 + insets.bottom : 18 },
              ]}
            >
              <ScrollView
                keyboardShouldPersistTaps="always"
                canCancelContentTouches={Platform.OS === 'ios'} showsVerticalScrollIndicator={false}>
                <Text style={styles.sheetTitle}>{t(COLOR_GROUPS.flatMap((g) => g.fields).find((item) => item.key === activeColorKey)?.label ?? 'Color')}</Text>

                {/* Keep drag gestures on Reanimated's UI thread; commit to JS/Zustand only after release for smooth Android hue sliding. */}
                <ColorPicker
                  style={{ width: '100%' }}
                  value={pickerColorValue}
                  onChangeJS={(color) => handlePickerColorChange(color.hex.toUpperCase())}
                  onCompleteJS={(color) => handlePickerColorComplete(color.hex.toUpperCase())}
                >
                  <View style={styles.colorPickerRow}>
                    <Preview hideText disableOpacityTexture style={styles.previewPanel} />
                    <Panel1 
                      style={styles.panel1} 
                      thumbShape="circle" 
                      thumbSize={24}
                      thumbColor="transparent"
                      thumbInnerStyle={{ borderWidth: 2, borderColor: '#FFFFFF', backgroundColor: 'transparent' }} 
                    />
                  </View>
                  <HueSlider 
                    sliderThickness={12} 
                    boundedThumb 
                    style={styles.slider} 
                    thumbShape="circle" 
                    thumbSize={24} 
                    thumbInnerStyle={{ borderWidth: 2, borderColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 1, elevation: 1 }} 
                  />
                </ColorPicker>

                <View style={styles.infoCard}>
                  <Text style={styles.infoLabel}>HEX</Text>
                  <TextInput style={styles.hexInput} value={draftColor} onChangeText={handleDraftColorChange} autoCapitalize="characters" />
                </View>

                <View style={styles.infoGrid}>
                  <View style={styles.infoCardThird}>
                    <Text style={styles.infoLabelThird}>RGB</Text>
                    <Text style={styles.infoValueThird}>{colorRgb.r}, {colorRgb.g}, {colorRgb.b}</Text>
                  </View>
                  <View style={styles.infoCardThird}>
                    <Text style={styles.infoLabelThird}>HSV</Text>
                    <Text style={styles.infoValueThird}>{Math.round(colorHsv.h)}°, {Math.round(colorHsv.s)}%, {Math.round(colorHsv.v)}%</Text>
                  </View>
                  <View style={styles.infoCardThird}>
                    <Text style={styles.infoLabelThird}>HSL</Text>
                    <Text style={styles.infoValueThird}>{Math.round(colorHsl.h)}°, {Math.round(colorHsl.s)}%, {Math.round(colorHsl.l)}%</Text>
                  </View>
                </View>

                  <Pressable style={styles.doneButton} onPress={() => applyDraftColor(draftColor)}>
                    <Text style={styles.doneButtonText}>{t('Done')}</Text>
                  </Pressable>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      ) : null}
    </Screen>
  );
}



function makeStyles(T: ThemeColors, isDark: boolean) {
  const preferencesBackground = isDark ? SETTINGS_DARK_BACKGROUND : T.bg;
  const preferencesCardBackground = isDark ? SETTINGS_DARK_CARD_BACKGROUND : '#FFFFFF';
  const preferencesSoftCardBackground = isDark ? SETTINGS_DARK_CARD_BACKGROUND : '#F8FAFC';

  return StyleSheet.create({
    screen: {
      backgroundColor: preferencesBackground,
    },
    header: {
      paddingHorizontal: 16,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : '#E3E8F0',
      backgroundColor: preferencesBackground,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerBackBtn: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitleWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    headerTitle: {
      color: isDark ? '#F8FAFC' : '#0F172A',
      fontSize: 17,
      fontWeight: '500',
      letterSpacing: 0.3,
    },
    scroll: {
      flex: 1,
    },
    content: {
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 26,
    },
    title: {
      color: isDark ? '#F8FAFC' : '#0F172A',
      fontSize: 20,
      fontWeight: '600',
      lineHeight: 26,
      marginBottom: 12,
    },
    previewCard: {
      backgroundColor: preferencesCardBackground,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#DDE3EA',
      padding: 16,
      marginBottom: 14,
    },
    previewHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 12,
    },
    previewTitle: {
      color: isDark ? '#F8FAFC' : '#0F172A',
      fontSize: 16,
      fontWeight: '700',
    },
    previewSub: {
      marginTop: 4,
      color: isDark ? '#94A3B8' : '#64748B',
      fontSize: 13,
    },
    liveBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      marginRight: 16,
      backgroundColor: isDark ? 'rgba(37,99,235,0.12)' : 'rgba(37,99,235,0.08)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(96,165,250,0.2)' : 'rgba(37,99,235,0.12)',
    },
    liveDot: {
      width: 7,
      height: 7,
      borderRadius: 999,
      backgroundColor: T.trading.profit,
    },
    liveBadgeText: {
      color: isDark ? '#DBEAFE' : '#1D4ED8',
      fontSize: 12,
      fontWeight: '600',
    },
    snapshotRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 14,
      marginBottom: 14,
      flexWrap: 'wrap',
    },
    snapshotCard: {
      flex: 1,
      minWidth: 88,
      borderRadius: 14,
      paddingVertical: 10,
      paddingHorizontal: 12,
      backgroundColor: isDark ? preferencesCardBackground : 'rgba(248,250,252,0.94)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(148,163,184,0.16)' : 'rgba(148,163,184,0.12)',
    },
    snapshotLabel: {
      color: isDark ? '#94A3B8' : '#64748B',
      fontSize: 11,
      fontWeight: '600',
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginBottom: 6,
    },
    snapshotValue: {
      color: isDark ? '#F8FAFC' : '#0F172A',
      fontSize: 16,
      fontWeight: '600',
    },
    previewChart: {
      height: 240,
      borderRadius: 18,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#DDE3EA',
    },
    previewMetaRow: {
      marginBottom: 10,
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 8,
    },
    previewMetaTicker: {
      color: isDark ? '#F8FAFC' : '#0F172A',
      fontSize: 11,
      fontWeight: '600',
      letterSpacing: 0.4,
    },
    previewMetaTickerButton: {
      minHeight: 32,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(148,163,184,0.14)' : 'rgba(148,163,184,0.16)',
      backgroundColor: isDark ? 'rgba(148,163,184,0.08)' : 'rgba(148,163,184,0.10)',
    },
    previewMetaTickerButtonPressed: {
      opacity: 0.72,
    },
    previewMetaOhlc: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: isDark ? 'rgba(148,163,184,0.08)' : 'rgba(148,163,184,0.10)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(148,163,184,0.14)' : 'rgba(148,163,184,0.16)',
    },
    previewMetaPair: {
      flexDirection: 'row',
      alignItems: 'center',
      marginRight: 10,
      marginBottom: 2,
    },
    previewMetaLabel: {
      color: isDark ? '#94A3B8' : '#64748B',
      fontSize: 11,
      fontWeight: '600',
      marginRight: 4,
    },
    previewMetaValue: {
      fontSize: 11,
      fontWeight: '600',
    },
    previewFooter: {
      marginTop: 12,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      alignItems: 'center',
    },
    previewFooterBadge: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: isDark ? 'rgba(148,163,184,0.08)' : 'rgba(148,163,184,0.10)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(148,163,184,0.14)' : 'rgba(148,163,184,0.16)',
    },
    previewFooterText: {
      color: isDark ? '#94A3B8' : '#64748B',
      fontSize: 12,
      fontWeight: '600',
    },
    panel: {
      backgroundColor: preferencesCardBackground,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#DDE3EA',
      overflow: 'hidden',
    },
    panelBody: {
      paddingVertical: 4,
    },
    navRow: {
      minHeight: 56,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    navLabel: {
      color: isDark ? '#F8FAFC' : '#0F172A',
      fontSize: 15,
      fontWeight: '600',
    },
    rowRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      maxWidth: '58%',
      minWidth: 0,
    },
    rowValue: {
      color: isDark ? '#94A3B8' : '#64748B',
      fontSize: 13,
      fontWeight: '600',
      flexShrink: 1,
      minWidth: 0,
      textAlign: 'right',
    },
    transparentSlash: {
      width: 28,
      height: 2,
      backgroundColor: '#EF4444',
      transform: [{ rotate: '45deg' }],
    },
    separator: {
      height: 1,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#EEF2F7',
      marginLeft: 16,
    },

    /* ── Colors tab — premium redesign ────────────────────────────── */
    schemeGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: 6,
      paddingTop: 2,
      paddingBottom: 10,
    },
    schemeTile: {
      width: '50%',
      paddingHorizontal: 3,
      paddingVertical: 3,
    },
    schemeTileActive: {
      // Active state handled inside schemePreview/schemeTileLabel
    },
    schemePreview: {
      width: '100%',
      aspectRatio: 2.4,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
      overflow: 'hidden',
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'center',
    },
    schemePreviewActive: {
      borderColor: '#3B82F6',
      shadowColor: '#3B82F6',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.4,
      shadowRadius: 8,
      elevation: 4,
    },
    schemeCandleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      height: '100%',
      paddingHorizontal: 2,
    },
    schemeMiniWick: {
      width: 1,
      borderRadius: 0.5,
    },
    schemeMiniBody: {
      width: 7,
      borderRadius: 1,
      marginLeft: -4,
    },
    schemeMiniGap: {
      width: 8,
    },
    schemeCustomIconWrap: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    schemeCheckBadge: {
      position: 'absolute',
      top: 6,
      right: 6,
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: '#3B82F6',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.3,
      shadowRadius: 2,
      elevation: 2,
    },
    schemeTileFoot: {
      paddingTop: 4,
      alignItems: 'center',
    },
    schemeTileLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: isDark ? '#94A3B8' : '#64748B',
      letterSpacing: 0.2,
    },
    schemeTileLabelActive: {
      color: isDark ? '#F8FAFC' : '#0F172A',
    },

    colorGroup: {
      marginBottom: 16,
    },
    colorGroupTitle: {
      fontSize: 11,
      fontWeight: '600',
      color: isDark ? '#94A3B8' : '#64748B',
      letterSpacing: 1.1,
      textTransform: 'uppercase',
      paddingHorizontal: 20,
      marginBottom: 8,
    },
    colorGroupCard: {
      marginHorizontal: 14,
      backgroundColor: preferencesCardBackground,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#EEF2F7',
      overflow: 'hidden',
    },
    colorRowPro: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 12,
    },
    colorRowProPressed: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
    },
    colorChipPro: {
      width: 32,
      height: 32,
      borderRadius: 8,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    colorRowProText: {
      flex: 1,
    },
    colorRowProLabel: {
      color: isDark ? '#F8FAFC' : '#0F172A',
      fontSize: 14,
      fontWeight: '600',
    },
    colorRowProHint: {
      color: isDark ? '#64748B' : '#94A3B8',
      fontSize: 11,
      fontWeight: '500',
      marginTop: 1,
    },
    colorRowProHex: {
      color: isDark ? '#94A3B8' : '#64748B',
      fontSize: 12,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
      letterSpacing: 0.2,
    },
    colorRowSeparator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#EEF2F7',
      marginLeft: 58,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    modalBackdropBottom: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end',
    },
    modalCard: {
      alignSelf: 'center',
      width: '100%',
      maxWidth: 360,
      backgroundColor: preferencesCardBackground,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#DDE3EA',
      overflow: 'hidden',
    },
    modalRow: {
      minHeight: 52,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    modalRowText: {
      color: isDark ? '#F8FAFC' : '#0F172A',
      fontSize: 15,
      fontWeight: '600',
    },
    modalRowTextActive: {
      color: T.trading.buy.primary,
    },
    bottomSheet: {
      alignSelf: 'center',
      zIndex: 1,
      width: '100%',
      maxWidth: 440,
      backgroundColor: preferencesCardBackground,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#DDE3EA',
      padding: 18,
      maxHeight: '88%',
    },
    sheetTitle: {
      color: isDark ? '#F8FAFC' : '#0F172A',
      fontSize: 18,
      fontWeight: '600',
      marginBottom: 16,
      textAlign: 'center',
    },
    colorPickerRow: {
      flexDirection: 'row',
      height: 176,
      marginBottom: 12,
      borderRadius: 14,
      overflow: 'hidden',
    },
    previewPanel: {
      width: '30%',
      height: '100%',
      borderRadius: 0,
      borderWidth: 0,
      margin: 0,
    },
    panel1: {
      width: '70%',
      height: '100%',
      borderRadius: 0,
      borderWidth: 0,
      margin: 0,
    },
    slider: {
      borderRadius: 6,
      marginBottom: 16,
    },
    infoGrid: {
      flexDirection: 'row',
      flexWrap: 'nowrap',
      gap: 8,
      marginTop: 10,
    },
    infoCard: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#DDE3EA',
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: preferencesSoftCardBackground,
      alignItems: 'center',
    },
    infoCardThird: {
      flex: 1,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#DDE3EA',
      paddingHorizontal: 4,
      paddingVertical: 8,
      backgroundColor: preferencesSoftCardBackground,
      alignItems: 'center',
    },
    infoLabel: {
      color: isDark ? '#94A3B8' : '#64748B',
      fontSize: 11,
      fontWeight: '600',
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginBottom: 8,
    },
    infoLabelThird: {
      color: isDark ? '#94A3B8' : '#64748B',
      fontSize: 10,
      fontWeight: '600',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      marginBottom: 4,
    },
    infoValueThird: {
      color: isDark ? '#F8FAFC' : '#0F172A',
      fontSize: 11,
      fontWeight: '600',
      lineHeight: 16,
      textAlign: 'center',
    },
    hexInput: {
      color: isDark ? '#F8FAFC' : '#0F172A',
      fontSize: 16,
      fontWeight: '700',
      paddingVertical: 0,
      textAlign: 'center',
    },
    doneButton: {
      marginTop: 18,
      height: 50,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: T.trading.buy.primary,
    },
    doneButtonText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '600',
    },
  });
}
