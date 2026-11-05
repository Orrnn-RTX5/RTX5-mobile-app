import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectBugReportFile, isPlainTextBytes, scrubBugReportLog } from './bugReportAttachmentPolicy';

test('file inspection recognizes supported image signatures and HEIC independently of extensions', () => {
  const png = new Uint8Array(24); png.set([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(inspectBugReportFile(png), 'image/png');
  assert.equal(inspectBugReportFile(new Uint8Array([255, 216, 255, 224])), 'image/jpeg');
  assert.equal(inspectBugReportFile(new TextEncoder().encode('RIFF1234WEBPVP8 ')), 'image/webp');
  assert.equal(inspectBugReportFile(new TextEncoder().encode('0000ftypheic0000')), 'image/heic');
  for (const data of ['GIF89a', '%PDF-1.4', '<svg/>', 'PK\x03\x04', 'not an image']) assert.equal(inspectBugReportFile(new TextEncoder().encode(data)), undefined);
});
test('plain-text detection accepts UTF-8 logs and rejects empty, binary, malformed UTF-8 and disguised SVG/PDF', () => {
  assert.equal(isPlainTextBytes(new TextEncoder().encode('日本語 log\nconnected\t12:30')), true);
  for (const bytes of [new Uint8Array(), new Uint8Array([0, 32]), new Uint8Array([192, 128]), new Uint8Array([237, 160, 128]), new Uint8Array([244, 144, 128, 128]), new TextEncoder().encode('%PDF-1.4'), new TextEncoder().encode('<svg>image</svg>')]) assert.equal(isPlainTextBytes(bytes), false);
});
test('reviewed log copy strips secrets, authorization, cookies, keys, storage and known session credentials', () => {
  const input = 'chart froze\npassword=secret\nAuthorization: Bearer abc\nCookie: session=x\napi_key=key\nrefreshToken=rotating\nraw current-session-secret here\neyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdef\nreconnected';
  const clean = scrubBugReportLog(input, ['current-session-secret']);
  assert.match(clean, /chart froze/); assert.match(clean, /reconnected/);
  for (const secret of ['secret', 'Bearer abc', 'session=x', 'api_key=key', 'rotating', 'contents=private', 'eyJhbG']) assert.equal(clean.includes(secret), false);
});
test('multiline storage dumps are excluded in full, including unlabeled secrets on following lines', () => {
  assert.equal(scrubBugReportLog('AsyncStorage dump\n{\n"unlabeled": "sensitive-storage-value"\n}'), '[REDACTED STORAGE DUMP]');
});
