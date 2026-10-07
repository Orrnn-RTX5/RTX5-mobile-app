import { isPublicBrokerContextCurrent, type PublicBrokerContext } from '../state/publicBrokerContext';
import { timedFetch } from '../utils/apiLatency';

export type GuestSession = Readonly<{
  accessToken: string; refreshToken: string; expiresAt: string; accountLogin: string;
  brokerId: string; investor: boolean; metadata: Record<string, unknown>;
}>;
export class GuestAuthError extends Error {
  constructor(message: string, public status = 0, public code = '', public retryAt = 0, public ambiguous = false) { super(message); }
}
export const positiveAccountLogin = (value: unknown): string => {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value <= 0)) return '';
  const text = typeof value === 'number' || typeof value === 'string' ? String(value).trim() : '';
  return /^\d+$/.test(text) && BigInt(text) > 0n ? text : '';
};
export function normalizeGuestSession(payload: any, brokerId: string, operation: 'login' | 'register', now = Date.now()): GuestSession {
  const accessToken = payload?.access_token ?? payload?.token;
  const accountLogin = positiveAccountLogin(payload?.account_login ?? payload?.accountLogin ?? (operation === 'register' ? payload?.login : undefined));
  if (typeof accessToken !== 'string' || !accessToken.trim() || !accountLogin || payload?.broker_id !== brokerId) {
    throw new GuestAuthError('The server returned an incomplete or mismatched trading session. Use login or account recovery.', 0, 'INVALID_SESSION', 0, operation === 'register');
  }
  let expires = NaN;
  const raw = payload.expires_at;
  if (typeof raw === 'number' || typeof raw === 'string' && /^\d+(\.\d+)?$/.test(raw)) {
    const value = Number(raw); expires = value > 1e12 ? value : value * 1000;
  } else if (typeof raw === 'string') expires = Date.parse(raw);
  if (!Number.isFinite(expires) && Number(payload.expires_in) > 0) expires = now + Number(payload.expires_in) * 1000;
  return Object.freeze({ accessToken: accessToken.trim(), refreshToken: typeof payload.refresh_token === 'string' ? payload.refresh_token : '',
    expiresAt: Number.isFinite(expires) && expires > 0 ? new Date(expires).toISOString() : '',
    accountLogin, brokerId, investor: payload.login_type === 'investor' || payload.role === 'investor' || payload.investor === true,
    // API keys are deliberately excluded from the session and metadata.
    metadata: Object.fromEntries(['name', 'broker_name', 'group', 'server', 'leverage', 'currency', 'balance'].filter(key => payload[key] !== undefined).map(key => [key, payload[key]])) });
}
export type DemoForm = { name: string; email: string; password: string; confirmation: string };
export const isDemoRegistrationEnabled = (config: any): boolean => config?.demo_registration_enabled !== false && config?.registration_enabled !== false && config?.capabilities?.demo_registration_enabled !== false;
export function validateDemoForm(form: DemoForm): string | null {
  if (!form.name.trim()) return 'Enter your full name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return 'Enter a valid email address.';
  if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password)) return 'Use at least 8 characters, including a letter and a number.';
  if (form.password !== form.confirmation) return 'Passwords must match exactly.';
  return null;
}
export function demoRegistrationBody(form: DemoForm, brokerId: string) {
  const error = validateDemoForm(form); if (error) throw new GuestAuthError(error, 400, 'INVALID_INPUT');
  return { name: form.name.trim(), email: form.email.trim(), username: form.email.trim(), password: form.password, broker_id: brokerId };
}
export function loginRequestBody(identity: string, password: string, brokerId: string): string {
  const value = identity.trim(); if (!value || !password) throw new GuestAuthError('Enter your login and password.');
  if (/^\d+$/.test(value) && !positiveAccountLogin(value)) throw new GuestAuthError('Enter a positive account login.');
  const rest = JSON.stringify({ password, broker_id: brokerId }).slice(1);
  // Keep arbitrary-size numeric account identities exact without converting to Number.
  return /^\d+$/.test(value) && positiveAccountLogin(value)
    ? `{"login":${BigInt(value).toString()},${rest}` : JSON.stringify({ username: value, password, broker_id: brokerId });
}
export function authenticationError(status: number, payload: any, retryAfter: string | null, registering: boolean, now = Date.now()): GuestAuthError {
  const code = typeof payload?.code === 'string' ? payload.code : typeof payload?.error === 'string' ? payload.error : payload?.error?.code || '';
  const messages: Record<string, string> = {
    INVALID_INPUT: 'Check your name, email and password.', WEAK_PASSWORD: 'Choose a stronger password.',
    DEMO_REGISTRATION_DISABLED: 'Demo signup is disabled for this broker. You can still log in or browse as a guest.',
    CONFLICT: 'This identity already exists. Try logging in or recovering the account.',
    CALCULATION_POLICY_UNSUPPORTED: 'This broker’s calculation policy does not support demo signup.',
  };
  const ambiguous = registering && (status === 0 || status >= 500 && (status !== 503 || !['DEMO_REGISTRATION_UNAVAILABLE', 'DEMO_THROTTLE_UNAVAILABLE', 'DEMO_POLICY_UNAVAILABLE'].includes(code)));
  let message = ambiguous ? 'The result could not be confirmed. An account may have been created. Try login or account recovery before submitting again.'
    : messages[code] || (status === 413 ? 'The submitted information is too large.' : status === 429 ? 'Too many requests. Wait before trying again.'
      : status === 503 ? 'Demo signup is unavailable because of broker configuration, policy or licensing. Try login or continue as a guest.'
      : status >= 500 ? 'The broker service is unavailable. Try again later.' : status === 401 ? 'The login or password was not accepted.' : 'Authentication was not accepted. Check your details.');
  const seconds = Number(retryAfter);
  const retryAt = retryAfter ? Number.isFinite(seconds) ? now + Math.max(0, seconds) * 1000 : Date.parse(retryAfter) || 0 : 0;
  return new GuestAuthError(message, status, code, retryAt, ambiguous);
}
export async function authenticateGuest(context: PublicBrokerContext, operation: 'login' | 'register', body: string | Record<string, unknown>, signal: AbortSignal): Promise<GuestSession> {
  if (!isPublicBrokerContextCurrent(context)) throw new GuestAuthError('Broker selection changed.');
  const controller = new AbortController(); const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort();
  const timeout = setTimeout(abort, 15000);
  try {
    const response = await timedFetch(`${context.extendedApiBase}/auth/${operation}`, {
      method: 'POST', credentials: 'omit', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Broker-ID': context.brokerId },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }, { label: `auth.guest.${operation}`, method: 'POST', endpoint: `/auth/${operation}`, source: 'auth', timeoutMs: 15000 });
    const text = await response.text();
    // Preserve account identity when a server returns an integer larger than JS precision.
    let payload: any;
    try { payload = JSON.parse(text.replace(/("(?:account_login|accountLogin|login)"\s*:\s*)(\d{16,})(?=\s*[,}])/g, '$1"$2"')); }
    catch { if (response.ok) throw authenticationError(0, {}, null, operation === 'register'); payload = {}; }
    if (!response.ok) throw authenticationError(response.status, payload, response.headers.get('Retry-After'), operation === 'register');
    if (response.status !== (operation === 'register' ? 201 : 200)) throw new GuestAuthError('Unexpected authentication response. Use login or recovery.', response.status, 'INVALID_SESSION', 0, operation === 'register');
    if (signal.aborted || !isPublicBrokerContextCurrent(context)) throw new GuestAuthError('Authentication was cancelled.');
    return normalizeGuestSession(payload, context.brokerId, operation);
  } catch (error) {
    if (error instanceof GuestAuthError) throw error;
    throw authenticationError(0, {}, null, operation === 'register');
  } finally { clearTimeout(timeout); signal.removeEventListener('abort', abort); }
}
