import type { StateCreator } from 'zustand';
import type { AppStore } from '../types';

export const createCatalogSlice: StateCreator<AppStore, [], [], Pick<AppStore, 'tournaments' | 'addTournament' | 'updateTournament' | 'removeTournament' | 'tariffs' | 'addTariff' | 'updateTariff' | 'removeTariff'>> = (set) => ({
      // ===== ТУРНИРЫ =====
      tournaments: [],

      addTournament: (tournament) => {
        set((state) => ({ tournaments: [...state.tournaments, tournament] }));
      },

      updateTournament: (id, updates) => {
        set((state) => ({
          tournaments: state.tournaments.map((t) =>
            t.id === id ? { ...t, ...updates } : t
          ),
        }));
      },

      removeTournament: (id) => {
        set((state) => ({
          tournaments: state.tournaments.filter((t) => t.id !== id),
        }));
      },

      // ===== ТАРИФЫ =====
      tariffs: [],

      addTariff: (tariff) => {
        set((state) => ({ tariffs: [...state.tariffs, tariff] }));
      },

      updateTariff: (id, updates) => {
        set((state) => ({
          tariffs: state.tariffs.map((t) =>
            t.id === id ? { ...t, ...updates } : t
          ),
        }));
      },

      removeTariff: (id) => {
        set((state) => ({
          tariffs: state.tariffs.filter((t) => t.id !== id),
        }));
      },

});
