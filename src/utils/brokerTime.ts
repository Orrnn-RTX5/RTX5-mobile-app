export const BROKER_TIMEZONE_OFFSET_HOURS = 5.5; // UTC+5:30

/**
 * Converts any date representation into a formatted Broker Time string (YYYY-MM-DD HH:mm:ss)
 */
export function formatBrokerTime(dateParam: string | number | Date): string {
  let d: Date;
  if (typeof dateParam === 'number') {
    // Auto-detect unit so a backend that returns ms doesn't get blown up
    // into year 55000 (which is what the previous unconditional `* 1000`
    // produced for ms timestamps).
    if (!Number.isFinite(dateParam) || dateParam <= 0) return '--';
    let ms: number;
    if (dateParam > 4.2e16) ms = Math.floor(dateParam / 1_000_000);
    else if (dateParam > 4.2e13) ms = Math.floor(dateParam / 1_000);
    else if (dateParam > 4.2e10) ms = Math.floor(dateParam);
    else ms = Math.floor(dateParam * 1000);
    d = new Date(ms);
  } else {
    d = new Date(dateParam);
  }
  if (isNaN(d.getTime())) return '--';

  // Shift the underlying UTC time by the broker's offset so toISOString captures it locally
  const offsetMs = BROKER_TIMEZONE_OFFSET_HOURS * 60 * 60 * 1000;
  const shifted = new Date(d.getTime() + offsetMs);

  // return formatted without 'Z' since it's now manually shifted to broker time
  return shifted.toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * Returns a new Date object representing the current Broker Time
 */
export function getBrokerTimeDate(): Date {
  const now = new Date();
  const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
  const offsetMs = BROKER_TIMEZONE_OFFSET_HOURS * 60 * 60 * 1000;
  return new Date(utcMs + offsetMs);
}
