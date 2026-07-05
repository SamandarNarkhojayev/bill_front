import type { StateCreator } from "zustand";
import type { AppStore } from "../types";
import { defaultSettings } from "../defaults";

export const createSettingsSlice: StateCreator<
  AppStore,
  [],
  [],
  Pick<AppStore, "settings" | "updateSettings">
> = (set, get) => ({
  settings: defaultSettings,

  updateSettings: (updates) => {
    const role = get().currentUser?.role;
    const hasProtectedChanges =
      Object.prototype.hasOwnProperty.call(updates, "tables") ||
      Object.prototype.hasOwnProperty.call(updates, "kitchenSeparate") ||
      Object.prototype.hasOwnProperty.call(updates, "autoPrintKitchenTicket");

    if (hasProtectedChanges && role !== "admin" && role !== "developer") {
      get().addToast(
        "error",
        "Недостаточно прав для изменения настроек бара/кухни/тарифов",
      );
      return;
    }

    set((state) => {
      const newSettings = { ...state.settings, ...updates, currency: "тг" };
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
            status: "free" as const,
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
