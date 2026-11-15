import Link from "next/link";
import { Badge } from "@/components/badge";
import { FormMessage } from "@/components/form-field";
import { PatientStatusForm } from "@/components/patient-status-form";
import { primaryButtonClass } from "@/components/ui";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { ageFromBirthDate, formatCep, formatCns, formatCpf, formatDateBr, formatPhone } from "@/lib/br-docs";
import {
  AGE_OF_MAJORITY,
  CONSENT_CHANNEL_LABELS,
  CONSENT_CHANNELS,
  PATIENT_COVERAGE_LABELS,
  PATIENT_SEX_LABELS,
} from "@/lib/patient-constants";
import { getConsentHistory, getCurrentConsents, getUserName } from "@/lib/patient-service";
import { can } from "@/lib/permissions";
import { loadPatient } from "./load-patient";

export const metadata = { title: "Ficha do paciente | Prontuário Eletrônico" };

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function PacientePage({ params, searchParams }: PageProps<"/pacientes/[id]">) {
  const user = await requirePermission("pacientes:ler");
  const patient = loadPatient((await params).id);
  const { salvo, situacao } = await searchParams;

  // Leitura do cadastro é auditada (quem viu, quando).
  await audit({ userId: user.id, action: "ler", resource: "paciente", resourceId: patient.id, patientId: patient.id });

  const age = ageFromBirthDate(patient.birthDate);
  const consents = getCurrentConsents(patient.id);
  const history = getConsentHistory(patient.id);
  const address = [
    [patient.street, patient.number].filter(Boolean).join(", "),
    patient.complement,
    patient.district,
    [patient.city, patient.uf].filter(Boolean).join("/"),
    patient.cep && `CEP ${formatCep(patient.cep)}`,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      {salvo === "1" && <FormMessage tone="success">Cadastro salvo com sucesso.</FormMessage>}
      {situacao === "inativado" && <FormMessage tone="success">Cadastro inativado.</FormMessage>}
      {situacao === "reativado" && <FormMessage tone="success">Cadastro reativado.</FormMessage>}

      <div>
        <Link href="/pacientes" className="text-sm font-semibold text-petrol/70 hover:text-petrol">
          ← Pacientes
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl text-petrol">{patient.socialName ?? patient.fullName}</h1>
            {patient.socialName && <p className="text-ink/70">Nome civil: {patient.fullName}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              {patient.active ? <Badge tone="ok">Ativo</Badge> : <Badge tone="muted">Inativo</Badge>}
              {age < AGE_OF_MAJORITY && <Badge tone="warn">Menor de idade</Badge>}
            </div>
          </div>
          <div className="flex flex-wrap items-start gap-3">
            {patient.active && can(user.role, "pacientes:editar") && (
              <Link href={`/pacientes/${patient.id}/editar`} className={primaryButtonClass}>
                Editar cadastro
              </Link>
            )}
            {can(user.role, "pacientes:inativar") && <PatientStatusForm patientId={patient.id} active={patient.active} />}
          </div>
        </div>
      </div>

      {!patient.active && (
        <FormMessage tone="error">
          Inativado em {patient.inactivatedAt ? dateTime.format(patient.inactivatedAt) : "—"} por{" "}
          {getUserName(patient.inactivatedBy) ?? "—"}. Motivo: {patient.inactivationReason}
        </FormMessage>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Identificação">
          <Item label="Data de nascimento" value={`${formatDateBr(patient.birthDate)} (${age} anos)`} />
          <Item label="Sexo" value={PATIENT_SEX_LABELS[patient.sex]} />
          <Item label="CPF" value={formatCpf(patient.cpf)} mono />
          <Item label="CNS" value={patient.cns ? formatCns(patient.cns) : null} mono />
        </Section>

        <Section title="Contato e endereço">
          <Item label="Telefone" value={formatPhone(patient.phone)} mono />
          <Item label="E-mail" value={patient.email} />
          <Item label="Endereço" value={address.length ? address.join(" · ") : null} />
        </Section>

        <Section title="Responsável legal">
          {patient.guardianName ? (
            <>
              <Item label="Nome" value={`${patient.guardianName}${patient.guardianRelationship ? ` (${patient.guardianRelationship})` : ""}`} />
              <Item label="CPF" value={patient.guardianCpf ? formatCpf(patient.guardianCpf) : null} mono />
              <Item label="Telefone" value={patient.guardianPhone ? formatPhone(patient.guardianPhone) : null} mono />
            </>
          ) : (
            <p className="text-sm text-ink/60">Não informado.</p>
          )}
        </Section>

        <Section title="Atendimento">
          <Item label="Tipo" value={PATIENT_COVERAGE_LABELS[patient.coverage]} />
          {patient.coverage === "convenio" && (
            <>
              <Item label="Convênio" value={patient.insurerName} />
              <Item label="Carteirinha" value={patient.insurerCardNumber} mono />
            </>
          )}
        </Section>

        <Section title="Comunicação (consentimento LGPD)">
          {CONSENT_CHANNELS.map((c) => {
            const cur = consents[c];
            return (
              <div key={c} className="flex items-center justify-between gap-3">
                <dt className="text-sm text-ink/70">{CONSENT_CHANNEL_LABELS[c]}</dt>
                <dd className="text-right text-sm">
                  {cur?.granted ? <Badge tone="ok">Autorizado</Badge> : <Badge tone="muted">Não autorizado</Badge>}
                  {cur && <span className="block text-xs text-ink/50">desde {dateTime.format(cur.recordedAt)}</span>}
                </dd>
              </div>
            );
          })}
          {history.length > 0 && (
            <details className="pt-2 text-sm">
              <summary className="cursor-pointer font-semibold text-petrol">Histórico de consentimentos ({history.length})</summary>
              <ul className="mt-2 space-y-1 text-xs text-ink/70" data-testid="consent-history">
                {history.map((h) => (
                  <li key={h.id}>
                    {dateTime.format(h.recordedAt)} · {CONSENT_CHANNEL_LABELS[h.channel]} ·{" "}
                    {h.granted ? "autorizado" : "não autorizado/revogado"} · termo {h.termVersion} · registrado por{" "}
                    {h.recordedByName ?? "—"}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Section>

        <Section title="Registro">
          <Item label="Cadastrado em" value={`${dateTime.format(patient.createdAt)} por ${getUserName(patient.createdBy) ?? "—"}`} />
          <Item label="Última alteração" value={`${dateTime.format(patient.updatedAt)} por ${getUserName(patient.updatedBy) ?? "—"}`} />
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-brand-gray/60 bg-white p-5 shadow-sm">
      <h2 className="mb-3 font-serif text-lg text-petrol">{title}</h2>
      <dl className="space-y-2">{children}</dl>
    </section>
  );
}

function Item({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3 text-sm">
      <dt className="text-ink/70">{label}</dt>
      <dd className={`${mono ? "font-mono" : ""} ${value ? "text-ink" : "text-ink/40"}`}>{value || "—"}</dd>
    </div>
  );
}
