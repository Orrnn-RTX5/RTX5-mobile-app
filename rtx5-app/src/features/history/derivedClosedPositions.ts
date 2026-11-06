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
import { readBackendNumber } from '../../utils/accountCurrency';

const dealTimeAsc = (a: Deal, b: Deal): number =>
  (typeof a.time === 'number' ? a.time : 0) - (typeof b.time === 'number' ? b.time : 0);

const hasUsablePositionTicket = (deal: Deal): deal is Deal & { position_ticket: number } =>
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
  // the close execution itself (same symbol, same volume, close time within
  // one second) or the opening execution identity (same symbol, side, volume,
  // open price, and open time within one second).
  // Each history close can absorb at most one derived close, so two same-size
  // closes in the same second are not collapsed into one.
  const historyPool = historyRecords.map((record) => {
    const [execKey] = closedPositionExecutionKeys(record);
    const [openKey] = closedPositionOpeningKeys(record);
    return {
      dedupKey: closedPositionDedupKey(record),
      execKey,
      openKey,
      consumed: false,
    };
  });
  const historyTicketKeys = new Set(historyPool.map((item) => item.dedupKey));

  const byKey = new Map<string, ClosedPosition>();
  for (const record of derivedRecords) {
    const dedupKey = closedPositionDedupKey(record);
    const execKeys = new Set(closedPositionExecutionKeys(record));
    const openKeys = new Set(closedPositionOpeningKeys(record));
    const matchedEntry = historyPool.find(
      (item) =>
        !item.consumed &&
        (item.dedupKey === dedupKey ||
          (item.execKey !== undefined && execKeys.has(item.execKey)) ||
          (item.openKey !== undefined && openKeys.has(item.openKey))),
    );
    if (matchedEntry) {
      matchedEntry.consumed = true;
    }
    // Same ticket (history wins below) or same execution: drop it.
    if (historyTicketKeys.has(dedupKey) || matchedEntry) continue;
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

/**
 * Opening identity keys for a closed position so optimistic session-retained
 * closes reconcile cleanly once broker deal/history rows arrive with server
 * close timestamps.
 */
function closedPositionOpeningKeys(record: ClosedPosition): string[] {
  const source = record as unknown as Record<string, unknown>;
  const symbol = typeof record.symbol === 'string' ? record.symbol.trim().toUpperCase() : '';
  const side = record.side === 'buy' || record.side === 'sell' ? record.side : '';
  const volume = Number(record.volume);
  const openPrice = Number(source.price_open);
  const openSeconds = normalizeTimestampToSeconds(source.time_create);
  if (
    !symbol ||
    !side ||
    !Number.isFinite(volume) ||
    volume <= 0 ||
    !Number.isFinite(openPrice) ||
    openPrice <= 0 ||
    openSeconds === null
  ) {
    return [];
  }
  const volumeKey = volume.toFixed(8);
  const openPriceKey = openPrice.toFixed(8);
  return [openSeconds, openSeconds - 1, openSeconds + 1].map(
    (seconds) => `open:${symbol}|${side}|${volumeKey}|${openPriceKey}|${seconds}`,
  );
}

export interface CollapsedClosedPosition extends ClosedPosition {
  positionId: string;
  openPrice: number;
  closePrice: number;
  openTime: number;
  closeTime: number;
  fee: number;
  netProfit: number;
}

const isEntryInDeal = (deal: any): boolean => {
  const entry = String(deal?.entry ?? '')
    .trim()
    .toLowerCase();
  if (entry === 'entry_in' || entry === 'in' || entry === '0' || deal?.entry === 0) {
    return true;
  }
  return false;
};

const isEntryOutDeal = (deal: any): boolean => {
  const entry = String(deal?.entry ?? '')
    .trim()
    .toLowerCase();
  return (
    entry === 'entry_out' ||
    entry === 'entry_inout' ||
    entry === 'entry_out_by' ||
    entry === 'out' ||
    entry === 'inout' ||
    entry === 'out_by' ||
    entry === '1' ||
    entry === '2' ||
    entry === '3' ||
    deal?.entry === 1 ||
    deal?.entry === 2 ||
    deal?.entry === 3
  );
};

const resolveDealPositionGroupId = (deal: any): string | null => {
  const raw =
    deal?.position_id ??
    deal?.positionId ??
    deal?.position ??
    deal?.position_ticket ??
    deal?.order;
  if (raw === null || raw === undefined) return null;
  const num = Number(raw);
  if (Number.isFinite(num) && num <= 0) return null;
  const text = String(raw).trim();
  return text ? text : null;
};

const isSellAction = (action: unknown): boolean => {
  const raw = String(action ?? '')
    .trim()
    .toLowerCase();
  return raw === 'deal_sell' || raw === 'sell' || raw === '1' || action === 1;
};

export function collapseDealHistory(deals: readonly any[] | null | undefined): CollapsedClosedPosition[] {
  if (!Array.isArray(deals) || deals.length === 0) {
    return [];
  }

  const tradingDeals = deals
    .filter((d) => {
      if (!d || typeof d !== 'object') return false;
      const vol = readBackendNumber(d.volume ?? d.volume_lots ?? d.quantity);
      if (vol === undefined || vol <= 0) return false;
      const sym = String(d.symbol ?? '').trim();
      if (!sym) return false;
      return isEntryInDeal(d) || isEntryOutDeal(d);
    })
    .slice()
    .sort(
      (a, b) =>
        (readBackendNumber(a.time ?? a.timestamp) ?? 0) -
        (readBackendNumber(b.time ?? b.timestamp) ?? 0),
    );

  type PositionGroup = {
    positionId: string;
    symbol: string;
    accountLogin: number;
    entries: any[];
    exits: any[];
  };

  const groupsByKey = new Map<string, PositionGroup>();
  const fifoOpenQueueBySymbol = new Map<string, any[]>();
  const fifoGroups: PositionGroup[] = [];

  for (const deal of tradingDeals) {
    const symbol = String(deal.symbol ?? '').trim();
    const posId = resolveDealPositionGroupId(deal);
    if (posId !== null) {
      const groupKey = `${symbol}|${posId}`;
      let group = groupsByKey.get(groupKey);
      if (!group) {
        group = {
          positionId: posId,
          symbol,
          accountLogin: readBackendNumber(deal.account_login ?? deal.login) ?? 0,
          entries: [],
          exits: [],
        };
        groupsByKey.set(groupKey, group);
      }
      if (isEntryInDeal(deal)) {
        group.entries.push(deal);
      } else if (isEntryOutDeal(deal)) {
        group.exits.push(deal);
      }
    } else {
      if (isEntryInDeal(deal)) {
        const q = fifoOpenQueueBySymbol.get(symbol);
        if (q) q.push(deal);
        else fifoOpenQueueBySymbol.set(symbol, [deal]);
      } else if (isEntryOutDeal(deal)) {
        const q = fifoOpenQueueBySymbol.get(symbol);
        const matchedOpen = q && q.length > 0 ? q.shift() : undefined;
        const fallbackId = String(
          deal.ticket ?? deal.deal ?? deal.id ?? matchedOpen?.ticket ?? fifoGroups.length + 1,
        );
        fifoGroups.push({
          positionId: fallbackId,
          symbol,
          accountLogin: readBackendNumber(deal.account_login ?? deal.login) ?? 0,
          entries: matchedOpen ? [matchedOpen] : [],
          exits: [deal],
        });
      }
    }
  }

  const allGroups = [...groupsByKey.values(), ...fifoGroups];
  const collapsed: CollapsedClosedPosition[] = [];

  for (const group of allGroups) {
    if (group.exits.length === 0) {
      continue;
    }

    let entryVolSum = 0;
    let entryWeightedPriceSum = 0;
    let exitVolSum = 0;
    let exitWeightedPriceSum = 0;
    let profitSum = 0;
    let commissionSum = 0;
    let swapSum = 0;
    let feeSum = 0;

    for (const entry of group.entries) {
      const vol = readBackendNumber(entry.volume ?? entry.volume_lots ?? entry.quantity) ?? 0;
      const price = readBackendNumber(entry.price ?? entry.open_price ?? entry.openPrice) ?? 0;
      if (vol > 0 && price > 0) {
        entryVolSum += vol;
        entryWeightedPriceSum += price * vol;
      }
      profitSum += readBackendNumber(entry.profit) ?? 0;
      commissionSum += readBackendNumber(entry.commission) ?? 0;
      swapSum += readBackendNumber(entry.swap ?? entry.storage) ?? 0;
      feeSum += readBackendNumber(entry.fee) ?? 0;
    }

    for (const exit of group.exits) {
      const vol = readBackendNumber(exit.volume ?? exit.volume_lots ?? exit.quantity) ?? 0;
      const price = readBackendNumber(exit.price ?? exit.close_price ?? exit.closePrice) ?? 0;
      if (vol > 0 && price > 0) {
        exitVolSum += vol;
        exitWeightedPriceSum += price * vol;
      }
      profitSum += readBackendNumber(exit.profit) ?? 0;
      commissionSum += readBackendNumber(exit.commission) ?? 0;
      swapSum += readBackendNumber(exit.swap ?? exit.storage) ?? 0;
      feeSum += readBackendNumber(exit.fee) ?? 0;
    }

    const openPrice = entryVolSum > 0 ? entryWeightedPriceSum / entryVolSum : 0;
    const closePrice = exitVolSum > 0 ? exitWeightedPriceSum / exitVolSum : 0;
    const volume = exitVolSum > 0 ? exitVolSum : entryVolSum;

    const firstEntry = group.entries[0];
    const firstExit = group.exits[0];
    const lastExit = group.exits[group.exits.length - 1];
    const side: 'buy' | 'sell' = firstEntry
      ? isSellAction(firstEntry.action ?? firstEntry.type)
        ? 'sell'
        : 'buy'
      : isSellAction(firstExit.action ?? firstExit.type)
        ? 'buy'
        : 'sell';

    const openTime =
      readBackendNumber(firstEntry?.time ?? firstEntry?.timestamp) ??
      readBackendNumber(firstExit?.time ?? firstExit?.timestamp) ??
      0;
    const closeTime =
      readBackendNumber(lastExit?.time ?? lastExit?.timestamp) ?? openTime;
    const numericTicket = Number(group.positionId);
    const ticket = Number.isFinite(numericTicket) && numericTicket > 0 ? numericTicket : 0;

    collapsed.push({
      ticket,
      positionId: group.positionId,
      account_login: group.accountLogin,
      symbol: group.symbol,
      side,
      volume,
      openPrice,
      closePrice,
      price_open: openPrice,
      price_close: closePrice,
      profit: profitSum,
      swap: swapSum,
      commission: commissionSum,
      fee: feeSum,
      netProfit: profitSum + commissionSum + swapSum + feeSum,
      time_create: openTime,
      time_update: closeTime,
      time_close: closeTime,
      openTime,
      closeTime,
      comment: String(lastExit?.comment ?? firstEntry?.comment ?? '').trim() || undefined,
    });
  }

  return collapsed;
}

export function resolveClosedPositionsHistory(
  dealHistory: readonly any[] | null | undefined,
  fallbackPositionsHistory: readonly ClosedPosition[] | null | undefined,
): ClosedPosition[] {
  if (Array.isArray(dealHistory) && dealHistory.length > 0) {
    return collapseDealHistory(dealHistory);
  }
  return Array.isArray(fallbackPositionsHistory) ? [...fallbackPositionsHistory] : [];
}
