import type { Ionicons } from '@expo/vector-icons';
import { DEFAULT_APP_LEGAL_LINKS } from '../../config/legalLinks';

export type AboutActionId =
  | 'rate-experience'
  | 'user-guide'
  | 'privacy-policy'
  | 'account-deletion'
  | 'contact-developer';

export type AboutAction = {
  id: AboutActionId;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
};

export type AboutContactCategory = {
  id: string;
  label: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
};

export type AboutExternalLinks = {
  androidPackageName: string;
  iosAppStoreId?: string | null;
  iosSearchTerm: string;
  userGuideUrl: string;
  termsUrl: string;
  privacyPolicyUrl: string;
  developerEmail: string;
};

export type AboutStoreTarget = {
  primaryUrl: string;
  fallbackUrl: string;
  storeLabel: string;
};

export type AboutDeveloperMailOptions = {
  appName: string;
  appVersion: string;
  appBuildVersion?: string | null;
  platform: string;
  category: AboutContactCategory | null;
  requesterName?: string;
  requesterEmail?: string;
  title?: string;
  message?: string;
  developerEmail?: string;
};

const CONTACT_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const ABOUT_EXTERNAL_LINKS: AboutExternalLinks = {
  androidPackageName: 'com.rtx5.app',
  iosSearchTerm: 'RTX5',
  userGuideUrl: 'https://rtx5.app/user-guide',
  termsUrl: DEFAULT_APP_LEGAL_LINKS.termsUrl,
  privacyPolicyUrl: DEFAULT_APP_LEGAL_LINKS.privacyPolicyUrl,
  developerEmail: DEFAULT_APP_LEGAL_LINKS.developerEmail,
};

export const ABOUT_ACTIONS: AboutAction[] = [
  {
    id: 'rate-experience',
    title: 'Rate your experience',
    icon: 'star',
  },
  {
    id: 'user-guide',
    title: 'User guide',
    icon: 'book-outline',
  },
  {
    id: 'privacy-policy',
    title: 'Privacy Policy',
    icon: 'shield-checkmark-outline',
  },
  {
    id: 'account-deletion',
    title: 'Request Account Deletion',
    icon: 'person-remove-outline',
  },
  {
    id: 'contact-developer',
    title: 'Report a Bug',
    icon: 'bug-outline',
  },
];

export const ABOUT_CONTACT_CATEGORIES: AboutContactCategory[] = [
  {
    id: 'bug-report',
    label: 'Bug Report',
    subtitle: 'Report broken UI, crashes, or unexpected behavior.',
    icon: 'bug-outline',
  },
  {
    id: 'feature-request',
    label: 'Feature Request',
    subtitle: 'Suggest a product improvement for a future release.',
    icon: 'bulb-outline',
  },
  {
    id: 'trading-account-problem',
    label: 'Trading Account Problem',
    subtitle: 'Login, account, order ticket, position, or access issue.',
    icon: 'flash-outline',
  },
  {
    id: 'account-deletion',
    label: 'Account Deletion',
    subtitle: 'Request deletion of your app account and related personal data.',
    icon: 'person-remove-outline',
  },
  {
    id: 'other',
    label: 'Other',
    subtitle: 'Send another developer support request.',
    icon: 'ellipsis-horizontal-outline',
  },
];

export function formatAboutPlatform(platform: string): string {
  switch (platform) {
    case 'ios':
      return 'iOS';
    case 'android':
      return 'Android';
    case 'web':
      return 'Web preview';
    default:
      return platform ? platform.toUpperCase() : 'Native';
  }
}

export function resolveAboutBuildLabel({
  appVersion,
}: {
  appVersion: string;
  appBuildVersion?: string | null;
}): string {
  const normalizedVersion = appVersion.trim() || 'Local';

  return `Version ${normalizedVersion}`;
}

export function getAboutStoreTarget(
  platform: string,
  links: AboutExternalLinks = ABOUT_EXTERNAL_LINKS,
): AboutStoreTarget {
  if (platform === 'android') {
    return {
      primaryUrl: `market://details?id=${encodeURIComponent(links.androidPackageName)}`,
      fallbackUrl: `https://play.google.com/store/apps/details?id=${encodeURIComponent(links.androidPackageName)}`,
      storeLabel: 'Google Play',
    };
  }

  const encodedSearchTerm = encodeURIComponent(links.iosSearchTerm);
  const iosAppStoreId = links.iosAppStoreId?.trim();
  if (platform === 'ios') {
    if (iosAppStoreId) {
      return {
        primaryUrl: `itms-apps://itunes.apple.com/app/id${encodeURIComponent(iosAppStoreId)}`,
        fallbackUrl: `https://apps.apple.com/app/id${encodeURIComponent(iosAppStoreId)}`,
        storeLabel: 'App Store',
      };
    }

    return {
      primaryUrl: `itms-apps://itunes.apple.com/search?term=${encodedSearchTerm}&entity=software`,
      fallbackUrl: `https://apps.apple.com/us/search?term=${encodedSearchTerm}`,
      storeLabel: 'App Store',
    };
  }

  return {
    primaryUrl: `https://play.google.com/store/apps/details?id=${encodeURIComponent(links.androidPackageName)}`,
    fallbackUrl: `https://apps.apple.com/us/search?term=${encodedSearchTerm}`,
    storeLabel: 'App store',
  };
}

export function getAboutContactCategory(categoryId: string): AboutContactCategory | null {
  return ABOUT_CONTACT_CATEGORIES.find((category) => category.id === categoryId) ?? null;
}

export function isValidDeveloperContactEmail(email: string): boolean {
  const trimmedEmail = email.trim();

  return trimmedEmail.length <= 254 && CONTACT_EMAIL_PATTERN.test(trimmedEmail);
}

export function buildAccountDeletionRequestMessage({
  accountId,
  server,
}: {
  accountId?: string | number | null;
  server?: string | null;
}): string {
  const normalizedAccountId = String(accountId ?? '').trim() || 'Not provided';
  const normalizedServer = server?.trim() || 'Not provided';

  return [
    'Please delete my RTX5 app account and related personal data.',
    '',
    'Account details:',
    `Account login: ${normalizedAccountId}`,
    `Server: ${normalizedServer}`,
    '',
    'I understand that some records may need to be retained where required by law or financial-service obligations.',
  ].join('\n');
}

export function buildDeveloperMailto({
  appName,
  appVersion,
  appBuildVersion,
  platform,
  category,
  requesterName,
  requesterEmail,
  title,
  message,
  developerEmail = ABOUT_EXTERNAL_LINKS.developerEmail,
}: AboutDeveloperMailOptions): string {
  const categoryLabel = category?.label ?? 'Unselected category';
  const trimmedTitle = title?.trim();
  const subject = trimmedTitle || `[${appName}] ${categoryLabel}`;
  const bodyLines = [
    `App: ${appName}`,
    `Version: ${appVersion}`,
    ...(appBuildVersion?.trim() ? [`Build: ${appBuildVersion.trim()}`] : []),
    `Platform: ${platform}`,
    `Category: ${categoryLabel}`,
    `Name: ${requesterName?.trim() || 'Not provided'}`,
    `Email: ${requesterEmail?.trim() || 'Not provided'}`,
    `Title: ${trimmedTitle || 'Not provided'}`,
    '',
    message?.trim() || 'Describe the issue or feedback here.',
  ];

  return `mailto:${developerEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyLines.join('\n'))}`;
}
