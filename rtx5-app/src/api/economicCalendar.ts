import { timedFetch } from '../utils/apiLatency';
export type ImpactLevel = 'high' | 'medium' | 'low' | 'holiday';

export interface EconomicEvent {
  id: string;
  time: string;
  currency: string;
  country: string;
  countryFlag: string;
  title: string;
  impact: ImpactLevel;
  actual?: string;
  forecast?: string;
  previous?: string;
  isAllDay?: boolean;
  /** ISO date string from the API for proper date grouping */
  date?: string;
}

// ── Currency → Country mapping ──────────────────────────────────────
const CURRENCY_TO_COUNTRY: Record<string, string> = {
  USD: 'United States',
  EUR: 'Eurozone',
  GBP: 'United Kingdom',
  JPY: 'Japan',
  AUD: 'Australia',
  CAD: 'Canada',
  CHF: 'Switzerland',
  NZD: 'New Zealand',
  CNY: 'China',
  All: 'Global',
};

// ── Impact string → typed level ─────────────────────────────────────
function parseImpact(raw: string): ImpactLevel {
  const lower = raw.toLowerCase();
  if (lower === 'high') return 'high';
  if (lower === 'medium') return 'medium';
  if (lower === 'low') return 'low';
  if (lower === 'holiday') return 'holiday';
  return 'low';
}

// ── Raw shape from the API ──────────────────────────────────────────
interface RawCalendarEvent {
  title: string;
  country: string;
  date: string;
  impact: string;
  forecast: string;
  previous: string;
  actual?: string;
}

// ── API endpoint ────────────────────────────────────────────────────
const API_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';

// ── In-memory cache ─────────────────────────────────────────────────
let _cachedEvents: EconomicEvent[] | null = null;
let _cacheTimestamp = 0;
let _pendingEvents: Promise<EconomicEvent[]> | null = null;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

function mapRawToEvents(raw: RawCalendarEvent[]): EconomicEvent[] {
  return raw.map((item, index) => {
    const impact = parseImpact(item.impact);
    const d = new Date(item.date);
    const hours = d.getUTCHours().toString().padStart(2, '0');
    const mins = d.getUTCMinutes().toString().padStart(2, '0');
    const timeStr = `${hours}:${mins}`;

    const isHoliday = impact === 'holiday';
    const currency = item.country || '';
    const country = CURRENCY_TO_COUNTRY[currency] || currency;

    return {
      id: `ec-${index}-${d.getTime()}`,
      time: isHoliday ? '' : timeStr,
      currency,
      country,
      countryFlag: '',
      title: item.title,
      impact,
      actual: item.actual && item.actual !== '' ? item.actual : undefined,
      forecast: item.forecast && item.forecast !== '' ? item.forecast : undefined,
      previous: item.previous && item.previous !== '' ? item.previous : undefined,
      isAllDay: isHoliday,
      date: item.date,
    };
  });
}
/**
 * Fetches real economic calendar data from FairEconomy feed.
 * Rejects on failure so callers can disclose unavailable or stale data.
 * Implements in-memory caching to avoid rate limits.
 */
export async function fetchEconomicCalendarData(): Promise<EconomicEvent[]> {
  // Return cache if still fresh
  if (_cachedEvents && Date.now() - _cacheTimestamp < CACHE_TTL) {
    return _cachedEvents;
  }

  // The retained prewarm and a newly focused screen may request the same feed
  // together. Share parsing and network work as well as the completed cache.
  if (_pendingEvents) return _pendingEvents;
  const pending = loadEconomicCalendarData();
  _pendingEvents = pending;
  try {
    return await pending;
  } finally {
    if (_pendingEvents === pending) _pendingEvents = null;
  }
}

async function loadEconomicCalendarData(): Promise<EconomicEvent[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {

    const response = await timedFetch(API_URL, { signal: controller.signal }, { label: 'economicCalendar.feed', source: 'unknown', timeoutMs: 8000 });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const raw: RawCalendarEvent[] = await response.json();
    if (!Array.isArray(raw) || raw.some(item => !item || typeof item.title !== 'string' || typeof item.country !== 'string' || typeof item.impact !== 'string' || !Number.isFinite(Date.parse(item.date)))) {
      throw new Error('Invalid calendar response');
    }

    const events = mapRawToEvents(raw);
    _cachedEvents = events;
    _cacheTimestamp = Date.now();
    return events;
  } finally {
    // Cover fetch rejection and body parsing too, not only response headers.
    clearTimeout(timeoutId);
  }
}

/** Only previously verified feed data may seed the screen. */
export function getInitialEconomicCalendarData(): EconomicEvent[] {
  return _cachedEvents ?? [];
}
export function getEconomicCalendarCacheTime(): number | null {
  return _cacheTimestamp || null;
}
