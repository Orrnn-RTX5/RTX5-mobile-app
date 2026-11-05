/**
 * Format validation for user-entered contact fields (demo registration, etc.).
 * Kept deliberately practical: the goal is catching typos and garbage input,
 * not RFC-perfect parsing — the backend remains the final authority.
 */

// One non-space local part, one "@", a domain with at least one dot and a
// 2+ char top-level label. Rejects spaces, double "@", and missing TLDs.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const EMAIL_MAX_LENGTH = 254;

export function isValidEmail(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= EMAIL_MAX_LENGTH && EMAIL_PATTERN.test(trimmed);
}

// E.164 allows up to 15 digits; require at least 7 so obvious junk like "123"
// is rejected. Common separators users type — spaces, dashes, dots,
// parentheses — are ignored; one optional leading "+" is allowed.
const PHONE_MIN_DIGITS = 7;
const PHONE_MAX_DIGITS = 15;

export function isValidPhoneNumber(value: string): boolean {
  const normalized = value.trim().replace(/[\s\-().]/g, '');
  if (!normalized) {
    return false;
  }

  const digits = normalized.startsWith('+') ? normalized.slice(1) : normalized;
  return (
    /^\d+$/.test(digits) &&
    digits.length >= PHONE_MIN_DIGITS &&
    digits.length <= PHONE_MAX_DIGITS
  );
}
