import type { BarOrderItem, SessionMode, SessionRecord } from '../types';

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
  // Настройки размера (опциональные, есть дефолты)
  receiptWidthMm?: number;
  receiptFontSize?: number;
  receiptPaddingMm?: number;
}

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
  totalCost: number;
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
      <div class="total-row">
        <span>ИТОГО:</span>
        <span>${totalCost.toLocaleString()} ${currency}</span>
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
    <div class="line grand"><span>ИТОГО:</span><span>${totalRevenue.toLocaleString()} ${currency}</span></div>
  </div>

  <div class="footer">
    <div>НЕ ЯВЛЯЕТСЯ ФИСКАЛЬНЫМ ДОКУМЕНТОМ</div>
  </div>
</body>
</html>`.trim();
};

export const printReportReceipt = async (data: ReportReceiptData & { silentPrint?: boolean }): Promise<boolean> => {
  if (!window.electronAPI?.printer) {
    console.warn('Printer API not available');
    return false;
  }

  try {
    const html = generateReportReceiptHTML(data);
    const widthMm = data.receiptWidthMm || 80;
    await window.electronAPI.printer.printReceipt(html, widthMm, data.silentPrint);
    return true;
  } catch (error) {
    console.error('Print report receipt error:', error);
    return false;
  }
};

export const printReceipt = async (data: ReceiptData & { silentPrint?: boolean }): Promise<boolean> => {
  if (!window.electronAPI?.printer) {
    console.warn('Printer API not available');
    return false;
  }

  try {
    const html = generateReceiptHTML(data);
    const widthMm = data.receiptWidthMm || 80;
    await window.electronAPI.printer.printReceipt(html, widthMm, data.silentPrint);
    return true;
  } catch (error) {
    console.error('Print error:', error);
    return false;
  }
};
