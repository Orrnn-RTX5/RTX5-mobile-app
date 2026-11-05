/** Content inspection is independent of picker MIME/extension claims. */
export function inspectBugReportFile(bytes: Uint8Array): string | undefined {
  const at = (offset: number, signature: number[]) => signature.every((value, i) => bytes[offset + i] === value);
  if (at(0, [137, 80, 78, 71, 13, 10, 26, 10]) && bytes.length >= 24) return 'image/png';
  if (at(0, [255, 216, 255]) && bytes.length >= 4) return 'image/jpeg';
  if (at(0, [82, 73, 70, 70]) && at(8, [87, 69, 66, 80]) && bytes.length >= 16) return 'image/webp';
  const ascii = Array.from(bytes.subarray(0, 48), (byte) => String.fromCharCode(byte)).join('');
  if (ascii.slice(4, 8) === 'ftyp' && /heic|heix|hevc|hevx|mif1|msf1/.test(ascii.slice(8))) return 'image/heic';
  return undefined;
}

/** Strict UTF-8: reject malformed sequences, NULs and non-text controls. */
export function isPlainTextBytes(bytes: Uint8Array): boolean {
  if (!bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if ((byte < 32 && ![9, 10, 13].includes(byte)) || byte === 127) return false;
    if (byte < 128) continue;
    const count = byte >= 194 && byte <= 223 ? 1 : byte >= 224 && byte <= 239 ? 2 : byte >= 240 && byte <= 244 ? 3 : -1;
    if (count < 0 || i + count >= bytes.length) return false;
    const next = bytes[i + 1];
    if ((byte === 224 && next < 160) || (byte === 237 && next > 159) || (byte === 240 && next < 144) || (byte === 244 && next > 143)) return false;
    for (let n = 1; n <= count; n++) if (bytes[i + n] < 128 || bytes[i + n] > 191) return false;
    i += count;
  }
  const prefix = Array.from(bytes.subarray(0, 512), (byte) => String.fromCharCode(byte)).join('').trimStart();
  // ASCII formats such as SVG/PDF are not accepted as disguised text logs.
  return !/^%PDF|^<(?:\?xml|!doctype|svg|html)/i.test(prefix);
}

export function scrubBugReportLog(text: string, knownSecrets: readonly string[] = []): string {
  // Storage dumps can put unlabeled credentials on subsequent lines. Exclude the whole dump.
  if (/(?:async|local|session|secure)[_ -]?storage|storage[_ -]?dump/i.test(text)) return '[REDACTED STORAGE DUMP]';
  let clean = text.replace(/-----BEGIN [^-]*(?:PRIVATE KEY|CERTIFICATE)-----[\s\S]*?-----END [^-]+-----/g, '[REDACTED]');
  for (const secret of knownSecrets) if (secret) clean = clean.split(secret).join('[REDACTED]');
  clean = clean.split(/\r?\n/).map((line) =>
    /password|passwd|\bpwd\b|\btoken\b|access[_ -]?token|refresh[_ -]?token|authorization|\bcookies?\b|api[_ -]?key|license[_ -]?key|secret|secure.?stor|async.?stor|local.?stor|session.?stor|credential/i.test(line)
      ? '[REDACTED SENSITIVE LINE]' : line,
  ).join('\n');
  return clean
    .replace(/\bBearer\s+[^\s,;]+/gi, '[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED]')
    .replace(/https?:\/\/[^\s/@]+:[^\s/@]+@/gi, 'https://[REDACTED]@');
}
