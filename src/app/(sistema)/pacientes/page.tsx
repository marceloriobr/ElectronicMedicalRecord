import Link from "next/link";
import { PatientSearch } from "@/components/patient-search";
import { primaryButtonClass } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { countPatients, listRecentPatients, toPatientRow } from "@/lib/patient-service";

export const metadata = { title: "Pacientes | Prontuário Eletrônico" };

export default async function PacientesPage() {
  await requirePermission("pacientes:ler");
  const { total, active } = countPatients();
  const recent = listRecentPatients().map(toPatientRow);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl text-petrol">Pacientes</h1>
          <p className="mt-1 text-ink/70">
            {active} ativo(s){total > active ? ` · ${total - active} inativo(s)` : ""}
          </p>
        </div>
        <Link href="/pacientes/novo" className={primaryButtonClass}>
          + Novo paciente
        </Link>
      </div>

      <PatientSearch recent={recent} />
    </div>
  );
}
