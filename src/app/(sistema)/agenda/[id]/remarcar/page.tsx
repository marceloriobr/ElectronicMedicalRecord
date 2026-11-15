import Link from "next/link";
import { redirect } from "next/navigation";
import { AppointmentForm } from "@/components/appointment-form";
import { requirePermission } from "@/lib/auth";
import { doctorsFor } from "@/lib/appointment-service";
import { formatDateBr, todayIso } from "@/lib/br-docs";
import { toClinic } from "@/lib/clinic-time";
import { can } from "@/lib/permissions";
import { loadAppointmentFor } from "../load-appointment";

export const metadata = { title: "Remarcar consulta | Prontuário Eletrônico" };

export default async function RemarcarPage({ params }: PageProps<"/agenda/[id]/remarcar">) {
  const user = await requirePermission("agenda:gerenciar");
  const { a, patient } = await loadAppointmentFor(user, (await params).id);
  if (!["agendado", "confirmado"].includes(a.status)) redirect(`/agenda/${a.id}`);

  const start = toClinic(a.startsAt);
  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/agenda/${a.id}`} className="text-sm font-semibold text-petrol/70 hover:text-petrol">
        ← Consulta
      </Link>
      <h1 className="mt-2 font-serif text-3xl text-petrol">Remarcar consulta</h1>
      <p className="mt-1 text-ink/70">Ao mudar data, horário ou médico, a consulta volta para “Agendado” e precisa ser confirmada de novo.</p>

      <div className="mt-8 rounded-lg border border-brand-gray/60 bg-white p-6 shadow-sm sm:p-8">
        <AppointmentForm
          appointmentId={a.id}
          doctors={doctorsFor(user)}
          canChooseDoctor={can(user.role, "agenda:todos-medicos")}
          minDate={todayIso()}
          cancelHref={`/agenda/${a.id}`}
          initial={{
            doctorId: String(a.doctorId),
            patientId: String(a.patientId),
            date: start.date,
            time: start.time,
            duration: String((a.endsAt.getTime() - a.startsAt.getTime()) / 60_000),
            type: a.type,
            note: a.note ?? "",
          }}
          initialPatientLabel={`${patient.socialName ?? patient.fullName} · nasc. ${formatDateBr(patient.birthDate)}`}
        />
      </div>
    </div>
  );
}
