/**
 * Static instrument metadata, flag mappings, and asset-icon fallbacks for the
 * symbol details screen.
 */
import { Ionicons } from '@expo/vector-icons';

export const dCol = (c: number, T: any) => c > 0 ? T.up : c < 0 ? T.down : T.textMuted;
export const sgn = (c: number) => c > 0 ? '+' : '';

export const CC: Record<string, string> = {
  EUR: 'eu', USD: 'us', GBP: 'gb', JPY: 'jp', CHF: 'ch', AUD: 'au',
  NZD: 'nz', CAD: 'ca', TRY: 'tr', ZAR: 'za', MXN: 'mx', SEK: 'se',
  NOK: 'no', DKK: 'dk', CNH: 'cn', SGD: 'sg', HKD: 'hk', PLN: 'pl',
  HUF: 'hu', CZK: 'cz', ILS: 'il', RUB: 'ru', BRL: 'br', INR: 'in',
  BTC: 'bt', ETH: 'et', XAU: 'xau', XAG: 'xag',
};

export const flagUrl = (cc: string) => `https://flagcdn.com/w80/${cc}.png`;

export const ASSET_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  BTC: 'logo-bitcoin', ETH: 'diamond-outline', XAU: 'ellipse', XAG: 'ellipse',
  SPX: 'trending-up', US3: 'trending-up', NAS: 'trending-up', UK1: 'trending-up',
};

export type Meta = {
  name: string;
  category: string;
  sector: string;
  spreadMode: string;
  stopsLevel: string;
  calculation: string;
  chartMode: string;
  sessions: Array<[string, string]>;
};

export const DEFAULT_SESSIONS: Array<[string, string]> = [
  ['Sunday', '23:05 - 24:00'],
  ['Monday', '00:00 - 24:00'],
  ['Tuesday', '00:00 - 24:00'],
  ['Wednesday', '00:00 - 24:00'],
  ['Thursday', '00:00 - 24:00'],
  ['Friday', '00:00 - 22:59'],
];

export const META: Record<string, Partial<Meta>> = {
  BTCUSD: { name: 'Bitcoin vs US Dollar', category: 'Crypto', sector: 'Digital Asset', spreadMode: 'Floating', stopsLevel: '0', calculation: 'Exchange', chartMode: 'By Last' },
  XAUUSD: { name: 'Gold vs US Dollar', category: 'Commodity', sector: 'Precious Metal', spreadMode: 'Floating', stopsLevel: '0', calculation: 'CFD', chartMode: 'By Bid' },
};

export const normalizeSessionHours = (hours: string) =>
  hours
    .replace(/–|—|–|—/g, ' - ')
    .replace(/\s*-\s*/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim();

export const normalizeTradingSessions = (sessions: Array<[string, string]>) =>
  sessions.map(([day, hours]) => [day, normalizeSessionHours(hours)] as [string, string]);

export function getMeta(sym: string): Meta {
  const base = {
    name: sym.replace(/m$/i, '') + ' Instrument',
    category: 'Major',
    sector: 'Currency',
    spreadMode: 'Floating',
    stopsLevel: '0',
    calculation: 'Forex',
    chartMode: 'By Bid',
    sessions: DEFAULT_SESSIONS,
    ...META[sym],
  };
  return {
    ...base,
    sessions: normalizeTradingSessions(base.sessions),
  };
}
