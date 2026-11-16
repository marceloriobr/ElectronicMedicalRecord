import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { APPOINTMENT_STATUS, APPOINTMENT_TYPES } from "../lib/appointment-constants";
import { DISCHARGE_REASONS } from "../lib/availability-constants";
import { PRESCRIPTION_STATUS, PRESCRIPTION_TYPES, RECORD_KINDS, RECORD_STATUS } from "../lib/clinical-constants";
import { CONSENT_CHANNELS, PATIENT_COVERAGE, PATIENT_SEX } from "../lib/patient-constants";
import { USER_ROLES } from "../lib/roles";

export { USER_ROLES, ROLE_LABELS, type UserRole } from "../lib/roles";

const now = sql`(unixepoch() * 1000)`;

/** Cadastro de usuários do sistema. */
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  username: text("username").notNull().unique(),
  email: text("email").unique(),
  role: text("role", { enum: USER_ROLES }).notNull(),
  /** Obrigatório para médicos. */
  crm: text("crm"),
  crmUf: text("crm_uf"),
  passwordHash: text("password_hash").notNull(),
  passwordChangedAt: integer("password_changed_at", { mode: "timestamp_ms" }).notNull().default(now),
  /** Força a troca no próximo login (ex.: senha provisória definida pelo administrador). */
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(true),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  lockedUntil: integer("locked_until", { mode: "timestamp_ms" }),
  lastLoginAt: integer("last_login_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  createdBy: integer("created_by"),
}, (t) => [
  check("users_role_check", sql`${t.role} in ('admin', 'medico', 'secretaria')`),
  check("users_medico_crm_check", sql`${t.role} <> 'medico' or (${t.crm} is not null and ${t.crmUf} is not null)`),
]);

/** Histórico de senhas, para impedir a reutilização de senhas anteriores. */
export const passwordHistory = sqliteTable(
  "password_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    passwordHash: text("password_hash").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [index("password_history_user_idx").on(t.userId)],
);

/** Sessões ativas. O cookie guarda o token; aqui fica apenas o hash SHA-256 dele. */
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    /** Última requisição autenticada: base do encerramento por inatividade nas áreas clínicas. */
    // Default constante (exigência do ALTER TABLE no SQLite); createSession grava o valor real.
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull().default(sql`0`),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export type User = typeof users.$inferSelect;

// ---------------------------------------------------------------------------
// Pacientes (dados de identificação e contato — NÃO clínicos).
// Pacientes não são excluídos: um gatilho no banco bloqueia DELETE (use inativação).
// ---------------------------------------------------------------------------

export const patients = sqliteTable(
  "patients",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fullName: text("full_name").notNull(),
    /** Nome social (Decreto 8.727/2016): exibido em destaque quando informado. */
    socialName: text("social_name"),
    /** Nome civil + nome social normalizados (minúsculo, sem acentos) para busca. */
    searchName: text("search_name").notNull(),
    /** AAAA-MM-DD */
    birthDate: text("birth_date").notNull(),
    sex: text("sex", { enum: PATIENT_SEX }).notNull(),
    /** Somente dígitos. */
    cpf: text("cpf").notNull().unique(),
    cns: text("cns").unique(),
    phone: text("phone").notNull(),
    email: text("email"),
    cep: text("cep"),
    street: text("street"),
    number: text("number"),
    complement: text("complement"),
    district: text("district"),
    city: text("city"),
    uf: text("uf"),
    /** Responsável legal: obrigatório para menores de 18 anos. */
    guardianName: text("guardian_name"),
    guardianCpf: text("guardian_cpf"),
    guardianPhone: text("guardian_phone"),
    guardianRelationship: text("guardian_relationship"),
    coverage: text("coverage", { enum: PATIENT_COVERAGE }).notNull().default("particular"),
    insurerName: text("insurer_name"),
    insurerCardNumber: text("insurer_card_number"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    inactivatedAt: integer("inactivated_at", { mode: "timestamp_ms" }),
    inactivatedBy: integer("inactivated_by"),
    inactivationReason: text("inactivation_reason"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    createdBy: integer("created_by").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedBy: integer("updated_by").notNull(),
  },
  (t) => [
    index("patients_search_name_idx").on(t.searchName),
    index("patients_birth_date_idx").on(t.birthDate),
    check("patients_sex_check", sql`${t.sex} in ('feminino', 'masculino', 'intersexo')`),
    check("patients_coverage_check", sql`${t.coverage} in ('particular', 'convenio')`),
    check("patients_cpf_check", sql`length(${t.cpf}) = 11`),
    check("patients_convenio_check", sql`${t.coverage} <> 'convenio' or ${t.insurerName} is not null`),
    check("patients_inactive_check", sql`${t.active} = 1 or ${t.inactivationReason} is not null`),
  ],
);

/**
 * Histórico de consentimentos para comunicação (append-only).
 * O consentimento vigente de cada canal é o registro mais recente.
 */
export const patientConsents = sqliteTable(
  "patient_consents",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    patientId: integer("patient_id")
      .notNull()
      .references(() => patients.id),
    channel: text("channel", { enum: CONSENT_CHANNELS }).notNull(),
    granted: integer("granted", { mode: "boolean" }).notNull(),
    termVersion: text("term_version").notNull(),
    recordedBy: integer("recorded_by").notNull(),
    recordedAt: integer("recorded_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [
    index("patient_consents_patient_idx").on(t.patientId, t.channel),
    check("patient_consents_channel_check", sql`${t.channel} in ('whatsapp', 'email')`),
  ],
);

// ---------------------------------------------------------------------------
// Trilha de auditoria (append-only: gatilhos no banco bloqueiam UPDATE e DELETE).
// Nunca grave aqui conteúdo pessoal ou clínico — apenas referências (ids) e nomes de campos.
// ---------------------------------------------------------------------------

export const AUDIT_ACTIONS = [
  "ler", "buscar", "criar", "alterar", "inativar", "reativar", "acesso_negado",
  "finalizar", "aditar", "emitir", "imprimir", "cancelar", "sessao_expirada",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    at: integer("at", { mode: "timestamp_ms" }).notNull().default(now),
    userId: integer("user_id"),
    action: text("action", { enum: AUDIT_ACTIONS }).notNull(),
    /** Ex.: "paciente", "rota". */
    resource: text("resource").notNull(),
    resourceId: text("resource_id"),
    patientId: integer("patient_id"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    /** JSON sem dados pessoais (ex.: lista de campos alterados). */
    details: text("details"),
  },
  (t) => [
    index("audit_log_patient_idx").on(t.patientId, t.at),
    index("audit_log_user_idx").on(t.userId, t.at),
    index("audit_log_at_idx").on(t.at),
  ],
);

export type Patient = typeof patients.$inferSelect;

// ---------------------------------------------------------------------------
// Agenda de consultas (dados administrativos — NÃO clínicos).
// Consultas não são excluídas (gatilho bloqueia DELETE): use o status "cancelado".
// ---------------------------------------------------------------------------

export const appointments = sqliteTable(
  "appointments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Médico (users.id com perfil medico) — validado no serviço. */
    doctorId: integer("doctor_id").notNull(),
    patientId: integer("patient_id")
      .notNull()
      .references(() => patients.id),
    startsAt: integer("starts_at", { mode: "timestamp_ms" }).notNull(),
    endsAt: integer("ends_at", { mode: "timestamp_ms" }).notNull(),
    type: text("type", { enum: APPOINTMENT_TYPES }).notNull(),
    status: text("status", { enum: APPOINTMENT_STATUS }).notNull().default("agendado"),
    /** Observação ADMINISTRATIVA curta (ex.: "trazer exames anteriores"). Nunca dados clínicos. */
    note: text("note"),
    /** Encaixe: agendado conscientemente sobre outro horário ocupado. */
    overbooked: integer("overbooked", { mode: "boolean" }).notNull().default(false),
    cancelReason: text("cancel_reason"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    createdBy: integer("created_by").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedBy: integer("updated_by").notNull(),
  },
  (t) => [
    index("appointments_doctor_start_idx").on(t.doctorId, t.startsAt),
    index("appointments_patient_start_idx").on(t.patientId, t.startsAt),
    check("appointments_period_check", sql`${t.endsAt} > ${t.startsAt}`),
    check(
      "appointments_status_check",
      sql`${t.status} in ('agendado', 'confirmado', 'em_atendimento', 'atendido', 'faltou', 'cancelado')`,
    ),
    check("appointments_type_check", sql`${t.type} in ('primeira_consulta', 'consulta', 'retorno')`),
    check("appointments_cancel_check", sql`${t.status} <> 'cancelado' or ${t.cancelReason} is not null`),
  ],
);

/** Histórico de cada consulta (append-only): quem agendou, remarcou, confirmou, cancelou etc. */
export const APPOINTMENT_EVENTS = ["agendada", "remarcada", "status"] as const;

export const appointmentEvents = sqliteTable(
  "appointment_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    appointmentId: integer("appointment_id")
      .notNull()
      .references(() => appointments.id),
    at: integer("at", { mode: "timestamp_ms" }).notNull().default(now),
    userId: integer("user_id").notNull(),
    event: text("event", { enum: APPOINTMENT_EVENTS }).notNull(),
    fromStatus: text("from_status", { enum: APPOINTMENT_STATUS }),
    toStatus: text("to_status", { enum: APPOINTMENT_STATUS }),
    fromStartsAt: integer("from_starts_at", { mode: "timestamp_ms" }),
    toStartsAt: integer("to_starts_at", { mode: "timestamp_ms" }),
    fromDoctorId: integer("from_doctor_id"),
    toDoctorId: integer("to_doctor_id"),
  },
  (t) => [index("appointment_events_appointment_idx").on(t.appointmentId)],
);

export type Appointment = typeof appointments.$inferSelect;

// ---------------------------------------------------------------------------
// Prontuário clínico (dados SENSÍVEIS de saúde — LGPD art. 11).
// Todo conteúdo clínico fica em `payload`: JSON criptografado com AES-256-GCM (src/lib/clinical-crypto.ts),
// chave fora do banco e versão da chave em `key_version`. Nada aqui é excluído (gatilhos no banco):
// - registros: editáveis só como rascunho; após "finalizado" são imutáveis (correção por aditamento);
// - aditamentos e perfis clínicos: somente inclusão;
// - receitas: imutáveis após emitidas; só podem ser canceladas (com motivo), preservando o original.
// ---------------------------------------------------------------------------

/** Anamnese / evolução: um registro por atendimento. */
export const clinicalRecords = sqliteTable(
  "clinical_records",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    patientId: integer("patient_id")
      .notNull()
      .references(() => patients.id),
    authorId: integer("author_id")
      .notNull()
      .references(() => users.id),
    /** Consulta da agenda que originou o registro (opcional). */
    appointmentId: integer("appointment_id").references(() => appointments.id),
    kind: text("kind", { enum: RECORD_KINDS }).notNull(),
    status: text("status", { enum: RECORD_STATUS }).notNull().default("rascunho"),
    keyVersion: integer("key_version").notNull(),
    payload: text("payload").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
    finalizedAt: integer("finalized_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    index("clinical_records_patient_idx").on(t.patientId, t.createdAt),
    check("clinical_records_kind_check", sql`${t.kind} in ('anamnese', 'evolucao')`),
    check("clinical_records_status_check", sql`${t.status} in ('rascunho', 'finalizado')`),
    check("clinical_records_finalized_check", sql`${t.status} <> 'finalizado' or ${t.finalizedAt} is not null`),
  ],
);

/** Aditamento/retificação de um registro finalizado: texto + motivo, autor e data/hora do servidor. */
export const clinicalAddenda = sqliteTable(
  "clinical_addenda",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    recordId: integer("record_id")
      .notNull()
      .references(() => clinicalRecords.id),
    authorId: integer("author_id")
      .notNull()
      .references(() => users.id),
    keyVersion: integer("key_version").notNull(),
    payload: text("payload").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [index("clinical_addenda_record_idx").on(t.recordId)],
);

/**
 * Alergias e medicamentos em uso (sempre visíveis no topo do prontuário).
 * Versionado e somente de inclusão: a versão vigente é a mais recente.
 */
export const clinicalProfiles = sqliteTable(
  "clinical_profiles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    patientId: integer("patient_id")
      .notNull()
      .references(() => patients.id),
    authorId: integer("author_id")
      .notNull()
      .references(() => users.id),
    keyVersion: integer("key_version").notNull(),
    payload: text("payload").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [index("clinical_profiles_patient_idx").on(t.patientId, t.id)],
);

/** Receitas emitidas. Identificação do médico copiada na emissão (o documento não muda depois). */
export const prescriptions = sqliteTable(
  "prescriptions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    patientId: integer("patient_id")
      .notNull()
      .references(() => patients.id),
    authorId: integer("author_id")
      .notNull()
      .references(() => users.id),
    recordId: integer("record_id").references(() => clinicalRecords.id),
    type: text("type", { enum: PRESCRIPTION_TYPES }).notNull(),
    status: text("status", { enum: PRESCRIPTION_STATUS }).notNull().default("emitida"),
    doctorName: text("doctor_name").notNull(),
    doctorCrm: text("doctor_crm").notNull(),
    doctorCrmUf: text("doctor_crm_uf").notNull(),
    keyVersion: integer("key_version").notNull(),
    payload: text("payload").notNull(),
    issuedAt: integer("issued_at", { mode: "timestamp_ms" }).notNull().default(now),
    cancelledAt: integer("cancelled_at", { mode: "timestamp_ms" }),
    cancelledBy: integer("cancelled_by"),
    cancelReason: text("cancel_reason"),
  },
  (t) => [
    index("prescriptions_patient_idx").on(t.patientId, t.issuedAt),
    check("prescriptions_type_check", sql`${t.type} in ('simples', 'controle_especial')`),
    check("prescriptions_status_check", sql`${t.status} in ('emitida', 'cancelada')`),
    check(
      "prescriptions_cancel_check",
      sql`${t.status} <> 'cancelada' or (${t.cancelReason} is not null and ${t.cancelledAt} is not null and ${t.cancelledBy} is not null)`,
    ),
  ],
);

export type ClinicalRecord = typeof clinicalRecords.$inferSelect;
export type Prescription = typeof prescriptions.$inferSelect;

// ---------------------------------------------------------------------------
// Disponibilidade dos médicos (grade semanal) e altas — base da previsão de agenda.
// ---------------------------------------------------------------------------

/** Duração padrão da consulta de cada médico (configurada pelo próprio médico). */
export const doctorSchedules = sqliteTable(
  "doctor_schedules",
  {
    doctorId: integer("doctor_id")
      .primaryKey()
      .references(() => users.id),
    slotMinutes: integer("slot_minutes").notNull(),
    /** Valores da consulta particular, em centavos, por tipo (base da visão financeira). */
    priceFirstCents: integer("price_first_cents").notNull().default(0),
    priceCents: integer("price_cents").notNull().default(0),
    priceReturnCents: integer("price_return_cents").notNull().default(0),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
    updatedBy: integer("updated_by").notNull(),
  },
  (t) => [check("doctor_schedules_slot_check", sql`${t.slotMinutes} in (15, 20, 30, 45, 60, 90)`)],
);

/** Faixas de atendimento por dia da semana (0 = domingo … 6 = sábado), horário do consultório "HH:MM". */
export const doctorAvailability = sqliteTable(
  "doctor_availability",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    doctorId: integer("doctor_id")
      .notNull()
      .references(() => users.id),
    weekday: integer("weekday").notNull(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
  },
  (t) => [
    index("doctor_availability_doctor_idx").on(t.doctorId, t.weekday),
    check("doctor_availability_weekday_check", sql`${t.weekday} between 0 and 6`),
    check("doctor_availability_time_check", sql`${t.startTime} < ${t.endTime} and ${t.startTime} >= '07:00' and ${t.endTime} <= '20:00'`),
  ],
);

/**
 * Alta do acompanhamento de um paciente com um médico (somente inclusão).
 * Vale enquanto não houver consulta atendida depois dela: se o paciente voltar, o acompanhamento reabre.
 */
export const patientDischarges = sqliteTable(
  "patient_discharges",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    patientId: integer("patient_id")
      .notNull()
      .references(() => patients.id),
    doctorId: integer("doctor_id")
      .notNull()
      .references(() => users.id),
    reason: text("reason", { enum: DISCHARGE_REASONS }).notNull(),
    recordedBy: integer("recorded_by").notNull(),
    at: integer("at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [
    index("patient_discharges_patient_idx").on(t.patientId, t.doctorId),
    check("patient_discharges_reason_check", sql`${t.reason} in ('alta_medica', 'encaminhado', 'desistencia', 'obito', 'outro')`),
  ],
);
