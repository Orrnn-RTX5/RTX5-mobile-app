/** OTA fallback for capabilities absent from the installed native binary.
 * The release assembler maps optional native imports here on legacy runtimes.
 * Normal native builds keep the real Expo packages and their full features.
 */
const unavailable = (): never => {
  throw new Error('This feature needs a newer installed app. You can still send a report without attachments.');
};
type Asset = { uri: string; name: string; fileName?: string; file?: globalThis.File };
type PickerResult = { canceled: boolean; assets: Asset[] };
export async function getDocumentAsync(_options?: unknown): Promise<PickerResult> { return unavailable(); }
export async function launchImageLibraryAsync(_options?: unknown): Promise<PickerResult> { return unavailable(); }
export async function setStringAsync(_text: string): Promise<boolean> { return unavailable(); }
export const Accelerometer = {
  isAvailableAsync: async () => false,
  setUpdateInterval: (_interval: number) => {},
  addListener: (_listener: (sample: { x: number; y: number; z: number }) => void) => ({ remove: () => {} }),
};
export const Paths = { cache: '' };
export class File {
  readonly size = 0;
  readonly uri = '';
  constructor(..._paths: string[]) { unavailable(); }
  open(): { readBytes: (length: number) => Uint8Array; close: () => void } { return unavailable(); }
  async bytes(): Promise<Uint8Array> { return unavailable(); }
  async text(): Promise<string> { return unavailable(); }
  create(): void { unavailable(); }
  write(_text: string): void { unavailable(); }
  delete(): void { unavailable(); }
}
export const SaveFormat = { PNG: 'png' };
export const ImageManipulator = {
  manipulate: (_uri: string): {
    renderAsync: () => Promise<{ saveAsync: (options: { format: string }) => Promise<{ uri: string }>; release: () => void }>;
    release: () => void;
  } => unavailable(),
};
