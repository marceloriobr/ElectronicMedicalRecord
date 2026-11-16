import { redirect } from "next/navigation";
import { PrescriptionForm } from "@/components/clinical-forms";
import { ClinicalHeader } from "@/components/clinical-header";
import { requireClinicalPermission } from "@/lib/auth";
import { loadPatient } from "../../load-patient";

export const metadata = { title: "Nova receita | Prontuário Eletrônico" };

export default async function NovaReceitaPage({ params, searchParams }: PageProps<"/pacientes/[id]/receitas/nova">) {
  await requireClinicalPermission("receita:emitir");
  const patient = loadPatient((await params).id);
  const { registro } = await searchParams;
  const base = `/pacientes/${patient.id}/prontuario`;
  if (!patient.active) redirect(base);
  // O registro vinculado é conferido no servidor ao emitir (precisa ser do mesmo paciente).
  const recordId = typeof registro === "string" && /^\d{1,10}$/.test(registro) ? Number(registro) : undefined;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <ClinicalHeader patient={patient} back={{ href: base, label: "Prontuário" }} />
      <h2 className="font-serif text-2xl text-petrol">Nova receita</h2>
      <PrescriptionForm patientId={patient.id} recordId={recordId} cancelHref={base} />
    </div>
  );
}
