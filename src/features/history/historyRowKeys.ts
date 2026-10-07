/** Assign identities before sorting so a sort moves existing native rows. */
export const keyHistoryRows = <Row extends { id: string }>(
  rows: readonly Row[],
): Array<Row & { listKey: string }> => {
  const occurrences = new Map<string, number>();
  return rows.map((row) => {
    const occurrence = occurrences.get(row.id) ?? 0;
    occurrences.set(row.id, occurrence + 1);
    // Brokers can return repeated ticket IDs. Keep every row and disambiguate
    // against source order rather than the user-selected display order.
    return { ...row, listKey: JSON.stringify([row.id, occurrence]) };
  });
};
