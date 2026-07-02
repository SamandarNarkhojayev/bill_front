// @vitest-environment jsdom
//
// Тесты на data-critical слой стора: сессии, паузы, бар, выручка, смены.
// Проверяют именно бизнес-логику действий (деньги/время), а не персист.
// Побочные каналы (Telegram/CloudSync) в тестах инертны: Telegram выключен по
// умолчанию, CloudSync не залогинен; fetch дополнительно застаблен.
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { useStore } from './useStore';
import type { BilliardTable, BarMenuItem, User } from '../types';

const T0 = 1_700_000_000_000; // фиксированная «точка отсчёта» для детерминизма
const HOUR = 3_600_000;

const makeTable = (): BilliardTable => ({
  id: 1,
  name: 'Стол 1',
  relayNumber: 1,
  status: 'free',
  lightOn: false,
  pricePerHour: 1000,
  priceSchedule: [],
  currentSession: null,
});

const makeDrink = (): BarMenuItem => ({
  id: 'd1',
  name: 'Кола',
  categoryId: 'c1',
  price: 500,
  costPrice: 200,
  available: true,
  image: '',
  stock: 10,
  unit: 'шт',
});

const makeUser = (): User => ({
  id: 'u1',
  username: 'op',
  password: 'x',
  displayName: 'Оператор',
  role: 'admin',
  createdAt: T0,
  createdBy: null,
  isActive: true,
});

// Задать startTime текущей сессии стола (для детерминированного расчёта стоимости).
const setSessionStart = (tableId: number, startTime: number) => {
  useStore.setState((s) => ({
    tables: s.tables.map((t) =>
      t.id === tableId && t.currentSession
        ? { ...t, currentSession: { ...t.currentSession, startTime } }
        : t
    ),
  }));
};

beforeAll(() => {
  // Никаких реальных сетевых вызовов из CloudSync/Telegram.
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) })));
});

beforeEach(() => {
  useStore.setState((s) => ({
    tables: [makeTable()],
    sessionHistory: [],
    completedOrders: [],
    reservations: [],
    currentShift: null,
    shiftHistory: [],
    toasts: [],
    barMenu: [makeDrink()],
    currentUser: makeUser(),
    settings: { ...s.settings, autoLightOff: true, soundEnabled: false, defaultPricePerHour: 1000 },
  }));
});

describe('startSession', () => {
  it('занимает стол и создаёт сессию (unlimited)', () => {
    useStore.getState().startSession(1, 'unlimited');
    const table = useStore.getState().tables[0];
    expect(table.status).toBe('occupied');
    expect(table.lightOn).toBe(true);
    expect(table.currentSession).not.toBeNull();
    expect(table.currentSession!.mode).toBe('unlimited');
    expect(table.currentSession!.plannedDuration).toBeNull();
    expect(table.currentSession!.fixedAmount).toBeNull();
  });

  it('режим «по времени» задаёт plannedDuration в секундах', () => {
    useStore.getState().startSession(1, 'time', { hours: 1, minutes: 30 });
    expect(useStore.getState().tables[0].currentSession!.plannedDuration).toBe(90 * 60);
  });

  it('режим «на сумму» сохраняет fixedAmount', () => {
    useStore.getState().startSession(1, 'amount', { amount: 5000 });
    const sess = useStore.getState().tables[0].currentSession!;
    expect(sess.fixedAmount).toBe(5000);
    expect(sess.mode).toBe('amount');
  });

  it('пакет/тариф сохраняет packagePrice и tariffName', () => {
    useStore.getState().startSession(1, 'time', { plannedDurationSeconds: 7200, packagePrice: 3000, tariffName: 'Ночь' });
    const sess = useStore.getState().tables[0].currentSession!;
    expect(sess.packagePrice).toBe(3000);
    expect(sess.tariffName).toBe('Ночь');
    expect(sess.plannedDuration).toBe(7200);
  });

  it('снимает бронь при запуске забронированного стола', () => {
    useStore.getState().addReservation(1, 'Гость', '+7', T0 + HOUR, '');
    expect(useStore.getState().reservations.length).toBe(1);
    useStore.getState().startSession(1, 'unlimited');
    expect(useStore.getState().reservations.length).toBe(0);
    expect(useStore.getState().tables[0].status).toBe('occupied');
  });
});

describe('endSession', () => {
  it('освобождает стол и пишет запись в историю с корректной стоимостью', () => {
    useStore.getState().startSession(1, 'unlimited');
    setSessionStart(1, T0);
    useStore.getState().endSession(1, T0 + HOUR, 'card'); // ровно 1 час @ 1000/ч

    const table = useStore.getState().tables[0];
    expect(table.status).toBe('free');
    expect(table.currentSession).toBeNull();

    const history = useStore.getState().sessionHistory;
    expect(history.length).toBe(1);
    const rec = history[0];
    expect(rec.tableCost).toBe(1000);
    expect(rec.barCost).toBe(0);
    expect(rec.totalCost).toBe(1000);
    expect(rec.duration).toBe(60);
    expect(rec.paymentMethod).toBe('card');
    expect(rec.endTime).toBe(T0 + HOUR); // фиксированный endTime (инвариант чек=отчёт)
  });

  it('endTimeOverride фиксирует момент завершения (сумма чека = сумма отчёта)', () => {
    useStore.getState().startSession(1, 'unlimited');
    setSessionStart(1, T0);
    const endTime = T0 + HOUR / 2; // 30 минут → 500
    useStore.getState().endSession(1, endTime);
    const rec = useStore.getState().sessionHistory[0];
    expect(rec.endTime).toBe(endTime);
    expect(rec.tableCost).toBe(500);
    expect(rec.duration).toBe(30);
  });

  it('ничего не делает для свободного стола', () => {
    useStore.getState().endSession(1, T0 + HOUR);
    expect(useStore.getState().sessionHistory.length).toBe(0);
  });
});

describe('пауза/возобновление', () => {
  it('исключает время паузы из длительности и стоимости', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(T0);
      useStore.getState().startSession(1, 'unlimited');

      vi.setSystemTime(T0 + 30 * 60_000); // +30 мин игры
      useStore.getState().pauseSession(1);
      expect(useStore.getState().tables[0].currentSession!.pausedAt).toBe(T0 + 30 * 60_000);

      vi.setSystemTime(T0 + 40 * 60_000); // пауза 10 мин
      useStore.getState().resumeSession(1);
      const sess = useStore.getState().tables[0].currentSession!;
      expect(sess.pausedAt).toBeNull();
      expect(sess.totalPausedMs).toBe(10 * 60_000);
      expect(sess.pauseIntervals.length).toBe(1);

      vi.setSystemTime(T0 + 70 * 60_000); // ещё 30 мин игры → всего 60 активных
      useStore.getState().endSession(1);
      const rec = useStore.getState().sessionHistory.at(-1)!;
      expect(rec.duration).toBe(60);
      expect(rec.tableCost).toBe(1000);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('бар', () => {
  it('добавляет заказ к столу, списывает склад и учитывает в итоге', () => {
    useStore.getState().startSession(1, 'unlimited');
    setSessionStart(1, T0);
    const drink = useStore.getState().barMenu[0];
    useStore.getState().addBarOrderToTable(1, drink, 2, { silent: true });

    expect(useStore.getState().barMenu[0].stock).toBe(8); // 10 - 2
    const sess = useStore.getState().tables[0].currentSession!;
    expect(sess.barOrders.length).toBe(1);
    expect(sess.barOrders[0].quantity).toBe(2);

    useStore.getState().endSession(1, T0 + HOUR);
    const rec = useStore.getState().sessionHistory[0];
    expect(rec.barCost).toBe(1000); // 2 × 500
    expect(rec.totalCost).toBe(2000); // 1000 стол + 1000 бар
  });

  it('priceOverride=0 (продукт из пакета тарифа) не добавляет к сумме бара', () => {
    useStore.getState().startSession(1, 'unlimited');
    setSessionStart(1, T0);
    const drink = useStore.getState().barMenu[0];
    useStore.getState().addBarOrderToTable(1, drink, 1, { priceOverride: 0, silent: true });
    useStore.getState().endSession(1, T0 + HOUR);
    expect(useStore.getState().sessionHistory[0].barCost).toBe(0);
  });
});

describe('выручка за день', () => {
  it('getTodayRevenue и getTodaySessions учитывают завершённые сегодня сессии', () => {
    useStore.getState().startSession(1, 'unlimited');
    setSessionStart(1, T0);
    const drink = useStore.getState().barMenu[0];
    useStore.getState().addBarOrderToTable(1, drink, 1, { silent: true }); // +500 бар
    useStore.getState().endSession(1, T0 + HOUR); // +1000 стол

    const rev = useStore.getState().getTodayRevenue();
    expect(rev.table).toBe(1000);
    expect(rev.bar).toBe(500);
    expect(rev.total).toBe(1500);
    expect(useStore.getState().getTodaySessions()).toBe(1);
  });
});

describe('смены', () => {
  it('startShift открывает смену для текущего пользователя', () => {
    useStore.getState().startShift();
    const shift = useStore.getState().currentShift;
    expect(shift).not.toBeNull();
    expect(shift!.isActive).toBe(true);
    expect(shift!.userName).toBe('Оператор');
    expect(shift!.endTime).toBeNull();
  });

  it('endShift закрывает смену и переносит её в историю', () => {
    useStore.getState().startShift();
    useStore.getState().endShift();
    expect(useStore.getState().currentShift).toBeNull();
    expect(useStore.getState().shiftHistory.length).toBe(1);
    const closed = useStore.getState().shiftHistory[0];
    expect(closed.isActive).toBe(false);
    expect(closed.endTime).not.toBeNull();
  });

  it('startShift без пользователя не создаёт смену', () => {
    useStore.setState({ currentUser: null });
    useStore.getState().startShift();
    expect(useStore.getState().currentShift).toBeNull();
  });
});
