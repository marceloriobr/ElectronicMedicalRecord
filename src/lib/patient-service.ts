import "server-only";
/**
 * Regras de negócio do cadastro de pacientes.
 * Autorização e auditoria ficam nas Server Actions/páginas; aqui ficam as regras de dados.
 */
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { patientConsents, patients, users, type Patient } from "@/db/schema";
import { decryptText, encryptText } from "./clinical-crypto";
import { ageFromBirthDate, formatDateBr, maskCpf, maskPhone, normalizeName, onlyDigits } from "./br-docs";
import {
  CONSENT_CHANNELS,
  CONSENT_TERM_VERSION,
  PATIENT_SEARCH_LIMIT,
  type ConsentChannel,
} from "./patient-constants";
import type { PatientFormData } from "./patient-schema";

export class PatientError extends Error {
  constructor(
    message: string,
    public field?: string,
    public code?: "homonym" | "not_found",
  ) {
    super(message);
  }
}

/** Colunas editáveis pelo formulário (usadas também para detectar campos alterados). */
const EDITABLE_FIELDS = [
  "fullName", "socialName", "birthDate", "sex", "cpf", "cns", "phone", "email",
  "cep", "street", "number", "complement", "district", "city", "uf",
  "guardianName", "guardianCpf", "guardianPhone", "guardianRelationship",
  "coverage", "insurerName", "insurerCardNumber",
] as const satisfies readonly (keyof Patient & keyof PatientFormData)[];

/** Chave de busca: nome civil + nome social, sem acentos e em minúsculas. */
const searchKey = (d: { fullName: string; socialName: string | null }) =>
  [d.fullName, d.socialName].filter(Boolean).map((n) => normalizeName(n!)).join(" / ");

function pickEditable(d: PatientFormData) {
  return Object.fromEntries(EDITABLE_FIELDS.map((k) => [k, d[k]])) as Pick<Patient, (typeof EDITABLE_FIELDS)[number]>;
}

function assertUniqueDocuments(d: PatientFormData, excludeId?: number) {
  const notSelf = excludeId ? ne(patients.id, excludeId) : undefined;
  const byCpf = db.select({ active: patients.active }).from(patients).where(and(eq(patients.cpf, d.cpf), notSelf)).get();
  if (byCpf) {
    throw new PatientError(
      byCpf.active
        ? "Já existe um paciente cadastrado com este CPF."
        : "Já existe um paciente INATIVO com este CPF. Reative o cadastro existente em vez de criar outro.",
      "cpf",
    );
  }
  if (d.cns && db.select({ id: patients.id }).from(patients).where(and(eq(patients.cns, d.cns), notSelf)).get()) {
    throw new PatientError("Já existe um paciente cadastrado com este CNS.", "cns");
  }
}

/** Mesmo nome (sem acentos/maiúsculas) e mesma data de nascimento: provável cadastro duplicado. */
function assertNoHomonym(d: PatientFormData, excludeId?: number) {
  if (d.confirmHomonym) return;
  const name = normalizeName(d.fullName);
  const found = db
    .select({ fullName: patients.fullName })
    .from(patients)
    .where(and(eq(patients.birthDate, d.birthDate), excludeId ? ne(patients.id, excludeId) : undefined))
    .all()
    .some((p) => normalizeName(p.fullName) === name);
  if (found) {
    throw new PatientError(
      "Já existe um paciente com o mesmo nome e data de nascimento (CPF diferente). " +
        "Confira se não é a mesma pessoa antes de continuar.",
      "confirmHomonym",
      "homonym",
    );
  }
}

export function createPatient(d: PatientFormData, userId: number) {
  assertUniqueDocuments(d);
  assertNoHomonym(d);
  const now = new Date();

  return db.transaction((tx) => {
    const { id } = tx
      .insert(patients)
      .values({
        ...pickEditable(d),
        searchName: searchKey(d),
        createdAt: now,
        createdBy: userId,
        updatedAt: now,
        updatedBy: userId,
      })
      .returning({ id: patients.id })
      .get();

    // Registra a resposta inicial do paciente para cada canal (concedido ou não).
    const wanted = consentsFromForm(d);
    for (const channel of CONSENT_CHANNELS) {
      tx.insert(patientConsents)
        .values({ patientId: id, channel, granted: wanted[channel], termVersion: CONSENT_TERM_VERSION, recordedBy: userId, recordedAt: now })
        .run();
    }
    return id;
  });
}

/** Atualiza o cadastro. Retorna apenas os NOMES dos campos alterados (para auditoria). */
export function updatePatient(id: number, d: PatientFormData, userId: number) {
  const current = getPatient(id);
  if (!current) throw new PatientError("Paciente não encontrado.", undefined, "not_found");
  if (!current.active) throw new PatientError("Paciente inativo: reative o cadastro antes de editar.");

  assertUniqueDocuments(d, id);
  if (normalizeName(d.fullName) !== normalizeName(current.fullName) || d.birthDate !== current.birthDate) {
    assertNoHomonym(d, id);
  }

  const next = pickEditable(d);
  const changedFields = EDITABLE_FIELDS.filter((k) => (current[k] ?? null) !== (next[k] ?? null));

  const currentConsents = getCurrentConsents(id);
  const wanted = consentsFromForm(d);
  const consentChanges = CONSENT_CHANNELS.filter((c) => (currentConsents[c]?.granted ?? false) !== wanted[c]).map(
    (c) => ({ channel: c, granted: wanted[c] }),
  );

  const now = new Date();
  db.transaction((tx) => {
    if (changedFields.length) {
      tx.update(patients)
        .set({ ...next, searchName: searchKey(d), updatedAt: now, updatedBy: userId })
        .where(eq(patients.id, id))
        .run();
    }
    for (const { channel, granted } of consentChanges) {
      tx.insert(patientConsents)
        .values({ patientId: id, channel, granted, termVersion: CONSENT_TERM_VERSION, recordedBy: userId, recordedAt: now })
        .run();
    }
  });

  return { changedFields, consentChanges };
}

/** O motivo da inativação é texto livre: fica cifrado em repouso (pode citar a saúde do paciente). */
const reasonCtx = (patientId: number) => ({ table: "patients", patientId });

export function setPatientActive(id: number, active: boolean, userId: number, reason?: string) {
  const current = getPatient(id);
  if (!current) throw new PatientError("Paciente não encontrado.", undefined, "not_found");
  if (current.active === active) return false;

  const now = new Date();
  db.update(patients)
    .set(
      active
        ? { active: true, inactivatedAt: null, inactivatedBy: null, inactivationReason: null, updatedAt: now, updatedBy: userId }
        : { active: false, inactivatedAt: now, inactivatedBy: userId, inactivationReason: reason ? encryptText(reason, reasonCtx(id)) : reason, updatedAt: now, updatedBy: userId },
    )
    .where(eq(patients.id, id))
    .run();
  return true;
}

export function getPatient(id: number) {
  const p = db.select().from(patients).where(eq(patients.id, id)).get();
  return p && { ...p, inactivationReason: decryptText(p.inactivationReason, reasonCtx(p.id)) };
}

function consentsFromForm(d: PatientFormData): Record<ConsentChannel, boolean> {
  return { whatsapp: d.consentWhatsapp, email: d.consentEmail };
}

export type ConsentRecord = { granted: boolean; termVersion: string; recordedAt: Date; recordedByName: string | null };

/** Consentimento vigente (registro mais recente) de cada canal. */
export function getCurrentConsents(patientId: number) {
  const result = {} as Record<ConsentChannel, ConsentRecord | null>;
  for (const channel of CONSENT_CHANNELS) {
    result[channel] =
      db
        .select({
          granted: patientConsents.granted,
          termVersion: patientConsents.termVersion,
          recordedAt: patientConsents.recordedAt,
          recordedByName: users.name,
        })
        .from(patientConsents)
        .leftJoin(users, eq(users.id, patientConsents.recordedBy))
        .where(and(eq(patientConsents.patientId, patientId), eq(patientConsents.channel, channel)))
        .orderBy(desc(patientConsents.recordedAt), desc(patientConsents.id))
        .get() ?? null;
  }
  return result;
}

export function getConsentHistory(patientId: number) {
  return db
    .select({
      id: patientConsents.id,
      channel: patientConsents.channel,
      granted: patientConsents.granted,
      termVersion: patientConsents.termVersion,
      recordedAt: patientConsents.recordedAt,
      recordedByName: users.name,
    })
    .from(patientConsents)
    .leftJoin(users, eq(users.id, patientConsents.recordedBy))
    .where(eq(patientConsents.patientId, patientId))
    .orderBy(desc(patientConsents.recordedAt), desc(patientConsents.id))
    .all();
}

/** Campos exibidos nas listagens (sem endereço, responsável etc.: minimização). */
const listColumns = {
  id: patients.id,
  fullName: patients.fullName,
  socialName: patients.socialName,
  birthDate: patients.birthDate,
  cpf: patients.cpf,
  phone: patients.phone,
  coverage: patients.coverage,
  insurerName: patients.insurerName,
  active: patients.active,
};

export type PatientListItem = {
  id: number;
  fullName: string;
  socialName: string | null;
  birthDate: string;
  cpf: string;
  phone: string;
  coverage: Patient["coverage"];
  insurerName: string | null;
  active: boolean;
};

/**
 * Busca por CPF completo (11 dígitos) ou por parte do nome / nome social
 * (sem diferenciar acentos e maiúsculas).
 */
export function searchPatients(term: string, includeInactive = false): PatientListItem[] {
  const digits = onlyDigits(term);
  const activeFilter = includeInactive ? undefined : eq(patients.active, true);

  if (digits.length === 11 && /^[\d.\-\s]+$/.test(term.trim())) {
    return db.select(listColumns).from(patients).where(and(eq(patients.cpf, digits), activeFilter)).all();
  }

  const q = normalizeName(term);
  if (q.length < 2) return [];
  return db
    .select(listColumns)
    .from(patients)
    .where(
      and(
        sql`instr(${patients.searchName}, ${q}) > 0`,
        activeFilter,
      ),
    )
    .orderBy(asc(patients.searchName))
    .limit(PATIENT_SEARCH_LIMIT)
    .all();
}

/** Últimos pacientes cadastrados/alterados (ativos). */
export function listRecentPatients(limit = 20): PatientListItem[] {
  return db
    .select(listColumns)
    .from(patients)
    .where(eq(patients.active, true))
    .orderBy(desc(patients.updatedAt))
    .limit(limit)
    .all();
}

export function countPatients() {
  return db
    .select({
      total: sql<number>`count(*)`,
      active: sql<number>`coalesce(sum(case when ${patients.active} then 1 else 0 end), 0)`,
    })
    .from(patients)
    .get()!;
}

/**
 * Linha de listagem já mascarada NO SERVIDOR: CPF e telefone completos não vão para o navegador
 * em listas (minimização — LGPD art. 6º, III).
 */
export type PatientRow = {
  id: number;
  displayName: string;
  civilName: string | null;
  birthDate: string;
  age: number;
  cpf: string;
  phone: string;
  coverage: string;
  active: boolean;
};

export function toPatientRow(p: PatientListItem): PatientRow {
  return {
    id: p.id,
    displayName: p.socialName ?? p.fullName,
    civilName: p.socialName ? p.fullName : null,
    birthDate: formatDateBr(p.birthDate),
    age: ageFromBirthDate(p.birthDate),
    cpf: maskCpf(p.cpf),
    phone: maskPhone(p.phone),
    coverage: p.coverage === "convenio" ? (p.insurerName ?? "Convênio") : "Particular",
    active: p.active,
  };
}

/** Valores iniciais do formulário de edição. */
export function toFormValues(p: Patient) {
  const consents = getCurrentConsents(p.id);
  const text = Object.fromEntries(EDITABLE_FIELDS.map((k) => [k, p[k] ?? ""])) as Record<(typeof EDITABLE_FIELDS)[number], string>;
  return {
    ...text,
    consentWhatsapp: consents.whatsapp?.granted ?? false,
    consentEmail: consents.email?.granted ?? false,
  };
}

export function getUserName(id: number | null) {
  if (id == null) return null;
  return db.select({ name: users.name }).from(users).where(eq(users.id, id)).get()?.name ?? null;
}
