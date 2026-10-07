export type QuoteWithVolume = {
  volume?: unknown;
  volumeSource?: unknown;
};

const toFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
};

export const normalizeQuoteVolume = (value: unknown): number | undefined => {
  const parsed = toFiniteNumber(value);
  if (parsed === undefined || parsed < 0) {
    return undefined;
  }

  return parsed;
};

export const resolveBackendQuoteVolume = ({
  incoming,
  previous,
}: {
  incoming?: unknown;
  previous?: QuoteWithVolume;
}): number | undefined => {
  // Volume is not derived from bid/ask. Use only backend tick/session volume,
  // and carry it forward only if the previous value also came from backend data.
  const incomingVolume = normalizeQuoteVolume(incoming);
  if (incomingVolume !== undefined) {
    return incomingVolume;
  }

  if (previous?.volumeSource !== 'backend') {
    return undefined;
  }

  return normalizeQuoteVolume(previous.volume);
};
