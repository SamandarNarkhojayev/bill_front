import type { SessionMode, TablePriceRule, PauseInterval } from '../types';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const toDayStart = (timestamp: number) => {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
};

export const parseTimeToMinutes = (value: string): number => {
  const [hours = '0', minutes = '0'] = value.split(':');
  const parsedHours = Number(hours);
  const parsedMinutes = Number(minutes);

  if (!Number.isFinite(parsedHours) || !Number.isFinite(parsedMinutes)) {
    return 0;
  }

  return (parsedHours * 60) + parsedMinutes;
};

export const isMinuteInRange = (currentMinute: number, startMinute: number, endMinute: number): boolean => {
  if (startMinute === endMinute) return true;
  if (startMinute < endMinute) {
    return currentMinute >= startMinute && currentMinute < endMinute;
  }
  return currentMinute >= startMinute || currentMinute < endMinute;
};

const normalizePriceSchedule = (schedule?: TablePriceRule[]): TablePriceRule[] => {
  if (!Array.isArray(schedule)) return [];

  return schedule
    .filter((rule) => rule && Number.isFinite(rule.pricePerHour) && rule.pricePerHour >= 0)
    .slice()
    .sort((left, right) => parseTimeToMinutes(left.startTime) - parseTimeToMinutes(right.startTime));
};

export const getCurrentPricePerHour = (
  timestamp: number,
  basePricePerHour: number,
  priceSchedule?: TablePriceRule[]
): number => {
  const normalizedSchedule = normalizePriceSchedule(priceSchedule);
  if (normalizedSchedule.length === 0) {
    return basePricePerHour;
  }

  const date = new Date(timestamp);
  const currentMinute = (date.getHours() * 60) + date.getMinutes();
  const matchedRule = normalizedSchedule.find((rule) => (
    isMinuteInRange(currentMinute, parseTimeToMinutes(rule.startTime), parseTimeToMinutes(rule.endTime))
  ));

  return matchedRule?.pricePerHour ?? basePricePerHour;
};

const getNextScheduleBoundary = (timestamp: number, priceSchedule?: TablePriceRule[]): number => {
  const normalizedSchedule = normalizePriceSchedule(priceSchedule);
  if (normalizedSchedule.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  const dayStart = toDayStart(timestamp);
  let nextBoundary = Number.POSITIVE_INFINITY;

  normalizedSchedule.forEach((rule) => {
    const boundaryMinutes = [parseTimeToMinutes(rule.startTime), parseTimeToMinutes(rule.endTime)];

    boundaryMinutes.forEach((minute) => {
      let candidate = dayStart + (minute * MINUTE_MS);
      while (candidate <= timestamp) {
        candidate += DAY_MS;
      }
      if (candidate < nextBoundary) {
        nextBoundary = candidate;
      }
    });
  });

  return nextBoundary;
};

/**
 * Активное (тарифицируемое) время сессии в мс — без учёта пауз.
 * Во время паузы значение «замораживается»: текущая пауза вычитается целиком.
 */
export const getActiveElapsedMs = (
  startTime: number,
  now: number,
  pausedAt: number | null | undefined,
  totalPausedMs: number | null | undefined
): number => {
  const completedPaused = typeof totalPausedMs === 'number' && totalPausedMs > 0 ? totalPausedMs : 0;
  const currentPause = pausedAt ? Math.max(0, now - pausedAt) : 0;
  return Math.max(0, now - startTime - completedPaused - currentPause);
};

export const calculateSessionTableCost = (
  startTime: number,
  endTime: number,
  basePricePerHour: number,
  priceSchedule: TablePriceRule[] | undefined,
  mode: SessionMode,
  fixedAmount: number | null,
  packagePrice?: number | null
): number => {
  const normalizedPackagePrice = typeof packagePrice === 'number' && Number.isFinite(packagePrice) && packagePrice > 0
    ? packagePrice
    : null;

  if (normalizedPackagePrice !== null) {
    return normalizedPackagePrice;
  }

  if (endTime <= startTime) {
    return 0;
  }

  let totalCost = 0;
  let cursor = startTime;

  while (cursor < endTime) {
    const pricePerHour = getCurrentPricePerHour(cursor, basePricePerHour, priceSchedule);
    const nextBoundary = getNextScheduleBoundary(cursor, priceSchedule);
    const segmentEnd = Math.min(endTime, nextBoundary);

    totalCost += ((segmentEnd - cursor) / HOUR_MS) * pricePerHour;
    cursor = segmentEnd;
  }

  const roundedCost = Math.ceil(totalCost);
  if (mode === 'amount' && fixedAmount) {
    return Math.min(roundedCost, fixedAmount);
  }

  return roundedCost;
};

/**
 * Стоимость сессии с учётом пауз и тарифной сетки по времени суток.
 * Считает реальные интервалы активной игры (исключая паузы) по реальному времени,
 * поэтому час до и после паузы тарифицируется по своей ставке (в отличие от
 * упрощённого startTime+activeMs, который смещает окно и недосчитывает на границе тарифа).
 */
export const calculatePausedSessionCost = (
  startTime: number,
  referenceEnd: number,
  basePricePerHour: number,
  priceSchedule: TablePriceRule[] | undefined,
  mode: SessionMode,
  fixedAmount: number | null,
  packagePrice: number | null | undefined,
  pauseIntervals: PauseInterval[] | undefined
): number => {
  const normalizedPackagePrice = typeof packagePrice === 'number' && Number.isFinite(packagePrice) && packagePrice > 0
    ? packagePrice
    : null;
  if (normalizedPackagePrice !== null) {
    return normalizedPackagePrice;
  }
  if (referenceEnd <= startTime) {
    return 0;
  }

  // Паузы, обрезанные до окна [startTime, referenceEnd]; открытая пауза тянется до referenceEnd
  const spans = (pauseIntervals || [])
    .map((iv) => ({
      start: Math.max(startTime, iv.start),
      end: Math.min(referenceEnd, iv.end ?? referenceEnd),
    }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start);

  // Суммируем стоимость по активным сегментам (mode='unlimited' — без капа на сегменте)
  let raw = 0;
  let cursor = startTime;
  for (const span of spans) {
    if (span.start > cursor) {
      raw += calculateSessionTableCost(cursor, span.start, basePricePerHour, priceSchedule, 'unlimited', null);
    }
    cursor = Math.max(cursor, span.end);
  }
  if (cursor < referenceEnd) {
    raw += calculateSessionTableCost(cursor, referenceEnd, basePricePerHour, priceSchedule, 'unlimited', null);
  }

  if (mode === 'amount' && fixedAmount) {
    return Math.min(raw, fixedAmount);
  }
  return raw;
};

export const estimateCostForDuration = (
  startTime: number,
  durationSeconds: number,
  basePricePerHour: number,
  priceSchedule?: TablePriceRule[]
): number => {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return 0;
  }

  return calculateSessionTableCost(
    startTime,
    startTime + (durationSeconds * 1000),
    basePricePerHour,
    priceSchedule,
    'time',
    null
  );
};

export const estimateDurationSecondsForAmount = (
  startTime: number,
  amount: number,
  basePricePerHour: number,
  priceSchedule?: TablePriceRule[]
): number => {
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }

  let remainingAmount = amount;
  let elapsedMs = 0;
  let cursor = startTime;
  let guard = 0;

  while (remainingAmount > 0 && guard < 1000) {
    guard += 1;
    const pricePerHour = getCurrentPricePerHour(cursor, basePricePerHour, priceSchedule);

    if (pricePerHour <= 0) {
      const nextBoundary = getNextScheduleBoundary(cursor, priceSchedule);
      if (!Number.isFinite(nextBoundary)) {
        return 0;
      }
      elapsedMs += nextBoundary - cursor;
      cursor = nextBoundary;
      continue;
    }

    const nextBoundary = getNextScheduleBoundary(cursor, priceSchedule);

    if (!Number.isFinite(nextBoundary)) {
      elapsedMs += (remainingAmount / pricePerHour) * HOUR_MS;
      remainingAmount = 0;
      break;
    }

    const segmentMs = nextBoundary - cursor;
    const segmentCost = (segmentMs / HOUR_MS) * pricePerHour;

    if (segmentCost >= remainingAmount) {
      elapsedMs += (remainingAmount / pricePerHour) * HOUR_MS;
      remainingAmount = 0;
      break;
    }

    remainingAmount -= segmentCost;
    elapsedMs += segmentMs;
    cursor = nextBoundary;
  }

  return Math.max(1, Math.ceil(elapsedMs / 1000));
};