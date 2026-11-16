import Link from "next/link";
import { AppointmentStatusBadge } from "@/components/appointment-status-badge";
import { FormMessage } from "@/components/form-field";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import {
  APPOINTMENT_STATUS,
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_TYPE_LABELS,
  BLOCKING_STATUS,
  DAY_VIEW_END,
  DAY_VIEW_SLOT_MIN,
  DAY_VIEW_START,
} from "@/lib/appointment-constants";
import { doctorsFor, listDoctorDay } from "@/lib/appointment-service";
import { ageFromBirthDate, maskPhone, todayIso } from "@/lib/br-docs";
import { addDays, addMinutes, clinicDateTime, isIsoDate, longDate, nowMs, toClinic } from "@/lib/clinic-time";
import { can } from "@/lib/permissions";

export const metadata = { title: "Agenda | Prontuário Eletrônico" };

type Row =
  | { kind: "appointment"; time: string; item: ReturnType<typeof listDoctorDay>[number] }
  | { kind: "free"; time: string; bookable: boolean };

export default async function AgendaPage({ searchParams }: PageProps<"/agenda">) {
  const user = await requirePermission("agenda:ler");
  const sp = await searchParams;
  const today = todayIso();
  const date = isIsoDate(sp.data) ? sp.data : today;

  const doctors = doctorsFor(user);
  if (!doctors.length) {
    return (
      <div className="space-y-4">
        <h1 className="font-serif text-3xl text-petrol">Agenda</h1>
        <FormMessage tone="error">Nenhum médico ativo cadastrado. Peça ao administrador para cadastrar um médico.</FormMessage>
      </div>
    );
  }

  const requested = Number(sp.medico);
  const allowed = doctors.find((d) => d.id === requested);
  if (sp.medico && !allowed) {
    // Ex.: médico tentando abrir a agenda de outro médico pela URL.
    await audit({ userId: user.id, action: "acesso_negado", resource: "agenda", resourceId: String(sp.medico).slice(0, 20) });
  }
  const doctor = allowed ?? doctors.find((d) => d.id === user.id) ?? doctors[0];
  const canChooseDoctor = can(user.role, "agenda:todos-medicos");
  const canManage = can(user.role, "agenda:gerenciar");

  const items = listDoctorDay(doctor.id, date);
  await audit({ userId: user.id, action: "ler", resource: "agenda", resourceId: doctor.id, details: { data: date, consultas: items.length } });

  // Horários livres: intervalos da grade sem consulta que ocupe o horário.
  const now = nowMs();
  const busy = items.filter((i) => (BLOCKING_STATUS as readonly string[]).includes(i.status));
  const rows: Row[] = items.map((item) => ({ kind: "appointment", time: toClinic(item.startsAt).time, item }));
  for (let t = DAY_VIEW_START; t < DAY_VIEW_END; t = addMinutes(t, DAY_VIEW_SLOT_MIN)) {
    const start = clinicDateTime(date, t).getTime();
    const end = start + DAY_VIEW_SLOT_MIN * 60_000;
    if (!busy.some((b) => b.startsAt.getTime() < end && b.endsAt.getTime() > start)) {
      rows.push({ kind: "free", time: t, bookable: canManage && start > now });
    }
  }
  rows.sort((a, b) => a.time.localeCompare(b.time) || (a.kind === "free" ? 1 : -1));

  const counts = APPOINTMENT_STATUS.map((s) => [s, items.filter((i) => i.status === s).length] as const).filter(([, n]) => n > 0);
  const q = (d: string) => `/agenda?data=${d}&medico=${doctor.id}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl text-petrol">Agenda</h1>
          <p className="mt-1 text-ink/70" data-testid="agenda-date">
            {longDate(date)}
            {date === today && <span className="ml-2 text-coral-dark">(hoje)</span>}
          </p>
          <p className="text-sm text-ink/70" data-testid="agenda-doctor">
            {doctor.name}
            {doctor.crm && ` · CRM ${doctor.crm}/${doctor.crmUf}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {can(user.role, "agenda:previsao") && (
            <Link href={`/agenda/previsao?medico=${doctor.id}`} className={secondaryButtonClass}>
              Previsão e oportunidades
            </Link>
          )}
          {canManage && (
            <Link href={`/agenda/nova?medico=${doctor.id}&data=${date}`} className={primaryButtonClass}>
              + Agendar consulta
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-brand-gray/60 bg-white p-4 shadow-sm">
        <nav className="flex gap-2" aria-label="Navegar entre dias">
          <Link href={q(addDays(date, -1))} className={secondaryButtonClass} aria-label="Dia anterior">
            ←
          </Link>
          <Link href={q(today)} className={secondaryButtonClass}>
            Hoje
          </Link>
          <Link href={q(addDays(date, 1))} className={secondaryButtonClass} aria-label="Próximo dia">
            →
          </Link>
        </nav>
        <form action="/agenda" className="flex flex-1 flex-wrap items-end gap-3">
          <label className="text-sm font-semibold text-petrol">
            Data
            <input type="date" name="data" defaultValue={date} className={inputClass} />
          </label>
          {canChooseDoctor ? (
            <label className="min-w-48 flex-1 text-sm font-semibold text-petrol">
              Médico(a)
              <select name="medico" defaultValue={doctor.id} className={inputClass}>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <input type="hidden" name="medico" value={doctor.id} />
          )}
          <button type="submit" className={secondaryButtonClass}>
            Ver agenda
          </button>
        </form>
      </div>

      {counts.length > 0 && (
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink/70">
          {counts.map(([s, n]) => (
            <span key={s}>
              {APPOINTMENT_STATUS_LABELS[s]}: <strong className="text-ink">{n}</strong>
            </span>
          ))}
        </p>
      )}

      <ol className="divide-y divide-brand-gray/40 overflow-hidden rounded-lg border border-brand-gray/60 bg-white shadow-sm">
        {rows.map((r) =>
          r.kind === "free" ? (
            <li key={`free-${r.time}`} className="flex items-center gap-4 px-4 py-2 text-sm text-ink/50">
              <span className="w-24 font-mono">{r.time}</span>
              {r.bookable ? (
                <Link href={`/agenda/nova?medico=${doctor.id}&data=${date}&hora=${r.time}`} className="font-semibold text-petrol/80 hover:text-petrol hover:underline">
                  Livre · agendar
                </Link>
              ) : (
                <span>Livre</span>
              )}
            </li>
          ) : (
            <li key={r.item.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 ${r.item.status === "cancelado" ? "opacity-60" : ""}`}>
              <span className="w-24 font-mono text-sm text-ink">
                {r.time}–{toClinic(r.item.endsAt).time}
              </span>
              <span className="min-w-48 flex-1">
                <Link href={`/agenda/${r.item.id}`} className="font-semibold text-petrol hover:underline">
                  {r.item.socialName ?? r.item.fullName}
                </Link>
                <span className="block text-xs text-ink/60">
                  {ageFromBirthDate(r.item.birthDate)} anos · {APPOINTMENT_TYPE_LABELS[r.item.type]} · {maskPhone(r.item.phone)}
                  {r.item.note && ` · ${r.item.note}`}
                </span>
              </span>
              {r.item.overbooked && <span className="text-xs font-semibold text-amber-700">Encaixe</span>}
              <AppointmentStatusBadge status={r.item.status} />
            </li>
          ),
        )}
      </ol>
    </div>
  );
}
