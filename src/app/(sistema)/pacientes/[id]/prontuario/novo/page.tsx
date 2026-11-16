import { redirect } from "next/navigation";
import { ClinicalHeader } from "@/components/clinical-header";
import { RecordForm } from "@/components/record-form";
import { requireClinicalPermission } from "@/lib/auth";
import { RECORD_KIND_LABELS, RECORD_KINDS, type RecordKind } from "@/lib/clinical-constants";
import { loadPatient } from "../../load-patient";

export const metadata = { title: "Novo registro | Prontuário Eletrônico" };

export default async function NovoRegistroPage({ params, searchParams }: PageProps<"/pacientes/[id]/prontuario/novo">) {
  await requireClinicalPermission("prontuario:escrever");
  const patient = loadPatient((await params).id);
  const { tipo, consulta } = await searchParams;
  const base = `/pacientes/${patient.id}/prontuario`;
  if (!patient.active) redirect(base);

  const kind: RecordKind = (RECORD_KINDS as readonly string[]).includes(String(tipo)) ? (tipo as RecordKind) : "evolucao";
  // A consulta vinculada é conferida no servidor ao salvar (precisa ser do paciente e do próprio médico).
  const appointmentId = typeof consulta === "string" && /^\d{1,10}$/.test(consulta) ? Number(consulta) : undefined;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <ClinicalHeader patient={patient} back={{ href: base, label: "Prontuário" }} />
      <h2 className="font-serif text-2xl text-petrol">{RECORD_KIND_LABELS[kind]}</h2>
      <RecordForm patientId={patient.id} kind={kind} appointmentId={appointmentId} cancelHref={base} />
    </div>
  );
}
