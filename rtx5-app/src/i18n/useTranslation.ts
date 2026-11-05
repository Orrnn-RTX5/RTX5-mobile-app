/**
 * Tiny i18n hook bound to the persisted user-preferences store.
 *
 * Usage:
 *   const { t, language, setLanguage } = useTranslation();
 *   <Text>{t('Settings')}</Text>
 *
 * `t()` falls back to the English key when a translation is missing so
 * unmapped strings still render readable text instead of an empty cell.
 */
import { useCallback } from 'react';
import { useUserPreferences } from '../state/userPreferences';
import { normalizeLanguageCode, translate, type TranslationKey } from './translations';

export function useTranslation() {
  const storedLanguage = useUserPreferences((s) => s.language);
  const setStoredLanguage = useUserPreferences((s) => s.setLanguage);
  const language = normalizeLanguageCode(storedLanguage);

  const setLanguage = useCallback(
    (nextLanguage: unknown) => {
      setStoredLanguage(normalizeLanguageCode(nextLanguage));
    },
    [setStoredLanguage],
  );

  const t = useCallback(
    (key: TranslationKey | string): string => {
      return translate(key, language);
    },
    [language],
  );

  return { t, language, setLanguage };
}
