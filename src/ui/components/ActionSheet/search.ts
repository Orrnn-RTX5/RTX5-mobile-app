export type FilterableActionSheetAction = {
  key?: string;
  label: string;
  subtitle?: string;
  countrySearch?: { names: readonly string[]; isoCode: string; callingCodes: readonly string[] };
};

const normalizeName = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

export const actionSheetActionKey = (action: FilterableActionSheetAction, index: number): string =>
  action.key ?? `${action.label}-${index}`;

/** Reset virtualized search frames and offsets together with the new results. */
export const searchableActionListKey = (visualKey: string | undefined, searchable: boolean, query: string): string =>
  `${visualKey ?? 'deferred-action-list'}${searchable ? `:search:${query}` : ''}`;

export function filterActionSheetActions<T extends FilterableActionSheetAction>(
  actions: T[],
  query: string,
  translate: (value: string) => string,
): T[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return actions;
  }

  return actions.filter((action) => {
    if (action.countrySearch) {
      const { names, isoCode, callingCodes } = action.countrySearch;
      if (/^\+?[\d\s().-]+$/.test(normalizedQuery)) {
        const digits = normalizedQuery.replace(/\D/g, '');
        return Boolean(digits) && callingCodes.some(code => {
          const callingDigits = code.replace(/\D/g, '');
          return normalizedQuery.startsWith('+') ? callingDigits.startsWith(digits) : callingDigits.includes(digits);
        });
      }
      const text = normalizeName(normalizedQuery);
      return [isoCode, ...names].some(name => normalizeName(name).includes(text));
    }
    const rawLabel = action.label.toLocaleLowerCase();
    const localizedLabel = translate(action.label).toLocaleLowerCase();
    const subtitle = action.subtitle?.toLocaleLowerCase() ?? '';

    return rawLabel.includes(normalizedQuery)
      || localizedLabel.includes(normalizedQuery)
      || subtitle.includes(normalizedQuery);
  });
}
