"use client";

import { useActionState, useState } from "react";
import { setPatientActiveAction, type PatientStatusState } from "@/app/actions/patients";
import { FormMessage } from "./form-field";
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from "./ui";

/** Inativar (com motivo obrigatório) ou reativar o cadastro. Não existe exclusão de paciente. */
export function PatientStatusForm({ patientId, active }: { patientId: number; active: boolean }) {
  const [state, formAction, pending] = useActionState(setPatientActiveAction, {} as PatientStatusState);
  const [open, setOpen] = useState(false);

  if (!active) {
    return (
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="id" value={patientId} />
        <input type="hidden" name="active" value="1" />
        <button type="submit" disabled={pending} className={secondaryButtonClass}>
          {pending ? "Reativando…" : "Reativar cadastro"}
        </button>
        {state.message && <FormMessage tone="error">{state.message}</FormMessage>}
      </form>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={secondaryButtonClass}>
        Inativar cadastro
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-md border border-coral/40 bg-coral/5 p-4" noValidate>
      <input type="hidden" name="id" value={patientId} />
      <input type="hidden" name="active" value="0" />
      <p className="text-sm text-ink/80">
        O cadastro não é excluído: fica inativo, oculto das buscas e preservado pelo prazo legal.
      </p>
      <div>
        <label htmlFor="reason" className={labelClass}>
          Motivo da inativação
        </label>
        <input id="reason" name="reason" required minLength={5} maxLength={300} className={inputClass} placeholder="Ex.: cadastro duplicado, mudou de cidade" />
      </div>
      {state.message && <FormMessage tone="error">{state.message}</FormMessage>}
      <div className="flex gap-3">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Inativando…" : "Confirmar inativação"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={secondaryButtonClass}>
          Voltar
        </button>
      </div>
    </form>
  );
}
