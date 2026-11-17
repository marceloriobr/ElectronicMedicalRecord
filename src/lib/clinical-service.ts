import "server-only";
/**
 * Regras de negócio do prontuário clínico e do receituário.
 * Autorização por PERFIL fica nas actions/páginas (requireClinicalPermission); aqui ficam as regras de dados
 * e a autorização por REGISTRO (só o autor edita rascunho, adita ou cancela a própria receita).
 * Todo conteúdo clínico é cifrado antes de gravar (clinical-crypto.ts) — nunca grave texto clínico em claro.
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { appointments, clinicalAddenda, clinicalProfiles, clinicalRecords, patients, prescriptions, users } from "@/db/schema";
import { getCid, type Cid } from "./cid10";
import { decryptJson, decryptText, encryptJson, encryptText } from "./clinical-crypto";
import {
  classifyMedication,
  type PrescriptionType,
  type RecordKind,
} from "./clinical-constants";
import type { ClinicalProfile, PrescriptionInput, PrescriptionItem, RecordContent } from "./clinical-schema";
import { finalizeIssues } from "./clinical-schema";
import { formatCep } from "./br-docs";
import { getClinicInfo, type ClinicInfo } from "./clinic-info";

export class ClinicalError extends Error {
  constructor(
    message: string,
    public field?: string,
    public code?: "not_found" | "forbidden" | "incomplete",
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}

export type Actor = { id: number };

function assertActivePatient(patientId: number) {
  const p = db.select({ active: patients.active }).from(patients).where(eq(patients.id, patientId)).get();
  if (!p) throw new ClinicalError("Paciente não encontrado.", undefined, "not_found");
  if (!p.active) throw new ClinicalError("Paciente inativo: reative o cadastro antes de registrar no prontuário.");
}

function doctorOf(id: number) {
  return db
    .select({ name: users.name, crm: users.crm, crmUf: users.crmUf, role: users.role, active: users.active })
    .from(users)
    .where(eq(users.id, id))
    .get();
}

const authorLabel = (a?: { name: string; crm: string | null; crmUf: string | null }) =>
  a ? `${a.name}${a.crm ? ` — CRM ${a.crm}/${a.crmUf}` : ""}` : "—";

// ---------------------------------------------------------------------------
// Alergias e medicamentos em uso (versionado, somente inclusão)
// ---------------------------------------------------------------------------

export function getClinicalProfile(patientId: number) {
  const row = db
    .select({ p: clinicalProfiles, name: users.name, crm: users.crm, crmUf: users.crmUf })
    .from(clinicalProfiles)
    .leftJoin(users, eq(users.id, clinicalProfiles.authorId))
    .where(eq(clinicalProfiles.patientId, patientId))
    .orderBy(desc(clinicalProfiles.id))
    .limit(1)
    .get();
  if (!row) return null;
  return {
    data: decryptJson<ClinicalProfile>(row.p.keyVersion, row.p.payload, { table: "clinical_profiles", patientId }),
    updatedAt: row.p.createdAt,
    author: row.name ? authorLabel({ name: row.name, crm: row.crm, crmUf: row.crmUf }) : "—",
  };
}

export function saveClinicalProfile(patientId: number, data: ClinicalProfile, actor: Actor) {
  assertActivePatient(patientId);
  const enc = encryptJson(data, { table: "clinical_profiles", patientId });
  return db
    .insert(clinicalProfiles)
    .values({ patientId, authorId: actor.id, ...enc, createdAt: new Date() })
    .returning({ id: clinicalProfiles.id })
    .get().id;
}

// ---------------------------------------------------------------------------
// Registros (anamnese / evolução)
// ---------------------------------------------------------------------------

const recordCtx = (patientId: number) => ({ table: "clinical_records", patientId });

export type RecordView = {
  id: number;
  patientId: number;
  authorId: number;
  author: string;
  kind: RecordKind;
  status: "rascunho" | "finalizado";
  appointmentId: number | null;
  createdAt: Date;
  updatedAt: Date;
  finalizedAt: Date | null;
  content: RecordContent;
  cidPrincipal: Cid | null;
  cidsSecundarios: Cid[];
};

function toView(row: { r: typeof clinicalRecords.$inferSelect; name: string | null; crm: string | null; crmUf: string | null }): RecordView {
  const content = decryptJson<RecordContent>(row.r.keyVersion, row.r.payload, recordCtx(row.r.patientId));
  const cid = (c: string) => getCid(c) ?? { code: c, description: "(código não encontrado na tabela)" };
  return {
    id: row.r.id,
    patientId: row.r.patientId,
    authorId: row.r.authorId,
    author: row.name ? authorLabel({ name: row.name, crm: row.crm, crmUf: row.crmUf }) : "—",
    kind: row.r.kind,
    status: row.r.status,
    appointmentId: row.r.appointmentId,
    createdAt: row.r.createdAt,
    updatedAt: row.r.updatedAt,
    finalizedAt: row.r.finalizedAt,
    content,
    cidPrincipal: content.cidPrincipal ? cid(content.cidPrincipal) : null,
    cidsSecundarios: content.cidsSecundarios.map(cid),
  };
}

const recordQuery = () =>
  db
    .select({ r: clinicalRecords, name: users.name, crm: users.crm, crmUf: users.crmUf })
    .from(clinicalRecords)
    .leftJoin(users, eq(users.id, clinicalRecords.authorId));

/** Registros do paciente (mais recentes primeiro). Rascunhos de OUTROS médicos não aparecem. */
export function listRecords(patientId: number, viewerId: number): RecordView[] {
  return recordQuery()
    .where(eq(clinicalRecords.patientId, patientId))
    .orderBy(desc(clinicalRecords.createdAt), desc(clinicalRecords.id))
    .all()
    .filter((row) => row.r.status === "finalizado" || row.r.authorId === viewerId)
    .map(toView);
}

/** Lê um registro do paciente. Rascunho só é visível ao autor. */
export function getRecord(patientId: number, recordId: number, viewerId: number): RecordView {
  const row = recordQuery()
    .where(and(eq(clinicalRecords.id, recordId), eq(clinicalRecords.patientId, patientId)))
    .get();
  if (!row || (row.r.status === "rascunho" && row.r.authorId !== viewerId)) {
    throw new ClinicalError("Registro não encontrado.", undefined, "not_found");
  }
  return toView(row);
}

function checkFinalize(kind: RecordKind, content: RecordContent) {
  const issues = finalizeIssues(kind, content);
  if (Object.keys(issues).length) {
    throw new ClinicalError("Faltam informações obrigatórias para finalizar. O registro pode ser salvo como rascunho.", undefined, "incomplete", issues);
  }
}

function hasContent(c: RecordContent) {
  return Object.entries(c).some(([k, v]) =>
    k === "vitals" ? Object.keys(v as object).length > 0 : Array.isArray(v) ? v.length > 0 : Boolean(v),
  );
}

/** Consulta da agenda vinculada: precisa ser do paciente e do próprio médico. */
function assertAppointment(appointmentId: number, patientId: number, actor: Actor) {
  const a = db
    .select({ patientId: appointments.patientId, doctorId: appointments.doctorId })
    .from(appointments)
    .where(eq(appointments.id, appointmentId))
    .get();
  if (!a || a.patientId !== patientId || a.doctorId !== actor.id) {
    throw new ClinicalError("Consulta vinculada inválida.", undefined, "forbidden");
  }
}

export function createRecord(
  patientId: number,
  input: { kind: RecordKind; content: RecordContent; finalize: boolean; appointmentId?: number },
  actor: Actor,
) {
  assertActivePatient(patientId);
  if (doctorOf(actor.id)?.role !== "medico") throw new ClinicalError("Somente médicos registram no prontuário.", undefined, "forbidden");
  if (!hasContent(input.content)) throw new ClinicalError("O registro está vazio.");
  if (input.finalize) checkFinalize(input.kind, input.content);
  if (input.appointmentId) assertAppointment(input.appointmentId, patientId, actor);

  const now = new Date(); // data/hora do SERVIDOR, nunca do cliente
  const enc = encryptJson(input.content, recordCtx(patientId));
  return db
    .insert(clinicalRecords)
    .values({
      patientId,
      authorId: actor.id,
      appointmentId: input.appointmentId ?? null,
      kind: input.kind,
      status: input.finalize ? "finalizado" : "rascunho",
      ...enc,
      createdAt: now,
      updatedAt: now,
      finalizedAt: input.finalize ? now : null,
    })
    .returning({ id: clinicalRecords.id })
    .get().id;
}

/** Edita um RASCUNHO do próprio autor (e opcionalmente finaliza). Registro finalizado é imutável. */
export function updateDraft(patientId: number, recordId: number, input: { content: RecordContent; finalize: boolean }, actor: Actor) {
  const current = db
    .select({ authorId: clinicalRecords.authorId, status: clinicalRecords.status, kind: clinicalRecords.kind })
    .from(clinicalRecords)
    .where(and(eq(clinicalRecords.id, recordId), eq(clinicalRecords.patientId, patientId)))
    .get();
  if (!current) throw new ClinicalError("Registro não encontrado.", undefined, "not_found");
  if (current.authorId !== actor.id) throw new ClinicalError("Somente o autor pode editar este registro.", undefined, "forbidden");
  if (current.status !== "rascunho") throw new ClinicalError("Registro finalizado não pode ser alterado: use o aditamento.", undefined, "forbidden");
  assertActivePatient(patientId);
  if (!hasContent(input.content)) throw new ClinicalError("O registro está vazio.");
  if (input.finalize) checkFinalize(current.kind, input.content);

  const now = new Date();
  const enc = encryptJson(input.content, recordCtx(patientId));
  db.update(clinicalRecords)
    .set({ ...enc, updatedAt: now, status: input.finalize ? "finalizado" : "rascunho", finalizedAt: input.finalize ? now : null })
    .where(and(eq(clinicalRecords.id, recordId), eq(clinicalRecords.status, "rascunho")))
    .run();
}

// ---------------------------------------------------------------------------
// Aditamentos
// ---------------------------------------------------------------------------

export type Addendum = { id: number; author: string; createdAt: Date; motivo: string; texto: string };

export function listAddenda(patientId: number, recordId: number): Addendum[] {
  return db
    .select({ a: clinicalAddenda, name: users.name, crm: users.crm, crmUf: users.crmUf })
    .from(clinicalAddenda)
    .leftJoin(users, eq(users.id, clinicalAddenda.authorId))
    .where(eq(clinicalAddenda.recordId, recordId))
    .orderBy(clinicalAddenda.id)
    .all()
    .map(({ a, name, crm, crmUf }) => ({
      id: a.id,
      author: name ? authorLabel({ name, crm, crmUf }) : "—",
      createdAt: a.createdAt,
      ...decryptJson<{ motivo: string; texto: string }>(a.keyVersion, a.payload, { table: "clinical_addenda", patientId }),
    }));
}

/** Aditamento: somente o autor do registro, somente em registro finalizado (gatilho reforça no banco). */
export function addAddendum(patientId: number, recordId: number, data: { motivo: string; texto: string }, actor: Actor) {
  const rec = db
    .select({ authorId: clinicalRecords.authorId, status: clinicalRecords.status })
    .from(clinicalRecords)
    .where(and(eq(clinicalRecords.id, recordId), eq(clinicalRecords.patientId, patientId)))
    .get();
  if (!rec) throw new ClinicalError("Registro não encontrado.", undefined, "not_found");
  if (rec.authorId !== actor.id) throw new ClinicalError("Somente o autor do registro pode aditá-lo.", undefined, "forbidden");
  if (rec.status !== "finalizado") throw new ClinicalError("Rascunhos são editados diretamente; o aditamento é para registros finalizados.");

  const enc = encryptJson(data, { table: "clinical_addenda", patientId });
  return db
    .insert(clinicalAddenda)
    .values({ recordId, authorId: actor.id, ...enc, createdAt: new Date() })
    .returning({ id: clinicalAddenda.id })
    .get().id;
}

// ---------------------------------------------------------------------------
// Receitas
// ---------------------------------------------------------------------------

/** Conteúdo cifrado da receita: itens + cópia da identificação do paciente e do consultório na emissão. */
export type PrescriptionPayload = {
  items: PrescriptionItem[];
  observacoes: string;
  paciente: { nome: string; cpf: string; endereco: string; nascimento: string; sexo: string };
  consultorio: ClinicInfo;
};

const rxCtx = (patientId: number) => ({ table: "prescriptions", patientId });

/** Confere cada medicamento contra o tipo de receita. "Na dúvida, bloquear e sinalizar" (CLAUDE.md, 6.5). */
export function prescriptionIssues(type: PrescriptionType, items: PrescriptionItem[]) {
  const issues: Record<string, string> = {};
  items.forEach((it, i) => {
    const c = classifyMedication(it.medicamento);
    if (c.notification) {
      issues[`items.${i}.medicamento`] =
        `${c.notification}: exige Notificação de Receita em talonário oficial. O sistema não gera este documento.`;
    } else if (c.controlled && type === "simples") {
      issues[`items.${i}.medicamento`] = "Medicamento sujeito a controle especial (Portaria 344/1998): use a receita de controle especial.";
    }
  });
  return issues;
}

function patientAddress(p: typeof patients.$inferSelect) {
  const parts = [
    [p.street, p.number].filter(Boolean).join(", "),
    p.complement,
    p.district,
    [p.city, p.uf].filter(Boolean).join("/"),
    p.cep && `CEP ${formatCep(p.cep)}`,
  ].filter(Boolean);
  return parts.join(" · ");
}

export function issuePrescription(patientId: number, input: PrescriptionInput & { recordId?: number }, actor: Actor) {
  assertActivePatient(patientId);
  const doctor = doctorOf(actor.id);
  if (!doctor || doctor.role !== "medico" || !doctor.active || !doctor.crm || !doctor.crmUf) {
    throw new ClinicalError("Somente médicos com CRM cadastrado emitem receitas.", undefined, "forbidden");
  }
  const issues = prescriptionIssues(input.type, input.items);
  if (Object.keys(issues).length) throw new ClinicalError("Revise os medicamentos destacados.", undefined, "incomplete", issues);

  const clinic = getClinicInfo();
  if (!clinic.address) {
    throw new ClinicalError("Endereço do consultório não configurado (CLINIC_ADDRESS): obrigatório na receita.");
  }
  const p = db.select().from(patients).where(eq(patients.id, patientId)).get()!;
  const endereco = patientAddress(p);
  if (input.type === "controle_especial" && (!p.street || !p.city)) {
    throw new ClinicalError("A receita de controle especial exige o endereço completo do paciente: atualize o cadastro antes de emitir.");
  }
  if (input.recordId) {
    const r = db.select({ patientId: clinicalRecords.patientId }).from(clinicalRecords).where(eq(clinicalRecords.id, input.recordId)).get();
    if (r?.patientId !== patientId) throw new ClinicalError("Registro vinculado inválido.", undefined, "forbidden");
  }

  const payload: PrescriptionPayload = {
    items: input.items,
    observacoes: input.observacoes,
    paciente: { nome: p.fullName, cpf: p.cpf, endereco, nascimento: p.birthDate, sexo: p.sex },
    consultorio: clinic,
  };
  const enc = encryptJson(payload, rxCtx(patientId));
  return db
    .insert(prescriptions)
    .values({
      patientId,
      authorId: actor.id,
      recordId: input.recordId ?? null,
      type: input.type,
      doctorName: doctor.name,
      doctorCrm: doctor.crm,
      doctorCrmUf: doctor.crmUf,
      ...enc,
      issuedAt: new Date(),
    })
    .returning({ id: prescriptions.id })
    .get().id;
}

export type PrescriptionView = Omit<typeof prescriptions.$inferSelect, "payload" | "keyVersion"> & {
  content: PrescriptionPayload;
  cancelledByName: string | null;
};

export function getPrescription(patientId: number, id: number): PrescriptionView {
  const row = db
    .select()
    .from(prescriptions)
    .where(and(eq(prescriptions.id, id), eq(prescriptions.patientId, patientId)))
    .get();
  if (!row) throw new ClinicalError("Receita não encontrada.", undefined, "not_found");
  const { payload, keyVersion, ...rest } = row;
  const cancelledByName = row.cancelledBy
    ? (db.select({ name: users.name }).from(users).where(eq(users.id, row.cancelledBy)).get()?.name ?? null)
    : null;
  return {
    ...rest,
    cancelReason: decryptText(rest.cancelReason, rxCtx(patientId)),
    content: decryptJson<PrescriptionPayload>(keyVersion, payload, rxCtx(patientId)),
    cancelledByName,
  };
}

export function listPrescriptions(patientId: number) {
  return db
    .select()
    .from(prescriptions)
    .where(eq(prescriptions.patientId, patientId))
    .orderBy(desc(prescriptions.issuedAt), desc(prescriptions.id))
    .all()
    // O motivo do cancelamento (cifrado) não é usado na listagem: não sai do serviço.
    .map(({ payload, keyVersion, cancelReason: _cancelReason, ...rest }) => {
      void _cancelReason;
      const c = decryptJson<PrescriptionPayload>(keyVersion, payload, rxCtx(patientId));
      return { ...rest, medicamentos: c.items.map((i) => i.medicamento) };
    });
}

/** Cancela a PRÓPRIA receita, com motivo. O conteúdo original é preservado (gatilho impede alteração). */
export function cancelPrescription(patientId: number, id: number, reason: string, actor: Actor) {
  const rx = db
    .select({ authorId: prescriptions.authorId, status: prescriptions.status })
    .from(prescriptions)
    .where(and(eq(prescriptions.id, id), eq(prescriptions.patientId, patientId)))
    .get();
  if (!rx) throw new ClinicalError("Receita não encontrada.", undefined, "not_found");
  if (rx.authorId !== actor.id) throw new ClinicalError("Somente o médico que emitiu pode cancelar a receita.", undefined, "forbidden");
  if (rx.status !== "emitida") throw new ClinicalError("Esta receita já foi cancelada.");
  db.update(prescriptions)
    .set({ status: "cancelada", cancelledAt: new Date(), cancelledBy: actor.id, cancelReason: encryptText(reason, rxCtx(patientId)) })
    .where(eq(prescriptions.id, id))
    .run();
}
