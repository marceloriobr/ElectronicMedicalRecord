/** Constantes do cadastro de pacientes (sem dependências: usadas no schema, no servidor e no navegador). */

export const PATIENT_SEX = ["feminino", "masculino", "intersexo"] as const;
export type PatientSex = (typeof PATIENT_SEX)[number];
export const PATIENT_SEX_LABELS: Record<PatientSex, string> = {
  feminino: "Feminino",
  masculino: "Masculino",
  intersexo: "Intersexo",
};

export const PATIENT_COVERAGE = ["particular", "convenio"] as const;
export type PatientCoverage = (typeof PATIENT_COVERAGE)[number];
export const PATIENT_COVERAGE_LABELS: Record<PatientCoverage, string> = {
  particular: "Particular",
  convenio: "Convênio",
};

/** Canais de comunicação que exigem consentimento específico (LGPD art. 11, I). */
export const CONSENT_CHANNELS = ["whatsapp", "email"] as const;
export type ConsentChannel = (typeof CONSENT_CHANNELS)[number];
export const CONSENT_CHANNEL_LABELS: Record<ConsentChannel, string> = {
  whatsapp: "WhatsApp",
  email: "E-mail",
};

/**
 * Versão do termo de consentimento apresentado no cadastro.
 * Ao mudar o texto de CONSENT_TERM_TEXT, incremente a versão.
 */
export const CONSENT_TERM_VERSION = "2026-11-v1";
export const CONSENT_TERM_TEXT =
  "Autorizo o consultório a me enviar mensagens administrativas (lembretes, confirmações e " +
  "remarcações de consulta) pelo canal marcado. Mensagens não conterão informações clínicas. " +
  "Posso revogar esta autorização a qualquer momento.";

/** Idade abaixo da qual o responsável legal é obrigatório. */
export const AGE_OF_MAJORITY = 18;

/** Tamanho máximo das listas de busca de pacientes. */
export const PATIENT_SEARCH_LIMIT = 50;
