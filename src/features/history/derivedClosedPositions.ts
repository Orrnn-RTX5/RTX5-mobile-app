/**
 * Derives synthetic ClosedPosition records from the deals stream.
 *
 * Why: some broker backends (the orrnn demo broker is the case in point)
 * populate the deals table (entry_in / entry_out) the moment a trade is
 * closed, but lag — or never populate at all — the dedicated
 * `/positions/{login}/history` endpoint. By rebuilding closed positions
 * from the deals stream we guarantee the History tab still shows
 * freshly-closed trades even when the history endpoint is empty.
 *
 * For partial closes, each entry_out deal becomes a separate synthetic
 * record (matching the broker's per-execution view). The earliest
 * matching entry_in deal supplies the open price, side, and open time.
 */
import type { Deal } from '../../api/deals';
import type { ClosedPosition } from '../../api/positions';

const dealTimeAsc = (a: Deal, b: Deal): number =>
  (typeof a.time === 'number' ? a.time : 0) - (typeof b.time === 'number' ? b.time : 0);

const hasUsablePositionTicket = (deal: Deal): boolean =>
  typeof deal.position_ticket === 'number' && Number.isFinite(deal.position_ticket) && deal.position_ticket > 0;

export function deriveClosedPositionsFromDeals(deals: Deal[] | undefined | null): ClosedPosition[] {
  if (!Array.isArray(deals) || deals.length === 0) {
    return [];
  }

  const entryInDeals = deals.filter((deal) => deal.entry === 'entry_in');

  // Primary pairing key: position_ticket. Non-consuming (a single open backs
  // every partial close of the position), and the earliest entry_in wins so we
  // capture the original open price/side/time.
  const openByPosition = new Map<number, Deal>();
  for (const deal of entryInDeals) {
    if (!hasUsablePositionTicket(deal)) continue;
    const existing = openByPosition.get(deal.position_ticket);
    if (!existing || (typeof deal.time === 'number' && deal.time < existing.time)) {
      openByPosition.set(deal.position_ticket, deal);
    }
  }

  // Fallback pairing: per-symbol FIFO queues for opens that carry no usable
  // position_ticket. The orrnn demo backend omits position_ticket on every
  // deal (and leaves order_ticket = 0 on closes), so without this fallback all
  // opens collapsed under a single `undefined` key and one arbitrary
  // instrument's price (e.g. USDJPY 160.256) was stamped onto every closed
  // row regardless of symbol. FIFO within a symbol is the standard convention
  // when no position id links the open and close executions.
  const openQueueBySymbol = new Map<string, Deal[]>();
  for (const deal of entryInDeals.filter((d) => !hasUsablePositionTicket(d)).sort(dealTimeAsc)) {
    const queue = openQueueBySymbol.get(deal.symbol);
    if (queue) queue.push(deal);
    else openQueueBySymbol.set(deal.symbol, [deal]);
  }

  // Resolves the opening deal for a close, never accepting a cross-instrument
  // match (a GBPUSD close must not inherit a USDJPY open price).
  const resolveOpenDeal = (out: Deal): Deal | undefined => {
    if (hasUsablePositionTicket(out)) {
      const byTicket = openByPosition.get(out.position_ticket);
      if (byTicket && byTicket.symbol === out.symbol) return byTicket;
    }
    const queue = openQueueBySymbol.get(out.symbol);
    if (queue && queue.length > 0) return queue.shift();
    return undefined;
  };

  const synthesized: ClosedPosition[] = [];
  // Sort closes chronologically so the FIFO fallback pairs the earliest open
  // with the earliest close deterministically.
  for (const deal of deals.filter((d) => d.entry === 'entry_out').sort(dealTimeAsc)) {
    const open = resolveOpenDeal(deal);

    // The entry_in deal's action determines the position direction:
    //   entry_in deal_buy  → position is BUY
    //   entry_in deal_sell → position is SELL
    // If we don't have the matching entry_in (history truncated, etc.)
    // we infer the inverse from the entry_out deal: closing a BUY is
    // a deal_sell, closing a SELL is a deal_buy.
    const side: 'buy' | 'sell' = open
      ? (open.action === 'deal_sell' ? 'sell' : 'buy')
      : (deal.action === 'deal_sell' ? 'buy' : 'sell');

    // Prefer a real position_ticket for the synthetic record so it dedupes
    // against authoritative history records; fall back to the close deal's own
    // unique ticket when the backend supplies no position id.
    const ticket = hasUsablePositionTicket(deal)
      ? deal.position_ticket
      : (open && hasUsablePositionTicket(open) ? open.position_ticket : deal.ticket);

    // `fee` is propagated even though it is not in ClosedPosition's type —
    // resolveClosedPositionNetProfit() on the screen reads it via duck-typing,
    // so dropping it would understate Net P/L by the broker fee component.
    synthesized.push({
      ticket,
      account_login: deal.account_login,
      symbol: deal.symbol,
      side,
      volume: deal.volume,
      price_open: open?.price ?? 0,
      price_close: deal.price,
      profit: deal.profit,
      swap: deal.swap,
      commission: deal.commission,
      fee: deal.fee,
      comment: deal.comment?.trim() || undefined,
      time_create: open?.time ?? deal.time,
      time_update: deal.time,
      time_close: deal.time,
    } as ClosedPosition);
  }

  return synthesized;
}

/**
 * Normalises any positive Unix-style timestamp (seconds, milliseconds, or
 * microseconds) down to whole seconds. Backends sometimes return time_close
 * in ms while deals.time is in seconds — without this normalisation the
 * dedupe key would miss collisions and we'd double-count the same close.
 */
function normalizeTimestampToSeconds(value: unknown): number | null {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  if (num > 4.2e16) return Math.floor(num / 1_000_000_000); // nanoseconds
  if (num > 4.2e13) return Math.floor(num / 1_000_000);     // microseconds
  if (num > 4.2e10) return Math.floor(num / 1_000);          // milliseconds
  return Math.floor(num);                                    // seconds
}

/**
 * Builds a stable dedup key combining the position ticket with the close
 * time normalised to whole seconds. Partial closes on the same position
 * produce separate keys, which matches what the dedicated history endpoint
 * returns. Unit normalisation prevents ms-vs-seconds mismatches between
 * the two sources from leaking through as duplicate rows.
 */
function closedPositionDedupKey(record: ClosedPosition): string {
  const ticket = record.ticket ?? '';
  const rawCloseTime = record.time_close ?? record.time_update ?? '';
  const closeTime = normalizeTimestampToSeconds(rawCloseTime) ?? rawCloseTime;
  return `${ticket}|${closeTime}`;
}

/**
 * Merges authoritative closed-history records with deals-derived records.
 * History records win on collisions — the dedicated endpoint is the source
 * of truth when it does return data; the derived stream just fills the gap.
 */
export function mergeClosedPositionSources(
  historyRecords: ClosedPosition[],
  derivedRecords: ClosedPosition[],
): ClosedPosition[] {
  // Contract v3 deal rows carry no position_ticket, so a derived record is
  // usually keyed by its close-deal ticket and cannot match the history
  // record's position ticket. Merge on ticket where possible, otherwise on
  // the close execution itself: same symbol, same volume, close time within
  // one second.
  // A multiset: each history close can absorb at most one derived close, so
  // two same-size closes in the same second are not collapsed into one.
  const historyExecutionCounts = new Map<string, number>();
  for (const record of historyRecords) {
    const [exactKey] = closedPositionExecutionKeys(record);
    if (exactKey) {
      historyExecutionCounts.set(exactKey, (historyExecutionCounts.get(exactKey) ?? 0) + 1);
    }
  }
  const historyTicketKeys = new Set(historyRecords.map(closedPositionDedupKey));

  const byKey = new Map<string, ClosedPosition>();
  for (const record of derivedRecords) {
    const dedupKey = closedPositionDedupKey(record);
    const matchedKey = closedPositionExecutionKeys(record).find(
      (key) => (historyExecutionCounts.get(key) ?? 0) > 0,
    );
    if (matchedKey) {
      historyExecutionCounts.set(matchedKey, (historyExecutionCounts.get(matchedKey) ?? 0) - 1);
    }
    // Same ticket (history wins below) or same close execution: drop it.
    if (historyTicketKeys.has(dedupKey) || matchedKey) continue;
    byKey.set(dedupKey, record);
  }
  for (const record of historyRecords) {
    byKey.set(closedPositionDedupKey(record), record);
  }
  return Array.from(byKey.values());
}

/**
 * Execution identity keys for a close: the exact second first, then the
 * second before/after so a 1 s rounding difference still collides.
 */
function closedPositionExecutionKeys(record: ClosedPosition): string[] {
  const source = record as unknown as Record<string, unknown>;
  const symbol = typeof record.symbol === 'string' ? record.symbol.trim().toUpperCase() : '';
  const volume = Number(record.volume);
  const closeSeconds = normalizeTimestampToSeconds(
    source.time_close ?? source.time_update,
  );
  if (!symbol || !Number.isFinite(volume) || volume <= 0 || closeSeconds === null) {
    return [];
  }
  const volumeKey = volume.toFixed(8);
  return [closeSeconds, closeSeconds - 1, closeSeconds + 1].map(
    (seconds) => `${symbol}|${volumeKey}|${seconds}`,
  );
}
