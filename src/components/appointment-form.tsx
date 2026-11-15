"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { saveAppointmentAction, type AppointmentFormState } from "@/app/actions/appointments";
import { searchPatientsAction } from "@/app/actions/patients";
import {
  APPOINTMENT_DURATIONS,
  APPOINTMENT_NOTE_MAX,
  APPOINTMENT_TYPE_LABELS,
  APPOINTMENT_TYPES,
  CLINIC_CLOSE,
  CLINIC_OPEN,
} from "@/lib/appointment-constants";
import type { PatientRow } from "@/lib/patient-service";
import { FormField, FormMessage } from "./form-field";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "./ui";

type Values = NonNullable<AppointmentFormState["values"]>;

type Props = {
  doctors: { id: number; name: string }[];
  /** Secretária escolhe o médico; o médico só agenda para si. */
  canChooseDoctor: boolean;
  initial: Values;
  initialPatientLabel?: string;
  /** Presente ao remarcar: o paciente não pode ser trocado. */
  appointmentId?: number;
  cancelHref: string;
  minDate: string;
};

export function AppointmentForm({ doctors, canChooseDoctor, initial, initialPatientLabel, appointmentId, cancelHref, minDate }: Props) {
  const [state, formAction, pending] = useActionState(saveAppointmentAction, {
    values: initial,
    patientLabel: initialPatientLabel,
  } as AppointmentFormState);
  const v = state.values ?? initial;
  const errors = state.fieldErrors ?? {};

  const [patient, setPatient] = useState({ id: v.patientId ?? "", label: state.patientLabel ?? initialPatientLabel ?? "" });

  const field = (k: keyof typeof errors) => ({
    id: k,
    name: k,
    "aria-invalid": !!errors[k],
    "aria-describedby": errors[k] ? `${k}-error` : undefined,
    className: inputClass,
  });

  return (
    <form action={formAction} className="space-y-8" noValidate>
      {appointmentId && <input type="hidden" name="id" value={appointmentId} />}

      <fieldset className="space-y-3">
        <legend className="mb-2 font-serif text-lg text-petrol">Paciente</legend>
        <input type="hidden" name="patientId" value={patient.id} />
        {patient.id ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-petrol/30 bg-petrol/5 px-4 py-3">
            <span className="font-semibold text-petrol" data-testid="selected-patient">
              {patient.label}
            </span>
            {!appointmentId && (
              <button type="button" onClick={() => setPatient({ id: "", label: "" })} className="text-sm font-semibold text-coral-dark hover:underline">
                Trocar paciente
              </button>
            )}
          </div>
        ) : (
          <PatientPicker onPick={(p) => setPatient({ id: String(p.id), label: `${p.displayName} · nasc. ${p.birthDate}` })} />
        )}
        {errors.patientId && (
          <p id="patientId-error" className="text-sm text-coral-dark">
            {errors.patientId}
          </p>
        )}
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="mb-2 font-serif text-lg text-petrol">Consulta</legend>

        {canChooseDoctor ? (
          <FormField id="doctorId" label="Médico(a)" error={errors.doctorId}>
            {/* key: preserva a escolha após o reset do formulário (React 19) quando há erro */}
            <select key={`d-${v.doctorId}`} {...field("doctorId")} defaultValue={v.doctorId ?? ""}>
              <option value="" disabled>
                Selecione…
              </option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </FormField>
        ) : (
          <>
            <input type="hidden" name="doctorId" value={v.doctorId ?? ""} />
            <p className="text-sm text-ink/70">
              Médico(a): <strong className="text-ink">{doctors.find((d) => String(d.id) === v.doctorId)?.name ?? "—"}</strong>
            </p>
            {errors.doctorId && <p className="text-sm text-coral-dark">{errors.doctorId}</p>}
          </>
        )}

        <div className="grid gap-5 sm:grid-cols-3">
          <FormField id="date" label="Data" error={errors.date}>
            <input {...field("date")} type="date" min={minDate} required defaultValue={v.date} />
          </FormField>
          <FormField id="time" label="Horário" error={errors.time} hint={`Entre ${CLINIC_OPEN} e ${CLINIC_CLOSE}`}>
            <input {...field("time")} type="time" step={300} required defaultValue={v.time} />
          </FormField>
          <FormField id="duration" label="Duração" error={errors.duration}>
            <select key={`du-${v.duration}`} {...field("duration")} defaultValue={v.duration ?? "30"}>
              {APPOINTMENT_DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {d} min
                </option>
              ))}
            </select>
          </FormField>
        </div>

        <FormField id="type" label="Tipo" error={errors.type}>
          <select key={`t-${v.type}`} {...field("type")} defaultValue={v.type ?? "consulta"}>
            {APPOINTMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {APPOINTMENT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </FormField>

        <FormField
          id="note"
          label="Observação administrativa (opcional)"
          error={errors.note}
          hint="Ex.: trazer exames anteriores, acompanhante. Não registre sintomas ou dados clínicos."
        >
          <input {...field("note")} maxLength={APPOINTMENT_NOTE_MAX} autoComplete="off" defaultValue={v.note} />
        </FormField>
      </fieldset>

      {state.conflict && (
        <div className="space-y-3 rounded-md border border-amber-400 bg-amber-50 p-4 text-sm text-amber-900" role="alert">
          <p>{errors.allowOverlap}</p>
          <label className="flex items-center gap-3 font-semibold">
            <input type="checkbox" name="allowOverlap" className="h-4 w-4 accent-petrol" />
            Confirmo o encaixe neste horário.
          </label>
        </div>
      )}

      <div aria-live="polite">{state.message && <FormMessage tone="error">{state.message}</FormMessage>}</div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link href={cancelHref} className={secondaryButtonClass}>
          Voltar
        </Link>
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Salvando…" : appointmentId ? "Salvar remarcação" : "Agendar consulta"}
        </button>
      </div>
    </form>
  );
}

/**
 * Busca de paciente dentro do formulário (não pode haver <form> aninhado):
 * chama a Server Action diretamente. O termo vai no corpo do POST, nunca na URL.
 */
function PatientPicker({ onPick }: { onPick: (p: PatientRow) => void }) {
  const [term, setTerm] = useState("");
  const [result, setResult] = useState<{ rows?: PatientRow[]; message?: string }>({});
  const [searching, startSearch] = useTransition();

  const search = () =>
    startSearch(async () => {
      const fd = new FormData();
      fd.set("q", term);
      const r = await searchPatientsAction({}, fd);
      setResult({ rows: r.results, message: r.message });
    });

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <label htmlFor="patientSearch" className="sr-only">
          Buscar paciente
        </label>
        <input
          id="patientSearch"
          type="search"
          autoComplete="off"
          placeholder="Nome, nome social ou CPF completo"
          className={inputClass}
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault(); // Enter busca o paciente em vez de enviar o agendamento
              search();
            }
          }}
        />
        <button type="button" onClick={search} disabled={searching} className={`${secondaryButtonClass} mt-1`}>
          {searching ? "Buscando…" : "Buscar"}
        </button>
      </div>
      {result.message && <FormMessage tone="error">{result.message}</FormMessage>}
      {result.rows && (
        <ul className="divide-y divide-brand-gray/40 rounded-md border border-brand-gray/60 bg-white" aria-label="Pacientes encontrados">
          {result.rows.length === 0 && <li className="px-4 py-3 text-sm text-ink/60">Nenhum paciente encontrado.</li>}
          {result.rows.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => onPick(p)} className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-petrol/5">
                <span>
                  <span className="font-semibold text-petrol">{p.displayName}</span>
                  <span className="block text-xs text-ink/60">
                    nasc. {p.birthDate} · CPF {p.cpf}
                  </span>
                </span>
                <span className="text-sm font-semibold text-coral-dark">Selecionar</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-ink/60">
        Paciente novo? <Link href="/pacientes/novo" className="font-semibold text-petrol hover:underline">Cadastre primeiro</Link>.
      </p>
    </div>
  );
}
