/**
 * Core module: email.ts
 */

import { useMutation } from '@tanstack/react-query';
import { sendEmail, SendEmailRequest, SendEmailResponse } from '../api/email';
import {
  getSessionQueryCacheNamespace,
  runSessionBoundQuery,
  useActiveBrokerQuerySession,
} from './authenticatedQueryScope';

/**
 * TanStack Mutation hook for sending emails via MT5 SMTP.
 *
 * Usage:
 * ```ts
 * const { mutate: send, isPending } = useSendEmail();
 * send({ account: '', to: 'user@example.com', to_name: 'User', subject: 'Hello', body: 'Welcome!' });
 * ```
 */
export function useSendEmail() {
  const session = useActiveBrokerQuerySession();
  const cacheNamespace = getSessionQueryCacheNamespace(session);
  return useMutation<SendEmailResponse, Error, SendEmailRequest>({
    mutationFn: (payload) => runSessionBoundQuery(
      cacheNamespace,
      () => sendEmail(payload),
    ),
  });
}
