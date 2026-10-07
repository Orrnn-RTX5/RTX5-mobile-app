type ResolvedHistoryDateRange = {
  fromMs: number | null;
  toMs: number | null;
};

type ClosedHistoryTimeRecord = {
  time_close?: number | string;
  timeClose?: number | string;
  close_time?: number | string;
  closeTime?: number | string;
  time_done?: number | string;
  timeDone?: number | string;
  closed_at?: number | string;
  time?: number | string;
  time_update?: number | string;
  timeUpdate?: number | string;
  updated_at?: number | string;
  time_create?: number | string;
  timeCreate?: number | string;
  open_time?: number | string;
  openTime?: number | string;
  time_open?: number | string;
  timeOpen?: number | string;
  created_at?: number | string;
};

function startOfDay(date: Date) {
  const next = new Date(date.getTime());
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date.getTime());
  next.setHours(23, 59, 59, 999);
  return next;
}

function resolvePresetHistoryDateRange(historyRange: string, now = new Date()): ResolvedHistoryDateRange | null {
  const end = endOfDay(now);
  const start = startOfDay(now);

  switch (historyRange) {
    case 'All time':
      return { fromMs: null, toMs: null };
    case 'Today':
      break;
    case 'Last week':
      start.setDate(start.getDate() - 7);
      break;
    case 'Last month':
      start.setMonth(start.getMonth() - 1);
      break;
    case 'Last 3 months':
      start.setMonth(start.getMonth() - 3);
      break;
    case 'Last 6 months':
      start.setMonth(start.getMonth() - 6);
      break;
    case 'Last year':
      start.setFullYear(start.getFullYear() - 1);
      break;
    default:
      return null;
  }

  return { fromMs: start.getTime(), toMs: end.getTime() };
}

export function resolveEffectiveHistoryDateRange(
  historyRange: string,
  historyFromMs: number | null,
  historyToMs: number | null,
  now = new Date(),
): ResolvedHistoryDateRange {
  if (historyFromMs != null || historyToMs != null) {
    return {
      fromMs: historyFromMs,
      toMs: historyToMs,
    };
  }

  return resolvePresetHistoryDateRange(historyRange, now) ?? { fromMs: null, toMs: null };
}

function coerceTimestampToMs(raw: unknown): number | null {
  // Accept seconds, milliseconds, microseconds, or ISO strings — the backend
  // for closed positions / deals / orders has historically returned each of
  // these. Without the auto-detect we silently drop every record whose
  // timestamp doesn't happen to be in the expected unit, which is what
  // produced "closed trades not showing in history".
  let numeric: number | null = null;

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    numeric = raw;
  } else if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber)) {
      numeric = asNumber;
    } else {
      // Replace dots with hyphens only if they appear in the date part (e.g. 2024.05.08)
      // This avoids replacing the decimal dot in milliseconds (e.g. 14:02:00.123)
      const normalizedIso = trimmed.replace(/^(\d{4})\.(\d{2})\.(\d{2})/, '$1-$2-$3').replace(' ', 'T');
      const parsedDate = Date.parse(normalizedIso);
      return Number.isFinite(parsedDate) ? parsedDate : null;
    }
  }

  if (numeric === null || numeric <= 0) return null;

  // Magnitude detection (same convention used elsewhere in the codebase):
  //   > 4.2e16 → nanoseconds
  //   > 4.2e13 → microseconds
  //   > 4.2e10 → milliseconds
  //   else      → seconds
  if (numeric > 4.2e16) return Math.floor(numeric / 1_000_000);
  if (numeric > 4.2e13) return Math.floor(numeric / 1_000);
  if (numeric > 4.2e10) return Math.floor(numeric);
  return Math.floor(numeric * 1000);
}

function resolveClosedRecordTimeMs(record: ClosedHistoryTimeRecord): number | null {
  return (
    coerceTimestampToMs(record.time_close) ??
    coerceTimestampToMs(record.timeClose) ??
    coerceTimestampToMs(record.close_time) ??
    coerceTimestampToMs(record.closeTime) ??
    coerceTimestampToMs(record.time_done) ??
    coerceTimestampToMs(record.timeDone) ??
    coerceTimestampToMs(record.closed_at) ??
    coerceTimestampToMs(record.time) ??
    coerceTimestampToMs(record.time_update) ??
    coerceTimestampToMs(record.timeUpdate) ??
    coerceTimestampToMs(record.updated_at) ??
    coerceTimestampToMs(record.time_create) ??
    coerceTimestampToMs(record.timeCreate) ??
    coerceTimestampToMs(record.open_time) ??
    coerceTimestampToMs(record.openTime) ??
    coerceTimestampToMs(record.time_open) ??
    coerceTimestampToMs(record.timeOpen) ??
    coerceTimestampToMs(record.created_at)
  );
}

export function filterClosedRecordsByDateRange<T extends ClosedHistoryTimeRecord>(
  records: T[],
  fromMs: number | null,
  toMs: number | null,
): T[] {
  if (fromMs == null && toMs == null) {
    return records;
  }

  return records.filter((record) => {
    const recordTimeMs = resolveClosedRecordTimeMs(record);

    if (recordTimeMs == null) {
      return false;
    }
    if (fromMs != null && recordTimeMs < fromMs) {
      return false;
    }
    if (toMs != null && recordTimeMs > toMs) {
      return false;
    }

    return true;
  });
}
