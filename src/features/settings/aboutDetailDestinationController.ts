/**
 * Sidebar-style retained destination controller for About screen rows
 * (Privacy Policy, Account Deletion, Contact Developer).
 *
 * User Guide uses the existing sidebar host layer. Rate opens the store URL.
 * These three stay mounted under About so taps never pay a stack push.
 */

export const ABOUT_DETAIL_DESTINATIONS = [
  'privacy-policy',
  'account-deletion',
  'contact-developer',
] as const;

export type AboutDetailDestination = (typeof ABOUT_DETAIL_DESTINATIONS)[number];

export type AboutDetailDestinationSnapshot = Readonly<{
  destination: AboutDetailDestination | null;
  revision: number;
  visible: boolean;
}>;

export type AboutDetailDestinationVisualApplier = (
  destination: AboutDetailDestination | null,
) => void;

export type AboutDetailDestinationController = Readonly<{
  getSnapshot: () => AboutDetailDestinationSnapshot;
  hide: (revision?: number) => boolean;
  isVisible: () => boolean;
  registerVisualApplier: (applier: AboutDetailDestinationVisualApplier) => () => void;
  show: (destination: AboutDetailDestination) => number;
  subscribe: (listener: () => void) => () => void;
}>;

const CLOSED: AboutDetailDestinationSnapshot = Object.freeze({
  destination: null,
  revision: 0,
  visible: false,
});

const ABOUT_DETAIL_CONTROLLER_VERSION = 1;

export function createAboutDetailDestinationController(): AboutDetailDestinationController {
  const listeners = new Set<() => void>();
  let visualApplier: AboutDetailDestinationVisualApplier | null = null;
  let snapshot: AboutDetailDestinationSnapshot = CLOSED;

  const publish = (next: AboutDetailDestinationSnapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };

  return Object.freeze({
    getSnapshot: () => snapshot,

    hide: (revision?: number) => {
      if (revision !== undefined && snapshot.revision !== revision) {
        return false;
      }
      if (!snapshot.visible) {
        visualApplier?.(null);
        return false;
      }
      visualApplier?.(null);
      publish(Object.freeze({
        destination: snapshot.destination,
        revision: snapshot.revision + 1,
        visible: false,
      }));
      return true;
    },

    isVisible: () => snapshot.visible,

    registerVisualApplier: (applier) => {
      visualApplier = applier;
      applier(snapshot.visible ? snapshot.destination : null);
      return () => {
        if (visualApplier === applier) {
          visualApplier = null;
        }
      };
    },

    show: (destination) => {
      const revision = snapshot.revision + 1;
      // UI-thread / native visibility first — same ordering as sidebar hosts.
      visualApplier?.(destination);
      publish(Object.freeze({
        destination,
        revision,
        visible: true,
      }));
      return revision;
    },

    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
}

type AboutDetailControllerGlobal = typeof globalThis & {
  __rtx5AboutDetailDestinationController?: AboutDetailDestinationController;
  __rtx5AboutDetailDestinationControllerVersion?: number;
};

const controllerGlobal = globalThis as AboutDetailControllerGlobal;
const existing = controllerGlobal.__rtx5AboutDetailDestinationController;

export const aboutDetailDestinationController =
  existing
    && controllerGlobal.__rtx5AboutDetailDestinationControllerVersion === ABOUT_DETAIL_CONTROLLER_VERSION
    && typeof existing.show === 'function'
    && typeof existing.registerVisualApplier === 'function'
    ? existing
    : createAboutDetailDestinationController();

controllerGlobal.__rtx5AboutDetailDestinationController = aboutDetailDestinationController;
controllerGlobal.__rtx5AboutDetailDestinationControllerVersion = ABOUT_DETAIL_CONTROLLER_VERSION;

export function showAboutDetailDestination(destination: AboutDetailDestination) {
  return aboutDetailDestinationController.show(destination);
}

export function hideAboutDetailDestination(revision?: number) {
  return aboutDetailDestinationController.hide(revision);
}

export function isAboutDetailDestinationVisible() {
  return aboutDetailDestinationController.isVisible();
}
