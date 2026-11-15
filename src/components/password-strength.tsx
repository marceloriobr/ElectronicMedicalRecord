"use client";

import { evaluatePassword, passwordScore, type PasswordContext } from "@/lib/password-policy";

const LEVELS = [
  { label: "", bar: "bg-brand-gray/40", text: "text-ink/60" },
  { label: "Fraca", bar: "bg-coral-dark", text: "text-coral-dark" },
  { label: "Média", bar: "bg-amber-500", text: "text-amber-700" },
  { label: "Forte", bar: "bg-emerald-600", text: "text-emerald-700" },
  { label: "Muito forte", bar: "bg-emerald-700", text: "text-emerald-800" },
] as const;

type Props = PasswordContext & { password: string; id?: string };

/** Indicador visual de força da senha + lista de requisitos. */
export function PasswordStrength({ password, username, name, id }: Props) {
  const rules = evaluatePassword(password, { username, name });
  const score = passwordScore(password, { username, name });
  const level = LEVELS[score];

  return (
    <div id={id} className="mt-2 rounded-md border border-brand-gray/60 bg-white/70 p-3">
      <div className="flex items-center gap-3">
        <div
          className="flex flex-1 gap-1"
          role="meter"
          aria-label="Força da senha"
          aria-valuemin={0}
          aria-valuemax={4}
          aria-valuenow={score}
          aria-valuetext={level.label || "Não informada"}
        >
          {[1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${i <= score ? level.bar : "bg-brand-gray/40"}`}
            />
          ))}
        </div>
        <span className={`w-20 text-right text-xs font-semibold ${level.text}`} aria-live="polite">
          {level.label}
        </span>
      </div>
      <ul className="mt-3 grid gap-1 text-xs sm:grid-cols-2">
        {rules.map((r) => (
          <li key={r.id} className={`flex items-start gap-1.5 ${r.ok ? "text-emerald-700" : "text-ink/60"}`}>
            <span aria-hidden="true" className="font-bold">
              {r.ok ? "✓" : "•"}
            </span>
            <span>
              {r.label}
              <span className="sr-only">{r.ok ? " — atendido" : " — pendente"}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
