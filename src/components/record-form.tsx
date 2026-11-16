"use client";

import Link from "next/link";
import { useActionState } from "react";
import { saveRecordAction, type RecordFormState } from "@/app/actions/clinical";
import type { Cid } from "@/lib/cid10";
import { RECORD_TEXT_FIELDS, VITAL_SIGNS, type RecordKind } from "@/lib/clinical-constants";
import { CidPicker } from "./cid-picker";
import { FormField, FormMessage } from "./form-field";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "./ui";

type Props = {
  patientId: number;
  kind: RecordKind;
  /** Presente ao editar um rascunho. */
  recordId?: number;
  appointmentId?: number;
  initialValues?: Record<string, string>;
  initialCids?: { principal: Cid | null; secundarios: Cid[] };
  cancelHref: string;
};

export function RecordForm({ patientId, kind, recordId, appointmentId, initialValues, initialCids, cancelHref }: Props) {
  const [state, formAction, pending] = useActionState(saveRecordAction, {} as RecordFormState);
  const v = state.values ?? initialValues ?? {};
  const cids = state.cids ?? initialCids ?? { principal: null, secundarios: [] };
  const errors = state.fieldErrors ?? {};
  const fields = RECORD_TEXT_FIELDS.filter((f) => (f.kinds as readonly RecordKind[]).includes(kind));

  const area = (key: string, rows: number) => (
    <textarea
      id={key}
      name={key}
      rows={rows}
      defaultValue={v[key]}
      aria-invalid={!!errors[key]}
      aria-describedby={errors[key] ? `${key}-error` : undefined}
      className={`${inputClass} leading-relaxed`}
    />
  );

  return (
    <form action={formAction} className="space-y-8" noValidate>
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="kind" value={kind} />
      {recordId && <input type="hidden" name="recordId" value={recordId} />}
      {appointmentId && <input type="hidden" name="appointmentId" value={appointmentId} />}

      {state.message && <FormMessage tone="error">{state.message}</FormMessage>}

      <section className="space-y-5 rounded-lg border border-brand-gray/60 bg-white p-5 shadow-sm">
        {fields
          .filter((f) => f.key !== "exameFisico" && f.key !== "examesComplementares" && f.key !== "avaliacao" && f.key !== "plano")
          .map((f) => (
            <FormField key={f.key} id={f.key} label={f.label} error={errors[f.key]}>
              {area(f.key, f.rows)}
            </FormField>
          ))}
      </section>

      <section className="space-y-5 rounded-lg border border-brand-gray/60 bg-white p-5 shadow-sm">
        <h2 className="font-serif text-lg text-petrol">Exame físico</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {VITAL_SIGNS.map((s) => {
            const key = `vitals.${s.key}`;
            return (
              <FormField key={key} id={key} label={`${s.label} (${s.unit})`} error={errors[key]}>
                <input id={key} name={key} inputMode="decimal" defaultValue={v[key]} aria-invalid={!!errors[key]} className={inputClass} />
              </FormField>
            );
          })}
        </div>
        {fields
          .filter((f) => f.key === "exameFisico" || f.key === "examesComplementares")
          .map((f) => (
            <FormField key={f.key} id={f.key} label={f.label} error={errors[f.key]}>
              {area(f.key, f.rows)}
            </FormField>
          ))}
      </section>

      <section className="space-y-5 rounded-lg border border-brand-gray/60 bg-white p-5 shadow-sm">
        <h2 className="font-serif text-lg text-petrol">Diagnóstico e conduta</h2>
        <CidPicker key={JSON.stringify(cids)} principal={cids.principal} secundarios={cids.secundarios} errors={errors} />
        {fields
          .filter((f) => f.key === "avaliacao" || f.key === "plano")
          .map((f) => (
            <FormField key={f.key} id={f.key} label={f.label} error={errors[f.key]}>
              {area(f.key, f.rows)}
            </FormField>
          ))}
      </section>

      <div className="rounded-md border border-amber-600/30 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Depois de <strong>finalizado</strong>, o registro não pode mais ser alterado (Res. CFM 1.821/2007): correções são feitas por
        aditamento, preservando o original. O rascunho fica visível só para você.
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="submit" name="intent" value="finalizar" disabled={pending} className={primaryButtonClass}>
          {pending ? "Salvando…" : "Finalizar registro"}
        </button>
        <button type="submit" name="intent" value="rascunho" disabled={pending} className={secondaryButtonClass}>
          Salvar rascunho
        </button>
        <Link href={cancelHref} className={secondaryButtonClass}>
          Voltar
        </Link>
      </div>
    </form>
  );
}
