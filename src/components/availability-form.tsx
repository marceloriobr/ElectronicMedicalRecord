"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { saveScheduleAction, type ScheduleFormState } from "@/app/actions/forecast";
import {
  centsToInput,
  CLINIC_CLOSE,
  CLINIC_OPEN,
  MAX_WINDOWS_PER_DAY,
  PRICE_FIELDS,
  SLOT_MINUTES,
  WEEKDAY_LABELS,
  WEEKDAYS,
} from "@/lib/availability-constants";
import { FormField, FormMessage } from "./form-field";
import { submitWithoutReset } from "./submit-without-reset";
import { compactInputClass, inputClass, primaryButtonClass, secondaryButtonClass } from "./ui";

type Win = { start: string; end: string };
type Props = {
  slotMinutes: number;
  /** Centavos por tipo de consulta. */
  prices: Record<(typeof PRICE_FIELDS)[number]["type"], number>;
  windows: { weekday: number; start: string; end: string }[];
};

/** Grade semanal do médico: duração da consulta + até 3 faixas por dia da semana. */
export function AvailabilityForm({ slotMinutes, prices, windows }: Props) {
  const [state, formAction, pending] = useActionState(saveScheduleAction, {} as ScheduleFormState);
  const [slot, setSlot] = useState(String(slotMinutes));
  const [money, setMoney] = useState<Record<string, string>>(() =>
    Object.fromEntries(PRICE_FIELDS.map((f) => [f.name, prices[f.type] ? centsToInput(prices[f.type]) : ""])),
  );
  const [days, setDays] = useState<Record<number, Win[]>>(() =>
    Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((wd) => [wd, windows.filter((w) => w.weekday === wd).map(({ start, end }) => ({ start, end }))])),
  );
  const errors = state.fieldErrors ?? {};

  const setWin = (wd: number, i: number, k: keyof Win, v: string) =>
    setDays({ ...days, [wd]: days[wd].map((w, j) => (j === i ? { ...w, [k]: v } : w)) });

  const perWeek = Object.values(days)
    .flat()
    .reduce((n, w) => {
      const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
      return w.start && w.end && w.end > w.start ? n + Math.floor((m(w.end) - m(w.start)) / Number(slot)) : n;
    }, 0);

  return (
    <form onSubmit={submitWithoutReset(formAction)} className="space-y-6" noValidate>
      {state.message && <FormMessage tone="error">{state.message}</FormMessage>}

      <FormField id="slotMinutes" label="Duração da consulta" error={errors.slotMinutes}>
        <select id="slotMinutes" name="slotMinutes" value={slot} onChange={(e) => setSlot(e.target.value)} className={`${inputClass} max-w-48`}>
          {SLOT_MINUTES.map((m) => (
            <option key={m} value={m}>
              {m} minutos
            </option>
          ))}
        </select>
      </FormField>

      <fieldset className="rounded-lg border border-brand-gray/60 bg-white p-4 shadow-sm">
        <legend className="px-1 font-serif text-lg text-petrol">Valor da consulta (particular)</legend>
        <p className="mb-3 text-sm text-ink/70">Usado na visão financeira da previsão. Deixe em branco o que não cobra (ex.: retorno).</p>
        <div className="grid gap-4 sm:grid-cols-3">
          {PRICE_FIELDS.map((f) => (
            <FormField key={f.name} id={f.name} label={f.label} error={errors[f.name]}>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 mt-0.5 -translate-y-1/2 text-ink/60">R$</span>
                <input
                  id={f.name}
                  name={f.name}
                  inputMode="decimal"
                  placeholder="0,00"
                  value={money[f.name]}
                  onChange={(e) => setMoney({ ...money, [f.name]: e.target.value.replace(/[^\d.,]/g, "") })}
                  aria-invalid={!!errors[f.name]}
                  className={`${inputClass} pl-10 text-right tabular-nums`}
                />
              </div>
            </FormField>
          ))}
        </div>
      </fieldset>

      <div className="divide-y divide-brand-gray/40 rounded-lg border border-brand-gray/60 bg-white shadow-sm">
        {WEEKDAYS.map((wd) => (
          <fieldset key={wd} className="grid gap-3 p-4 sm:grid-cols-[8rem_1fr]" data-testid={`weekday-${wd}`}>
            <legend className="sr-only">{WEEKDAY_LABELS[wd]}</legend>
            <span className="pt-2 font-semibold text-petrol" aria-hidden="true">
              {WEEKDAY_LABELS[wd]}
            </span>
            <div className="space-y-2">
              {days[wd].length === 0 && <p className="pt-2 text-sm text-ink/50">Sem atendimento</p>}
              {days[wd].map((w, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor={`w.${wd}.${i}.start`}>
                    {WEEKDAY_LABELS[wd]}: início da faixa {i + 1}
                  </label>
                  <input
                    id={`w.${wd}.${i}.start`}
                    name={`w.${wd}.${i}.start`}
                    type="time"
                    step={300}
                    min={CLINIC_OPEN}
                    max={CLINIC_CLOSE}
                    value={w.start}
                    onChange={(e) => setWin(wd, i, "start", e.target.value)}
                    className={`${compactInputClass} w-36`}
                  />
                  <span className="text-ink/60">às</span>
                  <label className="sr-only" htmlFor={`w.${wd}.${i}.end`}>
                    {WEEKDAY_LABELS[wd]}: fim da faixa {i + 1}
                  </label>
                  <input
                    id={`w.${wd}.${i}.end`}
                    name={`w.${wd}.${i}.end`}
                    type="time"
                    step={300}
                    min={CLINIC_OPEN}
                    max={CLINIC_CLOSE}
                    value={w.end}
                    onChange={(e) => setWin(wd, i, "end", e.target.value)}
                    className={`${compactInputClass} w-36`}
                  />
                  <button
                    type="button"
                    onClick={() => setDays({ ...days, [wd]: days[wd].filter((_, j) => j !== i) })}
                    className="text-sm font-semibold text-coral-dark hover:underline"
                  >
                    Remover
                  </button>
                </div>
              ))}
              {days[wd].length < MAX_WINDOWS_PER_DAY && (
                <button
                  type="button"
                  onClick={() => {
                    const last = days[wd].at(-1);
                    const next = last ? { start: last.end, end: "" } : { start: "08:00", end: "12:00" };
                    setDays({ ...days, [wd]: [...days[wd], next] });
                  }}
                  className="text-sm font-semibold text-petrol hover:underline"
                >
                  + Adicionar faixa
                </button>
              )}
              {errors[`day.${wd}`] && <p className="text-sm text-coral-dark">{errors[`day.${wd}`]}</p>}
            </div>
          </fieldset>
        ))}
      </div>

      <p className="text-sm text-ink/70" aria-live="polite">
        Capacidade por semana: <strong className="text-ink">{perWeek}</strong> consultas de {slot} min.
      </p>

      <div className="flex gap-3">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Salvando…" : "Salvar disponibilidade"}
        </button>
        <Link href="/agenda/previsao" className={secondaryButtonClass}>
          Voltar
        </Link>
      </div>
    </form>
  );
}
