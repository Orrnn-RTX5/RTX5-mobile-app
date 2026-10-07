const DEV_ENABLED = typeof __DEV__ !== 'undefined' && __DEV__;

type RefreshRegistry = {
  epochs: Record<string, number>;
  signatures: Record<string, string>;
};

type GlobalWithRefreshRegistry = typeof globalThis & {
  __RTX5_DEV_REFRESH_REGISTRY__?: RefreshRegistry;
};

function getRefreshRegistry(): RefreshRegistry {
  const scope = globalThis as GlobalWithRefreshRegistry;
  if (!scope.__RTX5_DEV_REFRESH_REGISTRY__) {
    scope.__RTX5_DEV_REFRESH_REGISTRY__ = {
      epochs: {},
      signatures: {},
    };
  }

  return scope.__RTX5_DEV_REFRESH_REGISTRY__;
}

export function hashDevRefreshSource(source: string): string {
  let hash = 2166136261;

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

export function getDevRefreshKey(scope: string, signature: string): string {
  if (!DEV_ENABLED) {
    return scope;
  }

  const registry = getRefreshRegistry();
  if (registry.signatures[scope] !== signature) {
    registry.signatures[scope] = signature;
    registry.epochs[scope] = (registry.epochs[scope] ?? 0) + 1;
  }

  return `${scope}-${registry.epochs[scope]}`;
}
