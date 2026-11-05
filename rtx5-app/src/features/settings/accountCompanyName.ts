/**
 * Company line of the Settings account card.
 *
 * The authoritative name is the broker directory's `broker_name`. Sessions
 * whose broker is absent from the configured directory (notably the public
 * demo broker) have no directory row, and the card used to render a bare
 * "---" placeholder for them while the sidebar hid the same line entirely.
 * The broker id is always known from the session, so it is the fallback
 * label; when even that is missing the line is omitted instead of showing a
 * placeholder.
 */

export const humanizeBrokerId = (brokerId: string): string =>
  brokerId
    .trim()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());

export const resolveAccountCompanyName = (
  brokerName: string | null | undefined,
  brokerId: string | null | undefined,
): string | null => {
  const name = String(brokerName ?? '').trim();
  if (name) return name;
  const id = String(brokerId ?? '').trim();
  return id ? humanizeBrokerId(id) : null;
};
