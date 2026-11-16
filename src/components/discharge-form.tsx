"use client";

import { useActionState, useState } from "react";
import { dischargeAction, type DischargeState } from "@/app/actions/forecast";
import { DISCHARGE_REASON_LABELS, DISCHARGE_REASONS } from "@/lib/availability-constants";
import { FormMessage } from "./form-field";
import { compactInputClass, secondaryButtonClass } from "./ui";

/** Registro da alta do acompanhamento (somente médico). Motivo em categoria — sem texto clínico. */
export function DischargeForm({ patientId, months }: { patientId: number; months: number }) {
  const [state, formAction, pending] = useActionState(dischargeAction, {} as DischargeState);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-semibold text-coral-dark hover:underline">
        Registrar alta
      </button>
    );
  }
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="meses" value={months} />
      <label className="sr-only" htmlFor={`reason-${patientId}`}>
        Motivo da alta
      </label>
      <select id={`reason-${patientId}`} name="reason" defaultValue="" className={`${compactInputClass} py-1.5 text-sm`}>
        <option value="" disabled>
          Motivo da alta…
        </option>
        {DISCHARGE_REASONS.map((r) => (
          <option key={r} value={r}>
            {DISCHARGE_REASON_LABELS[r]}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending} className={`${secondaryButtonClass} py-1.5 text-sm`}>
        {pending ? "Salvando…" : "Confirmar alta"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-sm text-ink/60 hover:underline">
        Cancelar
      </button>
      {state.message && <FormMessage tone="error">{state.message}</FormMessage>}
    </form>
  );
}
