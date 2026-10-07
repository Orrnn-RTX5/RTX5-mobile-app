import type { ClosedPosition } from '../../../api/positions';
import type { TradeJournalEntry } from './types';

function normalizeHistoryTimestampSeconds(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  if (numeric > 4.2e16) return Math.floor(numeric / 1_000_000_000);
  if (numeric > 4.2e13) return Math.floor(numeric / 1_000_000);
  if (numeric > 4.2e10) return Math.floor(numeric / 1_000);
  return Math.floor(numeric);
}

export function filterClosedHistoryByRange(
  records: ClosedPosition[],
  from: number,
  to: number,
): ClosedPosition[] {
  return records.filter((record) => {
    const closedAt = normalizeHistoryTimestampSeconds(record.time_close ?? record.time_update);
    return closedAt == null || (closedAt >= from && closedAt < to);
  });
}

export function advanceJournalSelectionForToday(
  selectedDateIso: string,
  previousTodayDateIso: string,
  todayDateIso: string,
): string {
  return selectedDateIso === previousTodayDateIso || selectedDateIso > todayDateIso
    ? todayDateIso
    : selectedDateIso;
}

export function getJournalEntryTime(entry: TradeJournalEntry): number {
  const dateMs = Date.parse(entry.date);
  if (Number.isFinite(dateMs)) {
    return dateMs;
  }

  const createdMs = Date.parse(entry.createdAt);
  return Number.isFinite(createdMs) ? createdMs : 0;
}

export function getJournalDayStartMs(nowMs = Date.now()): number {
  const dayStart = new Date(nowMs);
  dayStart.setHours(0, 0, 0, 0);
  return dayStart.getTime();
}

export function getJournalNextDayStartMs(nowMs = Date.now()): number {
  const nextDayStart = new Date(nowMs);
  nextDayStart.setHours(24, 0, 0, 0);
  return nextDayStart.getTime();
}

export function isJournalEntryWithinRetention(
  entry: TradeJournalEntry,
  nowMs = Date.now(),
): boolean {
  const entryTime = getJournalEntryTime(entry);
  return entryTime >= getJournalDayStartMs(nowMs) && entryTime < getJournalNextDayStartMs(nowMs);
}

export function filterJournalEntriesByRetention(
  entries: TradeJournalEntry[],
  nowMs = Date.now(),
): TradeJournalEntry[] {
  return entries.filter((entry) => isJournalEntryWithinRetention(entry, nowMs));
}
