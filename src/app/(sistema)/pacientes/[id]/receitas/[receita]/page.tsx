import Link from "next/link";
import { Badge } from "@/components/badge";
import { CancelPrescriptionForm } from "@/components/clinical-forms";
import { ClinicalHeader } from "@/components/clinical-header";
import { FormMessage } from "@/components/form-field";
import { primaryButtonClass } from "@/components/ui";
import { audit } from "@/lib/audit";
import { requireClinicalPermission } from "@/lib/auth";
import { PRESCRIPTION_TYPE_LABELS } from "@/lib/clinical-constants";
import { getPrescription } from "@/lib/clinical-service";
import { loadPatient } from "../../load-patient";
import { orNotFound, routeId } from "../../prontuario/load";

export const metadata = { title: "Receita | Prontuário Eletrônico" };

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
const OK: Record<string, string> = { emitida: "Receita emitida.", cancelada: "Receita cancelada." };

export default async function ReceitaPage({ params, searchParams }: PageProps<"/pacientes/[id]/receitas/[receita]">) {
  const user = await requireClinicalPermission("receita:emitir");
  const { id, receita } = await params;
  const patient = loadPatient(id);
  const rx = orNotFound(() => getPrescription(patient.id, routeId(receita)));
  const { ok } = await searchParams;

  await audit({ userId: user.id, action: "ler", resource: "receita", resourceId: rx.id, patientId: patient.id });

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {typeof ok === "string" && OK[ok] && <FormMessage tone="success">{OK[ok]}</FormMessage>}
      <ClinicalHeader patient={patient} back={{ href: `/pacientes/${patient.id}/prontuario`, label: "Prontuário" }} />

      <article className="space-y-5 rounded-lg border border-brand-gray/60 bg-white p-6 shadow-sm" data-testid="prescription">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-gray/40 pb-4">
          <div>
            <h2 className="font-serif text-2xl text-petrol">{PRESCRIPTION_TYPE_LABELS[rx.type]}</h2>
            <p className="text-sm text-ink/70">
              Emitida em {dateTime.format(rx.issuedAt)} · {rx.doctorName} — CRM {rx.doctorCrm}/{rx.doctorCrmUf}
            </p>
          </div>
          {rx.status === "cancelada" ? <Badge tone="muted">Cancelada</Badge> : <Badge tone="ok">Emitida</Badge>}
        </header>

        {rx.status === "cancelada" && (
          <FormMessage tone="error">
            Cancelada em {rx.cancelledAt ? dateTime.format(rx.cancelledAt) : "—"} por {rx.cancelledByName ?? "—"}. Motivo: {rx.cancelReason}
          </FormMessage>
        )}

        <ol className="list-decimal space-y-3 pl-5">
          {rx.content.items.map((it, i) => (
            <li key={i}>
              <p className="font-semibold">{it.medicamento}</p>
              <p className="text-sm">
                {it.via && <>Via {it.via.toLowerCase()} · </>}
                {it.posologia}
              </p>
              <p className="text-sm text-ink/70">
                Quantidade: {it.quantidade}
                {it.duracao && <> · Duração: {it.duracao}</>}
              </p>
            </li>
          ))}
        </ol>
        {rx.content.observacoes && <p className="whitespace-pre-line text-sm">{rx.content.observacoes}</p>}
      </article>

      <div className="flex flex-wrap items-start gap-3">
        {rx.status === "emitida" && (
          <Link href={`/impressao/pacientes/${patient.id}/receitas/${rx.id}`} className={primaryButtonClass} target="_blank">
            Imprimir receita
          </Link>
        )}
        {rx.status === "emitida" && rx.authorId === user.id && <CancelPrescriptionForm patientId={patient.id} prescriptionId={rx.id} />}
      </div>
    </div>
  );
}
