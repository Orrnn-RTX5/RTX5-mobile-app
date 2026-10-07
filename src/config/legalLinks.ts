export type AppLegalLinks = {
  termsUrl: string;
  privacyPolicyUrl: string;
  developerEmail: string;
  supportEmail: string;
};

export const DEFAULT_APP_LEGAL_LINKS: AppLegalLinks = {
  termsUrl: '',
  privacyPolicyUrl: '',
  developerEmail: 'support@rtx5.app',
  supportEmail: 'support@orrnn.com',
};

const resolveConfiguredValue = (value: string | undefined, fallback: string) => {
  const trimmed = value?.trim();
  return trimmed || fallback;
};

export const getConfiguredTermsUrl = () => (
  resolveConfiguredValue(process.env.EXPO_PUBLIC_TERMS_URL, DEFAULT_APP_LEGAL_LINKS.termsUrl)
);

export const getConfiguredPrivacyPolicyUrl = () => (
  resolveConfiguredValue(process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL, DEFAULT_APP_LEGAL_LINKS.privacyPolicyUrl)
);

export const getConfiguredDeveloperEmail = () => (
  resolveConfiguredValue(process.env.EXPO_PUBLIC_DEVELOPER_EMAIL, DEFAULT_APP_LEGAL_LINKS.developerEmail)
);

export const getConfiguredSupportEmail = () => (
  resolveConfiguredValue(process.env.EXPO_PUBLIC_SUPPORT_EMAIL, DEFAULT_APP_LEGAL_LINKS.supportEmail)
);

export const resolveLegalUrl = (
  primaryUrl: string | null | undefined,
  fallbackUrl: string,
) => {
  const normalizedPrimary = primaryUrl?.trim();
  if (normalizedPrimary && /^https?:\/\//i.test(normalizedPrimary)) {
    return normalizedPrimary;
  }

  const normalizedFallback = fallbackUrl.trim();
  return /^https?:\/\//i.test(normalizedFallback) ? normalizedFallback : '';
};
