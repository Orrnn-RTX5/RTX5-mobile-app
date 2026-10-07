import type { ComponentType } from 'react';

export const JOURNAL_ROUTE_CACHE_KEY = 'settings/journal';

export function loadJournalScreenRoute(): Promise<ComponentType> {
  return import('./index').then((module) => module.JournalScreen);
}
