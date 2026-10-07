import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type TradeNotificationsState = {
  enabledKeys: Record<string, true>;
  setEnabled: (key: string, enabled: boolean) => void;
};

type PersistedTradeNotificationsState = Pick<TradeNotificationsState, 'enabledKeys'>;

const STORAGE_KEY = 'tradeNotifications';

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const normalizeEnabledKeys = (value: unknown): Record<string, true> => {
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
        .map((key) => [key, true] as const),
    );
  }

  return Object.fromEntries(
    Object.entries(asRecord(value))
      .filter(([key, enabled]) => key.trim().length > 0 && enabled === true)
      .map(([key]) => [key, true] as const),
  );
};

const normalizeTradeNotificationsPersistedState = (
  state: unknown,
): PersistedTradeNotificationsState => ({
  enabledKeys: normalizeEnabledKeys(asRecord(state).enabledKeys),
});

const tradeNotificationsStorage = createJSONStorage<PersistedTradeNotificationsState>(() => ({
  getItem: async (name) => {
    try {
      const value = await AsyncStorage.getItem(name);
      if (value == null) return null;
      JSON.parse(value);
      return value;
    } catch (error) {
      console.error('[TradeNotifications] Ignoring unreadable persisted settings', error);
      void AsyncStorage.removeItem(name).catch(() => {});
      return null;
    }
  },
  setItem: (name, value) => AsyncStorage.setItem(name, value),
  removeItem: (name) => AsyncStorage.removeItem(name),
}));

export const useTradeNotifications = create<TradeNotificationsState>()(
  persist(
    (set) => ({
      enabledKeys: {},
      setEnabled: (key, enabled) =>
        set((state) => {
          if (enabled) {
            if (state.enabledKeys[key]) return state;
            return { enabledKeys: { ...state.enabledKeys, [key]: true } };
          }
          if (!state.enabledKeys[key]) return state;
          const next = { ...state.enabledKeys };
          delete next[key];
          return { enabledKeys: next };
        }),
    }),
    {
      name: STORAGE_KEY,
      storage: tradeNotificationsStorage,
      partialize: (state) => ({ enabledKeys: state.enabledKeys }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...normalizeTradeNotificationsPersistedState(persistedState),
      }),
    },
  ),
);

export function buildTradeNotificationKey(brokerId: string, login: string) {
  return `${brokerId}:${login}`;
}
