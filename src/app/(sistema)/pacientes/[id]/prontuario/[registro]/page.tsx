import Link from "next/link";
import { Badge } from "@/components/badge";
import { AddendumForm } from "@/components/clinical-forms";
import { ClinicalHeader } from "@/components/clinical-header";
import { FormMessage } from "@/components/form-field";
import { RecordForm } from "@/components/record-form";
import { secondaryButtonClass } from "@/components/ui";
import { audit } from "@/lib/audit";
import { requireClinicalPermission } from "@/lib/auth";
import { RECORD_KIND_LABELS, RECORD_TEXT_FIELDS, VITAL_SIGNS, type RecordKind } from "@/lib/clinical-constants";
import { getRecord, listAddenda } from "@/lib/clinical-service";
import { can } from "@/lib/permissions";
import { loadPatient } from "../../load-patient";
import { orNotFound, routeId } from "../load";

export const metadata = { title: "Registro clínico | Prontuário Eletrônico" };

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

const OK: Record<string, string> = {
  rascunho: "Rascunho salvo. Ele só é visível para você até ser finalizado.",
  finalizado: "Registro finalizado.",
  aditado: "Aditamento registrado.",
};

export default async function RegistroPage({ params, searchParams }: PageProps<"/pacientes/[id]/prontuario/[registro]">) {
  const user = await requireClinicalPermission("prontuario:ler");
  const { id, registro } = await params;
  const patient = loadPatient(id);
  const record = orNotFound(() => getRecord(patient.id, routeId(registro), user.id));
  const { ok } = await searchParams;
  const base = `/pacientes/${patient.id}/prontuario`;

  await audit({ userId: user.id, action: "ler", resource: "registro_clinico", resourceId: record.id, patientId: patient.id });

  const isAuthor = record.authorId === user.id;
  const c = record.content;

  // Rascunho do próprio autor: abre direto para edição.
  if (record.status === "rascunho" && isAuthor && patient.active && can(user.role, "prontuario:escrever")) {
    const values: Record<string, string> = {};
    for (const f of RECORD_TEXT_FIELDS) values[f.key] = c[f.key] ?? "";
    for (const v of VITAL_SIGNS) values[`vitals.${v.key}`] = c.vitals[v.key] !== undefined ? String(c.vitals[v.key]).replace(".", ",") : "";
    return (
      <div className="mx-auto max-w-4xl space-y-8">
        {typeof ok === "string" && OK[ok] && <FormMessage tone="success">{OK[ok]}</FormMessage>}
        <ClinicalHeader patient={patient} back={{ href: base, label: "Prontuário" }} />
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-serif text-2xl text-petrol">{RECORD_KIND_LABELS[record.kind]}</h2>
          <Badge tone="warn">Rascunho</Badge>
          <span className="text-sm text-ink/60">iniciado em {dateTime.format(record.createdAt)}</span>
        </div>
        <RecordForm
          patientId={patient.id}
          kind={record.kind}
          recordId={record.id}
          initialValues={values}
          initialCids={{ principal: record.cidPrincipal, secundarios: record.cidsSecundarios }}
          cancelHref={base}
        />
      </div>
    );
  }

  const addenda = listAddenda(patient.id, record.id);
  const fields = RECORD_TEXT_FIELDS.filter((f) => (f.kinds as readonly RecordKind[]).includes(record.kind) && c[f.key]);
  const vitals = VITAL_SIGNS.filter((v) => c.vitals[v.key] !== undefined);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {typeof ok === "string" && OK[ok] && <FormMessage tone="success">{OK[ok]}</FormMessage>}
      <ClinicalHeader patient={patient} back={{ href: base, label: "Prontuário" }} />

      <article className="space-y-6 rounded-lg border border-brand-gray/60 bg-white p-6 shadow-sm" data-testid="record">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-gray/40 pb-4">
          <div>
            <h2 className="font-serif text-2xl text-petrol">{RECORD_KIND_LABELS[record.kind]}</h2>
            <p className="text-sm text-ink/70">
              {dateTime.format(record.createdAt)} · {record.author}
            </p>
            {record.finalizedAt && <p className="text-xs text-ink/60">Finalizado em {dateTime.format(record.finalizedAt)}</p>}
          </div>
          {record.status === "finalizado" ? <Badge tone="ok">Finalizado</Badge> : <Badge tone="warn">Rascunho</Badge>}
        </header>

        {fields.map((f) => (
          <section key={f.key}>
            <h3 className="text-sm font-bold uppercase tracking-wide text-petrol">{f.label}</h3>
            <p className="mt-1 whitespace-pre-line text-ink">{c[f.key]}</p>
          </section>
        ))}

        {vitals.length > 0 && (
          <section>
            <h3 className="text-sm font-bold uppercase tracking-wide text-petrol">Sinais vitais</h3>
            <dl className="mt-1 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
              {vitals.map((v) => (
                <div key={v.key}>
                  <dt className="text-ink/60">{v.label}</dt>
                  <dd className="font-semibold">
                    {String(c.vitals[v.key]).replace(".", ",")} {v.unit}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <section data-testid="record-cids">
          <h3 className="text-sm font-bold uppercase tracking-wide text-petrol">Hipóteses diagnósticas (CID-10)</h3>
          {record.cidPrincipal ? (
            <ul className="mt-1 space-y-1 text-sm">
              <li>
                <span className="font-semibold">Principal:</span> <span className="font-mono">{record.cidPrincipal.code}</span> —{" "}
                {record.cidPrincipal.description}
              </li>
              {record.cidsSecundarios.map((s) => (
                <li key={s.code}>
                  <span className="font-semibold">Secundário:</span> <span className="font-mono">{s.code}</span> — {s.description}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-ink/50">Não informado.</p>
          )}
        </section>
      </article>

      <section className="space-y-4">
        <h2 className="font-serif text-lg text-petrol">Aditamentos</h2>
        {addenda.length === 0 ? (
          <p className="text-sm text-ink/60">Nenhum aditamento.</p>
        ) : (
          <ol className="space-y-3" data-testid="addenda">
            {addenda.map((a) => (
              <li key={a.id} className="rounded-lg border border-petrol/20 bg-petrol/5 p-4 text-sm">
                <p className="text-xs text-ink/60">
                  {dateTime.format(a.createdAt)} · {a.author}
                </p>
                <p className="mt-1">
                  <span className="font-semibold">Motivo:</span> {a.motivo}
                </p>
                <p className="mt-1 whitespace-pre-line">{a.texto}</p>
              </li>
            ))}
          </ol>
        )}
        <div className="flex flex-wrap items-start gap-3">
          {record.status === "finalizado" && isAuthor && patient.active && can(user.role, "prontuario:escrever") && (
            <AddendumForm patientId={patient.id} recordId={record.id} />
          )}
          {record.status === "finalizado" && patient.active && can(user.role, "receita:emitir") && (
            <Link href={`/pacientes/${patient.id}/receitas/nova?registro=${record.id}`} className={secondaryButtonClass}>
              Emitir receita deste atendimento
            </Link>
          )}
        </div>
        {record.status === "finalizado" && !isAuthor && (
          <p className="text-xs text-ink/60">Somente o autor do registro pode aditá-lo.</p>
        )}
      </section>
    </div>
  );
}
