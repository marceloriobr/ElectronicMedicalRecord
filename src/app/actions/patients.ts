"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { onlyDigits } from "@/lib/br-docs";
import { patientFormSchema, readPatientForm, type PatientTextField } from "@/lib/patient-schema";
import {
  createPatient,
  PatientError,
  searchPatients,
  setPatientActive,
  toPatientRow,
  updatePatient,
  type PatientRow,
} from "@/lib/patient-service";

const idSchema = z.coerce.number().int().positive();

export type PatientFormState = {
  values?: Partial<Record<PatientTextField, string>> & { consentWhatsapp?: boolean; consentEmail?: boolean };
  fieldErrors?: Partial<Record<PatientTextField | "confirmHomonym", string>>;
  message?: string;
  /** Possível duplicidade (mesmo nome + nascimento): o usuário precisa confirmar. */
  homonym?: boolean;
};

/** Cria (sem `id`) ou atualiza (com `id`) o cadastro de um paciente. */
export async function savePatientAction(_prev: PatientFormState, formData: FormData): Promise<PatientFormState> {
  const user = await requirePermission("pacientes:editar");

  const rawId = formData.get("id");
  const id = rawId ? idSchema.safeParse(rawId) : null;
  if (id && !id.success) return { message: "Paciente inválido." };

  const raw = readPatientForm(formData);
  const { confirmHomonym, ...values } = raw;
  void confirmHomonym;

  const parsed = patientFormSchema.safeParse(raw);
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
    const fieldErrors = Object.fromEntries(Object.entries(flat).map(([k, v]) => [k, v?.[0]]));
    return { values, fieldErrors, message: "Corrija os campos destacados." };
  }

  let patientId: number;
  try {
    if (id) {
      patientId = id.data;
      const { changedFields, consentChanges } = updatePatient(patientId, parsed.data, user.id);
      if (changedFields.length || consentChanges.length) {
        // Somente NOMES dos campos alterados — nunca os valores.
        await audit({
          userId: user.id,
          action: "alterar",
          resource: "paciente",
          resourceId: patientId,
          patientId,
          details: { campos: changedFields, consentimentos: consentChanges },
        });
      }
    } else {
      patientId = createPatient(parsed.data, user.id);
      await audit({
        userId: user.id,
        action: "criar",
        resource: "paciente",
        resourceId: patientId,
        patientId,
        details: { consentimentos: { whatsapp: parsed.data.consentWhatsapp, email: parsed.data.consentEmail } },
      });
    }
  } catch (e) {
    if (e instanceof PatientError) {
      if (e.code === "not_found") return { message: e.message };
      return {
        values,
        homonym: e.code === "homonym",
        fieldErrors: e.field ? { [e.field]: e.message } : undefined,
        message: e.field ? "Corrija os campos destacados." : e.message,
      };
    }
    throw e;
  }

  redirect(`/pacientes/${patientId}?salvo=1`);
}

export type PatientStatusState = { message?: string };

const reasonSchema = z
  .string()
  .trim()
  .min(5, "Informe o motivo (mínimo de 5 caracteres).")
  .max(300, "Use no máximo 300 caracteres.");

/** Inativa (com motivo) ou reativa um paciente. Pacientes nunca são excluídos. */
export async function setPatientActiveAction(_prev: PatientStatusState, formData: FormData): Promise<PatientStatusState> {
  const user = await requirePermission("pacientes:inativar");

  const id = idSchema.safeParse(formData.get("id"));
  if (!id.success) return { message: "Paciente inválido." };
  const active = formData.get("active") === "1";

  let reason: string | undefined;
  if (!active) {
    const r = reasonSchema.safeParse(String(formData.get("reason") ?? ""));
    if (!r.success) return { message: r.error.issues[0].message };
    reason = r.data;
  }

  try {
    const changed = setPatientActive(id.data, active, user.id, reason);
    if (changed) {
      await audit({
        userId: user.id,
        action: active ? "reativar" : "inativar",
        resource: "paciente",
        resourceId: id.data,
        patientId: id.data,
      });
    }
  } catch (e) {
    if (e instanceof PatientError) return { message: e.message };
    throw e;
  }

  redirect(`/pacientes/${id.data}?situacao=${active ? "reativado" : "inativado"}`);
}

export type PatientSearchState = {
  results?: PatientRow[];
  searched?: boolean;
  message?: string;
  /** Devolvidos só para manter o formulário preenchido (nunca vão para URL ou log). */
  term?: string;
  includeInactive?: boolean;
};

/**
 * Busca via POST (Server Action): o termo pesquisado — que pode ser nome ou CPF —
 * nunca aparece na URL, no histórico do navegador ou em logs de acesso.
 */
export async function searchPatientsAction(_prev: PatientSearchState, formData: FormData): Promise<PatientSearchState> {
  const user = await requirePermission("pacientes:ler");

  const term = String(formData.get("q") ?? "").trim().slice(0, 100);
  const includeInactive = formData.get("inativos") === "on";
  if (term.replace(/[\s.\-]/g, "").length < 2) {
    return { searched: false, term, includeInactive, message: "Digite ao menos 2 letras do nome ou o CPF completo." };
  }

  const results = searchPatients(term, includeInactive).map(toPatientRow);
  // Auditoria da busca SEM o termo pesquisado (pode conter nome/CPF).
  await audit({
    userId: user.id,
    action: "buscar",
    resource: "paciente",
    details: { tipo: onlyDigits(term).length === 11 ? "cpf" : "nome", resultados: results.length, inativos: includeInactive },
  });
  return { results, searched: true, term, includeInactive };
}
