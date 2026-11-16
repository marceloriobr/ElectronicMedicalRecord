import Link from "next/link";
import { AppointmentForm } from "@/components/appointment-form";
import { FormMessage } from "@/components/form-field";
import { requirePermission } from "@/lib/auth";
import { APPOINTMENT_DURATIONS, DEFAULT_DURATION } from "@/lib/appointment-constants";
import { doctorsFor } from "@/lib/appointment-service";
import { formatDateBr, todayIso } from "@/lib/br-docs";
import { isIsoDate, isTime } from "@/lib/clinic-time";
import { getSchedule } from "@/lib/forecast-service";
import { can } from "@/lib/permissions";
import { getPatient } from "@/lib/patient-service";

export const metadata = { title: "Agendar consulta | Prontuário Eletrônico" };

export default async function NovaConsultaPage({ searchParams }: PageProps<"/agenda/nova">) {
  const user = await requirePermission("agenda:gerenciar");
  const sp = await searchParams;
  const today = todayIso();
  const doctors = doctorsFor(user);

  const requested = doctors.find((d) => d.id === Number(sp.medico));
  const doctorId = requested?.id ?? doctors.find((d) => d.id === user.id)?.id ?? (doctors.length === 1 ? doctors[0].id : undefined);
  const date = isIsoDate(sp.data) && sp.data >= today ? sp.data : today;

  // Atalho a partir da ficha do paciente (?paciente=<id interno>).
  const pid = Number(sp.paciente);
  const patient = Number.isInteger(pid) && pid > 0 ? getPatient(pid) : undefined;
  const preselected = patient?.active ? patient : undefined;

  // Duração: ?duracao= (vinda da previsão) ou a duração configurada pelo médico; senão, o padrão.
  const requestedDuration = Number(sp.duracao);
  const duration = (APPOINTMENT_DURATIONS as readonly number[]).includes(requestedDuration)
    ? requestedDuration
    : ((doctorId && getSchedule(doctorId)?.slotMinutes) || DEFAULT_DURATION);

  const back = `/agenda?data=${date}${doctorId ? `&medico=${doctorId}` : ""}`;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={back} className="text-sm font-semibold text-petrol/70 hover:text-petrol">
        ← Agenda
      </Link>
      <h1 className="mt-2 font-serif text-3xl text-petrol">Agendar consulta</h1>

      <div className="mt-8 rounded-lg border border-brand-gray/60 bg-white p-6 shadow-sm sm:p-8">
        {doctors.length === 0 ? (
          <FormMessage tone="error">Nenhum médico ativo cadastrado.</FormMessage>
        ) : (
          <AppointmentForm
            doctors={doctors}
            canChooseDoctor={can(user.role, "agenda:todos-medicos")}
            minDate={today}
            cancelHref={back}
            initial={{
              doctorId: doctorId ? String(doctorId) : "",
              date,
              time: isTime(sp.hora) ? sp.hora : "",
              duration: String(duration),
              type: "consulta",
              patientId: preselected ? String(preselected.id) : "",
            }}
            initialPatientLabel={
              preselected ? `${preselected.socialName ?? preselected.fullName} · nasc. ${formatDateBr(preselected.birthDate)}` : undefined
            }
          />
        )}
      </div>
    </div>
  );
}
