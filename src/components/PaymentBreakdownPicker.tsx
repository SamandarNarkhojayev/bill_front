import React, { useEffect, useMemo, useState } from "react";
import { Banknote, CreditCard, Smartphone } from "lucide-react";
import { useT } from "../i18n";
import type { PaymentDetails, PaymentMethod } from "../types";
import NumberInput from "./NumberInput";
import { formatMoney } from "../utils/format";
import {
  PAYMENT_METHODS,
  createEmptyPaymentBreakdown,
  getEffectivePaymentMethod,
  getPaymentBreakdownTotal,
  normalizePaymentBreakdown,
} from "../utils/payment";

const PAYMENT_ICONS: Record<PaymentMethod, React.ReactNode> = {
  cash: <Banknote size={16} />,
  card: <CreditCard size={16} />,
  transfer: <Smartphone size={16} />,
};

interface PaymentBreakdownPickerProps {
  total: number;
  currency: string;
  busy?: boolean;
  onChange: (details: PaymentDetails, isValid: boolean) => void;
}

const PaymentBreakdownPicker: React.FC<PaymentBreakdownPickerProps> = ({
  total,
  currency,
  busy,
  onChange,
}) => {
  const { t } = useT();
  const [mode, setMode] = useState<"single" | "split">("single");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [splitAmounts, setSplitAmounts] = useState<
    Record<PaymentMethod, number>
  >(createEmptyPaymentBreakdown());
  const [touched, setTouched] = useState(false);

  const allocated = useMemo(
    () => getPaymentBreakdownTotal(splitAmounts),
    [splitAmounts],
  );
  const remaining = Math.max(0, total - allocated);
  const activeMethodsCount = PAYMENT_METHODS.reduce(
    (count, method) => count + ((splitAmounts[method] ?? 0) > 0 ? 1 : 0),
    0,
  );

  const paymentDetails = useMemo<PaymentDetails>(() => {
    if (mode === "split") {
      const paymentBreakdown = normalizePaymentBreakdown(splitAmounts);
      return {
        paymentMethod: getEffectivePaymentMethod({
          paymentMethod,
          paymentBreakdown,
        }),
        paymentBreakdown,
      };
    }
    return { paymentMethod };
  }, [mode, paymentMethod, splitAmounts]);

  const isValid =
    mode === "single" || (remaining === 0 && activeMethodsCount >= 2);

  useEffect(() => {
    onChange(paymentDetails, isValid);
  }, [paymentDetails, isValid, onChange]);

  const handleModeChange = (nextMode: "single" | "split") => {
    setMode(nextMode);
    // В сплит входим с нулями. Раньше первый способ предзаполнялся на весь total,
    // из-за чего сразу светилась ошибка «нужно ≥2 способа» и навязывался порядок
    // ввода (карта не принимала сумму, пока не уменьшишь наличные). Теперь — чисто.
    setTouched(false);
  };

  const handleSplitChange = (method: PaymentMethod, value: number) => {
    setTouched(true);
    setSplitAmounts((prev) => {
      const othersTotal = PAYMENT_METHODS.reduce(
        (sum, current) =>
          current === method ? sum : sum + Math.max(0, prev[current] ?? 0),
        0,
      );
      const maxAllowed = Math.max(0, total - othersTotal);
      return {
        ...prev,
        [method]: Math.min(Math.max(0, value), maxAllowed),
      };
    });
  };

  // Занести весь остаток в выбранный способ одним тапом — вместо ручного набора.
  const fillRemaining = (method: PaymentMethod) => {
    if (remaining <= 0) return;
    setTouched(true);
    setSplitAmounts((prev) => ({
      ...prev,
      [method]: Math.max(0, prev[method] ?? 0) + remaining,
    }));
  };

  // Быстрое деление 50/50 между наличными и картой.
  const splitHalf = () => {
    setTouched(true);
    const half = Math.floor(total / 2);
    setSplitAmounts({
      ...createEmptyPaymentBreakdown(),
      cash: half,
      card: total - half,
    });
  };

  return (
    <div className="payment-method-picker payment-method-picker--stacked">
      <div className="payment-method-head">
        <span className="payment-method-label">{t("payment.label")}:</span>
        <div className="payment-mode-toggle">
          <button
            type="button"
            onClick={() => handleModeChange("single")}
            className={`payment-mode-btn ${mode === "single" ? "active" : ""}`}
            disabled={busy}
          >
            {t("payment.single")}
          </button>
          <button
            type="button"
            onClick={() => handleModeChange("split")}
            className={`payment-mode-btn ${mode === "split" ? "active" : ""}`}
            disabled={busy}
          >
            {t("payment.split")}
          </button>
        </div>
      </div>

      {mode === "single" ? (
        <div className="payment-method-options">
          {PAYMENT_METHODS.map((method) => (
            <button
              key={method}
              type="button"
              onClick={() => setPaymentMethod(method)}
              className={`payment-method-btn ${paymentMethod === method ? "active" : ""}`}
              disabled={busy}
            >
              {PAYMENT_ICONS[method]}
              <span>{t(`payment.${method}`)}</span>
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="payment-split-grid">
            {PAYMENT_METHODS.map((method) => (
              <div key={method} className="payment-split-row">
                <div className="payment-split-method">
                  {PAYMENT_ICONS[method]}
                  <span>{t(`payment.${method}`)}</span>
                </div>
                <div className="payment-split-input-wrap">
                  <NumberInput
                    value={splitAmounts[method] ?? 0}
                    onChange={(value) => handleSplitChange(method, value)}
                    min={0}
                    max={total}
                    className="modal-input payment-split-input"
                    placeholder="0"
                    disabled={busy}
                  />
                  <span className="payment-split-currency">{currency}</span>
                  <button
                    type="button"
                    className="payment-split-fill"
                    onClick={() => fillRemaining(method)}
                    disabled={busy || remaining <= 0}
                    title={t("payment.fill_remaining")}
                  >
                    {t("payment.fill_remaining")}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="payment-split-actions">
            <button
              type="button"
              className="payment-split-half"
              onClick={splitHalf}
              disabled={busy}
            >
              {t("payment.split_half")}
            </button>
          </div>

          <div className="payment-split-summary">
            <span>
              {t("payment.allocated")}: {formatMoney(allocated)} {currency}
            </span>
            <span className={remaining === 0 ? "ok" : "warn"}>
              {t("payment.remaining")}: {formatMoney(remaining)} {currency}
            </span>
          </div>

          {touched && !isValid && (
            <p className="payment-split-error">
              {remaining > 0
                ? t("payment.split_remaining", {
                    remaining: formatMoney(remaining),
                    currency,
                  })
                : t("payment.split_need_two")}
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default PaymentBreakdownPicker;
