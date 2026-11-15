import type { ReactNode } from "react";
import { labelClass } from "./ui";

type Props = {
  id: string;
  label: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
};

/** Rótulo + campo + mensagem de erro, com ids de acessibilidade. */
export function FormField({ id, label, error, hint, children }: Props) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-ink/60">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-coral-dark">
          {error}
        </p>
      )}
    </div>
  );
}

export function FormMessage({ tone, children }: { tone: "error" | "success"; children: ReactNode }) {
  return tone === "error" ? (
    <p className="rounded-md border border-coral/40 bg-coral/10 px-3 py-2 text-sm text-coral-dark">{children}</p>
  ) : (
    <p className="rounded-md border border-petrol/30 bg-petrol/5 px-3 py-2 text-sm text-petrol">{children}</p>
  );
}
