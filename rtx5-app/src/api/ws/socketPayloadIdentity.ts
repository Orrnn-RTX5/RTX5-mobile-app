import type { ActiveBrokerSessionIdentity } from '../../state/activeBrokerSession';

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const clean = (value: unknown): string => String(value ?? '').trim();
const cleanBroker = (value: unknown): string => clean(value).toLowerCase();

const sameAccountLogin = (left: unknown, right: unknown): boolean => {
  const leftText = clean(left);
  const rightText = clean(right);
  if (leftText === rightText) return true;
  if (!/^\d+$/.test(leftText) || !/^\d+$/.test(rightText)) return false;
  const leftNumber = Number(leftText);
  const rightNumber = Number(rightText);
  return Number.isSafeInteger(leftNumber) && leftNumber === rightNumber;
};

const ACCOUNT_SCOPED_CHANNELS = new Set([
  'account',
  'metrics',
  'positions',
  'orders',
  'deals',
  'history',
]);

const explicitValue = (
  records: readonly Record<string, unknown>[],
  keys: readonly string[],
): unknown => {
  for (const record of records) {
    for (const key of keys) {
      if (record[key] !== undefined && record[key] !== null && record[key] !== '') {
        return record[key];
      }
    }
  }
  return undefined;
};

/**
 * Rejects explicit cross-broker/account/epoch payloads while allowing protocols
 * that omit identity fields and rely on their already-captured socket session.
 */
export const payloadMatchesSocketIdentity = (
  payload: unknown,
  identity: ActiveBrokerSessionIdentity,
): boolean => {
  const outer = asRecord(payload);
  if (!outer) return false;
  const first = [
    outer,
    asRecord(outer.data),
    asRecord(outer.payload),
    asRecord(outer.result),
  ].filter((record): record is Record<string, unknown> => Boolean(record));
  // Contract v3 trade frames nest the row one level deeper:
  // `{channel, data:{event_id, type, data:{ticket, account_login, broker_id, ...}}}`.
  const records = [
    ...first,
    ...first.slice(1).map((record) => asRecord(record.data)),
  ].filter((record): record is Record<string, unknown> => Boolean(record));

  const brokerId = explicitValue(records, ['broker_id', 'brokerId']);
  if (brokerId !== undefined && cleanBroker(brokerId) !== cleanBroker(identity.brokerId)) {
    return false;
  }
  const accountLogin = explicitValue(records, ['account_login', 'accountLogin', 'login']);
  // `account_login` is a JSON number on the wire; compare numerically when both
  // sides are numeric so `200074`, `"200074"` and `"0200074"` agree.
  if (accountLogin !== undefined && !sameAccountLogin(accountLogin, identity.accountLogin)) {
    return false;
  }
  const epoch = explicitValue(records, ['session_epoch', 'sessionEpoch']);
  if (epoch !== undefined && Number(epoch) !== identity.sessionEpoch) {
    return false;
  }

  const channel = clean(outer.channel ?? outer.topic);
  if (channel) {
    const separator = channel.indexOf('.');
    if (separator > 0) {
      const prefix = channel.slice(0, separator).toLowerCase();
      const scopedLogin = channel.slice(separator + 1);
      if (ACCOUNT_SCOPED_CHANNELS.has(prefix) && !sameAccountLogin(scopedLogin, identity.accountLogin)) {
        return false;
      }
    }
  }
  return true;
};
