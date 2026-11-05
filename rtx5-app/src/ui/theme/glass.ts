// ─── Dark Professional Trading Terminal Theme ─────────────────────────────────
// Design System v2 — full token set for global app theming.

// ── Trading sub-tokens ────────────────────────────────────────────────────────
export type TradingTokens = {
  buy: {
    primary: string;
    hover: string;
    active: string;
    dark: string;
    gradient: string;
    glow: string;
  };
  sell: {
    primary: string;
    hover: string;
    active: string;
    dark: string;
    gradient: string;
  };
  profit: string;
  loss: string;
  bidUp: string;
  bidDown: string;
  priceDefault: string;
};

export type ChartTokens = {
  background: string;
  grid: string;
  bullCandle: string;
  bearCandle: string;
  volumeUp: string;
  volumeDown: string;
  crosshair: string;
};

export type CategoryTokens = {
  forex: string;
  crypto: string;
  metal: string;
  index: string;
  commodity: string;
};

// ── Full GDark shape ──────────────────────────────────────────────────────────
export const GDark = {
  // ── Backgrounds (flat + namespaced) ────────────────────────────────────────
  bg: '#121212',                          // screen background
  bgRoot: '#121212',                      // root / screen base
  bgSecondary: '#1E1E1E',                 // secondary panels
  glass1: '#1E1E1E',                      // elevated items (buttons, icon boxes, inputs on cards)
  glass2: '#1E1E1E',                      // cards, panels
  glass3: 'rgba(255,255,255,0.08)',       // hover / selected
  inputBg: '#1E1E1E',                     // input fields

  // ── Borders ────────────────────────────────────────────────────────────────
  border: 'rgba(255,255,255,0.10)',       // default
  borderSubtle: 'rgba(255,255,255,0.08)',
  borderMedium: 'rgba(255,255,255,0.10)',
  borderHi: 'rgba(255,255,255,0.15)',     // strong / active
  borderHover: 'rgba(255,255,255,0.12)',
  borderZinc: 'rgba(255,255,255,0.10)',

  // ── Text ───────────────────────────────────────────────────────────────────
  text: '#FFFFFF',          // primary
  textSub: 'rgba(235,235,245,0.62)',
  textMuted: 'rgba(235,235,245,0.54)',
  textDimmed: 'rgba(235,235,245,0.46)',
  textFaint: 'rgba(235,235,245,0.32)',
  textGhost: '#1E1E1E',
  textDark: '#000000',

  // ── Up / Down (legacy alias → trading.bidUp/Down) ──────────────────────────
  up: '#4597FF',
  upGlow: 'rgba(69,151,255,0.15)',
  down: '#EF4444',          // Red 500
  downGlow: 'rgba(239,68,68,0.15)',
  flat: 'rgba(235,235,245,0.62)',

  // ── Accent ─────────────────────────────────────────────────────────────────
  accent: '#347DFF',
  accentGlow: 'rgba(52,125,255,0.22)',
  dotGradient: 'linear-gradient(135deg, rgba(235,235,245,0.62), #1E1E1E)',

  // ── Trading ────────────────────────────────────────────────────────────────
  trading: {
    buy: {
      primary: '#347DFF',
      hover: '#5B95FF',
      active: '#2563EB',
      dark: '#1D4ED8',
      gradient: 'linear-gradient(180deg, #5B95FF 0%, #347DFF 50%, #2563EB 100%)',
      glow: '0 0 6px rgba(52,125,255,0.6)',
    },
    sell: {
      primary: '#DC2626',
      hover: '#EF4444',
      active: '#B91C1C',
      dark: '#991B1B',
      gradient: 'linear-gradient(180deg, #EF4444 0%, #DC2626 50%, #B91C1C 100%)',
    },
    profit: '#4597FF',
    loss: '#EF4444',
    bidUp: '#4597FF',
    bidDown: '#EF4444',
    priceDefault: '#FFFFFF',
  } as TradingTokens,

  // ── Chart ──────────────────────────────────────────────────────────────────
  chart: {
    background: '#121212',
    grid: 'rgba(255,255,255,0.08)',
    bullCandle: '#4597FF',
    bearCandle: '#EF4444',
    volumeUp: 'rgba(69,151,255,0.25)',
    volumeDown: 'rgba(239,68,68,0.25)',
    crosshair: 'rgba(235,235,245,0.62)',
  } as ChartTokens,

  // ── Category colors ────────────────────────────────────────────────────────
  categories: {
    forex: '#818CF8',       // Indigo-400
    crypto: '#F59E0B',
    metal: '#EAB308',
    index: '#94A3B8',
    commodity: '#34D399',
  } as CategoryTokens,

  // ── Shadows ────────────────────────────────────────────────────────────────
  shadows: {
    dropdown: '0 8px 32px rgba(0,0,0,0.6)',
    panel: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(52,125,255,0.08)',
    selectedRow: 'inset 2px 0 0 rgba(255,255,255,0.5)',
  },

  // ── Font sizes (numeric px values for React Native) ────────────────────────
  fontSize: {
    xs: 9,
    sm: 10,
    base: 11,
    md: 12,
    lg: 13,
    priceBig: 28,
    priceMid: 14,
    priceSmall: 12,
  },

  // ── Border radius ──────────────────────────────────────────────────────────
  radius: {
    none: 0,
    small: 3,
    medium: 6,
    large: 7,
    pill: 10,
  },
};

// ── Elite Enterprise Light Theme ─────────────────────────────────────────
export const GLight = {
  bg: '#F2F4F8',          // Soft neutral canvas for light theme screens
  bgRoot: '#F2F4F8',
  bgSecondary: '#FFFFFF', // Pure White cards
  glass1: '#F2F6FC',      // Ultra-soft recessed tone for pills and inputs
  glass2: '#FFFFFF',      // Pure White cards
  glass3: 'rgba(59, 130, 246, 0.06)', // Soft electric blue pressed state
  inputBg: '#F2F6FC',     // Recessed input background

  border: '#E3E8F0',       // Clean, modern structural border
  borderSubtle: '#F3F4F6', // Almost invisible dividers
  borderMedium: '#D1D5DB', // Mid-tone generic border
  borderHi: '#9CA3AF',
  borderHover: '#6B7280',
  borderZinc: '#E3E8F0',

  text: '#111827',         // Deep rich black, not pure #000
  textSub: '#4B5563',      // Legible secondary gray
  textMuted: '#6B7280',    // Muted semantic gray
  textDimmed: '#9CA3AF',   // Dimmed semantic gray
  textFaint: '#D1D5DB',    // Faint functional gray
  textGhost: '#E5E7EB',    // Barely visible ghost text
  textDark: '#030712',     // Absolute deepest slate

  up: '#1D4ED8',
  upGlow: 'rgba(29,78,216,0.1)',
  down: '#EF4444',         // Crisp, modern Red
  downGlow: 'rgba(239, 68, 68, 0.1)',
  flat: '#64748B',

  accent: '#4338CA',       // Indigo 700: Deepened for maximum light contrast
  accentGlow: 'rgba(67, 56, 202, 0.15)',
  dotGradient: 'linear-gradient(135deg, #94A3B8, #CBD5E1)',

  trading: {
    buy: {
      primary: '#2563EB',  // Professional Blue 600 for primary Buy actions
      hover: '#1D4ED8',
      active: '#1E40AF',
      dark: '#1E3A8A',
      gradient: 'linear-gradient(180deg, #3B82F6 0%, #2563EB 50%, #1D4ED8 100%)',
      glow: '0 4px 14px rgba(37, 99, 235, 0.3)',
    },
    sell: {
      primary: '#DC2626',
      hover: '#B91C1C',
      active: '#991B1B',
      dark: '#7F1D1D',
      gradient: 'linear-gradient(180deg, #EF4444 0%, #DC2626 50%, #B91C1C 100%)',
    },
    profit: '#1D4ED8',
    loss: '#DC2626',
    bidUp: '#1D4ED8',
    bidDown: '#DC2626',
    priceDefault: '#0F172A',
  } as TradingTokens,

  chart: {
    background: '#FFFFFF',
    grid: '#F1F5F9',       // Slate 100
    bullCandle: '#1D4ED8',
    bearCandle: '#DC2626',
    volumeUp: 'rgba(29,78,216,0.1)',
    volumeDown: 'rgba(220, 38, 38, 0.1)',
    crosshair: '#94A3B8',
  } as ChartTokens,

  categories: {
    forex: '#4F46E5',      // Indigo
    crypto: '#F59E0B',
    metal: '#EAB308',
    index: '#64748B',
    commodity: '#059669',
  } as CategoryTokens,

  shadows: {
    dropdown: '0 10px 40px -10px rgba(15, 23, 42, 0.12)',
    panel: '0 4px 12px rgba(15, 23, 42, 0.05), 0 0 0 1px rgba(15, 23, 42, 0.03)',
    selectedRow: 'inset 2px 0 0 rgba(37, 99, 235, 1)',
  },

  fontSize: {
    xs: 9,
    sm: 10,
    base: 11,
    md: 12,
    lg: 13,
    priceBig: 28,
    priceMid: 14,
    priceSmall: 12,
  },

  radius: {
    none: 0,
    small: 3,
    medium: 6,
    large: 7,
    pill: 10,
  },
};

// ── Type export ───────────────────────────────────────────────────────────────
export type ThemeColors = typeof GDark;

// ── Default static export (dark) ──────────────────────────────────────────────
export const G = GDark;
