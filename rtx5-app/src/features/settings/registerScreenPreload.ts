import type React from 'react';

type RegisterScreenComponent = React.ComponentType;

let preloadedRegisterScreen: RegisterScreenComponent | null = null;
let preloadPromise: Promise<RegisterScreenComponent> | null = null;

export function getPreloadedRegisterScreen() {
  return preloadedRegisterScreen;
}

export function preloadRegisterScreen() {
  if (preloadedRegisterScreen) {
    return Promise.resolve(preloadedRegisterScreen);
  }

  if (!preloadPromise) {
    preloadPromise = import('../../../app/register')
      .then((module) => {
        preloadedRegisterScreen = module.default;
        return preloadedRegisterScreen;
      })
      .catch((error) => {
        preloadPromise = null;
        throw error;
      });
  }

  return preloadPromise;
}

/**
 * Warm the Demo Account form while Broker Detail is already on screen so
 * "Open a demo account" can mount a preloaded module on the next paint
 * (same class of readiness as Accounts "+" → Brokers).
 */
export function warmDemoAccountForm() {
  return preloadRegisterScreen().catch(() => undefined);
}
