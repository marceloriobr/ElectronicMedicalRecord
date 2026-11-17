"use server";
/**
 * Server Actions do prontuário e do receituário: validam (Zod), autorizam (perfil + inatividade),
 * auditam (somente referências — nunca conteúdo clínico) e delegam ao clinical-service.
 */
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit, audited } from "@/lib/audit";
import { requireClinicalPermission } from "@/lib/auth";
import { getCid, searchCid, type Cid } from "@/lib/cid10";
import { MAX_PRESCRIPTION_ITEMS, RECORD_TEXT_FIELDS, VITAL_SIGNS } from "@/lib/clinical-constants";
import {
  addendumSchema,
  cancelSchema,
  prescriptionSchema,
  profileSchema,
  recordContentSchema,
  recordMetaSchema,
} from "@/lib/clinical-schema";
import {
  addAddendum,
  cancelPrescription,
  ClinicalError,
  createRecord,
  issuePrescription,
  saveClinicalProfile,
  updateDraft,
} from "@/lib/clinical-service";

const id = z.coerce.number().int().positive();
const optionalId = z.union([z.literal(""), id]).transform((v) => (v === "" ? undefined : v));

/** Erros do Zod → { "campo.sub": "mensagem" } (primeira mensagem de cada campo). */
function fieldErrors(error: z.ZodError) {
  const out: Record<string, string> = {};
  for (const i of error.issues) {
    const k = i.path.join(".");
    if (!(k in out)) out[k] = i.message;
  }
  return out;
}

async function denied(userId: number, resource: string, resourceId: number, patientId: number) {
  await audit({ userId, action: "acesso_negado", resource, resourceId, patientId });
}

// ---------------------------------------------------------------------------
// CID-10
// ---------------------------------------------------------------------------

/** Busca na tabela CID-10 (dado público; via POST para o termo não aparecer em URL/log). */
export async function searchCidAction(term: string): Promise<Cid[]> {
  await requireClinicalPermission("prontuario:escrever");
  const t = z.string().max(60).safeParse(term);
  return t.success ? searchCid(t.data) : [];
}

// ---------------------------------------------------------------------------
// Registro clínico (anamnese / evolução)
// ---------------------------------------------------------------------------

export type RecordFormState = {
  values?: Record<string, string>;
  cids?: { principal: Cid | null; secundarios: Cid[] };
  fieldErrors?: Record<string, string>;
  message?: string;
};

function readRecordForm(formData: FormData) {
  const values: Record<string, string> = {};
  for (const f of RECORD_TEXT_FIELDS) values[f.key] = String(formData.get(f.key) ?? "");
  for (const v of VITAL_SIGNS) values[`vitals.${v.key}`] = String(formData.get(`vitals.${v.key}`) ?? "");
  const cidPrincipal = String(formData.get("cidPrincipal") ?? "");
  const cidsSecundarios = formData.getAll("cidsSecundarios").map(String).filter(Boolean);
  return {
    values,
    raw: {
      ...Object.fromEntries(RECORD_TEXT_FIELDS.map((f) => [f.key, values[f.key]])),
      vitals: Object.fromEntries(VITAL_SIGNS.map((v) => [v.key, values[`vitals.${v.key}`]])),
      cidPrincipal,
      cidsSecundarios,
    },
    cids: {
      principal: cidPrincipal ? (getCid(cidPrincipal) ?? null) : null,
      secundarios: cidsSecundarios.map((c) => getCid(c)).filter((c): c is Cid => !!c),
    },
  };
}

/** Cria (sem recordId) ou edita um rascunho (com recordId); `intent` = rascunho | finalizar. */
export async function saveRecordAction(_prev: RecordFormState, formData: FormData): Promise<RecordFormState> {
  const user = await requireClinicalPermission("prontuario:escrever");

  const ids = z
    .object({ patientId: id, recordId: optionalId, appointmentId: optionalId })
    .safeParse({ patientId: formData.get("patientId"), recordId: formData.get("recordId") ?? "", appointmentId: formData.get("appointmentId") ?? "" });
  const meta = recordMetaSchema.safeParse({ kind: formData.get("kind"), intent: formData.get("intent") });
  if (!ids.success || !meta.success) return { message: "Requisição inválida." };
  const { patientId, recordId, appointmentId } = ids.data;
  const finalize = meta.data.intent === "finalizar";

  const { values, raw, cids } = readRecordForm(formData);
  const parsed = recordContentSchema.safeParse(raw);
  if (!parsed.success) return { values, cids, fieldErrors: fieldErrors(parsed.error), message: "Corrija os campos destacados." };

  let savedId: number;
  try {
    if (recordId) {
      await audited(
        () => updateDraft(patientId, recordId, { content: parsed.data, finalize }, user),
        () => ({ userId: user.id, action: finalize ? "finalizar" : "alterar", resource: "registro_clinico", resourceId: recordId, patientId }),
      );
      savedId = recordId;
    } else {
      savedId = await audited(
        () => createRecord(patientId, { kind: meta.data.kind, content: parsed.data, finalize, appointmentId }, user),
        (newId) => ({
          userId: user.id,
          action: "criar",
          resource: "registro_clinico",
          resourceId: newId,
          patientId,
          details: { tipo: meta.data.kind, finalizado: finalize, consultaId: appointmentId ?? null },
        }),
      );
    }
  } catch (e) {
    if (e instanceof ClinicalError) {
      if (e.code === "forbidden") await denied(user.id, "registro_clinico", recordId ?? 0, patientId);
      return { values, cids, fieldErrors: e.fieldErrors, message: e.message };
    }
    throw e;
  }
  redirect(`/pacientes/${patientId}/prontuario/${savedId}?ok=${finalize ? "finalizado" : "rascunho"}`);
}

// ---------------------------------------------------------------------------
// Aditamento
// ---------------------------------------------------------------------------

export type SimpleFormState = { values?: Record<string, string>; fieldErrors?: Record<string, string>; message?: string };

export async function addAddendumAction(_prev: SimpleFormState, formData: FormData): Promise<SimpleFormState> {
  const user = await requireClinicalPermission("prontuario:escrever");
  const ids = z.object({ patientId: id, recordId: id }).safeParse({ patientId: formData.get("patientId"), recordId: formData.get("recordId") });
  if (!ids.success) return { message: "Requisição inválida." };
  const { patientId, recordId } = ids.data;

  const values = { motivo: String(formData.get("motivo") ?? ""), texto: String(formData.get("texto") ?? "") };
  const parsed = addendumSchema.safeParse(values);
  if (!parsed.success) return { values, fieldErrors: fieldErrors(parsed.error) };

  try {
    await audited(
      () => addAddendum(patientId, recordId, parsed.data, user),
      (addendumId) => ({ userId: user.id, action: "aditar", resource: "registro_clinico", resourceId: recordId, patientId, details: { aditamentoId: addendumId } }),
    );
  } catch (e) {
    if (e instanceof ClinicalError) {
      if (e.code === "forbidden") await denied(user.id, "registro_clinico", recordId, patientId);
      return { values, message: e.message };
    }
    throw e;
  }
  redirect(`/pacientes/${patientId}/prontuario/${recordId}?ok=aditado`);
}

// ---------------------------------------------------------------------------
// Alergias e medicamentos em uso
// ---------------------------------------------------------------------------

export async function saveProfileAction(_prev: SimpleFormState, formData: FormData): Promise<SimpleFormState> {
  const user = await requireClinicalPermission("prontuario:escrever");
  const pid = id.safeParse(formData.get("patientId"));
  if (!pid.success) return { message: "Requisição inválida." };

  const values = { alergias: String(formData.get("alergias") ?? ""), medicamentosEmUso: String(formData.get("medicamentosEmUso") ?? "") };
  const negaAlergias = formData.get("negaAlergias") === "on";
  const parsed = profileSchema.safeParse({ ...values, negaAlergias });
  if (!parsed.success) return { values: { ...values, negaAlergias: negaAlergias ? "on" : "" }, fieldErrors: fieldErrors(parsed.error) };

  try {
    await audited(
      () => saveClinicalProfile(pid.data, parsed.data, user),
      (profileId) => ({ userId: user.id, action: "alterar", resource: "alergias_medicamentos", resourceId: profileId, patientId: pid.data }),
    );
  } catch (e) {
    if (e instanceof ClinicalError) return { values, message: e.message };
    throw e;
  }
  redirect(`/pacientes/${pid.data}/prontuario?ok=alergias`);
}

// ---------------------------------------------------------------------------
// Receitas
// ---------------------------------------------------------------------------

export type PrescriptionFormState = { fieldErrors?: Record<string, string>; message?: string };

export async function issuePrescriptionAction(_prev: PrescriptionFormState, formData: FormData): Promise<PrescriptionFormState> {
  const user = await requireClinicalPermission("receita:emitir");
  const ids = z
    .object({ patientId: id, recordId: optionalId })
    .safeParse({ patientId: formData.get("patientId"), recordId: formData.get("recordId") ?? "" });
  if (!ids.success) return { message: "Requisição inválida." };
  const { patientId, recordId } = ids.data;

  // Itens chegam como items.<n>.<campo>; linhas totalmente vazias são ignoradas.
  const items = Array.from({ length: MAX_PRESCRIPTION_ITEMS + 1 }, (_, i) =>
    Object.fromEntries(["medicamento", "posologia", "quantidade", "duracao", "via"].map((k) => [k, String(formData.get(`items.${i}.${k}`) ?? "")])),
  ).filter((it) => Object.values(it).some((v) => v.trim()));

  const parsed = prescriptionSchema.safeParse({ type: formData.get("type"), items, observacoes: String(formData.get("observacoes") ?? "") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), message: "Corrija os campos destacados." };

  let rxId: number;
  try {
    rxId = await audited(
      () => issuePrescription(patientId, { ...parsed.data, recordId }, user),
      (newId) => ({
        userId: user.id,
        action: "emitir",
        resource: "receita",
        resourceId: newId,
        patientId,
        details: { tipo: parsed.data.type, itens: parsed.data.items.length },
      }),
    );
  } catch (e) {
    if (e instanceof ClinicalError) {
      if (e.code === "forbidden") await denied(user.id, "receita", 0, patientId);
      return { fieldErrors: e.fieldErrors, message: e.message };
    }
    throw e;
  }
  redirect(`/pacientes/${patientId}/receitas/${rxId}?ok=emitida`);
}

export async function cancelPrescriptionAction(_prev: SimpleFormState, formData: FormData): Promise<SimpleFormState> {
  const user = await requireClinicalPermission("receita:emitir");
  const ids = z.object({ patientId: id, prescriptionId: id }).safeParse({
    patientId: formData.get("patientId"),
    prescriptionId: formData.get("prescriptionId"),
  });
  if (!ids.success) return { message: "Requisição inválida." };
  const { patientId, prescriptionId } = ids.data;

  const values = { reason: String(formData.get("reason") ?? "") };
  const parsed = cancelSchema.safeParse(values);
  if (!parsed.success) return { values, fieldErrors: fieldErrors(parsed.error) };

  try {
    await audited(
      () => cancelPrescription(patientId, prescriptionId, parsed.data.reason, user),
      () => ({ userId: user.id, action: "cancelar", resource: "receita", resourceId: prescriptionId, patientId }),
    );
  } catch (e) {
    if (e instanceof ClinicalError) {
      if (e.code === "forbidden") await denied(user.id, "receita", prescriptionId, patientId);
      return { values, message: e.message };
    }
    throw e;
  }
  redirect(`/pacientes/${patientId}/receitas/${prescriptionId}?ok=cancelada`);
}
