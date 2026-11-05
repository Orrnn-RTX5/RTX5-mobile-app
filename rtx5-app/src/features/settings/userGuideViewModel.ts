import type { Ionicons } from '@expo/vector-icons';

export type GuideManualSection = {
  id: string;
  index: string;
  title: string;
  summary: string;
  icon: keyof typeof Ionicons.glyphMap;
  bullets: string[];
};

export type GuideSummary = {
  sectionCount: number;
  bulletCount: number;
  localStateLabel: string;
};

export const GUIDE_MANUAL_INTRO = {
  title: 'RTX5 Mobile App',
  subtitle: 'User Guide',
  body:
    'This guide explains the main RTX5 mobile screens and the everyday actions available in the app. It is written for the RTX5 app experience and its own mobile workflows.',
} as const;

export const GUIDE_MANUAL_SECTIONS: GuideManualSection[] = [
  {
    id: 'quotes',
    index: '01',
    title: 'Quotes',
    summary: 'Review market symbols, bid and ask prices, symbol details, and watchlist membership.',
    icon: 'swap-vertical-outline',
    bullets: [
      'Use list mode for quick scanning and table mode for denser quote comparison.',
      'Search or add symbols, then open chart, details, statistics, or delete actions from the quote row.',
      'Your selected watchlist membership and view mode remain stored on this device.',
    ],
  },
  {
    id: 'charts',
    index: '02',
    title: 'Charts',
    summary: 'Analyze symbols with the RTX5 chart workspace and saved chart preferences.',
    icon: 'stats-chart-outline',
    bullets: [
      'Choose the active symbol and timeframe from the chart header and toolbar.',
      'Use objects, indicators, colors, price-source settings, alerts, and chart preferences from chart menus.',
      'Chart drawings, visibility, lock settings, current symbol, and timeframe persist locally until you change them.',
    ],
  },
  {
    id: 'trade',
    index: '03',
    title: 'Trade',
    summary: 'Review open positions and use protected trade workflows.',
    icon: 'trending-up-outline',
    bullets: [
      'Open Trade to review positions, floating profit/loss, account context, and position actions.',
      'Use order tickets for market, pending, modify, close, and bulk operation flows.',
      'One-click trading remains blocked until the local terms acceptance state is enabled by the user.',
    ],
  },
  {
    id: 'history',
    index: '04',
    title: 'History',
    summary: 'Inspect closed positions, orders, deals, totals, and saved filters.',
    icon: 'time-outline',
    bullets: [
      'Switch between positions, orders, and deals to review completed account activity.',
      'Use date range, symbol, and related filters to narrow history results.',
      'The selected history filter range and related user filters are restored from local device state.',
    ],
  },
  {
    id: 'calendar-journal',
    index: '05',
    title: 'Economic Calendar and Journal',
    summary: 'Review economic events and the terminal activity journal from Settings and the sidebar.',
    icon: 'calendar-outline',
    bullets: [
      'Economic Calendar lists macro events with impact filters for market context inside the app.',
      'Journal shows account and terminal activity for the connected session.',
      'These screens are informational app surfaces and do not provide financial or investment advice.',
    ],
  },
  {
    id: 'accounts',
    index: '06',
    title: 'Accounts and Brokers',
    summary: 'Manage account context, saved accounts, broker directory entry points, and login flows.',
    icon: 'person-circle-outline',
    bullets: [
      'The active account card shows the connected account context and live metric readiness.',
      'Saved accounts can be reviewed or switched while preserving their latest known display details.',
      'Demo, contest, and real account classification comes from backend account/auth metadata.',
    ],
  },
  {
    id: 'settings',
    index: '07',
    title: 'Settings and Personalization',
    summary: 'Adjust app preferences without resetting user-specific choices.',
    icon: 'settings-outline',
    bullets: [
      'Theme, language, chart display, watchlists, chart drawings, filters, and trade preferences are user-controlled.',
      'Personalization is stored on the device and remains unchanged until the user changes it.',
      'Settings routes are frontend-only and consume typed app configuration or API data where required.',
    ],
  },
  {
    id: 'safety',
    index: '08',
    title: 'Safety Notes',
    summary: 'Understand app boundaries before using market and trading screens.',
    icon: 'shield-checkmark-outline',
    bullets: [
      'RTX5 is a frontend mobile trading app and does not replace broker, execution, or backend trading systems.',
      'The chart UI must remain free of visible third-party logos.',
      'Preview, staging, and production updates are separated through EAS Update channels and runtime compatibility gates.',
    ],
  },
];

export const GUIDE_FOOTER_NOTE =
  'RTX5 guide content explains app navigation and expected behavior. It is not trading advice, investment advice, or a recommendation to buy or sell any financial instrument.';

export function buildGuideSummary(sections: GuideManualSection[] = GUIDE_MANUAL_SECTIONS): GuideSummary {
  return {
    sectionCount: sections.length,
    bulletCount: sections.reduce((total, section) => total + section.bullets.length, 0),
    localStateLabel: 'Device local',
  };
}
