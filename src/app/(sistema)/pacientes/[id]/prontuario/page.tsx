import Link from "next/link";
import { Badge } from "@/components/badge";
import { ClinicalHeader } from "@/components/clinical-header";
import { FormMessage } from "@/components/form-field";
import { primaryButtonClass, secondaryButtonClass } from "@/components/ui";
import { audit } from "@/lib/audit";
import { requireClinicalPermission } from "@/lib/auth";
import { PRESCRIPTION_TYPE_LABELS, RECORD_KIND_LABELS } from "@/lib/clinical-constants";
import { listPrescriptions, listRecords } from "@/lib/clinical-service";
import { can } from "@/lib/permissions";
import { loadPatient } from "../load-patient";

export const metadata = { title: "Prontuário | Prontuário Eletrônico" };

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

const OK: Record<string, string> = { alergias: "Alergias e medicamentos em uso atualizados." };

export default async function ProntuarioPage({ params, searchParams }: PageProps<"/pacientes/[id]/prontuario">) {
  const user = await requireClinicalPermission("prontuario:ler");
  const patient = loadPatient((await params).id);
  const { ok } = await searchParams;

  // Leitura do prontuário é auditada (quem viu, quando) — só a referência, nunca o conteúdo.
  await audit({ userId: user.id, action: "ler", resource: "prontuario", resourceId: patient.id, patientId: patient.id });

  const records = listRecords(patient.id, user.id);
  const rxs = listPrescriptions(patient.id);
  const canWrite = patient.active && can(user.role, "prontuario:escrever");

  return (
    <div className="space-y-8">
      {typeof ok === "string" && OK[ok] && <FormMessage tone="success">{OK[ok]}</FormMessage>}
      <ClinicalHeader patient={patient} back={{ href: `/pacientes/${patient.id}`, label: "Ficha do paciente" }} />

      {canWrite && (
        <div className="flex flex-wrap gap-3">
          <Link href={`/pacientes/${patient.id}/prontuario/novo?tipo=anamnese`} className={primaryButtonClass}>
            Nova anamnese
          </Link>
          <Link href={`/pacientes/${patient.id}/prontuario/novo?tipo=evolucao`} className={secondaryButtonClass}>
            Nova evolução
          </Link>
          {can(user.role, "receita:emitir") && (
            <Link href={`/pacientes/${patient.id}/receitas/nova`} className={secondaryButtonClass}>
              Nova receita
            </Link>
          )}
        </div>
      )}

      <section className="rounded-lg border border-brand-gray/60 bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-serif text-lg text-petrol">Registros de atendimento</h2>
        {records.length === 0 ? (
          <p className="text-sm text-ink/60">Nenhum registro no prontuário.</p>
        ) : (
          <ul className="divide-y divide-brand-gray/40" data-testid="records">
            {records.map((r) => (
              <li key={r.id} className="py-3">
                <Link href={`/pacientes/${patient.id}/prontuario/${r.id}`} className="group block">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-petrol group-hover:underline">{dateTime.format(r.createdAt)}</span>
                    <span className="text-sm text-ink/70">{RECORD_KIND_LABELS[r.kind]}</span>
                    {r.status === "rascunho" ? <Badge tone="warn">Rascunho</Badge> : <Badge tone="ok">Finalizado</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-ink/80">
                    {r.cidPrincipal ? (
                      <>
                        <span className="font-mono font-semibold">{r.cidPrincipal.code}</span> {r.cidPrincipal.description}
                        {r.cidsSecundarios.length > 0 && <span className="text-ink/60"> · +{r.cidsSecundarios.length} CID(s)</span>}
                      </>
                    ) : (
                      <span className="text-ink/50">Sem CID</span>
                    )}
                  </p>
                  <p className="text-xs text-ink/60">{r.author}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-brand-gray/60 bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-serif text-lg text-petrol">Receitas</h2>
        {rxs.length === 0 ? (
          <p className="text-sm text-ink/60">Nenhuma receita emitida.</p>
        ) : (
          <ul className="divide-y divide-brand-gray/40" data-testid="prescriptions">
            {rxs.map((rx) => (
              <li key={rx.id} className="py-3">
                <Link href={`/pacientes/${patient.id}/receitas/${rx.id}`} className="group block">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-petrol group-hover:underline">{dateTime.format(rx.issuedAt)}</span>
                    <span className="text-sm text-ink/70">{PRESCRIPTION_TYPE_LABELS[rx.type]}</span>
                    {rx.status === "cancelada" && <Badge tone="muted">Cancelada</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-ink/80">{rx.medicamentos.join(" · ")}</p>
                  <p className="text-xs text-ink/60">
                    {rx.doctorName} — CRM {rx.doctorCrm}/{rx.doctorCrmUf}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
