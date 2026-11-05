type SecureLoginStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

/** Forget this account's autofill password while preserving broker/login fields. */
export async function clearSavedLoginPassword(
  brokerId: string,
  login: string,
  storage: SecureLoginStorage,
): Promise<void> {
  const key = 'rtx5_saved_login';
  const raw = await storage.getItem(key);
  if (!raw) return;
  const saved = JSON.parse(raw);
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return;
  if (String(saved.broker ?? '').trim().toLowerCase() !== brokerId.trim().toLowerCase()
    || String(saved.login ?? '').trim() !== login.trim()) return;
  const { pass: _password, ...withoutPassword } = saved;
  await storage.setItem(key, JSON.stringify(withoutPassword));
}
