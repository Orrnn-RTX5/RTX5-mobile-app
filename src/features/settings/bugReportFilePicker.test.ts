import assert from 'node:assert/strict';
import test from 'node:test';
import { bugReportFilePickerErrorMessage, pickBugReportFiles } from './bugReportFilePicker';

test('file picker launches in the tap call stack and returns selected files unchanged', async () => {
  const selected = { canceled: false as const, assets: [{ uri: 'file://report.txt', name: 'report.txt', lastModified: 0 }] };
  let launched = false;
  const pending = pickBugReportFiles(() => ({ getDocumentAsync: (options) => {
    launched = true;
    assert.equal(options.copyToCacheDirectory, true);
    assert.equal(options.multiple, true);
    assert.equal(options.base64, false);
    assert.ok(Array.isArray(options.type) && options.type.includes('text/plain'));
    return Promise.resolve(selected);
  } }));
  assert.equal(launched, true, 'Launching after an await would lose browser user activation');
  assert.equal(await pending, selected);
});

test('canceling file selection remains a cancellation without adding files', async () => {
  const canceled = { canceled: true as const, assets: null };
  assert.equal(await pickBugReportFiles(() => ({ getDocumentAsync: async () => canceled })), canceled);
});

test('missing native picker and legacy fallback explain the required installed-app update', async () => {
  for (const error of [new Error("Cannot find native module 'ExpoDocumentPicker'"), new Error('This feature needs a newer installed app.')]) {
    assert.throws(() => pickBugReportFiles(() => { throw error; }), (actual) => actual === error);
    assert.match(bugReportFilePickerErrorMessage(error), /updated installed app/);
    assert.match(bugReportFilePickerErrorMessage(error), /without attachments/);
  }
  const nativeError = new Error('This feature needs a newer installed app.');
  await assert.rejects(pickBugReportFiles(() => ({ getDocumentAsync: async () => { throw nativeError; } })), (actual) => actual === nativeError);
});

test('other picker failures allow retry without exposing internal errors', () => {
  assert.equal(bugReportFilePickerErrorMessage(new Error('private native diagnostics')), 'The file picker could not be opened. Please try again.');
  assert.equal(bugReportFilePickerErrorMessage(null), 'The file picker could not be opened. Please try again.');
});
