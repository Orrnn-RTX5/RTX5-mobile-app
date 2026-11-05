import type { Ionicons } from '@expo/vector-icons';

export type LegalDocumentSection = {
  title: string;
  body: string;
};

export type LegalDocument = {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  updatedLabel: string;
  sections: LegalDocumentSection[];
};

export const PRIVACY_POLICY_DOCUMENT: LegalDocument = {
  title: 'Privacy Policy',
  subtitle: 'How RTX5 handles app data, permissions, and deletion requests.',
  icon: 'shield-checkmark-outline',
  updatedLabel: 'Updated June 4, 2026',
  sections: [
    {
      title: 'Data we collect',
      body: 'When you create or sign in to a demo trading account, RTX5 may send the details you enter, such as name, email, phone number, country, account login, selected broker, and password fields, to the configured broker or trading platform endpoint so the account can be created or authenticated.',
    },
    {
      title: 'Data stored on this device',
      body: 'RTX5 stores app preferences, selected symbols, chart settings, drawing objects, account session state, and saved account credentials locally on the device. Tokens and saved credentials are stored with the platform secure-storage layer where available.',
    },
    {
      title: 'Protected resources',
      body: 'This app version does not request camera, microphone, contacts, photos, or location access for its account and trading flows.',
    },
    {
      title: 'Third parties and sharing',
      body: 'Trading account data is shared with the selected broker or trading platform endpoint needed to operate the requested account features. This app version does not use advertising-network SDKs or tracking SDKs.',
    },
    {
      title: 'Retention and deletion',
      body: 'Device-local preferences remain on the device until you change, remove, or reinstall the app. Account and trading records may be retained by the broker or operator where required for legal, security, financial-service, or audit obligations. You can start an account deletion request from About > Request Account Deletion.',
    },
    {
      title: 'Consent and support',
      body: 'Demo account registration is blocked until you explicitly accept the Terms and Privacy Policy. You can contact support or request account deletion from the About screen.',
    },
  ],
};

export const TERMS_DOCUMENT: LegalDocument = {
  title: 'Terms and Conditions',
  subtitle: 'Terms for account access, market data, trading decisions, and platform use.',
  icon: 'document-text-outline',
  updatedLabel: 'Updated June 4, 2026',
  sections: [
    {
      title: 'Acceptance of Terms',
      body: 'By using RTX5, creating an account, signing in, or submitting a trade request, you agree to these Terms and to any additional broker, platform, exchange, or market rules that apply to your selected account.',
    },
    {
      title: 'Trading Risk Disclaimer',
      body: 'Trading financial instruments involves risk and may result in losses. Prices, spreads, liquidity, leverage, margin requirements, and execution can change quickly. RTX5 does not guarantee profit, execution, availability, or data accuracy.',
    },
    {
      title: 'Account Usage',
      body: 'You are responsible for keeping login credentials secure, confirming account type and broker details, reviewing orders before submission, and using one-click trading only after accepting the related terms. Demo accounts are for practice and may not match live conditions.',
    },
    {
      title: 'Market Data',
      body: 'Quotes, candles, charts, symbols, news, account balances, and trading history are displayed from configured broker or platform data sources. Data may be delayed, interrupted, corrected, or unavailable during market, network, or service events.',
    },
    {
      title: 'Platform Availability',
      body: 'Network conditions, broker infrastructure, device state, maintenance, updates, or third-party service issues may affect access to RTX5 features. You remain responsible for monitoring open positions through your broker or other available channels.',
    },
    {
      title: 'User Responsibilities',
      body: 'You agree not to misuse the app, attempt unauthorized access, interfere with trading services, submit false account information, or use RTX5 where trading is restricted. You are responsible for complying with laws and broker requirements in your region.',
    },
    {
      title: 'Privacy and Data',
      body: 'RTX5 stores device preferences locally and may send registration, login, account, and trading data to the selected broker or configured platform endpoint. Review the Privacy Policy for details about data handling and deletion requests.',
    },
    {
      title: 'Updates to Terms',
      body: 'RTX5 may update these Terms as app features, broker integrations, legal requirements, or platform policies change. Continued use after an update means you accept the revised Terms.',
    },
  ],
};

export const getLegalDocument = (document: 'terms' | 'privacy') => (
  document === 'terms' ? TERMS_DOCUMENT : PRIVACY_POLICY_DOCUMENT
);
