import type { BilliardTable, TableSession, AppSettings } from '../types';
import { getActiveElapsedMs, calculatePausedSessionCost } from './pricing';

export interface SessionCharges {
  durationMinutes: number;
  tableCost: number;
  barCost: number;
  subtotal: number;     // стол + бар (без сервисного сбора)
  serviceCharge: number;
  grandTotal: number;   // subtotal + serviceCharge
}

/**
 * Единый расчёт стоимости сессии на момент `endTime`. Используется и для чека,
 * и для записи в отчёт, и для предпросмотра в модалке закрытия — чтобы суммы
 * везде совпадали до тенге (см. инвариант «чек = отчёт»).
 */
export function computeSessionCharges(
  table: BilliardTable,
  session: TableSession,
  settings: Pick<AppSettings, 'serviceChargeEnabled' | 'serviceChargePercent'>,
  endTime: number,
): SessionCharges {
  const activeMs = getActiveElapsedMs(session.startTime, endTime, session.pausedAt, session.totalPausedMs);
  const durationMinutes = Math.ceil(activeMs / 60000);
  const tableCost = calculatePausedSessionCost(
    session.startTime,
    endTime,
    table.pricePerHour,
    table.priceSchedule,
    session.mode,
    session.fixedAmount,
    session.packagePrice,
    session.pauseIntervals,
  );
  const barCost = session.barOrders.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const subtotal = tableCost + barCost;
  const serviceCharge = settings.serviceChargeEnabled
    ? Math.round((subtotal * settings.serviceChargePercent) / 100)
    : 0;
  return {
    durationMinutes,
    tableCost,
    barCost,
    subtotal,
    serviceCharge,
    grandTotal: subtotal + serviceCharge,
  };
}
