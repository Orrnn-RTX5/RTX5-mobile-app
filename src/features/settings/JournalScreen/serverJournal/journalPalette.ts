import { GDark, GLight } from '../../../../ui/theme/glass';

/**
 * Journal colours: the web terminal's dark-theme tokens, plus its light-skin
 * accents mapped onto an equivalent light palette.
 */
export type JournalPalette = {
  bg: string;
  rowPressed: string;
  divider: string;
  toolbarBg: string;
  toolbarBorder: string;
  headBg: string;
  headText: string;
  rowText: string;
  sourceText: string;
  typeStrong: string;
  typeMuted: string;
  typeFaint: string;
  errorText: string;
  inputBg: string;
  inputBorder: string;
  inputText: string;
  fieldLabel: string;
  chipText: string;
  chipActiveBg: string;
  chipActiveText: string;
  toolBorder: string;
  toolText: string;
  copiedBorder: string;
  copiedText: string;
  failedBorder: string;
  autoOnBorder: string;
  autoOnBg: string;
  autoOnText: string;
  autoOffText: string;
  refreshBg: string;
  refreshText: string;
  bannerBg: string;
  bannerBorder: string;
  bannerText: string;
  retryBg: string;
  retryText: string;
  loadingText: string;
  emptyText: string;
};

const DARK: JournalPalette = {
  bg: '#131316',
  rowPressed: '#202126',
  divider: 'rgba(39,39,42,0.9)',
  toolbarBg: '#191a1e',
  toolbarBorder: '#3f3f46',
  headBg: '#17181c',
  headText: '#c9cfdb',
  rowText: '#f4f4f5',
  sourceText: '#a1a1aa',
  typeStrong: '#d4d4d8',
  typeMuted: '#a1a1aa',
  typeFaint: '#71717a',
  errorText: '#f87171',
  inputBg: '#27272a',
  inputBorder: '#52525b',
  inputText: '#e4e4e7',
  fieldLabel: '#a1a1aa',
  chipText: '#a1a1aa',
  chipActiveBg: 'rgba(63,63,70,0.7)',
  chipActiveText: '#ffffff',
  toolBorder: '#3f3f46',
  toolText: '#a1a1aa',
  copiedBorder: GDark.trading.profit,
  copiedText: GDark.trading.profit,
  failedBorder: '#991b1b',
  autoOnBorder: '#52525b',
  autoOnBg: 'rgba(23,37,84,0.3)',
  autoOnText: '#60a5fa',
  autoOffText: '#71717a',
  refreshBg: '#27272a',
  refreshText: '#d4d4d8',
  bannerBg: 'rgba(69,26,3,0.3)',
  bannerBorder: 'rgba(120,53,15,0.6)',
  bannerText: '#fcd34d',
  retryBg: '#3f3f46',
  retryText: '#e4e4e7',
  loadingText: '#71717a',
  emptyText: '#52525b',
};

const LIGHT: JournalPalette = {
  bg: '#ffffff',
  rowPressed: '#f4f4f5',
  divider: 'rgba(0,0,0,0.08)',
  toolbarBg: '#fafafa',
  toolbarBorder: '#e4e4e7',
  headBg: '#f4f4f5',
  headText: '#52525b',
  rowText: '#18181b',
  sourceText: '#52525b',
  typeStrong: '#27272a',
  typeMuted: '#52525b',
  typeFaint: '#a1a1aa',
  errorText: '#dc2626',
  inputBg: '#ffffff',
  inputBorder: '#d4d4d8',
  inputText: '#18181b',
  fieldLabel: '#71717a',
  chipText: '#52525b',
  chipActiveBg: '#7E57C2',
  chipActiveText: '#ffffff',
  toolBorder: '#d4d4d8',
  toolText: '#52525b',
  copiedBorder: GLight.trading.profit,
  copiedText: GLight.trading.profit,
  failedBorder: '#991b1b',
  autoOnBorder: '#d6bbfb',
  autoOnBg: '#f4ebff',
  autoOnText: '#6941c6',
  autoOffText: '#71717a',
  refreshBg: '#e4e4e7',
  refreshText: '#3f3f46',
  bannerBg: '#fef3c7',
  bannerBorder: '#fcd34d',
  bannerText: '#92400e',
  retryBg: '#e4e4e7',
  retryText: '#18181b',
  loadingText: '#71717a',
  emptyText: '#71717a',
};

export const makeJournalPalette = (isDark: boolean): JournalPalette => (isDark ? DARK : LIGHT);
