"use client";

import { useState } from "react";

/**
 * Gráfico de barras verticais (simples ou empilhadas), sem biblioteca externa.
 * Segue o método de visualização do projeto: marcas finas com ponta arredondada de 4px ancorada na base,
 * 2px de respiro entre segmentos, grade recessiva, legenda para 2+ séries, tooltip por barra
 * (mouse, toque e teclado) e tabela equivalente para leitores de tela.
 * Paleta validada (daltonismo e contraste): ocupados #0b8aa6, livres #e55c3e.
 */
export type Series = { key: string; label: string; color: string };
export type Bar = { label: string; tick?: string; values: Record<string, number> };

type Props = {
  title: string;
  description?: string;
  series: Series[];
  bars: Bar[];
  height?: number;
  /** Unidade exibida no tooltip/tabela (ex.: "horários"). */
  unit?: string;
  testId?: string;
  /** Formato dos valores: número simples ou reais (BRL). */
  format?: "number" | "brl";
};

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brlCompact = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });

/** Teto "redondo" do eixo com 4 intervalos (ex.: 104 → 200; 16 → 20). */
function niceMax(v: number) {
  if (v <= 4) return 4;
  const raw = v / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => s * pow >= raw)! * pow;
  return Math.ceil(step) * 4;
}

export function BarChart({ title, description, series, bars, height = 220, unit = "", testId, format = "number" }: Props) {
  const fmt = (v: number) => (format === "brl" ? brl.format(v) : String(v));
  const fmtTick = (v: number) => (format === "brl" ? brlCompact.format(v) : String(v));
  const [active, setActive] = useState<number | null>(null);
  const totals = bars.map((b) => series.reduce((n, s) => n + (b.values[s.key] ?? 0), 0));
  const max = niceMax(Math.max(1, ...totals));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));

  return (
    <figure className="rounded-lg border border-brand-gray/60 bg-white p-5 shadow-sm" data-testid={testId}>
      <figcaption className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-lg text-petrol">{title}</h3>
          {description && <p className="text-sm text-ink/60">{description}</p>}
        </div>
        {series.length > 1 && (
          <ul className="flex flex-wrap gap-4 text-sm text-ink/80" aria-label="Legenda">
            {series.map((s) => (
              <li key={s.key} className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-sm" style={{ background: s.color }} aria-hidden="true" />
                {s.label}
              </li>
            ))}
          </ul>
        )}
      </figcaption>

      <div className={`mt-6 grid ${format === "brl" ? "grid-cols-[4.5rem_1fr]" : "grid-cols-[2.5rem_1fr]"} gap-2`} aria-hidden="true">
        {/* eixo Y */}
        <div className="relative" style={{ height }}>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2 text-[11px] tabular-nums text-ink/50" style={{ bottom: `${(t / max) * 100}%` }}>
              {fmtTick(t)}
            </span>
          ))}
        </div>
        <div className="relative" style={{ height }}>
          {ticks.map((t) => (
            <div key={t} className={`absolute inset-x-0 border-t ${t === 0 ? "border-ink/30" : "border-ink/10"}`} style={{ bottom: `${(t / max) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex items-end gap-[2px]" onMouseLeave={() => setActive(null)}>
            {bars.map((b, i) => (
              <div
                key={b.label}
                className="relative flex h-full min-w-0 flex-1 cursor-default flex-col-reverse items-center gap-[2px] outline-none"
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                onClick={() => setActive(active === i ? null : i)}
                tabIndex={0}
                data-bar={b.label}
              >
                {series.map((s, k) => {
                  const v = b.values[s.key] ?? 0;
                  if (!v) return null;
                  const isTop = series.slice(k + 1).every((n) => !(b.values[n.key] ?? 0));
                  return (
                    <div
                      key={s.key}
                      className={`w-full max-w-10 ${isTop ? "rounded-t-[4px]" : ""} ${active !== null && active !== i ? "opacity-60" : ""}`}
                      style={{ height: `${(v / max) * 100}%`, background: s.color }}
                    />
                  );
                })}
                {active === i && (
                  <div
                    role="tooltip"
                    className={`pointer-events-none absolute bottom-full z-10 mb-2 w-max max-w-56 rounded-md border border-brand-gray/60 bg-white px-3 py-2 text-xs text-ink shadow-lg ${
                      i < bars.length / 2 ? "left-0" : "right-0"
                    }`}
                  >
                    <p className="font-semibold">{b.label}</p>
                    {series.map((s) => (
                      <p key={s.key} className="flex items-center gap-2">
                        <span className="inline-block h-2 w-2 rounded-sm" style={{ background: s.color }} />
                        {s.label}: <strong className="tabular-nums">{fmt(b.values[s.key] ?? 0)}</strong>
                      </p>
                    ))}
                    {series.length > 1 && <p className="mt-1 text-ink/60">Total: {fmt(totals[i])}{unit && ` ${unit}`}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        {/* eixo X */}
        <div />
        <div className="flex gap-[2px]">
          {bars.map((b) => (
            <span key={b.label} className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center text-[11px] text-ink/60">
              {b.tick ?? ""}
            </span>
          ))}
        </div>
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-semibold text-petrol">Ver dados em tabela</summary>
        <table className="mt-2 w-full text-left text-sm">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="border-b border-brand-gray/60 text-ink/70">
              <th className="py-1 pr-4 font-semibold">Período</th>
              {series.map((s) => (
                <th key={s.key} className="py-1 pr-4 text-right font-semibold">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bars.map((b) => (
              <tr key={b.label} className="border-b border-brand-gray/30">
                <td className="py-1 pr-4">{b.label}</td>
                {series.map((s) => (
                  <td key={s.key} className="py-1 pr-4 text-right tabular-nums">
                    {fmt(b.values[s.key] ?? 0)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
