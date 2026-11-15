/**
 * Validação do cadastro de pacientes (executada no servidor, dentro das Server Actions).
 * Entrada: strings do formulário. Saída: dados normalizados (documentos só com dígitos, vazios → null).
 */
import { z } from "zod";
import { BR_UFS } from "./br-ufs";
import { ageFromBirthDate, isValidCep, isValidCns, isValidCpf, isValidPhone, onlyDigits, todayIso } from "./br-docs";
import { AGE_OF_MAJORITY, PATIENT_COVERAGE, PATIENT_SEX } from "./patient-constants";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres.`)
    .transform((v) => (v === "" ? null : v));

const personName = z
  .string()
  .trim()
  .min(3, "Informe o nome completo.")
  .max(150, "Use no máximo 150 caracteres.")
  .regex(/^[\p{L}][\p{L}' .-]*$/u, "Use apenas letras, espaços, apóstrofo, ponto ou hífen.")
  .transform((v) => v.replace(/\s+/g, " "));

export const patientFormSchema = z
  .object({
    fullName: personName.refine((v: string) => v.includes(" "), "Informe nome e sobrenome."),
    socialName: z.union([z.literal(""), personName]).transform((v) => v || null),
    birthDate: z.iso.date("Informe a data de nascimento."),
    sex: z.enum(PATIENT_SEX, "Selecione o sexo."),
    cpf: z.string().refine(isValidCpf, "CPF inválido.").transform(onlyDigits),
    cns: z
      .string()
      .transform(onlyDigits)
      .refine((v) => v === "" || isValidCns(v), "CNS inválido.")
      .transform((v) => v || null),
    phone: z.string().refine(isValidPhone, "Telefone inválido (informe DDD + número).").transform(onlyDigits),
    email: z.union([z.literal(""), z.email("E-mail inválido.").trim().toLowerCase().max(150)]).transform((v) => v || null),
    cep: z
      .string()
      .transform(onlyDigits)
      .refine((v) => v === "" || isValidCep(v), "CEP inválido.")
      .transform((v) => v || null),
    street: optionalText(150),
    number: optionalText(20),
    complement: optionalText(80),
    district: optionalText(80),
    city: optionalText(80),
    uf: z
      .string()
      .trim()
      .toUpperCase()
      .refine((v) => v === "" || (BR_UFS as readonly string[]).includes(v), "UF inválida.")
      .transform((v) => v || null),
    guardianName: z.union([z.literal(""), personName]).transform((v) => v || null),
    guardianCpf: z
      .string()
      .transform(onlyDigits)
      .refine((v) => v === "" || isValidCpf(v), "CPF do responsável inválido.")
      .transform((v) => v || null),
    guardianPhone: z
      .string()
      .transform(onlyDigits)
      .refine((v) => v === "" || isValidPhone(v), "Telefone do responsável inválido.")
      .transform((v) => v || null),
    guardianRelationship: optionalText(40),
    coverage: z.enum(PATIENT_COVERAGE, "Selecione particular ou convênio."),
    insurerName: optionalText(80),
    insurerCardNumber: optionalText(40),
    consentWhatsapp: z.boolean(),
    consentEmail: z.boolean(),
    confirmHomonym: z.boolean(),
  })
  .superRefine((d, ctx) => {
    const today = todayIso();
    if (d.birthDate > today) {
      ctx.addIssue({ code: "custom", path: ["birthDate"], message: "A data de nascimento não pode ser futura." });
    } else if (d.birthDate < "1900-01-01") {
      ctx.addIssue({ code: "custom", path: ["birthDate"], message: "Data de nascimento inválida." });
    } else if (ageFromBirthDate(d.birthDate, today) < AGE_OF_MAJORITY) {
      // Menor de idade: responsável legal obrigatório (LGPD art. 14).
      if (!d.guardianName) ctx.addIssue({ code: "custom", path: ["guardianName"], message: "Paciente menor de idade: informe o responsável legal." });
      if (!d.guardianCpf) ctx.addIssue({ code: "custom", path: ["guardianCpf"], message: "Informe o CPF do responsável." });
      if (!d.guardianRelationship) ctx.addIssue({ code: "custom", path: ["guardianRelationship"], message: "Informe o parentesco." });
    }
    if (d.guardianCpf && d.guardianCpf === d.cpf) {
      ctx.addIssue({ code: "custom", path: ["guardianCpf"], message: "O responsável deve ter CPF diferente do paciente." });
    }
    if (d.coverage === "convenio") {
      if (!d.insurerName) ctx.addIssue({ code: "custom", path: ["insurerName"], message: "Informe o convênio." });
      if (!d.insurerCardNumber) ctx.addIssue({ code: "custom", path: ["insurerCardNumber"], message: "Informe o número da carteirinha." });
    }
    if (d.consentEmail && !d.email) {
      ctx.addIssue({ code: "custom", path: ["email"], message: "Para autorizar mensagens por e-mail, informe o e-mail." });
    }
  })
  .transform((d) =>
    d.coverage === "particular" ? { ...d, insurerName: null, insurerCardNumber: null } : d,
  );

export type PatientFormInput = z.input<typeof patientFormSchema>;
export type PatientFormData = z.output<typeof patientFormSchema>;

/** Campos de texto do formulário (devolvidos ao navegador quando há erro). */
export const PATIENT_TEXT_FIELDS = [
  "fullName", "socialName", "birthDate", "sex", "cpf", "cns", "phone", "email",
  "cep", "street", "number", "complement", "district", "city", "uf",
  "guardianName", "guardianCpf", "guardianPhone", "guardianRelationship",
  "coverage", "insurerName", "insurerCardNumber",
] as const;
export type PatientTextField = (typeof PATIENT_TEXT_FIELDS)[number];

export type PatientFormRaw = Record<PatientTextField, string> & {
  consentWhatsapp: boolean;
  consentEmail: boolean;
  confirmHomonym: boolean;
};

export function readPatientForm(formData: FormData): PatientFormRaw {
  const text = Object.fromEntries(
    PATIENT_TEXT_FIELDS.map((k) => [k, String(formData.get(k) ?? "")]),
  ) as Record<PatientTextField, string>;
  return {
    ...text,
    consentWhatsapp: formData.get("consentWhatsapp") === "on",
    consentEmail: formData.get("consentEmail") === "on",
    confirmHomonym: formData.get("confirmHomonym") === "on",
  };
}
