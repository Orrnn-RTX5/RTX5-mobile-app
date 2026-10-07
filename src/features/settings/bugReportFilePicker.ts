import type { DocumentPickerOptions, DocumentPickerResult } from 'expo-document-picker';

type Picker = { getDocumentAsync: (options: DocumentPickerOptions) => Promise<DocumentPickerResult> };

export function pickBugReportFiles(loadPicker: () => Picker = () => require('expo-document-picker')): Promise<DocumentPickerResult> {
  // Load only when tapped, but launch before yielding so browsers retain user activation.
  return loadPicker().getDocumentAsync({
    type: ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif', 'text/plain'],
    multiple: true,
    copyToCacheDirectory: true,
    base64: false,
  });
}

export function bugReportFilePickerErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/newer installed app|cannot find native module.*ExpoDocumentPicker/i.test(message)) {
    return 'File selection requires an updated installed app. You can still send this report without attachments.';
  }
  return 'The file picker could not be opened. Please try again.';
}
