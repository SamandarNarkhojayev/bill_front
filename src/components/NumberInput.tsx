import React from 'react';

interface NumberInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min' | 'max'> {
  value: number;
  onChange: (value: number) => void;
  min?: number;          // нижняя граница (применяется при потере фокуса)
  max?: number;          // верхняя граница (применяется сразу)
  allowNegative?: boolean; // разрешить отрицательные (для полей вроде остатка -1)
}

/**
 * Числовое поле без «залипшего» нуля и без мусорного ввода.
 * - 0 показывается как пустое поле (с placeholder), поэтому первый ноль можно удалить,
 *   и не получается «01000».
 * - по умолчанию принимаются только цифры (минус запрещён → нельзя ввести -1 и т.п.).
 * - max применяется на лету, min — при потере фокуса (чтобы можно было набирать число).
 */
const NumberInput: React.FC<NumberInputProps> = ({
  value,
  onChange,
  min = 0,
  max,
  allowNegative = false,
  ...rest
}) => {
  const sanitize = (raw: string): string => {
    let s = raw.replace(allowNegative ? /[^\d-]/g : /[^\d]/g, '');
    if (allowNegative) s = s.replace(/(?!^)-/g, ''); // минус только в начале
    return s;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const s = sanitize(e.target.value);
    if (s === '' || s === '-') {
      onChange(0);
      return;
    }
    let n = Number(s);
    if (!Number.isFinite(n)) return;
    if (!allowNegative && n < 0) n = 0;
    if (max !== undefined && n > max) n = max;
    onChange(n);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    let n = value;
    if (min !== undefined && n < min) n = min;
    if (max !== undefined && n > max) n = max;
    if (n !== value) onChange(n);
    rest.onBlur?.(e);
  };

  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      value={value === 0 ? '' : String(value)}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
};

export default NumberInput;
