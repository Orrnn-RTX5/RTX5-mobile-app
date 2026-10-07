import { apiClient } from './apiClient';
import {
  normalizeJournalResponse,
  type JournalResponse,
} from '../features/settings/JournalScreen/serverJournal/journalModel';

/**
 * GET {broker}/api/v2/journal?mode=&type=&filter=
 *
 * Reuses the authenticated broker client: Bearer token, `accept` header,
 * single-flight 401 refresh with one retry, and session-change aborts all
 * come from `apiClient`. The selected account is enforced by the active
 * broker session rather than by a caller-supplied login.
 */

export const JOURNAL_REQUEST_TIMEOUT_MS = 30_000;
const TIMEOUT_MESSAGE = 'Request timed out after 30 seconds';
export const JOURNAL_MATCH_ALL_FILTER = ' ';

export type JournalQuery = {
  mode: number;
  type: number;
  filter?: string;
};

export function buildJournalQuery(params: JournalQuery): string {
  const filter = params.filter?.trim() || JOURNAL_MATCH_ALL_FILTER;
  return [
    `mode=${encodeURIComponent(String(params.mode))}`,
    `type=${encodeURIComponent(String(params.type))}`,
    `filter=${encodeURIComponent(filter)}`,
  ].join('&');
}

const readErrorMessage = async (response: Response): Promise<string> => {
  try {
    const body = await response.json() as Record<string, unknown> | null;
    const message = body && typeof body === 'object' ? body.message ?? body.error : undefined;
    if (typeof message === 'string' && message.trim()) return message;
  } catch {
    // Fall through to the status message.
  }
  return `HTTP Error: ${response.status}`;
};

export async function getJournalLogs(
  params: JournalQuery,
  options: { signal?: AbortSignal } = {},
): Promise<JournalResponse> {
  const query = buildJournalQuery(params);
  let response: Response;
  try {
    response = await apiClient(`/journal?${query}`, {
      method: 'GET',
      apiVersion: 'v2',
      signal: options.signal,
      timeoutMs: JOURNAL_REQUEST_TIMEOUT_MS,
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    const message = error instanceof Error ? error.message : '';
    if (/timed out/i.test(message)) throw new Error(TIMEOUT_MESSAGE);
    throw error instanceof Error ? error : new Error(String(error));
  }
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return normalizeJournalResponse(await response.json());
}
