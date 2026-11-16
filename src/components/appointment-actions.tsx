"use client";

import { useActionState, useState } from "react";
import { changeAppointmentStatusAction, type AppointmentStatusState } from "@/app/actions/appointments";
import type { AppointmentStatus } from "@/lib/appointment-constants";
import { FormMessage } from "./form-field";
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from "./ui";

export type StatusAction = { to: AppointmentStatus; label: string; primary?: boolean };

/** Botões de mudança de situação. A lista já vem filtrada pelo servidor (perfil + regras). */
export function AppointmentActions({ appointmentId, actions }: { appointmentId: number; actions: StatusAction[] }) {
  const [state, formAction, pending] = useActionState(changeAppointmentStatusAction, {} as AppointmentStatusState);
  const [cancelling, setCancelling] = useState(false);
  const simple = actions.filter((a) => a.to !== "cancelado");
  const canCancel = actions.some((a) => a.to === "cancelado");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {simple.map((a) => (
          <form key={a.to} action={formAction}>
            <input type="hidden" name="id" value={appointmentId} />
            <input type="hidden" name="to" value={a.to} />
            <button type="submit" disabled={pending} className={a.primary ? primaryButtonClass : secondaryButtonClass}>
              {a.label}
            </button>
          </form>
        ))}
        {canCancel && !cancelling && (
          <button type="button" onClick={() => setCancelling(true)} className={secondaryButtonClass}>
            Cancelar consulta
          </button>
        )}
      </div>

      {cancelling && (
        <form action={formAction} className="space-y-3 rounded-md border border-coral/40 bg-coral/5 p-4" noValidate>
          <input type="hidden" name="id" value={appointmentId} />
          <input type="hidden" name="to" value="cancelado" />
          <div>
            <label htmlFor="reason" className={labelClass}>
              Motivo do cancelamento
            </label>
            <input
              id="reason"
              name="reason"
              maxLength={200}
              className={inputClass}
              placeholder="Ex.: paciente pediu para cancelar; médico indisponível"
            />
            <p className="mt-1 text-xs text-ink/60">Motivo administrativo — não registre dados clínicos.</p>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={pending} className={primaryButtonClass}>
              {pending ? "Cancelando…" : "Confirmar cancelamento"}
            </button>
            <button type="button" onClick={() => setCancelling(false)} className={secondaryButtonClass}>
              Voltar
            </button>
          </div>
        </form>
      )}

      {state.message && <FormMessage tone="error">{state.message}</FormMessage>}
    </div>
  );
}
