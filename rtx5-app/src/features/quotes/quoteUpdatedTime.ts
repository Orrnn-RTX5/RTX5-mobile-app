import { normalizeQuoteTickTimestampToMs } from '../../api/ws/quoteTimestamp';
import { formatBrokerTime } from '../../utils/brokerTime';

/** Latest server-supplied quote time; client receive/freshness clocks are excluded. */
export function formatQuoteUpdatedTime(quotes: ReadonlyArray<{ feedTickAt?: unknown } | undefined>): string {
  let latest: number | null = null;
  for (const quote of quotes) {
    const timestamp = normalizeQuoteTickTimestampToMs(quote?.feedTickAt);
    if (timestamp !== null && Number.isFinite(new Date(timestamp).getTime())) {
      latest = latest === null ? timestamp : Math.max(latest, timestamp);
    }
  }
  return latest === null ? '--' : formatBrokerTime(latest).slice(11, 19);
}
