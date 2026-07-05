import type { StateCreator } from "zustand";
import type { AppStore } from "../types";

export const createCatalogSlice: StateCreator<
  AppStore,
  [],
  [],
  Pick<
    AppStore,
    | "tournaments"
    | "addTournament"
    | "updateTournament"
    | "removeTournament"
    | "tariffs"
    | "addTariff"
    | "updateTariff"
    | "removeTariff"
  >
> = (set, get) => ({
  // ===== ТУРНИРЫ =====
  tournaments: [],

  addTournament: (tournament) => {
    set((state) => ({ tournaments: [...state.tournaments, tournament] }));
  },

  updateTournament: (id, updates) => {
    set((state) => ({
      tournaments: state.tournaments.map((t) =>
        t.id === id ? { ...t, ...updates } : t,
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
    const role = get().currentUser?.role;
    if (role !== "admin" && role !== "developer") {
      get().addToast("error", "Недостаточно прав для изменения тарифов");
      return;
    }
    set((state) => ({ tariffs: [...state.tariffs, tariff] }));
  },

  updateTariff: (id, updates) => {
    const role = get().currentUser?.role;
    if (role !== "admin" && role !== "developer") {
      get().addToast("error", "Недостаточно прав для изменения тарифов");
      return;
    }
    set((state) => ({
      tariffs: state.tariffs.map((t) =>
        t.id === id ? { ...t, ...updates } : t,
      ),
    }));
  },

  removeTariff: (id) => {
    const role = get().currentUser?.role;
    if (role !== "admin" && role !== "developer") {
      get().addToast("error", "Недостаточно прав для изменения тарифов");
      return;
    }
    set((state) => ({
      tariffs: state.tariffs.filter((t) => t.id !== id),
    }));
  },
});
