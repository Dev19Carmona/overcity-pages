"use client";

import { inputClass } from "@/app/admin/_components/ui";

// Campo de enteros: solo dígitos, con tope. Vacío = null.
export default function NumberInput({
  value,
  onChange,
  max,
  label,
  placeholder,
  disabled,
  className = "",
}: {
  value: number | null;
  onChange: (next: number | null) => void;
  max: number;
  label: string; // aria-label
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <input
      aria-label={label}
      inputMode="numeric"
      value={value === null ? "" : String(value)}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(event) => {
        const digits = event.target.value.replace(/\D/g, "");
        onChange(digits ? Math.min(Number.parseInt(digits, 10), max) : null);
      }}
      className={`${inputClass} !h-10 disabled:opacity-60 ${className}`}
    />
  );
}
