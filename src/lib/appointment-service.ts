import "server-only";
/**
 * Regras de negócio da agenda de consultas.
 * Autorização por perfil fica nas actions (requirePermission); aqui ficam as regras de dados e
 * a autorização por REGISTRO (médico só acessa a própria agenda; ato médico só pelo médico da consulta).
 */
import { and, asc, desc, eq, gt, gte, inArray, lt, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db } from "@/db";
import { appointmentEvents, appointments, patients, users, type Appointment, type UserRole } from "@/db/schema";
import {
  BLOCKING_STATUS,
  CLINIC_CLOSE,
  CLINIC_OPEN,
  DOCTOR_ONLY_STATUS,
  STATUS_TRANSITIONS,
  type AppointmentStatus,
  type AppointmentType,
} from "./appointment-constants";
import { addMinutes, clinicDateTime, clinicDayRange, toClinic } from "./clinic-time";
import { formatDateBr } from "./br-docs";
import { can } from "./permissions";

export class AppointmentError extends Error {
  constructor(
    message: string,
    public field?: string,
    public code?: "doctor_conflict" | "not_found" | "forbidden",
  ) {
    super(message);
  }
}

export type Actor = { id: number; role: UserRole };

export type AppointmentInput = {
  doctorId: number;
  patientId: number;
  date: string;
  time: string;
  duration: number;
  type: AppointmentType;
  note: string | null;
  allowOverlap: boolean;
};

// ---------------------------------------------------------------------------
// Médicos e controle de acesso por registro
// ---------------------------------------------------------------------------

export function listDoctors() {
  return db
    .select({ id: users.id, name: users.name, crm: users.crm, crmUf: users.crmUf })
    .from(users)
    .where(and(eq(users.role, "medico"), eq(users.active, true)))
    .orderBy(asc(users.name))
    .all();
}

function getActiveDoctor(id: number) {
  return db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.id, id), eq(users.role, "medico"), eq(users.active, true)))
    .get();
}

/** Médicos cuja agenda o usuário pode ver/gerenciar. */
export function doctorsFor(actor: Actor) {
  const all = listDoctors();
  return can(actor.role, "agenda:todos-medicos") ? all : all.filter((d) => d.id === actor.id);
}

/** Secretária: qualquer médico. Médico: somente a própria agenda. */
export function canManageDoctor(actor: Actor, doctorId: number) {
  return can(actor.role, "agenda:todos-medicos") || doctorId === actor.id;
}

export function assertCanManageDoctor(actor: Actor, doctorId: number) {
  if (!canManageDoctor(actor, doctorId)) {
    throw new AppointmentError("Você só pode gerenciar a sua própria agenda.", "doctorId", "forbidden");
  }
}

// ---------------------------------------------------------------------------
// Validação de horário e conflitos
// ---------------------------------------------------------------------------

const timeFmt = (d: Date) => {
  const c = toClinic(d);
  return `${formatDateBr(c.date)} às ${c.time}`;
};

function overlapping(where: ReturnType<typeof eq>, startsAt: Date, endsAt: Date, excludeId?: number) {
  return db
    .select({ id: appointments.id, startsAt: appointments.startsAt, doctorId: appointments.doctorId })
    .from(appointments)
    .where(
      and(
        where,
        inArray(appointments.status, [...BLOCKING_STATUS]),
        lt(appointments.startsAt, endsAt),
        gt(appointments.endsAt, startsAt),
        excludeId ? ne(appointments.id, excludeId) : undefined,
      ),
    )
    .get();
}

function validateSlot(input: AppointmentInput, excludeId?: number) {
  if (!getActiveDoctor(input.doctorId)) throw new AppointmentError("Selecione um médico ativo.", "doctorId");

  const patient = db.select({ active: patients.active }).from(patients).where(eq(patients.id, input.patientId)).get();
  if (!patient) throw new AppointmentError("Selecione o paciente.", "patientId");
  if (!patient.active) throw new AppointmentError("Paciente inativo: reative o cadastro antes de agendar.", "patientId");

  const endTime = addMinutes(input.time, input.duration);
  if (input.time < CLINIC_OPEN || endTime > CLINIC_CLOSE) {
    throw new AppointmentError(`A consulta deve ocorrer entre ${CLINIC_OPEN} e ${CLINIC_CLOSE}.`, "time");
  }

  const startsAt = clinicDateTime(input.date, input.time);
  const endsAt = new Date(startsAt.getTime() + input.duration * 60_000);
  if (startsAt.getTime() <= Date.now()) {
    throw new AppointmentError("Não é possível agendar em data/horário que já passou.", "date");
  }

  const patientBusy = overlapping(eq(appointments.patientId, input.patientId), startsAt, endsAt, excludeId);
  if (patientBusy) {
    throw new AppointmentError(`O paciente já tem consulta marcada em ${timeFmt(patientBusy.startsAt)}.`, "time");
  }

  const doctorBusy = overlapping(eq(appointments.doctorId, input.doctorId), startsAt, endsAt, excludeId);
  if (doctorBusy && !input.allowOverlap) {
    throw new AppointmentError(
      `Horário ocupado: o médico já tem consulta em ${timeFmt(doctorBusy.startsAt)}. ` +
        "Para marcar mesmo assim, confirme o encaixe.",
      "allowOverlap",
      "doctor_conflict",
    );
  }
  return { startsAt, endsAt, overbooked: !!doctorBusy };
}

// ---------------------------------------------------------------------------
// Comandos
// ---------------------------------------------------------------------------

export function createAppointment(input: AppointmentInput, actor: Actor) {
  assertCanManageDoctor(actor, input.doctorId);
  return db.transaction((tx) => {
    // better-sqlite3 é síncrono: validar dentro da transação evita dois agendamentos simultâneos no mesmo horário.
    const slot = validateSlot(input);
    const now = new Date();
    const { id } = tx
      .insert(appointments)
      .values({
        doctorId: input.doctorId,
        patientId: input.patientId,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        type: input.type,
        note: input.note,
        overbooked: slot.overbooked,
        createdAt: now,
        createdBy: actor.id,
        updatedAt: now,
        updatedBy: actor.id,
      })
      .returning({ id: appointments.id })
      .get();
    tx.insert(appointmentEvents)
      .values({ appointmentId: id, at: now, userId: actor.id, event: "agendada", toStatus: "agendado", toStartsAt: slot.startsAt, toDoctorId: input.doctorId })
      .run();
    return id;
  });
}

/** Remarca (data, hora, duração, médico, tipo, observação). Volta o status para "agendado". */
export function rescheduleAppointment(id: number, input: AppointmentInput, actor: Actor) {
  const current = getAppointment(id);
  if (!current) throw new AppointmentError("Consulta não encontrada.", undefined, "not_found");
  assertCanManageDoctor(actor, current.doctorId);
  assertCanManageDoctor(actor, input.doctorId);
  if (!["agendado", "confirmado"].includes(current.status)) {
    throw new AppointmentError("Só é possível remarcar consultas agendadas ou confirmadas.");
  }
  if (input.patientId !== current.patientId) throw new AppointmentError("O paciente da consulta não pode ser trocado.", "patientId");

  return db.transaction((tx) => {
    const slot = validateSlot(input, id);
    const moved = slot.startsAt.getTime() !== current.startsAt.getTime() || input.doctorId !== current.doctorId;
    const resized = slot.endsAt.getTime() !== current.endsAt.getTime();
    const now = new Date();
    tx.update(appointments)
      .set({
        doctorId: input.doctorId,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        type: input.type,
        note: input.note,
        overbooked: slot.overbooked,
        // Mudou o horário/médico: precisa confirmar de novo com o paciente.
        status: moved ? "agendado" : current.status,
        updatedAt: now,
        updatedBy: actor.id,
      })
      .where(eq(appointments.id, id))
      .run();
    if (moved || resized) {
      tx.insert(appointmentEvents)
        .values({
          appointmentId: id,
          at: now,
          userId: actor.id,
          event: "remarcada",
          fromStatus: current.status,
          toStatus: moved ? "agendado" : current.status,
          fromStartsAt: current.startsAt,
          toStartsAt: slot.startsAt,
          fromDoctorId: current.doctorId,
          toDoctorId: input.doctorId,
        })
        .run();
    }
    return { moved, resized };
  });
}

export function changeAppointmentStatus(id: number, to: AppointmentStatus, actor: Actor, reason?: string) {
  const current = getAppointment(id);
  if (!current) throw new AppointmentError("Consulta não encontrada.", undefined, "not_found");
  assertCanManageDoctor(actor, current.doctorId);

  if (!STATUS_TRANSITIONS[current.status].includes(to)) {
    throw new AppointmentError("Esta mudança de situação não é permitida.");
  }
  if (DOCTOR_ONLY_STATUS.includes(to) && !(can(actor.role, "agenda:atender") && actor.id === current.doctorId)) {
    throw new AppointmentError("Somente o médico responsável pela consulta pode iniciar ou finalizar o atendimento.", undefined, "forbidden");
  }
  if (to === "faltou" && current.startsAt.getTime() > Date.now()) {
    throw new AppointmentError("Só é possível registrar falta depois do horário da consulta.");
  }
  if (to === "cancelado" && !reason) throw new AppointmentError("Informe o motivo do cancelamento.", "reason");

  const now = new Date();
  db.transaction((tx) => {
    tx.update(appointments)
      .set({ status: to, cancelReason: to === "cancelado" ? reason : current.cancelReason, updatedAt: now, updatedBy: actor.id })
      .where(eq(appointments.id, id))
      .run();
    tx.insert(appointmentEvents)
      .values({ appointmentId: id, at: now, userId: actor.id, event: "status", fromStatus: current.status, toStatus: to })
      .run();
  });
  return current;
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

export function getAppointment(id: number): Appointment | undefined {
  return db.select().from(appointments).where(eq(appointments.id, id)).get();
}

const doctor = alias(users, "doctor");
const creator = alias(users, "creator");
const updater = alias(users, "updater");

export function getAppointmentDetail(id: number) {
  return db
    .select({
      a: appointments,
      patient: {
        id: patients.id,
        fullName: patients.fullName,
        socialName: patients.socialName,
        birthDate: patients.birthDate,
        phone: patients.phone,
        active: patients.active,
      },
      doctorName: doctor.name,
      createdByName: creator.name,
      updatedByName: updater.name,
    })
    .from(appointments)
    .innerJoin(patients, eq(patients.id, appointments.patientId))
    .leftJoin(doctor, eq(doctor.id, appointments.doctorId))
    .leftJoin(creator, eq(creator.id, appointments.createdBy))
    .leftJoin(updater, eq(updater.id, appointments.updatedBy))
    .where(eq(appointments.id, id))
    .get();
}

export function getAppointmentEvents(id: number) {
  const fromDoctor = alias(users, "from_doctor");
  const toDoctor = alias(users, "to_doctor");
  return db
    .select({
      e: appointmentEvents,
      userName: users.name,
      fromDoctorName: fromDoctor.name,
      toDoctorName: toDoctor.name,
    })
    .from(appointmentEvents)
    .leftJoin(users, eq(users.id, appointmentEvents.userId))
    .leftJoin(fromDoctor, eq(fromDoctor.id, appointmentEvents.fromDoctorId))
    .leftJoin(toDoctor, eq(toDoctor.id, appointmentEvents.toDoctorId))
    .where(eq(appointmentEvents.appointmentId, id))
    .orderBy(desc(appointmentEvents.at), desc(appointmentEvents.id))
    .all();
}

/** Consultas de um médico em um dia (fuso do consultório), em ordem de horário. */
export function listDoctorDay(doctorId: number, date: string) {
  const { start, end } = clinicDayRange(date);
  return db
    .select({
      id: appointments.id,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      status: appointments.status,
      type: appointments.type,
      note: appointments.note,
      overbooked: appointments.overbooked,
      patientId: patients.id,
      fullName: patients.fullName,
      socialName: patients.socialName,
      birthDate: patients.birthDate,
      phone: patients.phone,
    })
    .from(appointments)
    .innerJoin(patients, eq(patients.id, appointments.patientId))
    .where(and(eq(appointments.doctorId, doctorId), gte(appointments.startsAt, start), lt(appointments.startsAt, end)))
    .orderBy(asc(appointments.startsAt), asc(appointments.id))
    .all();
}

/** Consultas de um paciente, restritas aos médicos que o usuário pode ver. */
export function listPatientAppointments(patientId: number, actor: Actor, limit = 20) {
  const allowed = doctorsFor(actor).map((d) => d.id);
  if (!allowed.length) return [];
  return db
    .select({
      id: appointments.id,
      startsAt: appointments.startsAt,
      status: appointments.status,
      type: appointments.type,
      doctorName: users.name,
    })
    .from(appointments)
    .leftJoin(users, eq(users.id, appointments.doctorId))
    .where(and(eq(appointments.patientId, patientId), inArray(appointments.doctorId, allowed)))
    .orderBy(desc(appointments.startsAt))
    .limit(limit)
    .all();
}

/** Contagem de consultas de hoje (não canceladas) por médico visível ao usuário. */
export function countDay(actor: Actor, date: string) {
  const { start, end } = clinicDayRange(date);
  const allowed = doctorsFor(actor).map((d) => d.id);
  if (!allowed.length) return 0;
  return db
    .select({ id: appointments.id })
    .from(appointments)
    .where(
      and(
        inArray(appointments.doctorId, allowed),
        gte(appointments.startsAt, start),
        lt(appointments.startsAt, end),
        ne(appointments.status, "cancelado"),
      ),
    )
    .all().length;
}
