import type { Ionicons } from '@expo/vector-icons';
import { DEFAULT_APP_LEGAL_LINKS } from '../../config/legalLinks';

export type HelpFaqCategory = 'All' | 'Account' | 'Trading' | 'Charts' | 'Safety';

export type HelpFaqItem = {
  id: string;
  category: Exclude<HelpFaqCategory, 'All'>;
  question: string;
  answer: string;
  icon: keyof typeof Ionicons.glyphMap;
};

export type HelpSummary = {
  faqCount: number;
  categoryCount: number;
};

export type HelpCategoryCounts = Record<HelpFaqCategory, number>;

export type SelectHelpFaqItemsOptions = {
  items?: HelpFaqItem[];
  category?: HelpFaqCategory;
  query?: string;
};

export type HelpMailtoOptions = {
  appName: string;
  appVersion: string;
  appBuildVersion?: string | null;
  platform: string;
  supportEmail?: string;
};

export const HELP_SUPPORT_EMAIL = DEFAULT_APP_LEGAL_LINKS.supportEmail;

export const HELP_HEADER = {
  title: 'FAQ',
  label: 'Help Center',
  body: 'Fast answers for the most common account, trading, chart, and safety questions inside RTX5.',
} as const;

export const HELP_CATEGORY_FILTERS: HelpFaqCategory[] = ['All', 'Account', 'Trading', 'Charts', 'Safety'];

export const HELP_FAQ_ITEMS: HelpFaqItem[] = [
  {
    id: 'connect-account',
    category: 'Account',
    question: 'How do I connect a trading account?',
    answer:
      'Open Settings, choose Login Account, select the broker/server, and enter the account login credentials. Demo, contest, and real classification is read from broker account metadata after login.',
    icon: 'person-circle-outline',
  },
  {
    id: 'switch-account',
    category: 'Account',
    question: 'Can I switch saved accounts without losing settings?',
    answer:
      'Yes. Saved accounts can be switched from Accounts, while local preferences such as theme, chart state, watchlists, and filters remain on the device until you change them.',
    icon: 'swap-horizontal-outline',
  },
  {
    id: 'one-click',
    category: 'Trading',
    question: 'Why is one-click trading disabled?',
    answer:
      'One-click trading stays disabled until the local terms switch is accepted. This keeps fast trade actions gated behind an explicit user decision.',
    icon: 'flash-outline',
  },
  {
    id: 'position-actions',
    category: 'Trading',
    question: 'Where are position actions located?',
    answer:
      'Open Trade to review positions. Position rows expose ticket actions such as modify, close, and supported bulk operation flows.',
    icon: 'briefcase-outline',
  },
  {
    id: 'chart-state',
    category: 'Charts',
    question: 'Are chart drawings and timeframe saved?',
    answer:
      'Yes. The active chart symbol, timeframe, drawings, visibility, lock state, and display preferences are stored locally on this device.',
    icon: 'stats-chart-outline',
  },
  {
    id: 'quote-watchlist',
    category: 'Charts',
    question: 'How do I manage quote symbols?',
    answer:
      'Use Quotes to search, add, delete, or inspect symbols. Watchlist membership and the selected quote view mode are persisted locally.',
    icon: 'list-outline',
  },
  {
    id: 'market-content',
    category: 'Safety',
    question: 'Is app content financial advice?',
    answer:
      'No. Mailbox, News, Economic Calendar, Help, and other information surfaces are provided for app context and are not investment advice.',
    icon: 'shield-checkmark-outline',
  },
  {
    id: 'private-details',
    category: 'Safety',
    question: 'What should I avoid sharing?',
    answer:
      'Never share passwords, one-time passcodes, full card details, or remote device access. Use the Support row in Settings for account-specific help.',
    icon: 'lock-closed-outline',
  },
];

export function filterHelpFaqItems(
  items: HelpFaqItem[] = HELP_FAQ_ITEMS,
  category: HelpFaqCategory = 'All',
): HelpFaqItem[] {
  return category === 'All' ? items : items.filter((item) => item.category === category);
}

export function getHelpCategoryCounts(items: HelpFaqItem[] = HELP_FAQ_ITEMS): HelpCategoryCounts {
  return HELP_CATEGORY_FILTERS.reduce((counts, category) => {
    counts[category] = filterHelpFaqItems(items, category).length;
    return counts;
  }, {} as HelpCategoryCounts);
}

export function selectHelpFaqItems({
  items = HELP_FAQ_ITEMS,
  category = 'All',
  query = '',
}: SelectHelpFaqItemsOptions = {}): HelpFaqItem[] {
  const filteredByCategory = filterHelpFaqItems(items, category);
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return filteredByCategory;
  }

  return filteredByCategory.filter((item) => {
    const searchable = `${item.category} ${item.question} ${item.answer}`.toLowerCase();
    return searchable.includes(normalizedQuery);
  });
}

export function buildHelpSummary(items: HelpFaqItem[] = HELP_FAQ_ITEMS): HelpSummary {
  return {
    faqCount: items.length,
    categoryCount: new Set(items.map((item) => item.category)).size,
  };
}

export function buildHelpMailto({
  appName,
  appVersion,
  appBuildVersion,
  platform,
  supportEmail = HELP_SUPPORT_EMAIL,
}: HelpMailtoOptions): string {
  const subject = `${appName} help request`;
  const bodyLines = [
    `App: ${appName}`,
    `Version: ${appVersion}`,
    ...(appBuildVersion?.trim() ? [`Build: ${appBuildVersion.trim()}`] : []),
    `Platform: ${platform}`,
    '',
    'Describe your question or issue here.',
    '',
    'Account login:',
    'Broker server:',
  ];

  return `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyLines.join('\n'))}`;
}
