import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/clinical-forms";
import { ClinicalHeader } from "@/components/clinical-header";
import { audit } from "@/lib/audit";
import { requireClinicalPermission } from "@/lib/auth";
import { getClinicalProfile } from "@/lib/clinical-service";
import { loadPatient } from "../../load-patient";

export const metadata = { title: "Alergias e medicamentos | Prontuário Eletrônico" };

export default async function AlergiasPage({ params }: PageProps<"/pacientes/[id]/prontuario/alergias">) {
  const user = await requireClinicalPermission("prontuario:escrever");
  const patient = loadPatient((await params).id);
  const base = `/pacientes/${patient.id}/prontuario`;
  if (!patient.active) redirect(base);

  await audit({ userId: user.id, action: "ler", resource: "alergias_medicamentos", resourceId: patient.id, patientId: patient.id });
  const current = getClinicalProfile(patient.id)?.data;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <ClinicalHeader patient={patient} back={{ href: base, label: "Prontuário" }} />
      <h2 className="font-serif text-2xl text-petrol">Alergias e medicamentos em uso</h2>
      <p className="text-sm text-ink/70">Cada atualização gera uma nova versão; as anteriores ficam preservadas no histórico.</p>
      <ProfileForm
        patientId={patient.id}
        initial={{ alergias: current?.alergias ?? "", medicamentosEmUso: current?.medicamentosEmUso ?? "", negaAlergias: current?.negaAlergias ?? false }}
        cancelHref={base}
      />
    </div>
  );
}
