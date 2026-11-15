"use client";

import { useState, type InputHTMLAttributes } from "react";
import { inputClass } from "./ui";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  id: string;
  error?: string;
};

/** Campo de senha com botão Mostrar/Ocultar. */
export function PasswordInput({ id, error, className, ...props }: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? "text" : "password"}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${inputClass} pr-20 ${className ?? ""}`}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 mt-1 px-3 text-sm font-semibold text-petrol/70 hover:text-petrol"
        aria-pressed={visible}
        aria-controls={id}
      >
        {visible ? "Ocultar" : "Mostrar"}
      </button>
    </div>
  );
}
