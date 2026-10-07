import { isCanonicalStoredBrokerSessionManifest, type ActiveBrokerSessionManifest } from '../state/activeBrokerSessionStorage';
import { isCanonicalStoredAuthCredentialBundle, type SecureAuthCredentialBundle } from '../state/secureCredentialBundle';

/** Called only after directory revalidation and broker/account-bound secure reads. */
export function resolveBrokerSessionRestoreWrites(
  manifest: ActiveBrokerSessionManifest,
  credentials: SecureAuthCredentialBundle,
  nextManifest: ActiveBrokerSessionManifest,
) {
  return {
    rewriteCredentials: !isCanonicalStoredAuthCredentialBundle(credentials) || credentials.brokerId !== nextManifest.brokerId,
    rewriteManifest: !isCanonicalStoredBrokerSessionManifest(manifest) ||
      Object.entries(nextManifest).some(([key, value]) => manifest[key as keyof ActiveBrokerSessionManifest] !== value) ||
      Object.keys(manifest).length !== Object.keys(nextManifest).length,
  };
}
