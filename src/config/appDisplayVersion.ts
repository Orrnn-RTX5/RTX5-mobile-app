const APP_DISPLAY_VERSION_OVERRIDE = process.env.EXPO_PUBLIC_APP_DISPLAY_VERSION?.trim();

export const APP_DISPLAY_VERSION = APP_DISPLAY_VERSION_OVERRIDE || '1.1.49';

export function resolveAppDisplayVersion(fallbackVersion?: string | null): string {
  const displayVersion = APP_DISPLAY_VERSION.trim();
  if (displayVersion) {
    return displayVersion;
  }

  return fallbackVersion?.trim() || 'Local';
}
