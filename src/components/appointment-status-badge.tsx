import { APPOINTMENT_STATUS_LABELS, type AppointmentStatus } from "@/lib/appointment-constants";

const TONES: Record<AppointmentStatus, string> = {
  agendado: "bg-sky-50 text-sky-800 ring-sky-600/20",
  confirmado: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  em_atendimento: "bg-amber-50 text-amber-800 ring-amber-600/30",
  atendido: "bg-petrol/10 text-petrol ring-petrol/20",
  faltou: "bg-coral/10 text-coral-dark ring-coral/30",
  cancelado: "bg-gray-50 text-gray-500 ring-gray-400/20 line-through",
};

export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${TONES[status]}`}>
      {APPOINTMENT_STATUS_LABELS[status]}
    </span>
  );
}
