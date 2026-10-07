/**
 * Persistent store for manually logged trading-journal entries.
 *
 * The Journal screen shows these merged with entries auto-derived from the
 * account's real closed-trade history; only the manual ones need persisting —
 * the derived ones are rebuilt from live backend data on every visit.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { filterJournalEntriesByRetention } from '../features/settings/JournalScreen/journalRetention';
import type { TradeJournalEntry } from '../features/settings/JournalScreen/types';

type JournalState = {
  manualEntries: TradeJournalEntry[];
  addEntry: (entry: TradeJournalEntry) => void;
  removeEntry: (id: string) => void;
  pruneExpiredEntries: (nowMs?: number) => void;
};

export const useJournalState = create<JournalState>()(
  persist(
    (set) => ({
      manualEntries: [],
      addEntry: (entry) =>
        set((state) => ({ manualEntries: [entry, ...state.manualEntries] })),
      removeEntry: (id) =>
        set((state) => ({
          manualEntries: state.manualEntries.filter((entry) => entry.id !== id),
        })),
      pruneExpiredEntries: (nowMs = Date.now()) =>
        set((state) => ({
          manualEntries: filterJournalEntriesByRetention(state.manualEntries, nowMs),
        })),
    }),
    {
      name: 'tradeJournalEntries',
      // Corrupt-data tolerant: malformed persisted blobs are dropped instead
      // of throwing during rehydrate (mirrors savedAccounts).
      storage: createJSONStorage(() => ({
        getItem: async (name) => {
          try {
            const value = await AsyncStorage.getItem(name);
            if (value == null) return null;
            JSON.parse(value);
            return value;
          } catch (error) {
            console.error('[Journal] Ignoring unreadable persisted journal', error);
            void AsyncStorage.removeItem(name).catch(() => {});
            return null;
          }
        },
        setItem: (name, value) => AsyncStorage.setItem(name, value),
        removeItem: (name) => AsyncStorage.removeItem(name),
      })),
      partialize: (state) => ({ manualEntries: state.manualEntries }),
    },
  ),
);
