import { describe, it, expect } from 'vitest';
import {
  parseTimeToMinutes,
  isMinuteInRange,
  getCurrentPricePerHour,
  getActiveElapsedMs,
  calculateSessionTableCost,
  calculatePausedSessionCost,
  estimateCostForDuration,
} from './pricing';
import type { TablePriceRule } from '../types';

const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;

// Фиксированная точка отсчёта (полночь) — чтобы тарифная сетка по времени суток была предсказуемой.
const BASE = new Date(2026, 0, 1, 0, 0, 0, 0).getTime();
const at = (h: number, m = 0) => BASE + h * HOUR + m * MIN;

describe('parseTimeToMinutes', () => {
  it('парсит HH:MM в минуты', () => {
    expect(parseTimeToMinutes('00:00')).toBe(0);
    expect(parseTimeToMinutes('09:30')).toBe(570);
    expect(parseTimeToMinutes('23:59')).toBe(1439);
  });
  it('некорректный ввод → 0', () => {
    expect(parseTimeToMinutes('abc')).toBe(0);
  });
});

describe('isMinuteInRange', () => {
  it('обычный диапазон', () => {
    expect(isMinuteInRange(600, 540, 720)).toBe(true);   // 10:00 ∈ [09:00,12:00)
    expect(isMinuteInRange(720, 540, 720)).toBe(false);  // конец исключён
  });
  it('диапазон через полночь', () => {
    expect(isMinuteInRange(30, 1380, 120)).toBe(true);   // 00:30 ∈ [23:00,02:00)
    expect(isMinuteInRange(180, 1380, 120)).toBe(false); // 03:00 — нет
  });
});

describe('getCurrentPricePerHour', () => {
  const schedule: TablePriceRule[] = [
    { id: '1', startTime: '00:00', endTime: '18:00', pricePerHour: 2000 },
    { id: '2', startTime: '18:00', endTime: '00:00', pricePerHour: 3000 },
  ];
  it('без расписания → базовая ставка', () => {
    expect(getCurrentPricePerHour(at(12), 2500, [])).toBe(2500);
  });
  it('дневная ставка', () => {
    expect(getCurrentPricePerHour(at(12), 0, schedule)).toBe(2000);
  });
  it('вечерняя ставка', () => {
    expect(getCurrentPricePerHour(at(20), 0, schedule)).toBe(3000);
  });
});

describe('getActiveElapsedMs', () => {
  it('без пауз — всё время активно', () => {
    expect(getActiveElapsedMs(at(0), at(1), null, 0)).toBe(HOUR);
  });
  it('вычитает завершённые паузы', () => {
    expect(getActiveElapsedMs(at(0), at(2), null, 30 * MIN)).toBe(2 * HOUR - 30 * MIN);
  });
  it('вычитает текущую (открытую) паузу целиком', () => {
    // пауза началась 10 минут назад → эти 10 минут не тарифицируются
    expect(getActiveElapsedMs(at(0), at(1), at(0) + 50 * MIN, 0)).toBe(50 * MIN);
  });
  it('не уходит в минус', () => {
    expect(getActiveElapsedMs(at(0), at(0), null, 999 * HOUR)).toBe(0);
  });
});

describe('calculateSessionTableCost', () => {
  it('один час по флэт-ставке', () => {
    expect(calculateSessionTableCost(at(0), at(1), 2000, [], 'unlimited', null)).toBe(2000);
  });
  it('округляет вверх (ceil)', () => {
    // 1.5 минуты при 2000/час = 50 → точное; возьмём дробный случай
    const cost = calculateSessionTableCost(at(0), at(0) + 90 * 1000, 2000, [], 'unlimited', null);
    expect(cost).toBe(Math.ceil((90 / 3600) * 2000)); // = 50
  });
  it('packagePrice перекрывает расчёт', () => {
    expect(calculateSessionTableCost(at(0), at(5), 2000, [], 'unlimited', null, 7000)).toBe(7000);
  });
  it('режим amount ограничен fixedAmount (cap)', () => {
    // 5 часов * 2000 = 10000, но cap 5000
    expect(calculateSessionTableCost(at(0), at(5), 2000, [], 'amount', 5000)).toBe(5000);
  });
  it('нулевая/обратная длительность → 0', () => {
    expect(calculateSessionTableCost(at(1), at(0), 2000, [], 'unlimited', null)).toBe(0);
  });
  it('тарифная сетка: переход дневной→вечерней ставки', () => {
    const schedule: TablePriceRule[] = [
      { id: '1', startTime: '00:00', endTime: '18:00', pricePerHour: 2000 },
      { id: '2', startTime: '18:00', endTime: '00:00', pricePerHour: 3000 },
    ];
    // с 17:00 до 19:00 = 1ч*2000 + 1ч*3000 = 5000
    expect(calculateSessionTableCost(at(17), at(19), 0, schedule, 'unlimited', null)).toBe(5000);
  });
});

// Сигнатура: (startTime, referenceEnd, basePricePerHour, priceSchedule, mode, fixedAmount, packagePrice, pauseIntervals)
describe('calculatePausedSessionCost', () => {
  it('без пауз совпадает с обычным расчётом', () => {
    const flat = calculateSessionTableCost(at(0), at(2), 2000, [], 'unlimited', null);
    const paused = calculatePausedSessionCost(at(0), at(2), 2000, [], 'unlimited', null, null, []);
    expect(paused).toBe(flat);
    expect(paused).toBe(4000);
  });
  it('исключает время паузы из тарификации', () => {
    // 2 часа, но 1 час пауза → тарифицируется 1 час = 2000
    const cost = calculatePausedSessionCost(
      at(0), at(2), 2000, [], 'unlimited', null, null,
      [{ start: at(0) + 30 * MIN, end: at(0) + 90 * MIN }],
    );
    expect(cost).toBe(2000);
  });
  it('открытая (незавершённая) пауза тянется до конца', () => {
    // пауза началась на 90-й минуте и не закрыта → активны первые 90 мин = 1.5ч = 3000
    const cost = calculatePausedSessionCost(
      at(0), at(2), 2000, [], 'unlimited', null, null,
      [{ start: at(0) + 90 * MIN, end: null }],
    );
    expect(cost).toBe(3000);
  });
  it('packagePrice перекрывает', () => {
    expect(calculatePausedSessionCost(at(0), at(3), 2000, [], 'unlimited', null, 9000, [])).toBe(9000);
  });
  it('amount cap соблюдается', () => {
    expect(calculatePausedSessionCost(at(0), at(5), 2000, [], 'amount', 4000, null, [])).toBe(4000);
  });
});

describe('estimateCostForDuration', () => {
  it('оценивает стоимость по длительности (сек)', () => {
    expect(estimateCostForDuration(at(0), 3600, 2000, [])).toBe(2000);
  });
  it('нулевая длительность → 0', () => {
    expect(estimateCostForDuration(at(0), 0, 2000, [])).toBe(0);
  });
});
