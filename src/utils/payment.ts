import type {
  PaymentBreakdown,
  PaymentDetails,
  PaymentInput,
  PaymentMethod,
  SessionRecord,
} from "../types";

export const PAYMENT_METHODS: PaymentMethod[] = ["cash", "card", "transfer"];

export const createEmptyPaymentBreakdown = (): Record<
  PaymentMethod,
  number
> => ({
  cash: 0,
  card: 0,
  transfer: 0,
});

export const toPaymentDetails = (payment?: PaymentInput): PaymentDetails => {
  if (typeof payment === "string") return { paymentMethod: payment };
  return payment ?? { paymentMethod: "cash" };
};

export const normalizePaymentBreakdown = (
  breakdown?: PaymentBreakdown,
): PaymentBreakdown | undefined => {
  if (!breakdown) return undefined;
  const normalized: PaymentBreakdown = {};
  for (const method of PAYMENT_METHODS) {
    const raw = breakdown[method];
    const amount =
      typeof raw === "number" && Number.isFinite(raw)
        ? Math.max(0, Math.round(raw))
        : 0;
    if (amount > 0) normalized[method] = amount;
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
};

export const getPaymentBreakdownTotal = (
  breakdown?: PaymentBreakdown,
): number => {
  return PAYMENT_METHODS.reduce((sum, method) => {
    const amount = breakdown?.[method];
    return (
      sum + (typeof amount === "number" && Number.isFinite(amount) ? amount : 0)
    );
  }, 0);
};

export const getEffectivePaymentMethod = (
  payment?: PaymentInput,
): PaymentMethod => {
  const details = toPaymentDetails(payment);
  const breakdown = normalizePaymentBreakdown(details.paymentBreakdown);
  if (breakdown) {
    let bestMethod: PaymentMethod = details.paymentMethod ?? "cash";
    let bestAmount = -1;
    for (const method of PAYMENT_METHODS) {
      const amount = breakdown[method] ?? 0;
      if (amount > bestAmount) {
        bestAmount = amount;
        bestMethod = method;
      }
    }
    if (bestAmount > 0) return bestMethod;
  }
  return details.paymentMethod ?? "cash";
};

export const formatPaymentSummary = (
  record: Pick<SessionRecord, "paymentMethod" | "paymentBreakdown">,
  getLabel: (method: PaymentMethod) => string,
  currency?: string,
): string => {
  const breakdown = normalizePaymentBreakdown(record.paymentBreakdown);
  if (breakdown && Object.keys(breakdown).length > 1) {
    return PAYMENT_METHODS.filter((method) => (breakdown[method] ?? 0) > 0)
      .map((method) => {
        const amount = breakdown[method] ?? 0;
        return currency
          ? `${getLabel(method)} ${amount.toLocaleString()} ${currency}`
          : `${getLabel(method)} ${amount.toLocaleString()}`;
      })
      .join(" + ");
  }
  return getLabel(getEffectivePaymentMethod(record));
};
