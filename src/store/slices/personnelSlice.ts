import type { StateCreator } from "zustand";
import type { AppStore } from "../types";
import { generateId } from "../helpers";

const canManagePersonnel = (role?: string | null) =>
  role === "admin" || role === "developer";

export const createPersonnelSlice: StateCreator<
  AppStore,
  [],
  [],
  Pick<
    AppStore,
    | "personnel"
    | "addPersonnelMember"
    | "updatePersonnelMember"
    | "removePersonnelMember"
    | "assignPersonnelToTable"
    | "assignPersonnelToBarOrder"
  >
> = (set, get) => ({
  personnel: [],

  addPersonnelMember: (name, roleLabel) => {
    if (!canManagePersonnel(get().currentUser?.role)) return;
    const trimmedName = name.trim();
    const trimmedRole = roleLabel.trim();
    if (!trimmedName || !trimmedRole) return;

    set((state) => ({
      personnel: [
        ...state.personnel,
        {
          id: generateId(),
          name: trimmedName,
          roleLabel: trimmedRole,
          createdAt: Date.now(),
          isActive: true,
        },
      ],
    }));
  },

  updatePersonnelMember: (id, updates) => {
    if (!canManagePersonnel(get().currentUser?.role)) return;
    set((state) => ({
      personnel: state.personnel.map((member) =>
        member.id === id
          ? {
              ...member,
              ...updates,
              name: updates.name?.trim() ?? member.name,
              roleLabel: updates.roleLabel?.trim() ?? member.roleLabel,
            }
          : member,
      ),
    }));
  },

  removePersonnelMember: (id) => {
    if (!canManagePersonnel(get().currentUser?.role)) return;
    set((state) => ({
      personnel: state.personnel.filter((member) => member.id !== id),
      tables: state.tables.map((table) =>
        table.currentSession?.assignedPersonnelId === id
          ? {
              ...table,
              currentSession: {
                ...table.currentSession,
                assignedPersonnelId: null,
              },
            }
          : table,
      ),
      barOrders: state.barOrders.map((order) =>
        order.assignedPersonnelId === id
          ? { ...order, assignedPersonnelId: null }
          : order,
      ),
    }));
  },

  assignPersonnelToTable: (tableId, personnelId) => {
    if (!get().settings.personnelEnabled) return;
    set((state) => ({
      tables: state.tables.map((table) =>
        table.id === tableId && table.currentSession
          ? {
              ...table,
              currentSession: {
                ...table.currentSession,
                assignedPersonnelId: personnelId,
              },
            }
          : table,
      ),
    }));
  },

  assignPersonnelToBarOrder: (orderId, personnelId) => {
    if (!get().settings.personnelEnabled) return;
    set((state) => ({
      barOrders: state.barOrders.map((order) =>
        order.id === orderId
          ? { ...order, assignedPersonnelId: personnelId }
          : order,
      ),
    }));
  },
});
