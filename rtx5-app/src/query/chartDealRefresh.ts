import type { DealHistoryResult } from '../api/deals';
export function getChartDealsRefreshFrom(previous: DealHistoryResult | undefined, now = Date.now()): number | undefined {
  if (!previous?.complete || !previous.deals.length || now - previous.fullFetchedAt >= 300_000) return undefined;
  const latest = previous.deals.reduce((time, deal) => Math.max(time, deal.time > 1e11 ? deal.time / 1000 : deal.time), 0);
  return Math.max(0, Math.floor(latest) - 60);
}
export function mergeChartDealHistory(previous: DealHistoryResult, incoming: DealHistoryResult): DealHistoryResult {
  const merged = new Map(previous.deals.map(deal => [deal.ticket, deal]));
  incoming.deals.forEach(deal => merged.set(deal.ticket, deal));
  const deals = [...merged.values()];
  if (deals.length > 50_000) return { ...previous, deals: deals.sort((a,b) => b.time-a.time).slice(0,50_000), complete: false, reason: 'page-limit' };
  return { ...previous, deals, complete: previous.complete && incoming.complete, reason: incoming.reason ?? previous.reason };
}
