import { redactSensitiveString } from '../utils/securityRedaction';

/** AsyncStorage-backed journal messages must never persist credentials. */
export const sanitizeTerminalJournalMessage = (message: unknown): string =>
  redactSensitiveString(String(message ?? ''));
