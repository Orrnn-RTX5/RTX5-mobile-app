import { Platform } from 'react-native';
import { captureActiveBrokerSession } from '../../state/activeBrokerSession';
import { BugReportError, type BugReportAttachment, type BugReportOptions } from '../../api/bugReports';
import { inspectBugReportFile, isPlainTextBytes, scrubBugReportLog } from './bugReportAttachmentPolicy';

type PickedFile = { uri: string; name: string; file?: globalThis.File };
export async function prepareBugReportAttachment(asset: PickedFile, options: BugReportOptions): Promise<BugReportAttachment> {
  // Load optional native capabilities only after a file has been selected.
  // Missing modules must not prevent app startup or a text-only bug report.
  const { File, Paths } = await import('expo-file-system');
  const selectionSession = captureActiveBrokerSession();
  const selectionSecrets = [selectionSession?.credentials.accessToken ?? '', selectionSession?.credentials.refreshToken ?? ''];
  if (selectionSecrets.some((secret) => secret && asset.name.includes(secret))) throw new BugReportError('validation', 'This filename contains sensitive session information. Choose another file.');
  let uri = asset.uri; let name = asset.name;
  let nativeFile = Platform.OS === 'web' ? undefined : new File(uri);
  let blob: Blob | undefined = Platform.OS === 'web' ? asset.file ?? await (await fetch(uri)).blob() : undefined;
  const size = nativeFile?.size ?? blob!.size;
  if (!size) throw new BugReportError('validation', 'Empty or unreadable attachments cannot be uploaded.');
  if (size > options.maxFileBytes) throw new BugReportError('validation', 'This file exceeds the broker attachment size limit.');
  let header: Uint8Array;
  if (nativeFile) {
    const handle = nativeFile.open();
    try { header = handle.readBytes(Math.min(size, 48)); } finally { handle.close(); }
  } else header = new Uint8Array(await blob!.slice(0, 48).arrayBuffer());
  let mimeType = inspectBugReportFile(header);
  const imageTools = mimeType?.startsWith('image/') ? await import('expo-image-manipulator') : undefined;
  let ownedCache = false;
  if (mimeType === 'image/heic') {
    try {
      const context = imageTools!.ImageManipulator.manipulate(uri);
      const image = await context.renderAsync();
      const converted = await image.saveAsync({ format: imageTools!.SaveFormat.PNG });
      context.release(); image.release();
      uri = converted.uri;
      name = name.replace(/\.[^.]+$/, '') + '.png';
      nativeFile = Platform.OS === 'web' ? undefined : new File(uri);
      blob = Platform.OS === 'web' ? await (await fetch(uri)).blob() : undefined;
      ownedCache = Platform.OS !== 'web';
      const convertedHeader = nativeFile ? (await nativeFile.bytes()).subarray(0, 48) : new Uint8Array(await blob!.slice(0, 48).arrayBuffer());
      mimeType = inspectBugReportFile(convertedHeader);
      if (mimeType !== 'image/png') throw new Error('Conversion failed');
    } catch {
      throw new BugReportError('validation', 'This HEIC image could not be converted. Choose a PNG or JPEG, or send the report without it.');
    }
  }
  let textPreview: string | undefined;
  if (mimeType?.startsWith('image/') && mimeType !== 'image/heic') {
    // Decode with the platform image library; magic bytes alone cannot prove an image is valid.
    try {
      const decoder = imageTools!.ImageManipulator.manipulate(uri);
      const image = await decoder.renderAsync();
      image.release(); decoder.release();
    } catch {
      if (ownedCache) nativeFile?.delete();
      throw new BugReportError('validation', 'This image could not be decoded. Choose another image.');
    }
  }
  if (!mimeType) {
    const bytes = nativeFile ? await nativeFile.bytes() : new Uint8Array(await blob!.arrayBuffer());
    if (!isPlainTextBytes(bytes)) throw new BugReportError('validation', 'The selected file is not a supported plain-text log.');
    const capture = captureActiveBrokerSession();
    const text = nativeFile ? await nativeFile.text() : await blob!.text();
    textPreview = scrubBugReportLog(text, [...selectionSecrets, capture?.credentials.accessToken ?? '', capture?.credentials.refreshToken ?? '']);
    mimeType = 'text/plain';
    if (Platform.OS === 'web') blob = new Blob([textPreview], { type: mimeType });
    else {
      nativeFile = new File(Paths.cache, `bug-report-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
      nativeFile.create(); nativeFile.write(textPreview); uri = nativeFile.uri; ownedCache = true;
    }
  }
  if (!mimeType || !['image/png', 'image/jpeg', 'image/webp', 'text/plain'].includes(mimeType)) throw new BugReportError('validation', 'Choose a valid PNG, JPEG, WebP or plain-text file.');
  const finalSize = nativeFile?.size ?? blob!.size;
  if (!finalSize || finalSize > options.maxFileBytes) {
    if (ownedCache) nativeFile?.delete();
    throw new BugReportError('validation', 'The prepared file exceeds the broker attachment size limit.');
  }
  return { uri, name, mimeType, size: finalSize, contentVerified: true, reviewed: false, textPreview, blob, ownedCache };
}
export function releaseBugReportAttachment(file: BugReportAttachment) {
  if (file.ownedCache && Platform.OS !== 'web') {
    void import('expo-file-system').then(({ File }) => {
      try { new File(file.uri).delete(); } catch { /* Cache may already have been cleared by the OS. */ }
    }).catch(() => { /* Older binaries may not contain this native capability. */ });
  }
}
