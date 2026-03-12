import type { BarOrderItem, SessionMode } from '../types';

interface ReceiptData {
  clubName: string;
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
}

const formatDateTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit'
  });
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
    tableName,
    mode,
    startTime,
    endTime,
    duration,
    tableCost,
    barOrders,
    barCost,
    totalCost,
    currency
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
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: 'Courier New', monospace;
      font-size: 12px;
      width: 80mm;
      padding: 5mm;
      background: white;
      color: black;
    }
    .receipt {
      width: 100%;
    }
    .header {
      text-align: center;
      margin-bottom: 10px;
      border-bottom: 1px dashed #000;
      padding-bottom: 10px;
    }
    .club-name {
      font-size: 16px;
      font-weight: bold;
      margin-bottom: 5px;
    }
    .date {
      font-size: 11px;
      color: #333;
    }
    .section {
      margin: 10px 0;
      padding: 8px 0;
      border-bottom: 1px dashed #000;
    }
    .section-title {
      font-weight: bold;
      margin-bottom: 5px;
      font-size: 12px;
    }
    .row {
      display: flex;
      justify-content: space-between;
      margin: 3px 0;
    }
    .row-label {
      color: #333;
    }
    .row-value {
      font-weight: bold;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
    }
    th {
      text-align: left;
      border-bottom: 1px solid #000;
      padding: 3px 0;
      font-size: 10px;
    }
    .total-section {
      margin-top: 10px;
      padding-top: 10px;
      border-top: 2px solid #000;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      font-size: 16px;
      font-weight: bold;
      margin-top: 5px;
    }
    .footer {
      text-align: center;
      margin-top: 15px;
      font-size: 10px;
      color: #666;
    }
    .divider {
      border-bottom: 1px dashed #000;
      margin: 8px 0;
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <div class="club-name">${clubName}</div>
      <div class="date">${formatDateTime(endTime)}</div>
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
            <th style="text-align: center;">Кол.</th>
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
      <p>Спасибо за игру!</p>
      <p>Ждём вас снова</p>
    </div>
  </div>
</body>
</html>
  `.trim();
};

export const printReceipt = async (data: ReceiptData): Promise<boolean> => {
  if (!window.electronAPI?.printer) {
    console.warn('Printer API not available');
    return false;
  }

  try {
    const html = generateReceiptHTML(data);
    await window.electronAPI.printer.printReceipt(html);
    return true;
  } catch (error) {
    console.error('Print error:', error);
    return false;
  }
};
