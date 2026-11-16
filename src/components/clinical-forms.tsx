"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  addAddendumAction,
  cancelPrescriptionAction,
  issuePrescriptionAction,
  saveProfileAction,
  type PrescriptionFormState,
  type SimpleFormState,
} from "@/app/actions/clinical";
import {
  classifyMedication,
  CONTROLLED_VALIDITY_DAYS,
  MAX_PRESCRIPTION_ITEMS,
  PRESCRIPTION_TYPE_LABELS,
  PRESCRIPTION_TYPES,
  type PrescriptionType,
} from "@/lib/clinical-constants";
import { FormField, FormMessage } from "./form-field";
import { submitWithoutReset } from "./submit-without-reset";
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from "./ui";

const err = (errors: Record<string, string> | undefined, k: string) => errors?.[k];


// ---------------------------------------------------------------------------
// Alergias e medicamentos em uso
// ---------------------------------------------------------------------------

export function ProfileForm({
  patientId,
  initial,
  cancelHref,
}: {
  patientId: number;
  initial: { alergias: string; medicamentosEmUso: string; negaAlergias: boolean };
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(saveProfileAction, {} as SimpleFormState);
  const v = state.values ?? { ...initial, negaAlergias: initial.negaAlergias ? "on" : "" };
  const [nega, setNega] = useState(v.negaAlergias === "on" || v.negaAlergias === "true");

  return (
    <form onSubmit={submitWithoutReset(formAction)} className="space-y-6" noValidate>
      <input type="hidden" name="patientId" value={patientId} />
      {state.message && <FormMessage tone="error">{state.message}</FormMessage>}

      <label className="flex items-center gap-2 text-sm font-semibold text-petrol">
        <input type="checkbox" name="negaAlergias" checked={nega} onChange={(e) => setNega(e.target.checked)} className="h-4 w-4" />
        Paciente nega alergias conhecidas
      </label>

      <FormField id="alergias" label="Alergias (substância e reação)" error={err(state.fieldErrors, "alergias")}>
        <textarea
          id="alergias"
          name="alergias"
          rows={3}
          disabled={nega}
          defaultValue={v.alergias}
          className={inputClass}
          placeholder="Ex.: dipirona — urticária; penicilina — anafilaxia"
        />
      </FormField>

      <FormField
        id="medicamentosEmUso"
        label="Medicamentos em uso"
        error={err(state.fieldErrors, "medicamentosEmUso")}
        hint="Um por linha, com dose e horário."
      >
        <textarea id="medicamentosEmUso" name="medicamentosEmUso" rows={6} defaultValue={v.medicamentosEmUso} className={inputClass} />
      </FormField>

      <div className="flex gap-3">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Salvando…" : "Salvar"}
        </button>
        <Link href={cancelHref} className={secondaryButtonClass}>
          Voltar
        </Link>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Aditamento
// ---------------------------------------------------------------------------

export function AddendumForm({ patientId, recordId }: { patientId: number; recordId: number }) {
  const [state, formAction, pending] = useActionState(addAddendumAction, {} as SimpleFormState);
  const [open, setOpen] = useState(false);
  const v = state.values ?? {};

  if (!open && !state.fieldErrors && !state.message) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={secondaryButtonClass}>
        Aditar registro
      </button>
    );
  }
  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-petrol/30 bg-white p-5 shadow-sm" noValidate>
      <h3 className="font-serif text-lg text-petrol">Novo aditamento</h3>
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="recordId" value={recordId} />
      {state.message && <FormMessage tone="error">{state.message}</FormMessage>}
      <FormField id="motivo" label="Motivo do aditamento / retificação" error={err(state.fieldErrors, "motivo")}>
        <input id="motivo" name="motivo" maxLength={300} defaultValue={v.motivo} className={inputClass} placeholder="Ex.: resultado de exame recebido; correção de dose" />
      </FormField>
      <FormField id="texto" label="Texto do aditamento" error={err(state.fieldErrors, "texto")}>
        <textarea id="texto" name="texto" rows={5} defaultValue={v.texto} className={inputClass} />
      </FormField>
      <p className="text-xs text-ink/60">O aditamento é registrado com seu nome, CRM, data e hora, e não pode ser alterado depois.</p>
      <div className="flex gap-3">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Salvando…" : "Registrar aditamento"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={secondaryButtonClass}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Receita
// ---------------------------------------------------------------------------

type Item = { medicamento: string; posologia: string; quantidade: string; duracao: string; via: string };
const emptyItem = (): Item => ({ medicamento: "", posologia: "", quantidade: "", duracao: "", via: "" });

export function PrescriptionForm({ patientId, recordId, cancelHref }: { patientId: number; recordId?: number; cancelHref: string }) {
  const [state, formAction, pending] = useActionState(issuePrescriptionAction, {} as PrescriptionFormState);
  const [type, setType] = useState<PrescriptionType>("simples");
  const [items, setItems] = useState<Item[]>([emptyItem()]);
  const [observacoes, setObservacoes] = useState("");
  const errors = state.fieldErrors ?? {};

  const set = (i: number, k: keyof Item, value: string) => setItems(items.map((it, j) => (j === i ? { ...it, [k]: value } : it)));

  return (
    <form onSubmit={submitWithoutReset(formAction)} className="space-y-6" noValidate>
      <input type="hidden" name="patientId" value={patientId} />
      {recordId && <input type="hidden" name="recordId" value={recordId} />}
      {state.message && <FormMessage tone="error">{state.message}</FormMessage>}

      <fieldset>
        <legend className={labelClass}>Tipo de receita</legend>
        <div className="mt-2 flex flex-wrap gap-4">
          {PRESCRIPTION_TYPES.map((t) => (
            <label key={t} className="flex items-center gap-2 text-sm">
              <input type="radio" name="type" value={t} checked={type === t} onChange={() => setType(t)} className="h-4 w-4" />
              {PRESCRIPTION_TYPE_LABELS[t]}
            </label>
          ))}
        </div>
        {type === "controle_especial" ? (
          <p className="mt-2 text-xs text-ink/70">
            Receita de Controle Especial em 2 vias (Portaria SVS/MS 344/1998 — listas C1, C5 e adendos), validade de{" "}
            {CONTROLLED_VALIDITY_DAYS} dias. Informe a quantidade em algarismos <strong>e por extenso</strong>. Substâncias que
            exigem <strong>Notificação de Receita</strong> (A, B1, B2, C2, C3) não são emitidas pelo sistema — use o talonário oficial.
          </p>
        ) : (
          <p className="mt-2 text-xs text-ink/70">Medicamentos sujeitos a controle especial devem ir na receita de controle especial.</p>
        )}
      </fieldset>

      {items.map((it, i) => {
        const c = it.medicamento.trim().length >= 4 ? classifyMedication(it.medicamento) : null;
        const e = (k: string) => errors[`items.${i}.${k}`];
        return (
          <fieldset key={i} className="space-y-4 rounded-lg border border-brand-gray/60 bg-white p-5 shadow-sm" data-testid={`rx-item-${i}`}>
            <div className="flex items-center justify-between">
              <legend className="font-serif text-lg text-petrol">Medicamento {i + 1}</legend>
              {items.length > 1 && (
                <button type="button" onClick={() => setItems(items.filter((_, j) => j !== i))} className="text-sm font-semibold text-coral-dark hover:underline">
                  Remover
                </button>
              )}
            </div>
            <FormField id={`items.${i}.medicamento`} label="Medicamento (nome, concentração e forma)" error={e("medicamento")}>
              <input
                id={`items.${i}.medicamento`}
                name={`items.${i}.medicamento`}
                value={it.medicamento}
                onChange={(ev) => set(i, "medicamento", ev.target.value)}
                aria-invalid={!!e("medicamento")}
                className={inputClass}
                placeholder="Ex.: Losartana potássica 50 mg, comprimido"
              />
            </FormField>
            {c?.notification && (
              <p className="text-sm font-semibold text-coral-dark" role="alert">
                ⚠ {c.notification}: exige Notificação de Receita (talonário oficial). O sistema não emite.
              </p>
            )}
            {!c?.notification && c?.controlled && type === "simples" && (
              <p className="text-sm font-semibold text-amber-800" role="alert">
                ⚠ Sujeito a controle especial: selecione “Receita de controle especial”.
              </p>
            )}
            {c?.antimicrobial && (
              <p className="text-sm text-amber-800">Antimicrobiano (RDC 471/2021): a receita é impressa em 2 vias, válida por 10 dias.</p>
            )}
            <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
              <FormField id={`items.${i}.posologia`} label="Posologia" error={e("posologia")}>
                <input id={`items.${i}.posologia`} name={`items.${i}.posologia`} value={it.posologia} onChange={(ev) => set(i, "posologia", ev.target.value)} className={inputClass} placeholder="Ex.: 1 comprimido de 12/12 h" />
              </FormField>
              <FormField id={`items.${i}.via`} label="Via" error={e("via")}>
                <input id={`items.${i}.via`} name={`items.${i}.via`} value={it.via} onChange={(ev) => set(i, "via", ev.target.value)} className={inputClass} placeholder="Oral" />
              </FormField>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id={`items.${i}.quantidade`} label="Quantidade" error={e("quantidade")}>
                <input
                  id={`items.${i}.quantidade`}
                  name={`items.${i}.quantidade`}
                  value={it.quantidade}
                  onChange={(ev) => set(i, "quantidade", ev.target.value)}
                  className={inputClass}
                  placeholder={type === "controle_especial" ? "Ex.: 30 (trinta) comprimidos" : "Ex.: 2 caixas"}
                />
              </FormField>
              <FormField id={`items.${i}.duracao`} label="Duração do tratamento" error={e("duracao")}>
                <input id={`items.${i}.duracao`} name={`items.${i}.duracao`} value={it.duracao} onChange={(ev) => set(i, "duracao", ev.target.value)} className={inputClass} placeholder="Ex.: 30 dias; uso contínuo" />
              </FormField>
            </div>
          </fieldset>
        );
      })}
      {errors.items && <p className="text-sm text-coral-dark">{errors.items}</p>}

      {items.length < MAX_PRESCRIPTION_ITEMS && (
        <button type="button" onClick={() => setItems([...items, emptyItem()])} className={secondaryButtonClass}>
          + Adicionar medicamento
        </button>
      )}

      <FormField id="observacoes" label="Orientações gerais (opcional)" error={errors.observacoes}>
        <textarea id="observacoes" name="observacoes" rows={3} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} className={inputClass} />
      </FormField>

      <div className="rounded-md border border-amber-600/30 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        A receita emitida não pode ser alterada. Para corrigir, cancele (com motivo) e emita outra.
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Salvando…" : "Emitir receita"}
        </button>
        <Link href={cancelHref} className={secondaryButtonClass}>
          Voltar
        </Link>
      </div>
    </form>
  );
}

export function CancelPrescriptionForm({ patientId, prescriptionId }: { patientId: number; prescriptionId: number }) {
  const [state, formAction, pending] = useActionState(cancelPrescriptionAction, {} as SimpleFormState);
  const [open, setOpen] = useState(false);

  if (!open && !state.fieldErrors && !state.message) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={secondaryButtonClass}>
        Cancelar receita
      </button>
    );
  }
  return (
    <form action={formAction} className="w-full space-y-3 rounded-md border border-coral/40 bg-coral/5 p-4" noValidate>
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="prescriptionId" value={prescriptionId} />
      {state.message && <FormMessage tone="error">{state.message}</FormMessage>}
      <FormField id="reason" label="Motivo do cancelamento" error={err(state.fieldErrors, "reason")}>
        <input id="reason" name="reason" maxLength={300} defaultValue={state.values?.reason} className={inputClass} />
      </FormField>
      <div className="flex gap-3">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Cancelando…" : "Confirmar cancelamento"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={secondaryButtonClass}>
          Voltar
        </button>
      </div>
    </form>
  );
}

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={primaryButtonClass}>
      Imprimir
    </button>
  );
}
