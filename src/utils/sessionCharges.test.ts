import { describe, it, expect } from 'vitest';
import { computeSessionCharges } from './sessionCharges';
import type { BilliardTable, TableSession, AppSettings, BarOrderItem } from '../types';

const HOUR = 60 * 60 * 1000;
const BASE = new Date(2026, 0, 1, 12, 0, 0, 0).getTime();

const makeTable = (over: Partial<BilliardTable> = {}): BilliardTable => ({
  id: 1,
  name: 'Стол №1',
  relayNumber: 1,
  status: 'occupied',
  lightOn: true,
  pricePerHour: 2000,
  priceSchedule: [],
  currentSession: null,
  ...over,
});

const makeBarItem = (price: number, quantity: number): BarOrderItem => ({
  id: Math.random().toString(36).slice(2),
  menuItemId: 'm1',
  menuItemName: 'Кола',
  quantity,
  price,
  timestamp: BASE,
});

const makeSession = (over: Partial<TableSession> = {}): TableSession => ({
  id: 's1',
  tableId: 1,
  startTime: BASE,
  endTime: null,
  mode: 'unlimited',
  tariffName: null,
  plannedDuration: null,
  fixedAmount: null,
  packagePrice: null,
  pausedAt: null,
  totalPausedMs: 0,
  pauseIntervals: [],
  barOrders: [],
  totalTableCost: 0,
  totalBarCost: 0,
  isPaid: false,
  ...over,
});

const settings = (over: Partial<AppSettings> = {}): AppSettings =>
  ({ serviceChargeEnabled: false, serviceChargePercent: 10, ...over } as AppSettings);

describe('computeSessionCharges', () => {
  it('базовый расчёт: 2 часа по 2000/час без бара', () => {
    const r = computeSessionCharges(makeTable(), makeSession(), settings(), BASE + 2 * HOUR);
    expect(r.tableCost).toBe(4000);
    expect(r.barCost).toBe(0);
    expect(r.subtotal).toBe(4000);
    expect(r.serviceCharge).toBe(0);
    expect(r.grandTotal).toBe(4000);
    expect(r.durationMinutes).toBe(120);
  });

  it('суммирует бар-заказы', () => {
    const session = makeSession({ barOrders: [makeBarItem(600, 2), makeBarItem(300, 1)] });
    const r = computeSessionCharges(makeTable(), session, settings(), BASE + HOUR);
    expect(r.barCost).toBe(1500);
    expect(r.tableCost).toBe(2000);
    expect(r.grandTotal).toBe(3500);
  });

  it('сервисный сбор 10% ТОЛЬКО с бара (стол в базу не входит)', () => {
    const session = makeSession({ barOrders: [makeBarItem(1000, 1)] });
    const r = computeSessionCharges(makeTable(), session, settings({ serviceChargeEnabled: true, serviceChargePercent: 10 }), BASE + HOUR);
    expect(r.subtotal).toBe(3000);          // 2000 стол + 1000 бар
    expect(r.serviceCharge).toBe(100);      // 10% от 1000 (бар), стол не облагается
    expect(r.grandTotal).toBe(3100);        // 3000 + 100
  });

  it('сервисный сбор без бара = 0 (только стол)', () => {
    const r = computeSessionCharges(makeTable(), makeSession(), settings({ serviceChargeEnabled: true, serviceChargePercent: 10 }), BASE + 2 * HOUR);
    expect(r.tableCost).toBe(4000);
    expect(r.serviceCharge).toBe(0);        // нет бара → нет сбора
    expect(r.grandTotal).toBe(4000);
  });

  it('ИНВАРИАНТ чек=отчёт: один и тот же endTime даёт идентичный результат', () => {
    const table = makeTable();
    const session = makeSession({ barOrders: [makeBarItem(550, 3)] });
    const endTime = BASE + 137 * 60 * 1000; // произвольный момент
    const a = computeSessionCharges(table, session, settings(), endTime);
    const b = computeSessionCharges(table, session, settings(), endTime);
    expect(a).toEqual(b); // чек и запись в отчёт считаются по одному endTime → совпадают
  });

  it('пакетная цена (тариф) перекрывает почасовой расчёт', () => {
    const session = makeSession({ packagePrice: 5000 });
    const r = computeSessionCharges(makeTable(), session, settings(), BASE + 10 * HOUR);
    expect(r.tableCost).toBe(5000);
  });
});
