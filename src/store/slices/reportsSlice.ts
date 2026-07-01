import type { StateCreator } from 'zustand';
import type { AppStore } from '../types';
import { localDateStr } from '../helpers';

export const createReportsSlice: StateCreator<AppStore, [], [], Pick<AppStore, 'sessionHistory' | 'completedOrders' | 'addSessionRecord' | 'getTodayRevenue' | 'getTodaySessions'>> = (set, get) => ({
      sessionHistory: [],
      completedOrders: [],

      addSessionRecord: (record) => {
        set((state) => ({
          sessionHistory: [...state.sessionHistory, record],
        }));
      },

      getTodayRevenue: () => {
        const today = localDateStr();
        const todaySessions = get().sessionHistory.filter((s) => s.date === today);
        const tableRev = todaySessions.reduce((sum, s) => sum + (Number.isFinite(s.tableCost) ? s.tableCost : 0), 0);
        const barRev = todaySessions.reduce((sum, s) => sum + (Number.isFinite(s.barCost) ? s.barCost : 0), 0);
        return { table: tableRev, bar: barRev, total: tableRev + barRev };
      },

      getTodaySessions: () => {
        const today = localDateStr();
        return get().sessionHistory.filter((s) => s.date === today).length;
      },

});
