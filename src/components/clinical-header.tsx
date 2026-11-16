import Link from "next/link";
import type { Patient } from "@/db/schema";
import { ageFromBirthDate, formatDateBr } from "@/lib/br-docs";
import { getClinicalProfile } from "@/lib/clinical-service";
import { PATIENT_SEX_LABELS } from "@/lib/patient-constants";
import { Badge } from "./badge";

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

/**
 * Identificação do paciente + alergias e medicamentos em uso, sempre no topo das telas clínicas
 * (CLAUDE.md, 6.3). Componente de servidor: o conteúdo é decifrado aqui e não vai inteiro ao cliente.
 */
export function ClinicalHeader({ patient, back }: { patient: Patient; back?: { href: string; label: string } }) {
  const profile = getClinicalProfile(patient.id);
  const age = ageFromBirthDate(patient.birthDate);

  return (
    <div className="space-y-4">
      {back && (
        <Link href={back.href} className="text-sm font-semibold text-petrol/70 hover:text-petrol">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl text-petrol">{patient.socialName ?? patient.fullName}</h1>
          <p className="text-sm text-ink/70">
            {patient.socialName && <>Nome civil: {patient.fullName} · </>}
            {PATIENT_SEX_LABELS[patient.sex]} · {formatDateBr(patient.birthDate)} ({age} anos)
          </p>
        </div>
        {!patient.active && <Badge tone="muted">Cadastro inativo</Badge>}
      </div>

      <div className="grid gap-3 md:grid-cols-2" data-testid="clinical-alerts">
        <div
          className={`rounded-lg border p-4 ${
            profile?.data.alergias ? "border-coral/60 bg-coral/10" : "border-brand-gray/60 bg-white"
          }`}
        >
          <h2 className="text-sm font-bold uppercase tracking-wide text-coral-dark">Alergias</h2>
          <p className="mt-1 whitespace-pre-line text-sm" data-testid="allergies">
            {!profile
              ? "Não informado"
              : profile.data.negaAlergias
                ? "Nega alergias conhecidas"
                : profile.data.alergias || "Não informado"}
          </p>
        </div>
        <div className="rounded-lg border border-brand-gray/60 bg-white p-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-petrol">Medicamentos em uso</h2>
          <p className="mt-1 whitespace-pre-line text-sm" data-testid="current-meds">
            {profile?.data.medicamentosEmUso || "Não informado"}
          </p>
        </div>
        {profile && (
          <p className="text-xs text-ink/60 md:col-span-2">
            Atualizado em {dateTime.format(profile.updatedAt)} por {profile.author}.{" "}
            {patient.active && (
              <Link href={`/pacientes/${patient.id}/prontuario/alergias`} className="font-semibold text-petrol hover:underline">
                Atualizar
              </Link>
            )}
          </p>
        )}
        {!profile && patient.active && (
          <Link href={`/pacientes/${patient.id}/prontuario/alergias`} className="text-sm font-semibold text-petrol hover:underline md:col-span-2">
            Registrar alergias e medicamentos em uso →
          </Link>
        )}
      </div>
    </div>
  );
}
