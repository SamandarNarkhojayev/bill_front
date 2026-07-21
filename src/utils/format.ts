// Единое форматирование денег для ВСЕГО UI. Раньше компоненты звали
// value.toLocaleString() без локали — разделитель разрядов брался из системной
// локали Chromium (en-US → "5,000"), а чек печатается в 'ru-RU' ("5 000"),
// из-за чего экран и чек расходились. Здесь фиксируем 'ru-RU', как в receipt.ts.
export const formatMoney = (value: number | null | undefined): string => {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return n.toLocaleString("ru-RU");
};
