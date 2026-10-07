/**
 * Platform Email Dispatch API (V2)
 * 
 * Proxies SMTP requests through the gateway for sending trade
 * confirmations and welcome emails directly to the user.
 */

import { apiClient } from './apiClient';

/** Request body for POST /api/v1/email/send */
export interface SendEmailRequest {
  account: string;
  to: string;
  to_name: string;
  subject: string;
  body: string;
}

/** Success response */
export interface SendEmailResponse {
  success: boolean;
  message: string;
}

/**
 * Sends an email via MT5's configured SMTP server.
 * Proxied through the Gateway.
 *
 * POST /api/v1/email/send
 *
 * Use cases: welcome emails, trade confirmations, account statements, security alerts.
 */
export async function sendEmail(payload: SendEmailRequest): Promise<SendEmailResponse> {
  const response = await apiClient('/email/send', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorMsg = 'Failed to send email';
    try {
      const errorData = await response.json();
      errorMsg = errorData.message || errorData.error || errorMsg;
    } catch (e) {
      // Response may not be JSON (e.g. 502 returns HTML)
    }
    throw new Error(`API Error ${response.status}: ${errorMsg}`);
  }

  return response.json();
}
