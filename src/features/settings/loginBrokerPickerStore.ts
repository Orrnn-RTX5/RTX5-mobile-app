// The login screen is one large component. Keeping the broker picker's open
// flag in its useState meant every open/close re-rendered the whole form inside
// the touch event, which blew the 20ms first-frame budget. This store lets only
// the picker button and the sheet subscribe to the flag.
export type LoginBrokerPickerStore = {
  isOpen: () => boolean;
  open: () => void;
  close: () => void;
  subscribe: (listener: () => void) => () => void;
};

export function createLoginBrokerPickerStore(): LoginBrokerPickerStore {
  let open = false;
  const listeners = new Set<() => void>();
  const setOpen = (next: boolean) => {
    if (open === next) return;
    open = next;
    listeners.forEach((listener) => listener());
  };
  return {
    isOpen: () => open,
    open: () => setOpen(true),
    close: () => setOpen(false),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
