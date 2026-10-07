/** Only session authority gates activation; rollback waits for both secure writers. */
export async function persistBrokerSessionAuthority<T>(tasks: {
  writeCredentials: () => Promise<T>;
  writeManifest: () => Promise<unknown>;
}): Promise<T> {
  const results = await Promise.allSettled([
    Promise.resolve().then(tasks.writeCredentials),
    Promise.resolve().then(tasks.writeManifest),
  ]);
  for (const result of results) {
    if (result.status === 'rejected') throw result.reason;
  }
  const credentials = results[0];
  if (credentials.status === 'rejected') throw credentials.reason;
  return credentials.value;
}
