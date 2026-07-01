import type { StateCreator } from 'zustand';
import type { AppStore } from '../types';
import type { User, Shift } from '../../types';
import { generateId, hashPassword } from '../helpers';
import { defaultUsers } from '../defaults';
import { translate } from '../../i18n/translate';
import cloudSync from '../../utils/cloudSync';
import telegram from '../../utils/telegram';

export const createAuthSlice: StateCreator<AppStore, [], [], Pick<AppStore, 'isAuthenticated' | 'currentUser' | 'users' | 'login' | 'logout' | 'addUser' | 'updateUser' | 'changeUserPassword' | 'removeUser' | 'currentShift' | 'shiftHistory' | 'startShift' | 'endShift' | 'confirmEndShiftAndLogout'>> = (set, get) => ({
      // ===== АВТОРИЗАЦИЯ =====
      isAuthenticated: false,
      currentUser: null,
      users: defaultUsers,

      login: (username, password) => {
        const hashedPass = hashPassword(password);
        const user = get().users.find(
          (u) => u.username === username && u.password === hashedPass && u.isActive
        );
        if (user) {
          // Отмечаем время входа (для сортировки на экране выбора пользователя).
          const loginAt = Date.now();
          const updatedUser = { ...user, lastLoginAt: loginAt };
          set((state) => ({
            isAuthenticated: true,
            currentUser: updatedUser,
            users: state.users.map((u) => (u.id === user.id ? updatedUser : u)),
          }));
          // Завершаем предыдущую смену, если она была активна (например, при внезапном закрытии приложения)
          if (get().currentShift) {
            get().endShift();
            get().addToast('info', translate(get().settings.language, 'toasts.prev_shift_closed'));
          }
          // Автоматически стартуем новую смену при входе
          const shift: Shift = {
            id: generateId(),
            userId: user.id,
            userName: user.displayName,
            startTime: Date.now(),
            endTime: null,
            isActive: true,
          };
          set({ currentShift: shift });
          return true;
        }
        return false;
      },

      logout: () => {
        const shift = get().currentShift;
        if (shift?.isActive) {
          // Открываем модалку подтверждения завершения смены
          get().openModal('logout-confirm', { shift });
        } else {
          // Выходим без модалки
          set({ isAuthenticated: false, currentUser: null, currentPage: 'dashboard' });
        }
      },

      confirmEndShiftAndLogout: () => {
        const shift = get().currentShift;
        if (shift?.isActive) {
          get().endShift();
        }
        get().closeModal();
        set({ isAuthenticated: false, currentUser: null, currentPage: 'dashboard' });
      },

      addUser: (username, password, displayName, role) => {
        const existing = get().users.find((u) => u.username === username);
        if (existing) return false;
        const currentUser = get().currentUser;
        const newUser: User = {
          id: generateId(),
          username,
          password: hashPassword(password),
          displayName,
          role,
          createdAt: Date.now(),
          createdBy: currentUser?.id || null,
          isActive: true,
        };
        set((state) => ({ users: [...state.users, newUser] }));
        return true;
      },

      updateUser: (id, updates) => {
        set((state) => ({
          users: state.users.map((u) => (u.id === id ? { ...u, ...updates } : u)),
        }));
      },

      changeUserPassword: (id, newPassword) => {
        set((state) => ({
          users: state.users.map((u) =>
            u.id === id ? { ...u, password: hashPassword(newPassword) } : u
          ),
        }));
      },

      removeUser: (id) => {
        set((state) => ({
          users: state.users.filter((u) => u.id !== id),
        }));
      },

      // ===== СМЕНЫ =====
      currentShift: null,
      shiftHistory: [],

      startShift: () => {
        const user = get().currentUser;
        if (!user) return;
        const shift: Shift = {
          id: generateId(),
          userId: user.id,
          userName: user.displayName,
          startTime: Date.now(),
          endTime: null,
          isActive: true,
        };
        set({ currentShift: shift });
        // Облако: пушим открытую смену сразу (endTime=null, totals=0).
        void cloudSync.pushShift({
          id: shift.id,
          operatorId: shift.userId,
          operatorName: shift.userName,
          startTime: shift.startTime,
          endTime: null,
          totalRevenue: 0,
          tableRevenue: 0,
          barRevenue: 0,
          sessionsCount: 0,
        });
      },

      endShift: () => {
        const shift = get().currentShift;
        if (!shift) return;
        const ended = { ...shift, endTime: Date.now(), isActive: false };
        // Считаем итоги смены из sessionHistory: все, что попали в интервал [startTime, endTime].
        const sessions = get().sessionHistory.filter(
          (s) => s.startTime >= shift.startTime && s.startTime <= (ended.endTime as number),
        );
        const tableRevenue = sessions.reduce((sum, s) => sum + (s.tableCost || 0), 0);
        const barRevenue = sessions.reduce((sum, s) => sum + (s.barCost || 0), 0);
        set((state) => ({
          currentShift: null,
          shiftHistory: [ended, ...state.shiftHistory],
        }));
        // Облако: пушим закрытую смену с итогами.
        void cloudSync.pushShift({
          id: shift.id,
          operatorId: shift.userId,
          operatorName: shift.userName,
          startTime: shift.startTime,
          endTime: ended.endTime,
          totalRevenue: tableRevenue + barRevenue,
          tableRevenue,
          barRevenue,
          sessionsCount: sessions.length,
        });
        // Telegram: отчёт владельцу клуба о закрытии смены.
        telegram.notifyShiftClosed({
          operatorName: shift.userName,
          startTime: shift.startTime,
          endTime: ended.endTime as number,
          tableRevenue,
          barRevenue,
          totalRevenue: tableRevenue + barRevenue,
          sessionsCount: sessions.length,
          currency: get().settings.currency,
          clubName: get().settings.clubName,
        });
      },

});
