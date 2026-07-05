import type { StateCreator } from "zustand";
import type { AppStore } from "../types";
import { generateId } from "../helpers";

export const createUiSlice: StateCreator<
  AppStore,
  [],
  [],
  Pick<
    AppStore,
    | "currentPage"
    | "setCurrentPage"
    | "walkInAccountIntent"
    | "openWalkInAccount"
    | "clearWalkInAccountIntent"
    | "sidebarCollapsed"
    | "toggleSidebar"
    | "toasts"
    | "addToast"
    | "removeToast"
    | "activeModal"
    | "modalData"
    | "openModal"
    | "closeModal"
  >
> = (set, get) => ({
  // ===== НАВИГАЦИЯ =====
  currentPage: "dashboard",
  setCurrentPage: (page) => set({ currentPage: page }),
  walkInAccountIntent: null,
  openWalkInAccount: (label, page, action) =>
    set({
      currentPage: page,
      walkInAccountIntent: { label, action },
    }),
  clearWalkInAccountIntent: () => set({ walkInAccountIntent: null }),

  toasts: [],

  addToast: (type, message, duration = 3000) => {
    const id = generateId();
    set((state) => ({
      toasts: [...state.toasts, { id, type, message, duration }],
    }));
    setTimeout(() => {
      get().removeToast(id);
    }, duration);
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  activeModal: null,
  modalData: null,
  openModal: (modal, data) =>
    set({ activeModal: modal, modalData: data || null }),
  closeModal: () => set({ activeModal: null, modalData: null }),

  sidebarCollapsed: false,
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
});
