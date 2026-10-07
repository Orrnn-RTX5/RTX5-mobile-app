import {
  redactDiagnosticValue,
  redactSensitiveString,
  isSensitiveAuthKey,
} from '../utils/securityRedaction';

export { redactDiagnosticValue, redactSensitiveString, isSensitiveAuthKey };

export const redactAuthPayload = (payload: unknown): unknown =>
  redactDiagnosticValue(payload);
