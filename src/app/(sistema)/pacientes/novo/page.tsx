import Link from "next/link";
import { PatientForm } from "@/components/patient-form";
import { requirePermission } from "@/lib/auth";

export const metadata = { title: "Novo paciente | Prontuário Eletrônico" };

export default async function NovoPacientePage() {
  await requirePermission("pacientes:editar");

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/pacientes" className="text-sm font-semibold text-petrol/70 hover:text-petrol">
        ← Pacientes
      </Link>
      <h1 className="mt-2 font-serif text-3xl text-petrol">Novo paciente</h1>
      <p className="mt-1 text-ink/70">
        Dados de identificação e contato. Não registre aqui informações clínicas.
      </p>

      <div className="mt-8 rounded-lg border border-brand-gray/60 bg-white p-6 shadow-sm sm:p-8">
        <PatientForm cancelHref="/pacientes" />
      </div>
    </div>
  );
}
