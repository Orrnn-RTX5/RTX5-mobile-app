/**
 * Pure date / calendar helpers for the history filter calendar grid.
 */

export const PRESETS = [
  'All time',
  'Today',
  'Last week',
  'Last month',
  'Last 3 months',
  'Last 6 months',
  'Last year',
  'Custom',
];

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export type SelectionMode = 'range' | 'single' | 'week';

export function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

export function getFirstDayOfMonth(year: number, month: number) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1; // Monday-first
}

export function getWeekDates(date: Date): [Date, Date] {
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return [monday, sunday];
}

export function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Parses a calendar key as local time instead of UTC midnight. */
export function fromDateKey(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day
    ? date
    : null;
}

export function formatDate(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
}

export function formatLocalizedDate(d: Date, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
  } catch {
    return formatDate(d);
  }
}

export function formatMonthYear(year: number, month: number, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(year, month, 1));
  } catch {
    return `${MONTHS[month]} ${year}`;
  }
}

export function getWeekdayLabels(locale: string): string[] {
  try {
    const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    const monday = new Date(2021, 7, 2);
    return DAYS.map((_, offset) => {
      const day = new Date(monday);
      day.setDate(monday.getDate() + offset);
      return formatter.format(day);
    });
  } catch {
    return DAYS;
  }
}
