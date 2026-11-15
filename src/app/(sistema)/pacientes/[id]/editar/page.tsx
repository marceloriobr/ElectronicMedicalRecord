import Link from "next/link";
import { redirect } from "next/navigation";
import { PatientForm } from "@/components/patient-form";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { toFormValues } from "@/lib/patient-service";
import { loadPatient } from "../load-patient";

export const metadata = { title: "Editar paciente | Prontuário Eletrônico" };

export default async function EditarPacientePage({ params }: PageProps<"/pacientes/[id]/editar">) {
  const user = await requirePermission("pacientes:editar");
  const patient = loadPatient((await params).id);
  if (!patient.active) redirect(`/pacientes/${patient.id}`);

  await audit({ userId: user.id, action: "ler", resource: "paciente", resourceId: patient.id, patientId: patient.id, details: { tela: "editar" } });

  return (
    <div className="mx-auto max-w-4xl">
      <Link href={`/pacientes/${patient.id}`} className="text-sm font-semibold text-petrol/70 hover:text-petrol">
        ← Ficha do paciente
      </Link>
      <h1 className="mt-2 font-serif text-3xl text-petrol">Editar cadastro</h1>
      <p className="mt-1 text-ink/70">{patient.socialName ?? patient.fullName}</p>

      <div className="mt-8 rounded-lg border border-brand-gray/60 bg-white p-6 shadow-sm sm:p-8">
        <PatientForm patientId={patient.id} initial={toFormValues(patient)} cancelHref={`/pacientes/${patient.id}`} />
      </div>
    </div>
  );
}
