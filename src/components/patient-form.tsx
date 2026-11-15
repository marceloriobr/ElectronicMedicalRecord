"use client";

import Link from "next/link";
import { useActionState, useState, type InputHTMLAttributes } from "react";
import { savePatientAction, type PatientFormState } from "@/app/actions/patients";
import { BR_UFS } from "@/lib/br-ufs";
import { ageFromBirthDate, formatCep, formatCns, formatCpf, formatPhone, todayIso } from "@/lib/br-docs";
import {
  AGE_OF_MAJORITY,
  CONSENT_TERM_TEXT,
  CONSENT_TERM_VERSION,
  PATIENT_COVERAGE,
  PATIENT_COVERAGE_LABELS,
  PATIENT_SEX,
  PATIENT_SEX_LABELS,
} from "@/lib/patient-constants";
import { FormField, FormMessage } from "./form-field";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "./ui";

type Values = NonNullable<PatientFormState["values"]>;
type ErrorKey = keyof NonNullable<PatientFormState["fieldErrors"]>;

type Props = {
  /** Presente na edição. */
  patientId?: number;
  initial?: Values;
  cancelHref: string;
};

export function PatientForm({ patientId, initial, cancelHref }: Props) {
  const [state, formAction, pending] = useActionState(savePatientAction, { values: initial } as PatientFormState);
  const v: Values = state.values ?? initial ?? {};
  const errors = state.fieldErrors ?? {};

  const [birthDate, setBirthDate] = useState(v.birthDate ?? "");
  const [coverage, setCoverage] = useState(v.coverage || "particular");
  const isMinor = /^\d{4}-\d{2}-\d{2}$/.test(birthDate) && ageFromBirthDate(birthDate) < AGE_OF_MAJORITY;

  const field = (k: ErrorKey) => ({
    id: k,
    name: k,
    "aria-invalid": !!errors[k],
    "aria-describedby": errors[k] ? `${k}-error` : undefined,
    className: inputClass,
  });

  return (
    <form action={formAction} className="space-y-10" noValidate>
      {patientId && <input type="hidden" name="id" value={patientId} />}

      <fieldset className="space-y-5">
        <legend className="mb-4 font-serif text-lg text-petrol">Identificação</legend>

        <FormField id="fullName" label="Nome completo (civil)" error={errors.fullName}>
          <input {...field("fullName")} required autoComplete="off" defaultValue={v.fullName} />
        </FormField>

        <FormField
          id="socialName"
          label="Nome social (opcional)"
          error={errors.socialName}
          hint="Quando informado, é o nome usado no atendimento e exibido em destaque."
        >
          <input {...field("socialName")} autoComplete="off" defaultValue={v.socialName} />
        </FormField>

        <div className="grid gap-5 sm:grid-cols-3">
          <FormField id="birthDate" label="Data de nascimento" error={errors.birthDate}>
            <input
              {...field("birthDate")}
              type="date"
              required
              min="1900-01-01"
              max={todayIso()}
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
            />
          </FormField>
          <FormField id="sex" label="Sexo" error={errors.sex}>
            {/* key: o React 19 reseta o formulário após a action e o <select> volta à opção
                padrão do 1º render. Recriar o campo com o valor devolvido preserva a escolha. */}
            <select key={`sex-${v.sex}`} {...field("sex")} required defaultValue={v.sex ?? ""}>
              <option value="" disabled>
                Selecione…
              </option>
              {PATIENT_SEX.map((s) => (
                <option key={s} value={s}>
                  {PATIENT_SEX_LABELS[s]}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id="cpf" label="CPF" error={errors.cpf}>
            <MaskedInput {...field("cpf")} format={formatCpf} required inputMode="numeric" placeholder="000.000.000-00" initial={v.cpf} />
          </FormField>
        </div>

        <FormField id="cns" label="Cartão Nacional de Saúde – CNS (opcional)" error={errors.cns}>
          <MaskedInput {...field("cns")} format={formatCns} inputMode="numeric" placeholder="000 0000 0000 0000" initial={v.cns} />
        </FormField>
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="mb-4 font-serif text-lg text-petrol">Contato e endereço</legend>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField id="phone" label="Telefone / celular" error={errors.phone}>
            <MaskedInput {...field("phone")} format={formatPhone} required type="tel" inputMode="tel" placeholder="(21) 99999-9999" initial={v.phone} />
          </FormField>
          <FormField id="email" label="E-mail (opcional)" error={errors.email}>
            <input {...field("email")} type="email" autoComplete="off" defaultValue={v.email} />
          </FormField>
        </div>

        <div className="grid gap-5 sm:grid-cols-[10rem_1fr_7rem]">
          <FormField id="cep" label="CEP" error={errors.cep}>
            <MaskedInput {...field("cep")} format={formatCep} inputMode="numeric" placeholder="00000-000" initial={v.cep} />
          </FormField>
          <FormField id="street" label="Logradouro" error={errors.street}>
            <input {...field("street")} autoComplete="off" defaultValue={v.street} />
          </FormField>
          <FormField id="number" label="Número" error={errors.number}>
            <input {...field("number")} autoComplete="off" defaultValue={v.number} />
          </FormField>
        </div>

        <div className="grid gap-5 sm:grid-cols-[1fr_1fr_1fr_6rem]">
          <FormField id="complement" label="Complemento" error={errors.complement}>
            <input {...field("complement")} autoComplete="off" defaultValue={v.complement} />
          </FormField>
          <FormField id="district" label="Bairro" error={errors.district}>
            <input {...field("district")} autoComplete="off" defaultValue={v.district} />
          </FormField>
          <FormField id="city" label="Cidade" error={errors.city}>
            <input {...field("city")} autoComplete="off" defaultValue={v.city} />
          </FormField>
          <FormField id="uf" label="UF" error={errors.uf}>
            <select key={`uf-${v.uf}`} {...field("uf")} defaultValue={v.uf ?? ""}>
              <option value="">—</option>
              {BR_UFS.map((uf) => (
                <option key={uf}>{uf}</option>
              ))}
            </select>
          </FormField>
        </div>
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="mb-1 font-serif text-lg text-petrol">
          Responsável legal {isMinor ? "" : "(opcional)"}
        </legend>
        <p className="text-sm text-ink/70">
          {isMinor
            ? "Paciente menor de 18 anos: o responsável legal é obrigatório."
            : "Para pacientes que dependem de responsável (ex.: curador ou familiar responsável)."}
        </p>
        <div className="grid gap-5 sm:grid-cols-[1fr_12rem]">
          <FormField id="guardianName" label="Nome do responsável" error={errors.guardianName}>
            <input {...field("guardianName")} autoComplete="off" required={isMinor} defaultValue={v.guardianName} />
          </FormField>
          <FormField id="guardianRelationship" label="Parentesco / vínculo" error={errors.guardianRelationship}>
            <input {...field("guardianRelationship")} autoComplete="off" required={isMinor} placeholder="Ex.: mãe, filho, curador" defaultValue={v.guardianRelationship} />
          </FormField>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField id="guardianCpf" label="CPF do responsável" error={errors.guardianCpf}>
            <MaskedInput {...field("guardianCpf")} format={formatCpf} inputMode="numeric" required={isMinor} placeholder="000.000.000-00" initial={v.guardianCpf} />
          </FormField>
          <FormField id="guardianPhone" label="Telefone do responsável" error={errors.guardianPhone}>
            <MaskedInput {...field("guardianPhone")} format={formatPhone} type="tel" inputMode="tel" placeholder="(21) 99999-9999" initial={v.guardianPhone} />
          </FormField>
        </div>
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="mb-4 font-serif text-lg text-petrol">Atendimento</legend>
        <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Tipo de atendimento">
          {PATIENT_COVERAGE.map((c) => (
            <label
              key={c}
              className={`cursor-pointer rounded-md border bg-white px-4 py-2.5 font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-petrol/30 ${
                coverage === c ? "border-petrol text-petrol ring-1 ring-petrol" : "border-brand-gray text-ink/70 hover:border-petrol/50"
              }`}
            >
              <input type="radio" name="coverage" value={c} checked={coverage === c} onChange={() => setCoverage(c)} className="sr-only" />
              {PATIENT_COVERAGE_LABELS[c]}
            </label>
          ))}
        </div>
        {coverage === "convenio" && (
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField id="insurerName" label="Convênio" error={errors.insurerName}>
              <input {...field("insurerName")} autoComplete="off" required defaultValue={v.insurerName} />
            </FormField>
            <FormField id="insurerCardNumber" label="Nº da carteirinha" error={errors.insurerCardNumber}>
              <input {...field("insurerCardNumber")} autoComplete="off" required defaultValue={v.insurerCardNumber} />
            </FormField>
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-1 font-serif text-lg text-petrol">Comunicação (LGPD)</legend>
        <p className="rounded-md bg-petrol/5 p-3 text-sm text-ink/80">
          {CONSENT_TERM_TEXT} <span className="text-ink/50">(termo {CONSENT_TERM_VERSION})</span>
        </p>
        <p className="text-sm text-ink/70">Marque apenas os canais que o paciente autorizou expressamente:</p>
        <label className="flex items-center gap-3 text-ink">
          <input type="checkbox" name="consentWhatsapp" defaultChecked={v.consentWhatsapp} className="h-4 w-4 accent-petrol" />
          Autoriza mensagens por WhatsApp
        </label>
        <label className="flex items-center gap-3 text-ink">
          <input type="checkbox" name="consentEmail" defaultChecked={v.consentEmail} className="h-4 w-4 accent-petrol" />
          Autoriza mensagens por e-mail
        </label>
      </fieldset>

      {state.homonym && (
        <div className="space-y-3 rounded-md border border-amber-400 bg-amber-50 p-4 text-sm text-amber-900" role="alert">
          <p>{errors.confirmHomonym}</p>
          <label className="flex items-center gap-3 font-semibold">
            <input type="checkbox" name="confirmHomonym" className="h-4 w-4 accent-petrol" />
            Conferi: é outra pessoa (homônimo). Salvar mesmo assim.
          </label>
        </div>
      )}

      <div aria-live="polite">
        {state.message && !state.homonym && <FormMessage tone="error">{state.message}</FormMessage>}
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link href={cancelHref} className={secondaryButtonClass}>
          Cancelar
        </Link>
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Salvando…" : patientId ? "Salvar alterações" : "Cadastrar paciente"}
        </button>
      </div>
    </form>
  );
}

/** Campo com máscara aplicada durante a digitação. */
function MaskedInput({
  format,
  initial,
  ...props
}: { format: (v: string) => string; initial?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const [value, setValue] = useState(() => format(initial ?? ""));
  return <input {...props} autoComplete="off" value={value} onChange={(e) => setValue(format(e.target.value))} />;
}
