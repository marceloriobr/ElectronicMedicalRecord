import Link from "next/link";
import { AppointmentActions, type StatusAction } from "@/components/appointment-actions";
import { AppointmentStatusBadge } from "@/components/appointment-status-badge";
import { FormMessage } from "@/components/form-field";
import { secondaryButtonClass } from "@/components/ui";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import {
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_TYPE_LABELS,
  DOCTOR_ONLY_STATUS,
  STATUS_TRANSITIONS,
  type AppointmentStatus,
} from "@/lib/appointment-constants";
import { getAppointmentEvents } from "@/lib/appointment-service";
import { ageFromBirthDate, formatDateBr, formatPhone } from "@/lib/br-docs";
import { longDate, nowMs, toClinic } from "@/lib/clinic-time";
import { can } from "@/lib/permissions";
import { loadAppointmentFor } from "./load-appointment";

export const metadata = { title: "Consulta | Prontuário Eletrônico" };

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

const ACTION_LABELS: Record<AppointmentStatus, string> = {
  agendado: "Agendar",
  confirmado: "Confirmar presença",
  em_atendimento: "Iniciar atendimento",
  atendido: "Finalizar atendimento",
  faltou: "Registrar falta",
  cancelado: "Cancelar consulta",
};

const OK_MESSAGES: Record<string, string> = {
  agendada: "Consulta agendada.",
  remarcada: "Consulta remarcada.",
  confirmado: "Presença confirmada.",
  em_atendimento: "Atendimento iniciado.",
  atendido: "Atendimento finalizado.",
  faltou: "Falta registrada.",
  cancelado: "Consulta cancelada.",
};

export default async function ConsultaPage({ params, searchParams }: PageProps<"/agenda/[id]">) {
  const user = await requirePermission("agenda:ler");
  const { a, patient, doctorName, createdByName, updatedByName } = await loadAppointmentFor(user, (await params).id);
  const { ok } = await searchParams;

  await audit({ userId: user.id, action: "ler", resource: "consulta", resourceId: a.id, patientId: patient.id });

  const start = toClinic(a.startsAt);
  const events = getAppointmentEvents(a.id);
  const started = a.startsAt.getTime() <= nowMs();

  // Ações permitidas: transição válida + perfil + regras (o servidor confere tudo de novo ao executar).
  const actions: StatusAction[] = can(user.role, "agenda:gerenciar")
    ? STATUS_TRANSITIONS[a.status]
        .filter((to) => !DOCTOR_ONLY_STATUS.includes(to) || (can(user.role, "agenda:atender") && user.id === a.doctorId))
        .filter((to) => to !== "faltou" || started)
        .map((to) => ({ to, label: ACTION_LABELS[to], primary: DOCTOR_ONLY_STATUS.includes(to) }))
    : [];
  const canReschedule = can(user.role, "agenda:gerenciar") && ["agendado", "confirmado"].includes(a.status);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {typeof ok === "string" && OK_MESSAGES[ok] && <FormMessage tone="success">{OK_MESSAGES[ok]}</FormMessage>}

      <div>
        <Link href={`/agenda?data=${start.date}&medico=${a.doctorId}`} className="text-sm font-semibold text-petrol/70 hover:text-petrol">
          ← Agenda do dia
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl text-petrol">
              <Link href={`/pacientes/${patient.id}`} className="hover:underline">
                {patient.socialName ?? patient.fullName}
              </Link>
            </h1>
            <p className="mt-1 text-ink/70">
              {longDate(start.date)}, {start.time}–{toClinic(a.endsAt).time}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <AppointmentStatusBadge status={a.status} />
              {a.overbooked && <span className="text-xs font-semibold text-amber-700">Encaixe</span>}
            </div>
          </div>
          {canReschedule && (
            <Link href={`/agenda/${a.id}/remarcar`} className={secondaryButtonClass}>
              Remarcar
            </Link>
          )}
        </div>
      </div>

      {actions.length > 0 && <AppointmentActions appointmentId={a.id} actions={actions} />}

      {a.status === "cancelado" && a.cancelReason && <FormMessage tone="error">Motivo do cancelamento: {a.cancelReason}</FormMessage>}

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-lg border border-brand-gray/60 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-serif text-lg text-petrol">Consulta</h2>
          <dl className="space-y-2 text-sm">
            <Item label="Médico(a)" value={doctorName} />
            <Item label="Tipo" value={APPOINTMENT_TYPE_LABELS[a.type]} />
            <Item label="Observação" value={a.note} />
            <Item label="Agendada em" value={`${dateTime.format(a.createdAt)} por ${createdByName ?? "—"}`} />
            <Item label="Última alteração" value={`${dateTime.format(a.updatedAt)} por ${updatedByName ?? "—"}`} />
          </dl>
        </section>

        <section className="rounded-lg border border-brand-gray/60 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-serif text-lg text-petrol">Paciente</h2>
          <dl className="space-y-2 text-sm">
            <Item label="Nascimento" value={`${formatDateBr(patient.birthDate)} (${ageFromBirthDate(patient.birthDate)} anos)`} />
            <Item label="Telefone" value={formatPhone(patient.phone)} />
          </dl>
          <Link href={`/pacientes/${patient.id}`} className="mt-3 inline-block text-sm font-semibold text-petrol hover:underline">
            Abrir ficha do paciente →
          </Link>
        </section>
      </div>

      <section className="rounded-lg border border-brand-gray/60 bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-serif text-lg text-petrol">Histórico</h2>
        <ul className="space-y-1 text-sm text-ink/80" data-testid="appointment-history">
          {events.map(({ e, userName, fromDoctorName, toDoctorName }) => (
            <li key={e.id}>
              <span className="text-ink/60">{dateTime.format(e.at)}</span> · {userName ?? "—"} ·{" "}
              {e.event === "agendada" && "agendou a consulta"}
              {e.event === "remarcada" &&
                `remarcou de ${e.fromStartsAt ? dateTime.format(e.fromStartsAt) : "—"} para ${e.toStartsAt ? dateTime.format(e.toStartsAt) : "—"}` +
                  (e.fromDoctorId !== e.toDoctorId ? ` (de ${fromDoctorName ?? "—"} para ${toDoctorName ?? "—"})` : "")}
              {e.event === "status" &&
                `mudou de “${e.fromStatus ? APPOINTMENT_STATUS_LABELS[e.fromStatus] : "—"}” para “${e.toStatus ? APPOINTMENT_STATUS_LABELS[e.toStatus] : "—"}”`}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-3">
      <dt className="text-ink/70">{label}</dt>
      <dd className={value ? "text-ink" : "text-ink/40"}>{value || "—"}</dd>
    </div>
  );
}
