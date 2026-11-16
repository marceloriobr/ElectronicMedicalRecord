import "server-only";
/**
 * Disponibilidade dos médicos e previsão de agenda.
 *
 * Capacidade = horários gerados pela grade semanal do médico (dias, faixas e duração da consulta).
 * Ocupado   = horário da grade que se sobrepõe a uma consulta que ocupa horário (agendado, confirmado…).
 * Livre     = capacidade − ocupado, a partir de agora (nunca horário passado). Feriados não são descontados.
 *
 * Autorização por PERFIL nas páginas/actions; por REGISTRO aqui (médico só a própria grade e só dá alta
 * a paciente que atendeu).
 */
import { and, asc, eq, gt, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { appointments, doctorAvailability, doctorSchedules, patientDischarges, patients } from "@/db/schema";
import { BLOCKING_STATUS, type AppointmentType } from "./appointment-constants";
import {
  CLINIC_CLOSE,
  CLINIC_OPEN,
  FOLLOW_UP_MONTHS,
  MAX_WINDOWS_PER_DAY,
  SLOT_MINUTES,
  type DischargeReason,
  type ForecastHorizon,
} from "./availability-constants";
import { todayIso } from "./br-docs";
import { addDays, addMinutes, clinicDateTime, toClinic } from "./clinic-time";

export class ForecastError extends Error {
  constructor(
    message: string,
    public field?: string,
    public code?: "forbidden" | "not_found",
  ) {
    super(message);
  }
}

export type Window = { weekday: number; start: string; end: string };
/** Valores da consulta particular em centavos, por tipo de consulta. */
export type Prices = Record<AppointmentType, number>;
export type Schedule = { slotMinutes: number; prices: Prices; windows: Window[]; updatedAt: Date };

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

// ---------------------------------------------------------------------------
// Grade semanal
// ---------------------------------------------------------------------------

export function getSchedule(doctorId: number): Schedule | null {
  const s = db.select().from(doctorSchedules).where(eq(doctorSchedules.doctorId, doctorId)).get();
  if (!s) return null;
  const windows = db
    .select({ weekday: doctorAvailability.weekday, start: doctorAvailability.startTime, end: doctorAvailability.endTime })
    .from(doctorAvailability)
    .where(eq(doctorAvailability.doctorId, doctorId))
    .orderBy(asc(doctorAvailability.weekday), asc(doctorAvailability.startTime))
    .all();
  const prices = { primeira_consulta: s.priceFirstCents, consulta: s.priceCents, retorno: s.priceReturnCents };
  return { slotMinutes: s.slotMinutes, prices, windows, updatedAt: s.updatedAt };
}

/** Confere faixas: dentro do expediente, fim > início, cabe ao menos 1 consulta, sem sobreposição no mesmo dia. */
export function validateWindows(slotMinutes: number, windows: Window[]): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!(SLOT_MINUTES as readonly number[]).includes(slotMinutes)) errors.slotMinutes = "Selecione a duração da consulta.";
  for (let wd = 0; wd <= 6; wd++) {
    const day = windows.map((w, i) => ({ ...w, i })).filter((w) => w.weekday === wd);
    if (day.length > MAX_WINDOWS_PER_DAY) errors[`day.${wd}`] = `No máximo ${MAX_WINDOWS_PER_DAY} faixas por dia.`;
    for (const w of day) {
      const key = `day.${wd}`;
      if (w.start < CLINIC_OPEN || w.end > CLINIC_CLOSE) errors[key] = `Use horários entre ${CLINIC_OPEN} e ${CLINIC_CLOSE}.`;
      else if (w.end <= w.start) errors[key] = "O fim deve ser depois do início.";
      else if (toMin(w.end) - toMin(w.start) < slotMinutes) errors[key] = `A faixa precisa comportar ao menos uma consulta de ${slotMinutes} min.`;
    }
    const sorted = [...day].sort((a, b) => a.start.localeCompare(b.start));
    for (let k = 1; k < sorted.length; k++) {
      if (sorted[k].start < sorted[k - 1].end) errors[`day.${wd}`] = "As faixas do mesmo dia não podem se sobrepor.";
    }
  }
  return errors;
}

/** Substitui a grade do médico (configuração administrativa, sem dado de paciente). */
export function saveSchedule(doctorId: number, input: { slotMinutes: number; prices: Prices; windows: Window[] }, actorId: number) {
  if (doctorId !== actorId) throw new ForecastError("Você só pode configurar a sua própria disponibilidade.", undefined, "forbidden");
  const errors = validateWindows(input.slotMinutes, input.windows);
  if (Object.keys(errors).length) throw Object.assign(new ForecastError("Corrija os horários destacados."), { fieldErrors: errors });

  db.transaction((tx) => {
    const now = new Date();
    const values = {
      slotMinutes: input.slotMinutes,
      priceFirstCents: input.prices.primeira_consulta,
      priceCents: input.prices.consulta,
      priceReturnCents: input.prices.retorno,
      updatedAt: now,
      updatedBy: actorId,
    };
    tx.insert(doctorSchedules)
      .values({ doctorId, ...values })
      .onConflictDoUpdate({ target: doctorSchedules.doctorId, set: values })
      .run();
    tx.delete(doctorAvailability).where(eq(doctorAvailability.doctorId, doctorId)).run();
    for (const w of input.windows) {
      tx.insert(doctorAvailability).values({ doctorId, weekday: w.weekday, startTime: w.start, endTime: w.end }).run();
    }
  });
}

// ---------------------------------------------------------------------------
// Previsão
// ---------------------------------------------------------------------------

/** "2026-11-16" + n meses (dia limitado ao fim do mês). */
export function addMonths(date: string, n: number) {
  const [y, m, d] = date.split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + n, Math.min(d, last))).toISOString().slice(0, 10);
}
const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
/** Segunda-feira da semana da data. */
const weekStart = (date: string) => addDays(date, -((weekdayOf(date) + 6) % 7));

export type Forecast = {
  from: string;
  to: string; // exclusivo
  slotMinutes: number;
  capacity: number;
  booked: number;
  free: number;
  /** Consultas marcadas fora da grade (encaixes ou fora dos dias/horários configurados). */
  outsideGrid: number;
  weeks: { start: string; booked: number; free: number }[];
  byWeekday: { weekday: number; free: number; capacity: number }[];
  byPeriod: { period: "manha" | "tarde" | "noite"; free: number }[];
  /** Dias com horários livres, em ordem cronológica. */
  days: { date: string; free: string[]; capacity: number }[];
  /**
   * Visão financeira (valores de consulta PARTICULAR configurados pelo médico; convênios não são diferenciados):
   * agendada = consultas marcadas no período (pelo tipo de cada uma); potencial = horários livres × valor da consulta.
   */
  finance: {
    prices: Prices;
    scheduledCents: number;
    potentialCents: number;
    months: { month: string; scheduledCents: number; potentialCents: number }[];
  };
};

export function forecast(doctorId: number, months: ForecastHorizon, nowMs = Date.now()): Forecast | null {
  const schedule = getSchedule(doctorId);
  if (!schedule || schedule.windows.length === 0) return null;

  const from = todayIso(new Date(nowMs));
  const to = addMonths(from, months);
  const rangeStart = clinicDateTime(from, "00:00");
  const rangeEnd = clinicDateTime(to, "00:00");

  const appts = db
    .select({ startsAt: appointments.startsAt, endsAt: appointments.endsAt, type: appointments.type })
    .from(appointments)
    .where(
      and(
        eq(appointments.doctorId, doctorId),
        inArray(appointments.status, [...BLOCKING_STATUS]),
        lt(appointments.startsAt, rangeEnd),
        gt(appointments.endsAt, rangeStart),
      ),
    )
    .orderBy(asc(appointments.startsAt))
    .all()
    .map((a) => ({ s: a.startsAt.getTime(), e: a.endsAt.getTime(), type: a.type, inGrid: false }));

  const slotMs = schedule.slotMinutes * 60_000;
  const weeks = new Map<string, { booked: number; free: number }>();
  const byWeekday = new Map<number, { free: number; capacity: number }>();
  const byPeriod = { manha: 0, tarde: 0, noite: 0 };
  const days: Forecast["days"] = [];
  let capacity = 0;
  let booked = 0;
  // Meses do período (AAAA-MM), na ordem, para o gráfico financeiro.
  const money = new Map<string, { scheduledCents: number; potentialCents: number }>();
  const lastMonth = addDays(to, -1).slice(0, 7); // `to` é exclusivo
  for (let m = from.slice(0, 7); m <= lastMonth; m = addMonths(`${m}-01`, 1).slice(0, 7)) {
    money.set(m, { scheduledCents: 0, potentialCents: 0 });
  }

  for (let date = from; date < to; date = addDays(date, 1)) {
    const wd = weekdayOf(date);
    const windows = schedule.windows.filter((w) => w.weekday === wd);
    if (!windows.length) continue;
    const day = { date, free: [] as string[], capacity: 0 };
    const wk = weekStart(date);
    if (!weeks.has(wk)) weeks.set(wk, { booked: 0, free: 0 });
    const wkAgg = weeks.get(wk)!;
    const wdAgg = byWeekday.get(wd) ?? { free: 0, capacity: 0 };

    for (const w of windows) {
      for (let t = w.start; toMin(t) + schedule.slotMinutes <= toMin(w.end); t = addMinutes(t, schedule.slotMinutes)) {
        const s = clinicDateTime(date, t).getTime();
        if (s <= nowMs) continue; // passado não é oportunidade
        const e = s + slotMs;
        capacity++;
        day.capacity++;
        wdAgg.capacity++;
        let busy = false;
        for (const a of appts) {
          if (a.s >= e) break;
          if (a.e > s) {
            busy = true;
            a.inGrid = true;
          }
        }
        if (busy) {
          booked++;
          wkAgg.booked++;
        } else {
          wkAgg.free++;
          wdAgg.free++;
          money.get(date.slice(0, 7))!.potentialCents += schedule.prices.consulta;
          day.free.push(t);
          byPeriod[t < "12:00" ? "manha" : t < "18:00" ? "tarde" : "noite"]++;
        }
      }
    }
    byWeekday.set(wd, wdAgg);
    if (day.capacity) days.push(day);
  }

  // Receita agendada: toda consulta marcada no período (inclusive fora da grade/encaixe) ainda não passada,
  // mais as de hoje já iniciadas/atendidas.
  for (const a of appts) {
    const m = money.get(toClinic(new Date(a.s)).date.slice(0, 7));
    if (m && a.s >= rangeStart.getTime()) m.scheduledCents += schedule.prices[a.type];
  }
  const months_ = [...money].map(([month, v]) => ({ month, ...v }));

  return {
    from,
    to,
    slotMinutes: schedule.slotMinutes,
    capacity,
    booked,
    free: capacity - booked,
    outsideGrid: appts.filter((a) => !a.inGrid && a.s > nowMs).length,
    weeks: [...weeks].map(([start, v]) => ({ start, ...v })),
    byWeekday: [1, 2, 3, 4, 5, 6, 0].filter((wd) => byWeekday.has(wd)).map((wd) => ({ weekday: wd, ...byWeekday.get(wd)! })),
    byPeriod: (["manha", "tarde", "noite"] as const).map((period) => ({ period, free: byPeriod[period] })),
    days: days.filter((d) => d.free.length > 0),
    finance: {
      prices: schedule.prices,
      scheduledCents: months_.reduce((n, m) => n + m.scheduledCents, 0),
      potentialCents: months_.reduce((n, m) => n + m.potentialCents, 0),
      months: months_,
    },
  };
}

/** Resumo financeiro dos próximos meses para vários médicos (painel). Médicos sem grade são ignorados. */
export function financeSummary(doctorIds: number[], months: ForecastHorizon = 3) {
  const rows = doctorIds
    .map((id) => ({ id, f: forecast(id, months) }))
    .filter((r): r is { id: number; f: Forecast } => r.f !== null);
  return {
    configured: rows.length,
    scheduledCents: rows.reduce((n, r) => n + r.f.finance.scheduledCents, 0),
    potentialCents: rows.reduce((n, r) => n + r.f.finance.potentialCents, 0),
    free: rows.reduce((n, r) => n + r.f.free, 0),
    pricesMissing: rows.some((r) => r.f.finance.prices.consulta === 0),
  };
}

// ---------------------------------------------------------------------------
// Pacientes em acompanhamento sem retorno marcado
// ---------------------------------------------------------------------------

export type FollowUpPatient = {
  id: number;
  name: string;
  birthDate: string;
  phone: string;
  firstVisit: Date;
  lastVisit: Date;
  visits: number;
};

/**
 * Pacientes do médico em acompanhamento há mais de 6 meses (1ª consulta atendida há mais de 6 meses),
 * sem alta posterior à última consulta atendida e sem nenhuma consulta futura marcada (com qualquer médico).
 */
export function overdueFollowUps(doctorId: number, nowMs = Date.now()): FollowUpPatient[] {
  const cutoff = clinicDateTime(addMonths(todayIso(new Date(nowMs)), -FOLLOW_UP_MONTHS), "00:00").getTime();

  const visits = db
    .select({ patientId: appointments.patientId, startsAt: appointments.startsAt })
    .from(appointments)
    .where(and(eq(appointments.doctorId, doctorId), eq(appointments.status, "atendido")))
    .all();
  const byPatient = new Map<number, { first: number; last: number; n: number }>();
  for (const v of visits) {
    const t = v.startsAt.getTime();
    const cur = byPatient.get(v.patientId) ?? { first: t, last: t, n: 0 };
    cur.first = Math.min(cur.first, t);
    cur.last = Math.max(cur.last, t);
    cur.n++;
    byPatient.set(v.patientId, cur);
  }
  const candidates = [...byPatient].filter(([, v]) => v.first < cutoff).map(([id]) => id);
  if (!candidates.length) return [];

  const scheduled = new Set(
    db
      .select({ patientId: appointments.patientId })
      .from(appointments)
      .where(
        and(
          inArray(appointments.patientId, candidates),
          inArray(appointments.status, ["agendado", "confirmado", "em_atendimento"]),
          gte(appointments.startsAt, new Date(nowMs)),
        ),
      )
      .all()
      .map((r) => r.patientId),
  );
  const lastDischarge = new Map<number, number>();
  for (const d of db
    .select({ patientId: patientDischarges.patientId, at: patientDischarges.at })
    .from(patientDischarges)
    .where(and(eq(patientDischarges.doctorId, doctorId), inArray(patientDischarges.patientId, candidates)))
    .all()) {
    lastDischarge.set(d.patientId, Math.max(lastDischarge.get(d.patientId) ?? 0, d.at.getTime()));
  }

  const rows = db
    .select({ id: patients.id, fullName: patients.fullName, socialName: patients.socialName, birthDate: patients.birthDate, phone: patients.phone, active: patients.active })
    .from(patients)
    .where(inArray(patients.id, candidates))
    .all();

  return rows
    .filter((p) => p.active && !scheduled.has(p.id))
    .filter((p) => (lastDischarge.get(p.id) ?? 0) < byPatient.get(p.id)!.last)
    .map((p) => {
      const v = byPatient.get(p.id)!;
      return {
        id: p.id,
        name: p.socialName ?? p.fullName,
        birthDate: p.birthDate,
        phone: p.phone,
        firstVisit: new Date(v.first),
        lastVisit: new Date(v.last),
        visits: v.n,
      };
    })
    .sort((a, b) => a.lastVisit.getTime() - b.lastVisit.getTime()); // há mais tempo sem consulta primeiro
}

/** Registra a alta do acompanhamento: só pelo médico e só para paciente que ele atendeu. */
export function dischargePatient(patientId: number, doctorId: number, reason: DischargeReason, actorId: number) {
  if (doctorId !== actorId) throw new ForecastError("Somente o próprio médico registra a alta.", undefined, "forbidden");
  const attended = db
    .select({ id: appointments.id })
    .from(appointments)
    .where(and(eq(appointments.patientId, patientId), eq(appointments.doctorId, doctorId), eq(appointments.status, "atendido")))
    .get();
  if (!attended) throw new ForecastError("Paciente sem atendimento com este médico.", undefined, "forbidden");
  return db
    .insert(patientDischarges)
    .values({ patientId, doctorId, reason, recordedBy: actorId, at: new Date() })
    .returning({ id: patientDischarges.id })
    .get().id;
}
