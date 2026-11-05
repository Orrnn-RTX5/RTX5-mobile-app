import { normalizeTimeframeStrict } from '../../domain/candles/core/candles';
export const candleChannel = (symbol: string, timeframe: string) => `candles.${symbol}.${normalizeTimeframeStrict(timeframe)}`;
export function acknowledgedChannels(payload: any): string[] {
  if (!['subscribed', 'subscribe_ack', 'ack'].includes(payload?.type ?? payload?.action) || payload?.success === false || payload?.error) return [];
  return Array.isArray(payload.channels) ? payload.channels.filter((channel: unknown) => typeof channel === 'string') : typeof payload.channel === 'string' ? [payload.channel] : [];
}
export function quoteAcknowledgment(payload: any): { accepted: string[]; rejected: string[] } | null {
  if (!['subscribed', 'subscribe_ack', 'subscription_ack'].includes(payload?.type)) return null;
  const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  return { accepted: strings(payload.accepted ?? payload.subscribed ?? payload.symbols), rejected: strings(payload.rejected ?? payload.invalid_symbols) };
}
