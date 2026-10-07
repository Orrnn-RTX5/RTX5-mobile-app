import { GDark } from '../../../ui/theme/glass';
import { Ionicons } from '@expo/vector-icons';
import type { EconomicEvent, ImpactLevel } from '../../../dev/mock/calendarData';

export const DATE_TABS = ['Today', 'Tomorrow', 'This Week'];
export const IMPACT_FILTERS: ImpactLevel[] = ['high', 'medium', 'low'];
export const CURRENCY_FILTERS = ['All', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'NZD'];

export const IMPACT_CONFIG: Record<ImpactLevel, { color: string; gradient: [string, string]; label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  high: { color: '#EF4444', gradient: ['#EF4444', '#DC2626'], label: 'High', icon: 'flame' },
  medium: { color: '#F59E0B', gradient: ['#F59E0B', '#D97706'], label: 'Medium', icon: 'alert-circle' },
  low: { color: '#10B981', gradient: ['#10B981', '#059669'], label: 'Low', icon: 'information-circle' },
  holiday: { color: '#8B5CF6', gradient: ['#8B5CF6', '#7C3AED'], label: 'Holiday', icon: 'calendar' },
};

export const COUNTRY_COLORS: Record<string, { bg: string; text: string; abbr: string }> = {
  'China': { bg: '#DC262620', text: '#DC2626', abbr: 'CN' },
  'Australia': { bg: '#1D4ED820', text: '#3B82F6', abbr: 'AU' },
  'Germany': { bg: '#F59E0B20', text: '#F59E0B', abbr: 'DE' },
  'United Kingdom': { bg: '#1D4ED820', text: '#60A5FA', abbr: 'UK' },
  'Eurozone': { bg: '#2563EB20', text: '#3B82F6', abbr: 'EU' },
  'United States': { bg: '#1E40AF20', text: '#3B82F6', abbr: 'US' },
  'Japan': { bg: '#DC262620', text: '#EF4444', abbr: 'JP' },
  'Canada': { bg: '#DC262620', text: '#EF4444', abbr: 'CA' },
  'France': { bg: '#2563EB20', text: '#3B82F6', abbr: 'FR' },
  'Switzerland': { bg: '#DC262620', text: '#DC2626', abbr: 'CH' },
  'New Zealand': { bg: '#1E40AF20', text: '#2563EB', abbr: 'NZ' },
};

export const DEFAULT_COUNTRY_COLOR = { bg: '#64748B20', text: '#64748B', abbr: '??' };

export function parseAndDiff(valA?: string, valB?: string, positiveColor = GDark.trading.profit) {
  if (!valA || valA === '—' || !valB || valB === '—') return null;
  const numA = parseFloat(valA.replace(/[^0-9.-]/g, ''));
  const numB = parseFloat(valB.replace(/[^0-9.-]/g, ''));
  if (isNaN(numA) || isNaN(numB)) return null;
  const diff = numA - numB;
  if (Math.abs(diff) < 0.0001) return null;
  const hasPct = valA.includes('%');
  const hasK = valA.includes('K');
  const hasM = valA.includes('M');
  const hasB = valA.includes('B');
  const suffix = hasPct ? '%' : hasK ? 'K' : hasM ? 'M' : hasB ? 'B' : '';
  const isPositive = diff > 0;
  const sign = isPositive ? '+' : '';
  const diffStr = sign + (diff).toFixed(hasPct ? 2 : 1) + suffix;
  return {
    text: diffStr,
    color: isPositive ? positiveColor : '#F87171',
    symbol: isPositive ? '▲' : '▼',
  };
}

export function getDateLabel(dayOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
}

export function getShortDate(dayOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export function formatDateLabel(d: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${days[d.getDay()]}, ${months[d.getMonth()]} ${d.getDate()}`;
}

export function formatShortDate(d: Date): string {
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getEventsForTab(tab: string, eventsList: EconomicEvent[]): { date: string; shortDate: string; events: EconomicEvent[]; dayOffset: number }[] {
  const now = new Date();
  const todayKey = toDateKey(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = toDateKey(tomorrow);

  const grouped = new Map<string, { d: Date; events: EconomicEvent[] }>();
  for (const ev of eventsList) {
    const evDate = ev.date ? new Date(ev.date) : now;
    const key = toDateKey(evDate);
    if (!grouped.has(key)) {
      grouped.set(key, { d: evDate, events: [] });
    }
    grouped.get(key)!.events.push(ev);
  }

  for (const group of grouped.values()) {
    group.events.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  }

  const sortedKeys = [...grouped.keys()].sort();

  if (tab === 'Today') {
    const g = grouped.get(todayKey);
    if (!g) return [];
    return [{ date: formatDateLabel(g.d), shortDate: formatShortDate(g.d), events: g.events, dayOffset: 0 }];
  } else if (tab === 'Tomorrow') {
    const g = grouped.get(tomorrowKey);
    if (!g) return [];
    return [{ date: formatDateLabel(g.d), shortDate: formatShortDate(g.d), events: g.events, dayOffset: 1 }];
  } else {
    return sortedKeys.map((key, i) => {
      const g = grouped.get(key)!;
      return { date: formatDateLabel(g.d), shortDate: formatShortDate(g.d), events: g.events, dayOffset: i };
    });
  }
}
