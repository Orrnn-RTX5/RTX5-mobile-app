JSON.stringify({
  dev: typeof __DEV__ !== 'undefined' && __DEV__,
  hook: Object.keys(globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ || {}),
  renderers: Array.from(globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__?.renderers || []).map(([id, r]) => ({id, version:r.version, package:r.rendererPackageName})),
  modules: globalThis.__r?.getModules?.().size,
})
