const pad = (value: number) => String(value).padStart(2, '0');

export function formatPendingExpiryDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatPendingExpiryTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function pendingExpiryWithLocalDate(current: Date, text: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const next = new Date(current);
  next.setFullYear(year, month - 1, day);
  next.setSeconds(0, 0);
  return Number.isFinite(next.getTime()) && next.getFullYear() === year && next.getMonth() === month - 1 && next.getDate() === day ? next : null;
}

export function pendingExpiryWithLocalTime(current: Date, text: string): Date | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!match) return null;
  const hours = Number(match[1]), minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  const next = new Date(current);
  next.setHours(hours, minutes, 0, 0);
  return Number.isFinite(next.getTime()) && next.getHours() === hours && next.getMinutes() === minutes ? next : null;
}
