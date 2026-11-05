import { redactSensitiveString } from '../../../utils/securityRedaction';

/**
 * Diagnostics need the selected host/path, never credential-bearing query
 * parameters or fragments. Strip both before applying the shared redactor.
 */
export const redactMarketSocketUrl = (url: string): string => {
  const queryOrFragmentStart = url.search(/[?#]/);
  const withoutQuery =
    queryOrFragmentStart === -1
      ? url
      : url.slice(0, queryOrFragmentStart);
  return redactSensitiveString(withoutQuery);
};
