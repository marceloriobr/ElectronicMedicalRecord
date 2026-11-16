import "server-only";
/** Validação (Zod) das entradas do prontuário e do receituário. Usada pelas Server Actions. */
import { z } from "zod";
import { normalizeCidCode } from "./cid10";
import {
  ADDENDUM_MIN,
  CLINICAL_TEXT_MAX,
  MAX_PRESCRIPTION_ITEMS,
  MAX_SECONDARY_CIDS,
  PRESCRIPTION_TYPES,
  RECORD_KINDS,
  RECORD_TEXT_FIELDS,
  VITAL_SIGNS,
  type RecordTextField,
  type VitalSign,
} from "./clinical-constants";

const text = (max = CLINICAL_TEXT_MAX) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres.`)
    .transform((v) => v.replace(/\r\n/g, "\n"));

const cidCode = z.string().transform((v, ctx) => {
  const code = normalizeCidCode(v);
  if (!code) {
    ctx.addIssue({ code: "custom", message: "CID-10 inválido." });
    return z.NEVER;
  }
  return code;
});

const vitalSchema = (min: number, max: number) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(",", "."))
    .refine((v) => v === "" || (/^\d{1,3}(\.\d{1,2})?$/.test(v) && Number(v) >= min && Number(v) <= max), `Valor fora da faixa (${min}–${max}).`)
    .transform((v) => (v === "" ? undefined : Number(v)));

export const recordContentSchema = z
  .object({
    ...(Object.fromEntries(RECORD_TEXT_FIELDS.map((f) => [f.key, text()])) as Record<RecordTextField, ReturnType<typeof text>>),
    vitals: z.object(
      Object.fromEntries(VITAL_SIGNS.map((v) => [v.key, vitalSchema(v.min, v.max)])) as Record<VitalSign, ReturnType<typeof vitalSchema>>,
    ),
    cidPrincipal: z.union([z.literal(""), cidCode]).transform((v) => v || null),
    cidsSecundarios: z.array(cidCode).max(MAX_SECONDARY_CIDS, `Informe no máximo ${MAX_SECONDARY_CIDS} CIDs secundários.`),
  })
  .superRefine((d, ctx) => {
    if (d.cidsSecundarios.length && !d.cidPrincipal) {
      ctx.addIssue({ code: "custom", path: ["cidPrincipal"], message: "Informe o CID principal antes dos secundários." });
    }
    if (d.cidPrincipal && d.cidsSecundarios.includes(d.cidPrincipal)) {
      ctx.addIssue({ code: "custom", path: ["cidsSecundarios"], message: "O CID principal não pode se repetir nos secundários." });
    }
    if (new Set(d.cidsSecundarios).size !== d.cidsSecundarios.length) {
      ctx.addIssue({ code: "custom", path: ["cidsSecundarios"], message: "CID secundário repetido." });
    }
  })
  .transform((d) => ({
    ...d,
    // Remove sinais vitais não preenchidos.
    vitals: Object.fromEntries(Object.entries(d.vitals).filter(([, v]) => v !== undefined)) as Partial<Record<VitalSign, number>>,
  }));
export type RecordContent = z.output<typeof recordContentSchema>;

export const recordMetaSchema = z.object({
  kind: z.enum(RECORD_KINDS, "Tipo de registro inválido."),
  intent: z.enum(["rascunho", "finalizar"]),
});

/** Regras para FINALIZAR (o rascunho pode ficar incompleto). Retorna erros por campo. */
export function finalizeIssues(kind: (typeof RECORD_KINDS)[number], c: RecordContent): Record<string, string> {
  const issues: Record<string, string> = {};
  if (!c.cidPrincipal) issues.cidPrincipal = "Para finalizar, informe o CID principal (hipótese diagnóstica).";
  if (kind === "anamnese" && !c.queixaPrincipal) issues.queixaPrincipal = "Para finalizar a anamnese, informe a queixa principal.";
  if (kind === "evolucao" && !c.subjetivo && !c.queixaPrincipal) issues.subjetivo = "Para finalizar a evolução, descreva o quadro atual.";
  if (!c.plano) issues.plano = "Para finalizar, registre o plano terapêutico / conduta.";
  return issues;
}

export const addendumSchema = z.object({
  motivo: z.string().trim().min(5, "Informe o motivo do aditamento (mínimo de 5 caracteres).").max(300, "Use no máximo 300 caracteres."),
  texto: z.string().trim().min(ADDENDUM_MIN, `Escreva o aditamento (mínimo de ${ADDENDUM_MIN} caracteres).`).max(CLINICAL_TEXT_MAX),
});

export const profileSchema = z
  .object({
    negaAlergias: z.boolean(),
    alergias: text(2000),
    medicamentosEmUso: text(4000),
  })
  .superRefine((d, ctx) => {
    if (d.negaAlergias && d.alergias) {
      ctx.addIssue({ code: "custom", path: ["alergias"], message: "Desmarque “nega alergias” para registrar alergias." });
    }
  });
export type ClinicalProfile = z.output<typeof profileSchema>;

const itemText = (label: string, max: number, required = true) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres.`)
    .refine((v) => !required || v.length > 0, `Informe ${label}.`);

export const prescriptionItemSchema = z.object({
  medicamento: itemText("o medicamento (nome, concentração e forma)", 200),
  posologia: itemText("a posologia", 500),
  quantidade: itemText("a quantidade", 120),
  duracao: itemText("a duração do tratamento", 80, false),
  via: itemText("a via", 40, false),
});
export type PrescriptionItem = z.output<typeof prescriptionItemSchema>;

export const prescriptionSchema = z.object({
  type: z.enum(PRESCRIPTION_TYPES, "Selecione o tipo de receita."),
  items: z
    .array(prescriptionItemSchema)
    .min(1, "Inclua ao menos um medicamento.")
    .max(MAX_PRESCRIPTION_ITEMS, `No máximo ${MAX_PRESCRIPTION_ITEMS} medicamentos por receita.`),
  observacoes: text(1000),
});
export type PrescriptionInput = z.output<typeof prescriptionSchema>;

export const cancelSchema = z.object({
  reason: z.string().trim().min(5, "Informe o motivo do cancelamento (mínimo de 5 caracteres).").max(300, "Use no máximo 300 caracteres."),
});
