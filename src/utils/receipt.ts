import type { BarOrderItem, SessionMode, SessionRecord, BilliardTable, TableSession, AppSettings } from '../types';
import { computeSessionCharges } from './sessionCharges';

interface ReceiptData {
  clubName: string;
  receiptCompanyName?: string;
  receiptCity?: string;
  receiptPhone?: string;
  receiptCashierName?: string;
  orderNumber?: string;
  tableName: string;
  mode: SessionMode;
  startTime: number;
  endTime: number;
  duration: number; // минуты
  tableCost: number;
  barOrders: BarOrderItem[];
  barCost: number;
  totalCost: number;
  currency: string;
  // Процент за обслуживание (необязательно). Если задан и > 0 — печатается строкой в чеке.
  serviceChargePercent?: number;
  serviceCharge?: number;
  // Настройки размера (опциональные, есть дефолты)
  receiptWidthMm?: number;
  receiptFontSize?: number;
  receiptPaddingMm?: number;
}

// Экранирование пользовательских строк перед вставкой в HTML чека/талона
const escapeHtml = (value: string): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatShortDateTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  const d = date.toLocaleDateString('ru-RU');
  const t = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return `${d} ${t}`;
};

const getFallbackOrderNumber = (timestamp: number): string => {
  const n = timestamp % 1000;
  return String(n).padStart(3, '0');
};

const getModeLabel = (mode: SessionMode): string => {
  switch (mode) {
    case 'time': return 'По времени';
    case 'amount': return 'На сумму';
    case 'unlimited': return 'Бессрочно';
  }
};

const formatDuration = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) {
    return `${hours}ч ${mins}мин`;
  }
  return `${mins}мин`;
};

export const generateReceiptHTML = (data: ReceiptData): string => {
  const {
    clubName,
    receiptCompanyName,
    receiptCity,
    receiptPhone,
    receiptCashierName,
    orderNumber,
    tableName,
    mode,
    startTime,
    endTime,
    duration,
    tableCost,
    barOrders,
    barCost,
    totalCost,
    currency,
    serviceChargePercent = 0,
    serviceCharge = 0,
    receiptWidthMm = 80,
    receiptFontSize = 14,
    receiptPaddingMm = 5,
  } = data;

  const barItemsHTML = barOrders.length > 0
    ? barOrders.map(item => `
      <tr>
        <td style="text-align: left; padding: 2px 0;">${item.menuItemName}</td>
        <td style="text-align: center; padding: 2px 0;">${item.quantity}</td>
        <td style="text-align: right; padding: 2px 0;">${(item.price * item.quantity).toLocaleString()}</td>
      </tr>
    `).join('')
    : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page {
      size: ${receiptWidthMm}mm auto;
      margin: 0;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Courier New', monospace;
      font-size: ${receiptFontSize}px;
      font-weight: 600;
      width: ${receiptWidthMm}mm;
      padding: ${receiptPaddingMm}mm;
      background: white;
      color: black;
    }
    .receipt {
      width: 100%;
    }
    .header {
      text-align: left;
      margin-bottom: 12px;
      border-bottom: 1px dashed #000;
      padding-bottom: 12px;
    }
    .club-name {
      font-size: ${receiptFontSize + 6}px;
      font-weight: 800;
      margin-bottom: 4px;
      line-height: 1.15;
    }
    .header-meta {
      font-size: ${receiptFontSize - 3}px;
      font-weight: 600;
      color: #000;
      line-height: 1.25;
      margin-bottom: 8px;
    }
    .header-meta .line {
      margin: 2px 0;
    }
    .date {
      font-size: ${receiptFontSize - 2}px;
      color: #000;
      font-weight: 600;
    }
    .section {
      margin: 12px 0;
      padding: 10px 0;
      border-bottom: 1px dashed #000;
    }
    .section-title {
      font-weight: bold;
      margin-bottom: 6px;
      font-size: ${receiptFontSize}px;
    }
    .row {
      display: flex;
      justify-content: space-between;
      margin: 4px 0;
      font-size: ${receiptFontSize - 1}px;
    }
    .row-label {
      color: #000;
      font-weight: 600;
    }
    .row-value {
      font-weight: bold;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: ${receiptFontSize - 2}px;
    }
    th {
      text-align: left;
      border-bottom: 1px solid #000;
      padding: 4px 0;
      font-size: ${receiptFontSize - 3}px;
      font-weight: 800;
      color: #000;
    }
    td {
      font-weight: 600;
      color: #000;
    }
    .total-section {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 2px solid #000;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      font-size: ${receiptFontSize + 4}px;
      font-weight: bold;
      margin-top: 6px;
    }
    .footer {
      text-align: center;
      margin-top: 18px;
      font-size: ${receiptFontSize - 3}px;
      color: #333;
      font-weight: 600;
    }
    .divider {
      border-bottom: 1px dashed #000;
      margin: 10px 0;
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <div class="club-name">${clubName}</div>
      <div class="header-meta">
        <div class="line">${receiptCompanyName || 'ИП не указано'}</div>
        <div class="line">${receiptCity || 'Город не указан'}</div>
        <div class="line">Тел: ${receiptPhone || 'не указан'}</div>
        <div class="line">Кассир: ${receiptCashierName || 'ИМЯ'}</div>
      </div>
      <div style="font-size: ${receiptFontSize + 2}px; font-weight: bold; margin: 8px 0 4px; letter-spacing: 1px;">ПРЕДВАРИТЕЛЬНЫЙ СЧЁТ</div>
      <div style="display:flex;justify-content:space-between;gap:10px;font-size:${receiptFontSize - 2}px;margin-top:6px;">
        <span>Заказ №${orderNumber || getFallbackOrderNumber(endTime)}</span>
        <span>${formatShortDateTime(endTime)}</span>
      </div>
    </div>

    <div class="section">
      <div class="section-title">${tableName}</div>
      <div class="row">
        <span class="row-label">Режим:</span>
        <span class="row-value">${getModeLabel(mode)}</span>
      </div>
      <div class="row">
        <span class="row-label">Начало:</span>
        <span class="row-value">${formatTime(startTime)}</span>
      </div>
      <div class="row">
        <span class="row-label">Конец:</span>
        <span class="row-value">${formatTime(endTime)}</span>
      </div>
      <div class="row">
        <span class="row-label">Время игры:</span>
        <span class="row-value">${formatDuration(duration)}</span>
      </div>
      <div class="divider"></div>
      <div class="row">
        <span class="row-label">За стол:</span>
        <span class="row-value">${tableCost.toLocaleString()} ${currency}</span>
      </div>
    </div>

    ${barOrders.length > 0 ? `
    <div class="section">
      <div class="section-title">Заказы бара</div>
      <table>
        <thead>
          <tr>
            <th style="text-align: left;">Название</th>
            <th style="text-align: center;">Кол-во</th>
            <th style="text-align: right;">Сумма</th>
          </tr>
        </thead>
        <tbody>
          ${barItemsHTML}
        </tbody>
      </table>
      <div class="divider"></div>
      <div class="row">
        <span class="row-label">За бар:</span>
        <span class="row-value">${barCost.toLocaleString()} ${currency}</span>
      </div>
    </div>
    ` : ''}

    <div class="total-section">
      ${serviceCharge > 0 ? `
      <div class="row">
        <span class="row-label">Сумма:</span>
        <span class="row-value">${(tableCost + barCost).toLocaleString()} ${currency}</span>
      </div>
      <div class="row">
        <span class="row-label">Обслуживание (${serviceChargePercent}% с бара):</span>
        <span class="row-value">${serviceCharge.toLocaleString()} ${currency}</span>
      </div>` : ''}
      <div class="total-row">
        <span>ИТОГО:</span>
        <span>${totalCost.toLocaleString()} ${currency}</span>
      </div>
    </div>

    <div class="footer">
      <p style="font-size: ${receiptFontSize + 2}px; font-weight: bold; margin-bottom: 6px; color: #000;">НЕ ЯВЛЯЕТСЯ ФИСКАЛЬНЫМ ДОКУМЕНТОМ</p>
      <p style="font-size: ${receiptFontSize - 4}px; color: #999;">Для получения фискального документа используйте ККМ</p>
      <p style="margin-top: 8px;">Спасибо за игру!</p>
      <p>Ждём вас снова</p>
    </div>
  </div>
</body>
</html>
  `.trim();
};

// ===== ЧЕК ДЛЯ ПРОДАЖИ БАРА (без сессии стола) =====
interface BarSaleReceiptData {
  clubName: string;
  receiptCompanyName?: string;
  receiptCity?: string;
  receiptPhone?: string;
  receiptCashierName?: string;
  orderNumber?: string;
  items: { name: string; quantity: number; price: number }[];
  totalCost: number; // сумма позиций (без обслуживания)
  serviceCharge?: number;       // сумма обслуживания (0 = не показывать строку)
  serviceChargePercent?: number; // процент обслуживания (для подписи строки)
  currency: string;
  tableName?: string; // если добавили к столу
  receiptWidthMm?: number;
  receiptFontSize?: number;
  receiptPaddingMm?: number;
}

export const generateBarSaleReceiptHTML = (data: BarSaleReceiptData): string => {
  const {
    clubName,
    receiptCompanyName,
    receiptCity,
    receiptPhone,
    receiptCashierName,
    orderNumber,
    items,
    totalCost,
    serviceCharge = 0,
    serviceChargePercent = 0,
    currency,
    tableName,
    receiptWidthMm = 80,
    receiptFontSize = 14,
    receiptPaddingMm = 5,
  } = data;

  const now = Date.now();
  const rowsHTML = items
    .map(
      (item) => `
      <tr>
        <td style="text-align:left;padding:2px 0;">${item.name}</td>
        <td style="text-align:center;padding:2px 0;">${item.quantity}</td>
        <td style="text-align:right;padding:2px 0;">${(item.price * item.quantity).toLocaleString()}</td>
      </tr>`
    )
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: ${receiptWidthMm}mm auto; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', monospace;
      font-size: ${receiptFontSize}px;
      font-weight: 600;
      width: ${receiptWidthMm}mm;
      padding: ${receiptPaddingMm}mm;
      background: white;
      color: black;
    }
    .receipt { width: 100%; }
    .header { text-align: left; margin-bottom: 12px; border-bottom: 1px dashed #000; padding-bottom: 12px; }
    .club-name { font-size: ${receiptFontSize + 6}px; font-weight: 800; margin-bottom: 4px; line-height: 1.15; }
    .header-meta { font-size: ${receiptFontSize - 3}px; font-weight: 600; color:#000; line-height: 1.25; margin-bottom: 8px; }
    .header-meta .line { margin: 2px 0; }
    .date { font-size: ${receiptFontSize - 2}px; color: #000; font-weight: 600; }
    .section { margin: 12px 0; padding: 10px 0; border-bottom: 1px dashed #000; }
    .section-title { font-weight: bold; margin-bottom: 6px; font-size: ${receiptFontSize}px; }
    table { width: 100%; border-collapse: collapse; font-size: ${receiptFontSize - 2}px; }
    th { text-align: left; border-bottom: 1px solid #000; padding: 4px 0; font-size: ${receiptFontSize - 3}px; font-weight: 800; color:#000; }
    td { font-weight: 600; color:#000; }
    .total-section { margin-top: 12px; padding-top: 12px; border-top: 2px solid #000; }
    .total-row { display: flex; justify-content: space-between; font-size: ${receiptFontSize + 4}px; font-weight: bold; margin-top: 6px; }
    .footer { text-align: center; margin-top: 18px; font-size: ${receiptFontSize - 3}px; color: #333; font-weight: 600; }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <div class="club-name">${clubName}</div>
      <div class="header-meta">
        <div class="line">${receiptCompanyName || 'ИП не указано'}</div>
        <div class="line">${receiptCity || 'Город не указан'}</div>
        <div class="line">Тел: ${receiptPhone || 'не указан'}</div>
        <div class="line">Кассир: ${receiptCashierName || 'ИМЯ'}</div>
      </div>
      <div style="font-size: ${receiptFontSize + 2}px; font-weight: bold; margin: 8px 0 4px; letter-spacing: 1px;">ПРЕДВАРИТЕЛЬНЫЙ СЧЁТ</div>
      <div style="display:flex;justify-content:space-between;gap:10px;font-size:${receiptFontSize - 2}px;margin-top:6px;">
        <span>Заказ №${orderNumber || getFallbackOrderNumber(now)}</span>
        <span>${formatShortDateTime(now)}</span>
      </div>
    </div>
    <div class="section">
      <div class="section-title">Бар${tableName ? ` — ${tableName}` : ''}</div>
      <table>
        <thead>
          <tr>
            <th style="text-align:left;">Название</th>
            <th style="text-align:center;">Кол-во</th>
            <th style="text-align:right;">Сумма</th>
          </tr>
        </thead>
        <tbody>${rowsHTML}</tbody>
      </table>
    </div>
    <div class="total-section">
      ${serviceCharge > 0 ? `
      <div class="total-row" style="font-size:${receiptFontSize}px;font-weight:600;">
        <span>Сумма:</span>
        <span>${totalCost.toLocaleString()} ${currency}</span>
      </div>
      <div class="total-row" style="font-size:${receiptFontSize}px;font-weight:600;">
        <span>Обслуживание (${serviceChargePercent}%):</span>
        <span>${serviceCharge.toLocaleString()} ${currency}</span>
      </div>` : ''}
      <div class="total-row">
        <span>ИТОГО:</span>
        <span>${(totalCost + serviceCharge).toLocaleString()} ${currency}</span>
      </div>
    </div>
    <div class="footer">
      <p style="font-size: ${receiptFontSize + 2}px; font-weight: bold; margin-bottom: 6px; color: #000;">НЕ ЯВЛЯЕТСЯ ФИСКАЛЬНЫМ ДОКУМЕНТОМ</p>
      <p style="font-size: ${receiptFontSize - 4}px; color: #999;">Для получения фискального документа используйте ККМ</p>
      <p style="margin-top: 8px;">Спасибо за покупку!</p>
    </div>
  </div>
</body>
</html>`.trim();
};

interface ReportReceiptData {
  clubName: string;
  receiptCompanyName?: string;
  receiptCity?: string;
  receiptPhone?: string;
  receiptCashierName?: string;
  currency: string;
  periodLabel: string;
  sessions: SessionRecord[];
  totalTable: number;
  totalBar: number;
  totalRevenue: number;
  totalService?: number;
  totalCount: number;
  receiptWidthMm?: number;
  receiptFontSize?: number;
  receiptPaddingMm?: number;
}

export const generateReportReceiptHTML = (data: ReportReceiptData): string => {
  const {
    clubName,
    receiptCompanyName,
    receiptCity,
    receiptPhone,
    receiptCashierName,
    currency,
    periodLabel,
    sessions,
    totalTable,
    totalBar,
    totalRevenue,
    totalService = 0,
    totalCount,
    receiptWidthMm = 80,
    receiptFontSize = 12,
    receiptPaddingMm = 4,
  } = data;

  const rowsHTML = sessions
    .slice()
    .reverse()
    .map((s, idx) => {
      const mode = getModeLabel(s.mode);
      const start = formatShortDateTime(s.startTime);
      const end = formatShortDateTime(s.endTime);
      const barItemsHtml = s.barOrders && s.barOrders.length > 0
        ? `
        <div class="bar-items">
          <div class="bar-items-title">Бар-позиции:</div>
          ${s.barOrders
            .map((item) => `
              <div class="line bar-item-line">
                <span>${item.menuItemName} × ${item.quantity}</span>
                <span>${(item.price * item.quantity).toLocaleString()} ${currency}</span>
              </div>`)
            .join('')}
        </div>`
        : s.barCost > 0
        ? `
        <div class="bar-items">
          <div class="bar-items-title">Бар-позиции:</div>
          <div class="line bar-item-line">
            <span>Бар</span>
            <span>${s.barCost.toLocaleString()} ${currency}</span>
          </div>
        </div>`
        : '';

      return `
      <div class="item">
        <div class="item-head">${idx + 1}. ${s.tableName} • ${mode}</div>
        <div class="line"><span>Начало:</span><span>${start}</span></div>
        <div class="line"><span>Конец:</span><span>${end}</span></div>
        <div class="line"><span>Время:</span><span>${s.duration} мин</span></div>
        <div class="line"><span>Стол:</span><span>${s.tableCost.toLocaleString()} ${currency}</span></div>
        <div class="line"><span>Бар:</span><span>${s.barCost.toLocaleString()} ${currency}</span></div>
        ${barItemsHtml}
        <div class="line total"><span>Итого:</span><span>${s.totalCost.toLocaleString()} ${currency}</span></div>
      </div>`;
    })
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    @page { size: ${receiptWidthMm}mm auto; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', monospace;
      font-size: ${receiptFontSize}px;
      font-weight: 600;
      width: ${receiptWidthMm}mm;
      padding: ${receiptPaddingMm}mm;
      background: #fff;
      color: #000;
    }
    .header { border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
    .club { font-size: ${receiptFontSize + 5}px; font-weight: 800; line-height: 1.15; }
    .meta { font-size: ${receiptFontSize - 2}px; margin-top: 4px; line-height: 1.25; }
    .title { font-size: ${receiptFontSize + 2}px; font-weight: 800; margin-top: 8px; }
    .period { font-size: ${receiptFontSize - 1}px; margin-top: 4px; }
    .section { margin-top: 8px; }
    .item { border-bottom: 1px dashed #000; padding: 6px 0; }
    .item-head { font-weight: 800; margin-bottom: 4px; }
    .line { display: flex; justify-content: space-between; gap: 8px; }
    .bar-items { margin-top: 4px; padding: 4px 0 2px 0; }
    .bar-items-title { font-weight: 700; margin-bottom: 2px; }
    .bar-item-line { font-size: ${receiptFontSize - 1}px; }
    .line.total { margin-top: 2px; font-weight: 800; }
    .summary { margin-top: 8px; border-top: 2px solid #000; padding-top: 8px; }
    .summary .line { font-size: ${receiptFontSize + 1}px; font-weight: 700; }
    .grand { font-size: ${receiptFontSize + 4}px; font-weight: 800; margin-top: 4px; }
    .footer { text-align: center; margin-top: 10px; font-size: ${receiptFontSize - 2}px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="club">${clubName}</div>
    <div class="meta">${receiptCompanyName || 'ИП не указано'}</div>
    <div class="meta">${receiptCity || 'Город не указан'}</div>
    <div class="meta">Тел: ${receiptPhone || 'не указан'}</div>
    <div class="meta">Кассир: ${receiptCashierName || 'ИМЯ'}</div>
    <div class="title">ОТЧЁТНЫЙ ПРЕДВАРИТЕЛЬНЫЙ СЧЁТ</div>
    <div class="period">Период: ${periodLabel}</div>
    <div class="period">Печать: ${formatShortDateTime(Date.now())}</div>
  </div>

  <div class="section">
    ${rowsHTML || '<div class="item"><div class="item-head">Нет данных за период</div></div>'}
  </div>

  <div class="summary">
    <div class="line"><span>Игр:</span><span>${totalCount}</span></div>
    <div class="line"><span>Столы:</span><span>${totalTable.toLocaleString()} ${currency}</span></div>
    <div class="line"><span>Бар:</span><span>${totalBar.toLocaleString()} ${currency}</span></div>
    ${totalService > 0 ? `<div class="line"><span>Обслуживание:</span><span>${totalService.toLocaleString()} ${currency}</span></div>` : ''}
    <div class="line grand"><span>ИТОГО:</span><span>${totalRevenue.toLocaleString()} ${currency}</span></div>
  </div>

  <div class="footer">
    <div>НЕ ЯВЛЯЕТСЯ ФИСКАЛЬНЫМ ДОКУМЕНТОМ</div>
  </div>
</body>
</html>`.trim();
};

export const printReportReceipt = async (data: ReportReceiptData & { silentPrint?: boolean; deviceName?: string }): Promise<boolean> => {
  if (!window.electronAPI?.printer) {
    console.warn('Printer API not available');
    return false;
  }

  try {
    const html = generateReportReceiptHTML(data);
    const widthMm = data.receiptWidthMm || 80;
    await window.electronAPI.printer.printReceipt(html, widthMm, data.silentPrint, data.deviceName);
    return true;
  } catch (error) {
    console.error('Print report receipt error:', error);
    return false;
  }
};

/**
 * Печать чека по столу: единая точка (используется ручным закрытием и авто-истечением).
 * Считает суммы через computeSessionCharges на фиксированном endTime.
 */
export const printSessionReceipt = async (opts: {
  table: BilliardTable;
  session: TableSession;
  settings: AppSettings;
  endTime: number;
}): Promise<boolean> => {
  const { table, session, settings, endTime } = opts;
  const { durationMinutes, tableCost, barCost, serviceCharge, grandTotal } =
    computeSessionCharges(table, session, settings, endTime);
  return printReceipt({
    clubName: settings.clubName,
    receiptCompanyName: settings.receiptCompanyName,
    receiptCity: settings.receiptCity,
    receiptPhone: settings.receiptPhone,
    receiptCashierName: settings.receiptCashierName,
    tableName: table.name,
    mode: session.mode,
    startTime: session.startTime,
    endTime,
    duration: durationMinutes,
    tableCost,
    barOrders: session.barOrders,
    barCost,
    serviceCharge,
    serviceChargePercent: settings.serviceChargePercent,
    totalCost: grandTotal,
    currency: settings.currency,
    receiptWidthMm: settings.receiptWidthMm,
    receiptFontSize: settings.receiptFontSize,
    receiptPaddingMm: settings.receiptPaddingMm,
    silentPrint: settings.silentPrint,
    deviceName: settings.receiptPrinterName,
  });
};

export const printReceipt = async (data: ReceiptData & { silentPrint?: boolean; deviceName?: string }): Promise<boolean> => {
  if (!window.electronAPI?.printer) {
    console.warn('Printer API not available');
    return false;
  }

  try {
    const html = generateReceiptHTML(data);
    const widthMm = data.receiptWidthMm || 80;
    await window.electronAPI.printer.printReceipt(html, widthMm, data.silentPrint, data.deviceName);
    return true;
  } catch (error) {
    console.error('Print error:', error);
    return false;
  }
};

// ===== ЗАКАЗ НА КУХНЮ (kitchen ticket, дизайн в стиле iiko) =====
// Печатается на отдельном кухонном принтере (xprinter) при пробитии блюда.
// Без цен — повару важны только позиции, количество, стол и время.
export interface KitchenTicketData {
  clubName: string;
  tableName?: string;       // стол или undefined (продажа без стола)
  orderNumber?: string;
  cashierName?: string;
  items: { name: string; quantity: number }[];
  timestamp?: number;
  receiptWidthMm?: number;
  receiptFontSize?: number;
  receiptPaddingMm?: number;
}

export const generateKitchenTicketHTML = (data: KitchenTicketData): string => {
  const {
    clubName,
    tableName,
    orderNumber,
    cashierName,
    items,
    timestamp = Date.now(),
    receiptWidthMm = 80,
    receiptFontSize = 14,
    receiptPaddingMm = 5,
  } = data;

  const itemsHTML = items
    .map(
      (item) => `
      <div class="kt-item">
        <div class="kt-qty">${item.quantity}</div>
        <div class="kt-name">${escapeHtml(item.name)}</div>
      </div>`
    )
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    @page { size: ${receiptWidthMm}mm auto; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', monospace;
      width: ${receiptWidthMm}mm;
      padding: ${receiptPaddingMm}mm;
      background: #fff;
      color: #000;
    }
    .kt-top { text-align: center; border-bottom: 3px solid #000; padding-bottom: 8px; margin-bottom: 8px; }
    .kt-station { font-size: ${receiptFontSize + 6}px; font-weight: 900; letter-spacing: 3px; }
    .kt-table { font-size: ${receiptFontSize + 18}px; font-weight: 900; margin-top: 6px; line-height: 1.05; }
    .kt-meta { display: flex; justify-content: space-between; gap: 8px; font-size: ${receiptFontSize - 1}px; font-weight: 700; margin: 3px 0; }
    .kt-items { border-top: 2px dashed #000; border-bottom: 2px dashed #000; padding: 6px 0; margin: 8px 0; }
    .kt-item { display: flex; align-items: center; gap: 12px; padding: 7px 0; border-bottom: 1px dotted #777; }
    .kt-item:last-child { border-bottom: none; }
    .kt-qty {
      min-width: 46px; text-align: center;
      font-size: ${receiptFontSize + 10}px; font-weight: 900;
      border: 2px solid #000; border-radius: 8px; padding: 2px 6px;
    }
    .kt-name { flex: 1; font-size: ${receiptFontSize + 8}px; font-weight: 800; line-height: 1.15; }
    .kt-foot { text-align: center; font-size: ${receiptFontSize - 2}px; font-weight: 700; margin-top: 8px; }
  </style>
</head>
<body>
  <div class="kt-top">
    <div class="kt-station">★ КУХНЯ ★</div>
    <div class="kt-table">${tableName ? escapeHtml(tableName) : 'БЕЗ СТОЛА'}</div>
  </div>
  <div class="kt-meta">
    <span>Заказ №${escapeHtml(orderNumber || getFallbackOrderNumber(timestamp))}</span>
    <span>${formatShortDateTime(timestamp)}</span>
  </div>
  <div class="kt-meta">
    <span>Кассир: ${escapeHtml(cashierName || 'ИМЯ')}</span>
    <span>${escapeHtml(clubName)}</span>
  </div>
  <div class="kt-items">
    ${itemsHTML}
  </div>
  <div class="kt-foot">Время приготовления — с момента печати</div>
</body>
</html>`.trim();
};

export const printKitchenTicket = async (
  data: KitchenTicketData & { silentPrint?: boolean; deviceName?: string }
): Promise<boolean> => {
  if (!window.electronAPI?.printer) {
    console.warn('Printer API not available');
    return false;
  }
  if (!data.items || data.items.length === 0) return false;

  try {
    const html = generateKitchenTicketHTML(data);
    const widthMm = data.receiptWidthMm || 80;
    // Кухонный талон печатается автоматически (без диалога), если явно не указано иное
    const silent = data.silentPrint !== false;
    await window.electronAPI.printer.printReceipt(html, widthMm, silent, data.deviceName);
    return true;
  } catch (error) {
    console.error('Kitchen ticket print error:', error);
    return false;
  }
};
