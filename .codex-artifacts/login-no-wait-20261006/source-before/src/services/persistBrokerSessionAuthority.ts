/** Independent handoff writes overlap, but rollback must wait for every writer. */
export async function persistBrokerSessionAuthority<T>(tasks: {
  writeCredentials: () => Promise<T>;
  writeManifest: () => Promise<unknown>;
  clearLegacyRouting: () => Promise<unknown>;
  pruneCaches: () => Promise<unknown>;
}): Promise<T> {
  const results = await Promise.allSettled([
    Promise.resolve().then(tasks.writeCredentials),
    Promise.resolve().then(tasks.writeManifest),
    Promise.resolve().then(tasks.clearLegacyRouting),
    Promise.resolve().then(tasks.pruneCaches),
  ]);
  for (const result of results) {
    if (result.status === 'rejected') throw result.reason;
  }
  const credentials = results[0];
  if (credentials.status === 'rejected') throw credentials.reason;
  return credentials.value;
}
