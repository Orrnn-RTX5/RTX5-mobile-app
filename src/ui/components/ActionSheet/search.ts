export type FilterableActionSheetAction = {
  label: string;
  subtitle?: string;
};

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
    const rawLabel = action.label.toLocaleLowerCase();
    const localizedLabel = translate(action.label).toLocaleLowerCase();
    const subtitle = action.subtitle?.toLocaleLowerCase() ?? '';

    return rawLabel.includes(normalizedQuery)
      || localizedLabel.includes(normalizedQuery)
      || subtitle.includes(normalizedQuery);
  });
}
