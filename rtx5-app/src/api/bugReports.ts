import { brokerApi, StaleBrokerSessionError, type BrokerApiRequestInit } from './brokerApi';
import { isActiveSessionInvestorReadOnly } from '../state/investorReadOnlySession';

// BrokerAPI's authenticated base already includes /api/v2.
export const BUG_REPORT_OPTIONS_PATH = '/bug-reports/options';
export const BUG_REPORTS_PATH = '/bug-reports';
export const BUG_REPORT_MAX_ATTACHMENTS = 5;
export const BUG_REPORT_MAX_ATTACHMENT_MB = 8;
export const BUG_REPORT_MAX_ATTACHMENT_BYTES = 8_388_608;
export const BUG_REPORT_MAX_REQUEST_BYTES = 25_165_824;
export const BUG_REPORT_ACCEPTED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'text/plain'] as const;
export const BUG_REPORT_TEXT_BOUNDS = {
  title: 200, description: 8000, expected_behavior: 2000, actual_behavior: 2000,
  route: 200, page: 120, connection_state: 120, app_version: 64, os: 64, browser: 64,
  timezone: 64, screen_resolution: 32, locale: 32, symbol: 32, timeframe: 16,
} as const;
export const BUG_REPORT_OPTION_LABELS: Readonly<Record<string, string>> = {
  trading: 'Trading', order: 'Order', position: 'Position', market_data: 'Market data',
  authentication: 'Authentication', ui_ux: 'Interface & display', performance: 'Performance',
  connection: 'Connection', account: 'Account', configuration: 'Configuration', other: 'Other',
  low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical',
};
export type BugReportOption = Readonly<{ value: string; label: string }>;
export type BugReportOptions = Readonly<{
  categories: readonly BugReportOption[]; severities: readonly BugReportOption[];
  enabled: boolean; maxAttachments: number; maxFileBytes: number;
}>;
export type BugReportAttachment = Readonly<{
  uri: string; name: string; size: number; mimeType: string;
  contentVerified: boolean; reviewed: boolean; textPreview?: string; blob?: Blob;
  /** Only app-created cache files may be deleted on removal. */
  ownedCache?: boolean;
}>;
export type BugReportContext = Partial<Record<
  Exclude<keyof typeof BUG_REPORT_TEXT_BOUNDS, 'title' | 'description' | 'expected_behavior' | 'actual_behavior'>,
  string
>> & { quote_age_ms?: number };
export type BugReportDraft = Readonly<{
  title: string; description: string; category: string; severity: string;
  stepsToReproduce?: string; expectedBehavior?: string; actualBehavior?: string;
  /** Local wall-clock input: YYYY-MM-DD HH:mm. */
  occurredAt?: string; context?: BugReportContext; attachments?: readonly BugReportAttachment[];
  /** Local draft bookkeeping; never included in the payload. */
  classificationEdited?: boolean;
}>;
export type BugReportPayload = {
  title: string; description: string; category: string; severity: string;
  steps_to_reproduce?: string[]; expected_behavior?: string; actual_behavior?: string;
  occurred_at: number;
} & BugReportContext;
export type BugReportValidationErrors = Partial<Record<
  'title' | 'description' | 'category' | 'severity' | 'stepsToReproduce' | 'expectedBehavior' | 'actualBehavior' | 'occurredAt' | 'attachments', string
>>;
export type BugReportSubmission = Readonly<{ reportId: string; failedAttachments: readonly number[] }>;
export type BugReportFailureKind = 'offline' | 'unauthorized' | 'read-only' | 'disabled' | 'validation' | 'uncertain' | 'server';
export class BugReportError extends Error {
  constructor(public readonly kind: BugReportFailureKind, message: string, public readonly status?: number, public readonly details?: unknown) {
    super(message); this.name = 'BugReportError';
  }
}
export type BugReportApiClient = Readonly<{ request: (endpoint: string, options?: BrokerApiRequestInit) => Promise<Response> }>;
type FormDataLike = { append: (name: string, value: any, filename?: string) => void };

// Does not rely on TextEncoder being present in every Hermes build.
export function utf8Bytes(text: string): number {
  let size = 0;
  for (const char of text) {
    const point = char.codePointAt(0)!;
    size += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return size;
}
export function truncateUtf8(text: string, maxBytes: number): string {
  let result = ''; let size = 0;
  for (const char of text) {
    const bytes = utf8Bytes(char);
    if (size + bytes > maxBytes) break;
    result += char; size += bytes;
  }
  return result;
}
export function sanitizeBugReportContext(input: BugReportContext = {}): BugReportContext {
  const safe: Record<string, string | number> = {};
  for (const [key, limit] of Object.entries(BUG_REPORT_TEXT_BOUNDS)) {
    if (['title', 'description', 'expected_behavior', 'actual_behavior'].includes(key)) continue;
    const value = input[key as keyof BugReportContext];
    if (typeof value !== 'string') continue;
    // Route is a pathname only; no query, fragment, URL credentials, or host.
    const text = key === 'route' ? value.split(/[?#]/)[0].replace(/^https?:\/\/[^/]+/i, '') : value;
    if (text || key === 'browser') safe[key] = truncateUtf8(text, limit);
  }
  if (Number.isSafeInteger(input.quote_age_ms) && input.quote_age_ms! >= 0) safe.quote_age_ms = input.quote_age_ms!;
  return safe as BugReportContext;
}
export const bugReportSteps = (text = '') => text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
export function parseBugReportIncidentTime(text: string): number | undefined {
  if (!text.trim()) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(text.trim());
  if (!match) return NaN;
  const [, y, m, d, h, min] = match.map(Number);
  const date = new Date(y, m - 1, d, h, min);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d || date.getHours() !== h || date.getMinutes() !== min) return NaN;
  return Math.floor(date.getTime() / 1000);
}
function payloadFromDraft(draft: BugReportDraft, now: number): BugReportPayload {
  const steps = bugReportSteps(draft.stepsToReproduce);
  return {
    ...sanitizeBugReportContext(draft.context),
    title: draft.title.trim(), description: draft.description.trim(), category: draft.category, severity: draft.severity,
    ...(steps.length ? { steps_to_reproduce: steps } : {}),
    ...(draft.expectedBehavior?.trim() ? { expected_behavior: draft.expectedBehavior.trim() } : {}),
    ...(draft.actualBehavior?.trim() ? { actual_behavior: draft.actualBehavior.trim() } : {}),
    occurred_at: parseBugReportIncidentTime(draft.occurredAt ?? '') ?? Math.floor(now / 1000),
  };
}
/** Conservatively reserves 64 KiB plus per-file headers/names for native/browser boundaries. */
export function estimateBugReportRequestBytes(draft: BugReportDraft): number {
  return utf8Bytes(JSON.stringify(payloadFromDraft(draft, Date.now()))) + 65_536 +
    (draft.attachments ?? []).reduce((sum, file) => sum + file.size + 1024 + utf8Bytes(file.name), 0);
}
export function validateBugReport(draft: BugReportDraft, options?: BugReportOptions): BugReportValidationErrors {
  const errors: BugReportValidationErrors = {};
  for (const key of ['title', 'description'] as const) {
    if ([...draft[key].trim()].length < 3) errors[key] = 'Enter at least 3 characters.';
    else if (utf8Bytes(draft[key].trim()) > BUG_REPORT_TEXT_BOUNDS[key]) errors[key] = `Maximum ${BUG_REPORT_TEXT_BOUNDS[key]} UTF-8 bytes.`;
  }
  if (!draft.category || (options && !options.categories.some((item) => item.value === draft.category))) errors.category = 'Select a category.';
  if (!draft.severity || (options && !options.severities.some((item) => item.value === draft.severity))) errors.severity = 'Select a severity.';
  for (const key of ['expectedBehavior', 'actualBehavior'] as const) {
    if (utf8Bytes(draft[key]?.trim() ?? '') > 2000) errors[key] = 'Maximum 2000 UTF-8 bytes.';
  }
  const steps = bugReportSteps(draft.stepsToReproduce);
  if (steps.length > 30 || steps.some((step) => utf8Bytes(step) > 300)) errors.stepsToReproduce = 'Use at most 30 steps, up to 300 UTF-8 bytes each.';
  if (Number.isNaN(parseBugReportIncidentTime(draft.occurredAt ?? ''))) errors.occurredAt = 'Use a valid local date and time: YYYY-MM-DD HH:mm.';
  const files = draft.attachments ?? [];
  const maxCount = Math.min(options?.maxAttachments ?? BUG_REPORT_MAX_ATTACHMENTS, BUG_REPORT_MAX_ATTACHMENTS);
  const maxBytes = Math.min(options?.maxFileBytes ?? BUG_REPORT_MAX_ATTACHMENT_BYTES, BUG_REPORT_MAX_ATTACHMENT_BYTES);
  if (files.length > maxCount) errors.attachments = `Choose no more than ${maxCount} attachments.`;
  else for (const file of files) {
    if (!Number.isSafeInteger(file.size) || file.size <= 0) errors.attachments = 'Empty or unreadable attachments cannot be uploaded.';
    else if (file.size > maxBytes) errors.attachments = `Each attachment must be at most ${(maxBytes / 1_048_576).toFixed(1)} MiB.`;
    else if (!file.contentVerified || !(BUG_REPORT_ACCEPTED_MIME_TYPES as readonly string[]).includes(file.mimeType)) errors.attachments = 'Choose a valid PNG, JPEG, WebP or plain-text file.';
    else if (!file.reviewed) errors.attachments = 'Preview and review every attachment before sending.';
    if (errors.attachments) break;
  }
  if (!errors.attachments && estimateBugReportRequestBytes(draft) > BUG_REPORT_MAX_REQUEST_BYTES) errors.attachments = 'The complete upload must fit within 24 MiB. Remove an attachment.';
  return errors;
}
export function buildBugReportPayload(draft: BugReportDraft, options?: BugReportOptions, now = Date.now()): BugReportPayload {
  const errors = validateBugReport(draft, options);
  if (Object.keys(errors).length) throw new BugReportError('validation', 'Check the highlighted report fields.', 400, errors);
  return payloadFromDraft(draft, now);
}
export function appendBugReportFormData(form: FormDataLike, draft: BugReportDraft, options?: BugReportOptions): BugReportPayload {
  const payload = buildBugReportPayload(draft, options);
  form.append('payload', JSON.stringify(payload));
  for (const file of draft.attachments ?? []) {
    if (file.blob) form.append('attachments', file.blob, file.name);
    else form.append('attachments', { uri: file.uri, name: file.name, type: file.mimeType });
  }
  return payload;
}
async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const data = await response.json();
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch (error) {
    if (error instanceof StaleBrokerSessionError) throw error;
    return {};
  }
}
const uncertainMessage = 'Acceptance could not be confirmed. The report may already have been created. Retrying could create a duplicate.';
function httpError(status: number, data: Record<string, unknown>): BugReportError {
  // Never display raw proxy HTML or echo arbitrary request/session data.
  const message = typeof data.message === 'string' ? truncateUtf8(data.message, 1000) : '';
  if (status === 401) return new BugReportError('unauthorized', 'Your session has expired. Sign in again. Your draft is saved.', status);
  if (status === 403) return new BugReportError('read-only', data.error === 'INVESTOR_READ_ONLY' ? 'Investor sessions are read-only and cannot submit reports.' : 'This session cannot submit reports.', status);
  if (status === 503 && data.error === 'BUG_REPORTS_DISABLED') return new BugReportError('disabled', 'Bug reporting is unavailable for this broker.', status);
  if (status === 413) return new BugReportError('validation', 'The submission exceeds upload limits. Remove an attachment.', status);
  if (status === 400 || status === 422 || status === 415) return new BugReportError('validation', message || 'The report or an attachment was rejected.', status);
  if (status === 502) return new BugReportError('server', 'The support service could not be reached.', status);
  if (status === 408 || status === 504 || status >= 500) return new BugReportError('uncertain', uncertainMessage, status);
  return new BugReportError('server', 'The report service is unavailable. Please try again.', status);
}
export async function loadBugReportOptions(api: BugReportApiClient = brokerApi, options: { signal?: AbortSignal } = {}): Promise<BugReportOptions> {
  try {
    const response = await api.request(BUG_REPORT_OPTIONS_PATH, { signal: options.signal, headers: { Accept: 'application/json' } });
    const data = await readJson(response);
    if (response.status !== 200) {
      const error = httpError(response.status, data);
      throw error.kind === 'uncertain' ? new BugReportError('server', 'The report options could not be loaded. Please retry.', response.status) : error;
    }
    const list = (value: unknown): BugReportOption[] => Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string' && !!item.trim()))].map((value) => ({ value, label: BUG_REPORT_OPTION_LABELS[value] ?? value.replace(/[_-]+/g, ' ') })) : [];
    const categories = list(data.categories); const severities = list(data.severities);
    if (typeof data.enabled !== 'boolean' || !Number.isSafeInteger(data.max_attachments) || Number(data.max_attachments) < 0 || !Number.isSafeInteger(data.max_file_bytes) || Number(data.max_file_bytes) <= 0 || (data.enabled && (!categories.length || !severities.length))) {
      throw new BugReportError('server', 'The report options returned by the gateway are incomplete.');
    }
    return { categories, severities, enabled: data.enabled, maxAttachments: Math.min(Number(data.max_attachments), 5), maxFileBytes: Math.min(Number(data.max_file_bytes), BUG_REPORT_MAX_ATTACHMENT_BYTES) };
  } catch (error) {
    if (options.signal?.aborted || error instanceof StaleBrokerSessionError) throw error;
    if (error instanceof BugReportError) throw error;
    throw new BugReportError('offline', 'The report options could not be loaded. Check your connection and retry.');
  }
}
export async function submitBugReport(draft: BugReportDraft, options: {
  formOptions: BugReportOptions; api?: BugReportApiClient; signal?: AbortSignal;
  createFormData?: () => FormDataLike; onUploadProgress?: (progress: number) => void;
}): Promise<BugReportSubmission> {
  if (!options.formOptions.enabled) throw new BugReportError('disabled', 'Bug reporting is unavailable for this broker.');
  if (isActiveSessionInvestorReadOnly()) throw new BugReportError('read-only', 'Investor sessions are read-only and cannot submit reports.');
  const form = options.createFormData?.() ?? new FormData();
  appendBugReportFormData(form, draft, options.formOptions);
  try {
    const response = await (options.api ?? brokerApi).request(BUG_REPORTS_PATH, {
      method: 'POST', body: form as FormData, headers: { Accept: 'application/json' },
      timeoutMs: 180_000, signal: options.signal, replayAfterAuthRefresh: false,
      onUploadProgress: options.onUploadProgress,
    });
    const data = await readJson(response);
    if (response.status !== 201) {
      if (response.ok) throw new BugReportError('uncertain', uncertainMessage, response.status);
      throw httpError(response.status, data);
    }
    if (typeof data.report_id !== 'string' || !data.report_id.trim()) throw new BugReportError('uncertain', uncertainMessage, 201);
    const failed = data.failed_attachments;
    if (failed != null && (!Array.isArray(failed) || failed.some((value) => !Number.isInteger(value) || value < 1 || value > (draft.attachments?.length ?? 0)))) {
      // Receipt confirms acceptance. Invalid attachment metadata must never provoke a report replay.
      return { reportId: data.report_id.trim(), failedAttachments: (draft.attachments ?? []).map((_, i) => i + 1) };
    }
    options.onUploadProgress?.(1);
    return { reportId: data.report_id.trim(), failedAttachments: failed ?? [] };
  } catch (error) {
    if (error instanceof BugReportError) throw error;
    // Abort, network loss and stale session errors after send are potentially ambiguous.
    throw new BugReportError('uncertain', uncertainMessage);
  }
}
