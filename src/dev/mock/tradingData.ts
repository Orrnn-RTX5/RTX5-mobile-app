/**
 * Core module: tradingData.ts
 */

export type QuoteItem = {
  symbol: string;
  bid: number;
  ask: number;
  feedTickAt?: number;
  lastTickAt?: number;
  lastReceivedAt?: number;
  lastPriceChangedAt?: number;
  source?: string;
  authority?: string;
  transport?: 'websocket' | 'rest_snapshot';
  stale?: boolean;
  tradable?: boolean;
  marketState?: string;
  degraded?: boolean;
  degradationReason?: 'missing_ask';
  sequence?: string | number;
  tickId?: string;
  ageMs?: number;
  ageSec?: number;
  prevBid?: number;
  prevAsk?: number;
  changePct: number;
  high: number;
  low: number;
  open?: number;
  close?: number;
  volume?: number;
  volumeSource?: 'backend';
  digits?: number;
  digitsSource?: 'backend';
  contractSize: number;
  minVolume?: number;
  maxVolume?: number;
  stepVolume?: number;
  point?: number;
  tickSize?: number;
  tickValue?: number;
  swapLong: number;
  swapShort: number;
  marginInitial?: number;
  marginMaintenance?: number;
  baseCurrency?: string;
  profitCurrency?: string;
  tradeAllowed?: boolean;
  spread: number;
  volatilityClass?: 'high' | 'medium' | 'low'; // Used by simulation engine
};

// ─── Symbol Generator Helpers ─────────────────────────────────────────────────
const rn = (min: number, max: number) => Math.random() * (max - min) + min;

function buildForex(base: string, quote: string, price: number, spreadPips: number, volClass: 'high' | 'medium' | 'low' = 'medium', tradeAllowed: boolean = false): QuoteItem {
  const isJpy = quote === 'JPY';
  const digits = isJpy ? 3 : 5;
  const pip = Math.pow(10, -(isJpy ? 2 : 4));

  // Real daily ranges are approx 0.5% - 1% for FX
  const dailyHigh = price * (1 + rn(0.002, 0.005));
  const dailyLow = price * (1 - rn(0.002, 0.005));

  return {
    symbol: `${base}${quote}`,
    bid: price,
    ask: price + (spreadPips * pip),
    spread: spreadPips,
    digits,
    changePct: rn(-0.8, 0.8),
    high: dailyHigh,
    low: dailyLow,
    open: price * (1 + (Math.random() > 0.5 ? 1 : -1) * rn(0.001, 0.005)),
    close: price * (1 + rn(-0.006, 0.006)),
    volume: Math.floor(rn(1000, 20000)),
    contractSize: 100000,
    minVolume: 0.01,
    maxVolume: 100,
    stepVolume: 0.01,
    tickSize: pip / 10,
    tickValue: 10, // simplified
    swapLong: rn(-5, -1),
    swapShort: rn(-1, 2),
    marginInitial: 1,
    marginMaintenance: 0.5,
    baseCurrency: base,
    profitCurrency: quote,
    tradeAllowed,
    volatilityClass: volClass,
  };
}

function buildCrypto(sym: string, price: number, tradeAllowed: boolean = false): QuoteItem {
  const dailyHigh = price * (1 + rn(0.02, 0.05));
  const dailyLow = price * (1 - rn(0.02, 0.05));
  return {
    symbol: sym,
    bid: price,
    ask: price + (price * 0.0005),
    spread: 50,
    digits: price > 1000 ? 2 : 4,
    changePct: rn(-3, 3),
    high: dailyHigh,
    low: dailyLow,
    open: price * (1 + rn(-0.02, 0.02)),
    volume: Math.floor(rn(50, 5000) * (price > 1000 ? 1 : 1000)),
    contractSize: 1,
    swapLong: -20,
    swapShort: -20,
    tradeAllowed,
    volatilityClass: 'high',
  };
}

function buildIndexOrMetal(sym: string, price: number, spreadPts: number, volClass: 'high' | 'medium' = 'medium', ptsMultiplier: number = 100, tradeAllowed: boolean = false): QuoteItem {
  return {
    symbol: sym,
    bid: price,
    ask: price + spreadPts,
    spread: spreadPts * ptsMultiplier,
    digits: 2,
    changePct: rn(-1.5, 1.5),
    high: price * (1 + rn(0.005, 0.015)),
    low: price * (1 - rn(0.005, 0.015)),
    open: price * (1 + rn(-0.01, 0.01)),
    volume: Math.floor(rn(5000, 50000)),
    contractSize: 10,
    swapLong: -5,
    swapShort: -2,
    tradeAllowed,
    volatilityClass: volClass,
  };
}

export type PositionItem = {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  volume: number;
  openPrice: number;
  currentPrice: number;
  pnl: number;
  swap: number;
  commission?: number;
  openTime: string;
  sl?: number;
  tp?: number;
  clientCreatedAt?: number;
  clientModifiedAt?: number;
};

export const account = {
  floating: -918.02,
  currency: 'USD',
  balance: 119701.53,
  equity: 118783.51,
  margin: 317.01,
  freeMargin: 118466.5,
  marginLevel: 37469.96,
};

export const positions: PositionItem[] = [
  { id: '1', symbol: 'BTCUSDm', side: 'buy', volume: 0.01, openPrice: 68299.43, currentPrice: 66959.53, pnl: -13.39, swap: 0, openTime: '2026.02.18 16:44:11' },
  { id: '2', symbol: 'BTCUSDm', side: 'buy', volume: 0.01, openPrice: 68259.19, currentPrice: 66959.53, pnl: -12.99, swap: 0, openTime: '2026.02.18 16:44:11' },
  { id: '3', symbol: 'BTCUSDm', side: 'buy', volume: 0.01, openPrice: 68230.18, currentPrice: 66959.53, pnl: -12.7, swap: 0, openTime: '2026.02.18 16:44:11' },
  { id: '4', symbol: 'BTCUSDm', side: 'buy', volume: 0.01, openPrice: 68204.21, currentPrice: 66959.53, pnl: -12.44, swap: 0, openTime: '2026.02.18 16:44:11' },
  { id: '5', symbol: 'BTCUSDm', side: 'buy', volume: 0.01, openPrice: 68158.63, currentPrice: 66959.53, pnl: -11.99, swap: 0, openTime: '2026.02.18 16:44:11' },
  { id: '6', symbol: 'BTCUSDm', side: 'buy', volume: 0.03, openPrice: 68110.4, currentPrice: 66959.53, pnl: -34.52, swap: 0, openTime: '2026.02.18 16:44:11' },
  { id: '7', symbol: 'BTCUSDm', side: 'buy', volume: 0.03, openPrice: 68073.4, currentPrice: 66959.53, pnl: -33.41, swap: 0, openTime: '2026.02.18 16:44:11' },
  { id: '8', symbol: 'BTCUSDm', side: 'buy', volume: 0.03, openPrice: 68040.52, currentPrice: 66959.53, pnl: -32.43, swap: 0, openTime: '2026.02.18 16:44:11' },
  { id: '9', symbol: 'BTCUSDm', side: 'buy', volume: 0.03, openPrice: 68007.62, currentPrice: 66959.53, pnl: -31.44, swap: 0, openTime: '2026.02.18 16:44:11' },
  { id: '10', symbol: 'BTCUSDm', side: 'buy', volume: 0.03, openPrice: 67971.09, currentPrice: 66959.53, pnl: -30.34, swap: 0, openTime: '2026.02.18 16:44:11' },
];

export const quotes: QuoteItem[] = [
  // MAJORS (Tradable)
  buildForex('EUR', 'USD', 1.0856, 1.2, 'medium', true),
  buildForex('GBP', 'USD', 1.2642, 1.5, 'medium', true),
  buildForex('USD', 'JPY', 151.245, 1.6, 'medium', true),
  buildForex('USD', 'CHF', 0.8872, 1.8, 'medium', false),
  buildForex('AUD', 'USD', 0.6543, 1.4, 'medium', false),
  buildForex('NZD', 'USD', 0.5988, 1.6, 'medium', false),
  buildForex('USD', 'CAD', 1.3520, 1.4, 'medium', false),

  // MINORS & CROSSES
  buildForex('EUR', 'GBP', 0.8587, 1.8),
  buildForex('EUR', 'JPY', 164.120, 2.2),
  buildForex('GBP', 'JPY', 191.130, 2.5),
  buildForex('AUD', 'JPY', 98.940, 2.0),
  buildForex('NZD', 'JPY', 90.540, 2.2),
  buildForex('CAD', 'JPY', 111.850, 2.1),
  buildForex('CHF', 'JPY', 170.450, 2.5),
  buildForex('EUR', 'CHF', 0.9632, 2.0),
  buildForex('GBP', 'CHF', 1.1215, 2.5),
  buildForex('EUR', 'AUD', 1.6590, 2.5),
  buildForex('GBP', 'AUD', 1.9320, 3.0),
  buildForex('EUR', 'CAD', 1.4674, 2.5),
  buildForex('GBP', 'CAD', 1.7090, 3.0),
  buildForex('AUD', 'CAD', 0.8845, 2.0),
  buildForex('NZD', 'CAD', 0.8095, 2.2),
  buildForex('EUR', 'NZD', 1.8125, 3.0),
  buildForex('GBP', 'NZD', 2.1110, 3.5),
  buildForex('AUD', 'CHF', 0.5805, 2.2),
  buildForex('NZD', 'CHF', 0.5312, 2.5),

  // EXOTICS (Wider spreads, lower tick volume)
  buildForex('USD', 'TRY', 31.5420, 50, 'low'),
  buildForex('EUR', 'TRY', 34.2310, 60, 'low'),
  buildForex('USD', 'ZAR', 18.9450, 45, 'low'),
  buildForex('EUR', 'ZAR', 20.5620, 55, 'low'),
  buildForex('USD', 'MXN', 16.7840, 30, 'low'),
  buildForex('USD', 'SEK', 10.4320, 25, 'medium'),
  buildForex('EUR', 'SEK', 11.3250, 25, 'medium'),
  buildForex('USD', 'NOK', 10.5620, 25, 'medium'),
  buildForex('EUR', 'NOK', 11.4650, 25, 'medium'),
  buildForex('USD', 'DKK', 6.8450, 15, 'medium'),
  buildForex('USD', 'CNH', 7.1980, 10, 'medium'),
  buildForex('USD', 'SGD', 1.3420, 10, 'medium'),
  buildForex('USD', 'HKD', 7.8240, 8, 'medium'),
  buildForex('USD', 'PLN', 3.9850, 30, 'low'),
  buildForex('USD', 'HUF', 358.450, 40, 'low'),
  buildForex('USD', 'CZK', 23.320, 35, 'low'),
  buildForex('USD', 'ILS', 3.6540, 35, 'low'),
  buildForex('USD', 'RUB', 92.540, 80, 'low'),
  buildForex('USD', 'BRL', 5.0120, 40, 'low'),
  buildForex('USD', 'INR', 83.245, 10, 'low'),

  // METALS
  buildIndexOrMetal('XAUUSD', 2384.50, 0.25, 'high', 100, true), // Gold
  buildIndexOrMetal('XAUEUR', 2195.40, 0.35, 'high', 100), // Gold EUR
  buildIndexOrMetal('XAGUSD', 28.45, 0.03, 'medium', 100, true), // Silver
  buildIndexOrMetal('XPTUSD', 985.20, 1.5, 'medium', 100), // Platinum
  buildIndexOrMetal('XPDUSD', 1055.80, 2.5, 'medium', 100), // Palladium
  buildIndexOrMetal('COPPER', 4.542, 0.015, 'medium', 1000),

  // ENERGIES (Oils)
  buildIndexOrMetal('USOIL', 82.45, 0.03, 'high', 100, true), // WTI Crude
  buildIndexOrMetal('UKOIL', 86.75, 0.03, 'high', 100), // Brent Crude
  buildIndexOrMetal('NATGAS', 1.845, 0.005, 'high', 1000),

  // INDICES (World markets)
  buildIndexOrMetal('SPX500', 5123.40, 0.4, 'high', 10), // S&P 500
  buildIndexOrMetal('US30', 38945.20, 1.5, 'high', 1),   // Dow Jones
  buildIndexOrMetal('NAS100', 18235.50, 1.0, 'high', 10), // Nasdaq
  buildIndexOrMetal('UK100', 7945.60, 1.0, 'medium', 10), // FTSE 100
  buildIndexOrMetal('GER40', 18345.20, 1.2, 'medium', 10), // DAX
  buildIndexOrMetal('FRA40', 8145.80, 1.0, 'medium', 10), // CAC 40
  buildIndexOrMetal('JPN225', 39545.00, 5.0, 'high', 1), // Nikkei
  buildIndexOrMetal('AUS200', 7845.20, 1.5, 'medium', 10), // ASX 200
  buildIndexOrMetal('HK50', 16845.50, 5.0, 'high', 1), // Hang Seng

  // CRYPTO MAJOR
  buildCrypto('BTCUSD', 65420.50, true),
  buildCrypto('ETHUSD', 3450.80),
  buildCrypto('BNBUSD', 594.30),
  buildCrypto('SOLUSD', 185.40),
  buildCrypto('XRPUSD', 0.6120),
  buildCrypto('ADAUSD', 0.5840),
  buildCrypto('AVAXUSD', 48.20),
  buildCrypto('DOGEUSD', 0.1850),
  buildCrypto('LINKUSD', 18.54),
  buildCrypto('DOTUSD', 8.54),

  // CRYPTO MINOR
  buildCrypto('MATICUSD', 0.8950),
  buildCrypto('LTCUSD', 98.40),
  buildCrypto('BCHUSD', 684.50),
  buildCrypto('UNIUSD', 11.20),
  buildCrypto('ATOMUSD', 10.45),
  buildCrypto('XLMUSD', 0.1320),
  buildCrypto('ALGOUSD', 0.2340),
  buildCrypto('FILUSD', 8.94),
  buildCrypto('NEARUSD', 6.85),
  buildCrypto('ICPUSD', 17.50),
  buildCrypto('APTUSD', 14.20),
  buildCrypto('ARBUSD', 1.45),
  buildCrypto('OPUSD', 3.12),
  buildCrypto('LDOUSD', 2.45),
  buildCrypto('RNDRUSD', 9.45),
  buildCrypto('STXUSD', 3.20),

  // Equities Simulated
  buildIndexOrMetal('TSLA', 175.40, 0.05, 'high', 100),
  buildIndexOrMetal('AAPL', 169.30, 0.03, 'medium', 100),
  buildIndexOrMetal('NVDA', 875.40, 0.20, 'high', 100),
  buildIndexOrMetal('MSFT', 425.60, 0.15, 'medium', 100),
  buildIndexOrMetal('AMZN', 185.20, 0.05, 'high', 100),
  buildIndexOrMetal('META', 510.40, 0.10, 'high', 100),
  buildIndexOrMetal('GOOGL', 155.80, 0.03, 'medium', 100),
  buildIndexOrMetal('NFLX', 625.30, 0.15, 'high', 100),

  // Padding
  buildCrypto('IMXUSD', 2.85),
  buildCrypto('MKRUSD', 3450),
  buildCrypto('INJUSD', 32.40),
  buildCrypto('GRTUSD', 0.35),
  buildCrypto('SNXUSD', 3.84),
  buildCrypto('TAOUSD', 580.40),
  buildCrypto('AAVEUSD', 115.40),
  buildCrypto('RUNEUSD', 7.45),
  buildCrypto('QNTUSD', 112.50),
  buildCrypto('FETUSD', 2.65),
];

export const historyPositions = [
  { id: 'hp1', line1: 'BTCUSDm sell 0.03', line2: '67369.64 → 67264.10', time: '2026.02.18 16:05:27', profit: 3.17 },
  { id: 'hp2', line1: 'BTCUSDm sell 0.01', line2: '67334.14 → 67264.12', time: '2026.02.18 16:05:28', profit: 0.7 },
  { id: 'hp3', line1: 'BTCUSDm sell 0.01', line2: '67293.08 → 67302.14', time: '2026.02.18 16:05:29', profit: -0.09 },
  { id: 'hp4', line1: 'BTCUSDm sell 0.01', line2: '67279.08 → 67222.14', time: '2026.02.18 16:05:30', profit: 0.57 },
  { id: 'hp5', line1: 'BTCUSDm sell 0.01', line2: '67241.27 → 67196.12', time: '2026.02.18 16:05:32', profit: 0.45 },
  { id: 'hp6', line1: 'BTCUSDm sell 0.01', line2: '67207.66 → 67204.81', time: '2026.02.18 16:05:33', profit: 0.03 },
  { id: 'hp7', line1: 'BTCUSDm sell 0.01', line2: '67239.18 → 67102.25', time: '2026.02.18 16:09:40', profit: 1.37 },
];

export const historyOrders = [
  { id: 'ho1', line1: 'BTCUSDm buy', line2: '0.01 / 0.01 at market', time: '2026.02.18 16:09:42', status: 'filled', profit: 2.45 },
  { id: 'ho2', line1: 'BTCUSDm sell', line2: '0.01 / 0.01 at market', time: '2026.02.18 16:09:44', status: 'filled', profit: -1.12 },
  { id: 'ho3', line1: 'BTCUSDm buy', line2: '0.11 / 0.11 at market', time: '2026.02.18 16:09:45', status: 'filled', profit: 5.87 },
  { id: 'ho4', line1: 'BTCUSDm sell', line2: '0.01 / 0.01 at market', time: '2026.02.18 16:10:01', status: 'filled', profit: -0.34 },
  { id: 'ho5', line1: 'BTCUSDm buy', line2: '0.11 / 0.11 at market', time: '2026.02.18 16:11:01', status: 'filled', profit: 3.21 },
];

export const historyDeals = [
  { id: 'hd1', line1: 'BTCUSDm buy,in', line2: '0.11 at 67072.95', time: '2026.02.18 16:09:45', profit: null },
  { id: 'hd2', line1: 'BTCUSDm sell,in', line2: '0.01 at 67106.26', time: '2026.02.18 16:10:01', profit: null },
  { id: 'hd3', line1: 'BTCUSDm buy,out', line2: '0.01 at 66996.70', time: '2026.02.18 16:12:46', profit: 1.36 },
  { id: 'hd4', line1: 'BTCUSDm buy,out', line2: '0.01 at 66984.70', time: '2026.02.18 16:12:47', profit: 1.21 },
  { id: 'hd5', line1: 'BTCUSDm buy,out', line2: '0.01 at 66977.53', time: '2026.02.18 16:12:49', profit: 0.87 },
];

export const settingsMenu = [
  { id: 'new-account', label: 'New Account', sub: '' },
  { id: 'tradays', label: 'Economic Calender', sub: 'Economic Calender' },
  { id: 'interface', label: 'Language Preference', sub: 'English' },
  { id: 'charts', label: 'Charts', sub: '' },
  { id: 'journal', label: 'Journal', sub: '' },
  { id: 'settings', label: 'Settings', sub: '' },
];

export const brokers = [
  'Exness Technologies Ltd',
  'GTC Global Trade Capital Co. Limited',
  'Trade Securities Limited',
  'GTC Global SA (Pty) Ltd',
  'Flexy Markets Limited',
  'Ascends Global Markets Limited',
  'Equiti Brokerage (Seychelles) Limited',
  'Swissquote Bank SA',
  'FP Markets LLC',
  'Vantage International Group Limited',
  'AMarkets LLC',
  'MetaQuotes Ltd.',
];
