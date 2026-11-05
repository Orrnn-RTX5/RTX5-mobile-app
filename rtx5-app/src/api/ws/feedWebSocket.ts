// Quote feed (/ws/feed) sockets must be opened without an Origin header.
//
// React Native's native WebSocket adds `Origin: https://<socket host>` to every
// handshake unless the caller supplies its own `origin` header. The broker
// feed enforces a browser-origin allowlist, and Orrnn (service.orrnn.com)
// rejects its own host with `403 {"reason":"origin_not_allowlisted"}`, so every
// connection from the phone failed and quotes stayed on "Connecting...".
// An empty origin is what a native (non-browser) client means, and the feed
// accepts it on both Orrnn and Trivanta. Browsers never let pages override
// Origin, so web keeps the platform default.
export const FEED_SOCKET_HEADERS = { origin: '' } as const;

type NativeWebSocketConstructor = new (
  url: string,
  protocols?: string | string[] | null,
  options?: { headers: Record<string, string> } | null,
) => WebSocket;

export function createFeedWebSocket(
  url: string,
  platformOs: string,
  WebSocketImpl: NativeWebSocketConstructor = WebSocket as unknown as NativeWebSocketConstructor,
): WebSocket {
  if (platformOs === 'web') {
    return new WebSocketImpl(url);
  }
  return new WebSocketImpl(url, null, { headers: { ...FEED_SOCKET_HEADERS } });
}
