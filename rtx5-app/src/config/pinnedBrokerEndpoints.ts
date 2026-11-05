// Published service roots for the brokers in scope of Backend Contract v3
// (MOBILE_APP_PROMPT_FROM_BACKEND.md, section 3).
//
// The live directory (superadmin-prod.orrnn.com) still returns these two rows
// with raw IPs and cleartext ws:// / http:// feed URLs: 51.195.188.172 fails
// TLS (the certificate is for service.orrnn.com) and 100.116.90.110 is a
// private Tailscale address. Those rows are correctly rejected, which left the
// login broker list empty. For exactly these broker ids, an unusable row falls
// back to the contract's published hostnames. A directory row that already
// validates always wins, so once ops fixes the rows this map is inert.
export const PINNED_BROKER_SERVICE_ROOTS: Readonly<Record<string, string>> = Object.freeze({
  'trivanta-markets': 'https://trivanta.orrnn.com',
  orrnn: 'https://service.orrnn.com',
});

// Directory endpoint fields that a pinned fallback replaces. Aliases are
// dropped so a stale ws:// alias cannot conflict with the pinned wss:// URL.
const DIRECTORY_ENDPOINT_FIELDS = [
  'server_url',
  'market_api_url',
  'feed_wss_url',
  'feed_ws_url',
  'feed_url',
  'wss_url',
  'ws_url',
  'feed_status_https_url',
  'feed_status_url',
  'trade_wss_url',
  'trade_ws_url',
  'services_domain',
] as const;

export function getPinnedBrokerServiceRoot(brokerId: unknown): string | null {
  if (typeof brokerId !== 'string') return null;
  return PINNED_BROKER_SERVICE_ROOTS[brokerId.trim().toLowerCase()] ?? null;
}

/**
 * Returns a copy of `record` whose endpoints point at the pinned service root,
 * or null when the broker is not pinned. The broker_id is kept exactly as the
 * directory sent it (login compares it case-sensitively).
 */
export function withPinnedBrokerEndpoints(
  record: Readonly<Record<string, unknown>>,
): Record<string, unknown> | null {
  const root = getPinnedBrokerServiceRoot(record.broker_id);
  if (!root) return null;
  const host = new URL(root).host;
  const patched: Record<string, unknown> = { ...record };
  for (const field of DIRECTORY_ENDPOINT_FIELDS) {
    delete patched[field];
  }
  return {
    ...patched,
    protocol: 'https',
    server: `${host}:443`,
    server_port: 443,
    server_url: root,
    feed_wss_url: `wss://${host}/ws/feed`,
    feed_status_https_url: `https://${host}/ws/feed/status`,
  };
}
