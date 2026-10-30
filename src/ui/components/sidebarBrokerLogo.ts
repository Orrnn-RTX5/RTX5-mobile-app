type BrokerBranding = Readonly<{ broker_id: string; logo_url?: string | null }>;

type SidebarBrokerLogoInput = Readonly<{
  isLoggedIn: boolean;
  brokerId: string;
  persistedLogoUrl?: string;
  brokerApiBase?: string;
  directoryApiBase?: string;
  brokerConfig?: BrokerBranding;
  brokerServers?: readonly BrokerBranding[];
}>;

const normalizeBrokerId = (value: string) => value.trim().toLowerCase();

/** Native image sources need an absolute URL. Branding never receives auth headers. */
const normalizeLogoUri = (value: string | null | undefined, base?: string): string => {
  const raw = value?.trim();
  if (!raw) return '';
  if (/^data:image\//i.test(raw)) return raw;
  try {
    const url = raw.startsWith('//')
      ? new URL(`https:${raw}`)
      : new URL(raw, base ? `${base.replace(/\/+$/, '')}/` : undefined);
    if (url.protocol === 'http:') url.protocol = 'https:';
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return '';
    return url.toString();
  } catch {
    return '';
  }
};

/** Only the active broker's branding may replace the drawer's default avatar. */
export function resolveSidebarBrokerLogoCandidates(input: SidebarBrokerLogoInput): readonly string[] {
  const brokerId = normalizeBrokerId(input.brokerId);
  if (!input.isLoggedIn || !brokerId) return [];
  const candidates = [normalizeLogoUri(input.persistedLogoUrl, input.directoryApiBase || input.brokerApiBase)];
  if (input.brokerConfig && normalizeBrokerId(input.brokerConfig.broker_id) === brokerId) {
    candidates.push(normalizeLogoUri(input.brokerConfig.logo_url, input.brokerApiBase));
  }
  for (const broker of input.brokerServers ?? []) {
    if (normalizeBrokerId(broker.broker_id) === brokerId) {
      candidates.push(normalizeLogoUri(broker.logo_url, input.directoryApiBase || input.brokerApiBase));
    }
  }
  return [...new Set(candidates.filter(Boolean))];
}
