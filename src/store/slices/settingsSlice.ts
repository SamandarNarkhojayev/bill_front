import type { StateCreator } from 'zustand';
import type { AppStore } from '../types';
import { defaultSettings } from '../defaults';

export const createSettingsSlice: StateCreator<AppStore, [], [], Pick<AppStore, 'settings' | 'updateSettings'>> = (set) => ({
      settings: defaultSettings,

      updateSettings: (updates) => {
        set((state) => {
          const newSettings = { ...state.settings, ...updates, currency: 'тг' };
          let newTables = state.tables;
          if (updates.tables) {
            newTables = newSettings.tables.map((st) => {
              const existing = state.tables.find((t) => t.id === st.id);
              if (existing) {
                return {
                  ...existing,
                  name: st.name,
                  relayNumber: st.relayNumber,
                  pricePerHour: st.pricePerHour,
                  priceSchedule: st.priceSchedule || [],
                };
              }
              return {
                id: st.id,
                name: st.name,
                relayNumber: st.relayNumber,
                status: 'free' as const,
                lightOn: false,
                pricePerHour: st.pricePerHour,
                priceSchedule: st.priceSchedule || [],
                currentSession: null,
              };
            });
          }
          return { settings: newSettings, tables: newTables };
        });
      },

});
