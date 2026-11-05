/**
 * Display-only broker types and label-translation helpers.
 */

export type BrokerFilter = 'all' | 'popular' | 'regulated';

export type BrokerRecord = {
  id: string;
  name: string;
  server: string;
  domain?: string;
  region: string;
  spread: string;
  minDeposit: string;
  popular: boolean;
  regulated: boolean;
};

export function translateBrokerRegion(region: string, t: (key: string) => string) {
  return t(region);
}

export function translateBrokerSpread(spread: string, t: (key: string) => string) {
  const spreadMatch = spread.match(/^from\s+(.+)\s+pips$/i);
  if (spreadMatch) {
    return `${t('from')} ${spreadMatch[1]} ${t('pips')}`;
  }

  return t(spread);
}
