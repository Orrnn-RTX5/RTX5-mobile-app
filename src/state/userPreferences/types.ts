import type {
  ChartShowOnChartKey,
  ChartShowOnChartSettings,
} from '../../features/chart/chartShowOnChart';
import type {
  PersistedChartDrawing,
  PersistedChartDrawingsBySymbol,
} from '../../features/chart/drawingPersistence';
import type {
  AccountEnvironment,
  AccountEnvironmentSource,
} from '../../domain/accountType';

export type QuoteViewMode = 'list' | 'table' | 'edit';
export type ThemeMode = 'light' | 'dark';
export type ChartTradeVolumeDisplayMode = 'lots' | 'margin';
export type LanguageCode =
  | 'en'
  | 'es'
  | 'pt'
  | 'fr'
  | 'de'
  | 'it'
  | 'ru'
  | 'tr'
  | 'ar'
  | 'hi'
  | 'bn'
  | 'zh'
  | 'ja'
  | 'ko'
  | 'id';
export type ChartColorScheme = 'green_on_black' | 'black_on_white' | 'yellow_on_black' | 'custom';
// Area reuses Line's close-price data with a gradient fill. Renko is generated
// from OHLC history and uses a price-brick axis instead of timed candles.
export type ChartVisualType = 'candles' | 'bars' | 'line' | 'area' | 'hollow' | 'renko';

export type ChartColorsConfig = {
  background: string;
  foreground: string;
  grid: string;
  candlesUptrend: string;
  candlesDowntrend: string;
  hollowBody: string;
  barsUptrend: string;
  barsDowntrend: string;
  lineBody: string;
  tradeOpen?: string;
  tradeTpSl?: string;
  tradeStopOut?: string;
};

export type ChartDisplaySettings = {
  showTicker: boolean;
  showOHLC: boolean;
  showQuickTradingButtons: boolean;
  showLivePriceLine: boolean;
  /** @deprecated Legacy persisted key migrated to showLivePriceLine. */
  showBidPriceLine: boolean;
  /** @deprecated Legacy persisted key migrated to showLivePriceLine. */
  showAskPriceLine: boolean;
  showLastPriceLine: boolean;
  showGrid: boolean;
  periodSeparators: boolean;
  showTickVolumes: boolean;
  showRealVolumes: boolean;
  showObjectDescriptions: boolean;
  showTradeLevels: boolean;
  showTradeHistory: boolean;
  /**
   * When enabled (3-dot chart menu), the symbol/OHLC header overlay can be
   * repositioned by holding it and dragging, so it never hides a trade
   * marker near the top of the chart.
   */
  movableSymbolHeader: boolean;
};

export type UserPreferencesState = {
  hasHydrated: boolean;
  themeMode: ThemeMode;
  quoteSymbols: string[];
  quoteViewMode: QuoteViewMode;
  chartSymbol: string;
  chartTimeframe: string;
  tradeVolume: number;
  chartTradeVolumeDisplayMode: ChartTradeVolumeDisplayMode;
  chartVisualType: ChartVisualType;
  chartViewportShowVolumePane: boolean;
  chartViewportShowDrawingToolbar: boolean;
  chartOneClickPanelAtBottom: boolean;
  chartVerticalScrollingLocked: boolean;
  chartAutoScaleEnabled: boolean;
  chartDrawings: string[];
  chartDrawingRecordsBySymbol: PersistedChartDrawingsBySymbol;
  chartLockAll: boolean;
  chartHideAll: boolean;
  chartShowOnChart: ChartShowOnChartSettings;
  historySummaryDetailsVisible: boolean;
  tradeSummaryDetailsVisible: boolean;
  oneClickAccepted: boolean;
  historyRange: string;
  /**
   * Unix millisecond timestamps for the active history date filter.
   * Set alongside `historyRange` so query hooks can pass `from`/`to` params
   * to GET /api/v2/account/deals and similar range-aware endpoints.
   * null means "no explicit filter" — the server applies its own default.
   */
  historyFromMs: number | null;
  historyToMs: number | null;
  priceSource: 'bid' | 'ask';
  openOrderMode: 'Regular' | 'Risk calculator' | 'One-click';
  accountType: AccountEnvironment;
  accountEnvironmentSource: AccountEnvironmentSource;
  accountEnvironmentKey: string;
  isDemoAccount: boolean;
  isLoggedIn: boolean;
  hasSetInitialSymbols: boolean;
  /** Broker ID entered at login — used by GET /broker/config to fetch broker-specific settings */
  brokerId: string;
  /** Broker-specific REST/WS origin selected from GET /api/v1/broker/servers */
  brokerServerUrl: string;
  /** Broker logo URL selected from the public broker directory */
  brokerLogoUrl: string;
  accountDetails: {
    id: string;
    name: string;
    server: string;
    credentials?: {
      accessToken: string;
      refreshToken: string;
      expiresAt: string;
    };
  } | null;
  chartColorScheme: ChartColorScheme;
  chartColors: ChartColorsConfig;
  chartDisplay: ChartDisplaySettings;
  language: LanguageCode;

  setLanguage: (lang: LanguageCode) => void;
  login: (
    id: string,
    name: string,
    server: string,
    tokens: { access_token: string; refresh_token: string; expires_at: string },
    brokerId?: string,
    brokerConnection?: {
      serverUrl?: string;
      logoUrl?: string;
      accountType: AccountEnvironment;
      accountEnvironmentSource: AccountEnvironmentSource;
    },
  ) => void;
  logout: () => void;
  updateTokens: (accessToken: string, refreshToken: string, expiresAt: string) => void;
  setQuoteViewMode: (mode: QuoteViewMode) => void;
  setThemeMode: (mode: ThemeMode) => void;
  addQuoteSymbol: (symbol: string) => void;
  removeQuoteSymbol: (symbol: string) => void;
  setQuoteSymbols: (symbols: string[]) => void;
  setChartSymbol: (symbol: string) => void;
  setChartTimeframe: (timeframe: string) => void;
  setTradeVolume: (volume: number) => void;
  setChartTradeVolumeDisplayMode: (mode: ChartTradeVolumeDisplayMode) => void;
  setChartVisualType: (chartType: ChartVisualType) => void;
  setChartViewportShowVolumePane: (visible: boolean) => void;
  setChartViewportShowDrawingToolbar: (visible: boolean) => void;
  setChartOneClickPanelAtBottom: (visible: boolean) => void;
  setChartVerticalScrollingLocked: (locked: boolean) => void;
  setChartAutoScaleEnabled: (enabled: boolean) => void;
  addChartDrawing: (drawing: string) => void;
  removeChartDrawing: (drawing: string) => void;
  setChartDrawings: (drawings: string[]) => void;
  setChartDrawingRecordsForSymbol: (symbol: string, drawings: PersistedChartDrawing[]) => void;
  removeChartDrawingRecordForSymbol: (symbol: string, drawingId: string) => void;
  setChartLockAll: (lock: boolean) => void;
  setChartHideAll: (hide: boolean) => void;
  setChartShowOnChartItem: <K extends ChartShowOnChartKey>(key: K, value: ChartShowOnChartSettings[K]) => void;
  setHistorySummaryDetailsVisible: (visible: boolean) => void;
  setTradeSummaryDetailsVisible: (visible: boolean) => void;
  setPriceSource: (source: 'bid' | 'ask') => void;
  setOpenOrderMode: (mode: 'Regular' | 'Risk calculator' | 'One-click') => void;
  setOneClickAccepted: (accepted: boolean) => void;
  setHistoryRange: (range: string) => void;
  /** Persist the computed from/to Unix-ms timestamps alongside the range label. */
  setHistoryDateRange: (fromMs: number | null, toMs: number | null) => void;
  mergeAccountEnvironmentForAccount: (
    accountKey: string,
    resolved: AccountEnvironment,
    source: AccountEnvironmentSource,
  ) => void;
  /** Persist the broker_id from the login screen for app-wide broker config access */
  setBrokerId: (id: string) => void;
  /** Persist the selected broker REST/WS origin and logo metadata */
  setBrokerConnection: (brokerId: string, serverUrl?: string, logoUrl?: string) => void;
  setHasSetInitialSymbols: (hasSet: boolean) => void;
  setChartColorScheme: (scheme: ChartColorScheme) => void;
  setChartColor: (key: keyof ChartColorsConfig, color: string) => void;
  setChartDisplaySetting: <K extends keyof ChartDisplaySettings>(key: K, value: ChartDisplaySettings[K]) => void;
  setHasHydrated: (hydrated: boolean) => void;
  updateAccountDetails: (updates: Partial<NonNullable<UserPreferencesState['accountDetails']>>) => void;
};
