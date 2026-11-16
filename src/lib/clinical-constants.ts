/** Constantes do prontuário e do receituário (sem dependências: usadas no schema, no servidor e no navegador). */

// ---------------------------------------------------------------------------
// Registros clínicos (anamnese / evolução)
// ---------------------------------------------------------------------------

export const RECORD_KINDS = ["anamnese", "evolucao"] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];
export const RECORD_KIND_LABELS: Record<RecordKind, string> = {
  anamnese: "Anamnese (primeira consulta)",
  evolucao: "Evolução (retorno)",
};

export const RECORD_STATUS = ["rascunho", "finalizado"] as const;
export type RecordStatus = (typeof RECORD_STATUS)[number];

/** Campos de texto livre do registro clínico, na ordem de exibição (Res. CFM 1.638/2002). */
export const RECORD_TEXT_FIELDS = [
  { key: "queixaPrincipal", label: "Queixa principal", kinds: ["anamnese", "evolucao"], rows: 2 },
  { key: "hda", label: "História da doença atual", kinds: ["anamnese"], rows: 5 },
  { key: "subjetivo", label: "Subjetivo / intercorrências desde a última consulta", kinds: ["evolucao"], rows: 5 },
  { key: "antecedentesPessoais", label: "Antecedentes pessoais (doenças, cirurgias, internações)", kinds: ["anamnese"], rows: 3 },
  { key: "antecedentesFamiliares", label: "Antecedentes familiares", kinds: ["anamnese"], rows: 2 },
  { key: "habitos", label: "Hábitos de vida (tabagismo, etilismo, atividade física, sono, alimentação)", kinds: ["anamnese"], rows: 2 },
  { key: "revisaoSistemas", label: "Revisão de sistemas / avaliação funcional", kinds: ["anamnese"], rows: 3 },
  { key: "exameFisico", label: "Exame físico", kinds: ["anamnese", "evolucao"], rows: 5 },
  { key: "examesComplementares", label: "Exames complementares (resultados)", kinds: ["anamnese", "evolucao"], rows: 3 },
  { key: "avaliacao", label: "Avaliação / impressão clínica", kinds: ["anamnese", "evolucao"], rows: 3 },
  { key: "plano", label: "Plano terapêutico / conduta", kinds: ["anamnese", "evolucao"], rows: 4 },
] as const satisfies readonly { key: string; label: string; kinds: readonly RecordKind[]; rows: number }[];
export type RecordTextField = (typeof RECORD_TEXT_FIELDS)[number]["key"];

/** Sinais vitais: chave, rótulo, unidade e faixa plausível (para barrar erros de digitação). */
export const VITAL_SIGNS = [
  { key: "paSistolica", label: "PA sistólica", unit: "mmHg", min: 40, max: 300 },
  { key: "paDiastolica", label: "PA diastólica", unit: "mmHg", min: 20, max: 200 },
  { key: "fc", label: "Frequência cardíaca", unit: "bpm", min: 20, max: 250 },
  { key: "fr", label: "Frequência respiratória", unit: "irpm", min: 4, max: 80 },
  { key: "temperatura", label: "Temperatura", unit: "°C", min: 30, max: 45 },
  { key: "spo2", label: "Saturação O₂", unit: "%", min: 50, max: 100 },
  { key: "peso", label: "Peso", unit: "kg", min: 1, max: 400 },
  { key: "altura", label: "Altura", unit: "cm", min: 30, max: 250 },
] as const;
export type VitalSign = (typeof VITAL_SIGNS)[number]["key"];

export const CLINICAL_TEXT_MAX = 10_000;
export const MAX_SECONDARY_CIDS = 10;
export const ADDENDUM_MIN = 10;

// ---------------------------------------------------------------------------
// Receituário
// ---------------------------------------------------------------------------

/**
 * Tipos de receita gerados pelo sistema.
 * - simples: medicamentos sem controle especial (inclui antimicrobianos, impressos em 2 vias).
 * - controle_especial: Receita de Controle Especial em 2 vias (Portaria SVS/MS 344/1998, listas C1, C5
 *   e adendos). As NOTIFICAÇÕES de receita (A, B1, B2, C2, C3) exigem talonário oficial e NÃO são geradas.
 */
export const PRESCRIPTION_TYPES = ["simples", "controle_especial"] as const;
export type PrescriptionType = (typeof PRESCRIPTION_TYPES)[number];
export const PRESCRIPTION_TYPE_LABELS: Record<PrescriptionType, string> = {
  simples: "Receita simples",
  controle_especial: "Receita de controle especial",
};

export const PRESCRIPTION_STATUS = ["emitida", "cancelada"] as const;
export type PrescriptionStatus = (typeof PRESCRIPTION_STATUS)[number];

export const MAX_PRESCRIPTION_ITEMS = 10;
/** Validade da receita de controle especial (Portaria 344/1998, art. 37): 30 dias da emissão. */
export const CONTROLLED_VALIDITY_DAYS = 30;
/** Antimicrobianos (RDC 471/2021): receita em 2 vias, validade de 10 dias. */
export const ANTIMICROBIAL_VALIDITY_DAYS = 10;

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

/**
 * Substâncias que exigem NOTIFICAÇÃO de receita (talonário oficial) — o sistema bloqueia.
 * Lista parcial e conservadora, para alertar nos casos mais comuns; não substitui o julgamento do médico.
 */
const NOTIFICATION_SUBSTANCES: Record<string, string> = {
  // A1/A2 — Notificação de Receita A (amarela)
  morfina: "A1", oxicodona: "A1", metadona: "A1", fentanil: "A1", petidina: "A1", buprenorfina: "A1",
  hidromorfona: "A1", tapentadol: "A1", alfentanila: "A1", remifentanila: "A1", sufentanila: "A1",
  // A3 — Notificação A
  metilfenidato: "A3", lisdexanfetamina: "A3", anfepramona: "A3", femproporex: "A3", modafinila: "A3",
  // B1 — Notificação de Receita B (azul)
  alprazolam: "B1", bromazepam: "B1", clobazam: "B1", clonazepam: "B1", cloxazolam: "B1", diazepam: "B1",
  estazolam: "B1", flunitrazepam: "B1", flurazepam: "B1", lorazepam: "B1", midazolam: "B1",
  nitrazepam: "B1", clordiazepoxido: "B1", zolpidem: "B1", zopiclona: "B1", eszopiclona: "B1",
  fenobarbital: "B1", zaleplona: "B1",
  // B2 — Notificação B2
  sibutramina: "B2",
  // C2 / C3 — notificações especiais
  isotretinoina: "C2", acitretina: "C2", talidomida: "C3",
};

/**
 * Substâncias da lista C1 (e afins) comuns na prática clínica/geriátrica, que exigem Receita de
 * Controle Especial em 2 vias. Lista parcial: usada para impedir que saiam em receita simples.
 */
const CONTROLLED_SUBSTANCES = [
  // antidepressivos
  "amitriptilina", "nortriptilina", "imipramina", "clomipramina", "sertralina", "fluoxetina", "paroxetina",
  "citalopram", "escitalopram", "venlafaxina", "desvenlafaxina", "duloxetina", "mirtazapina", "trazodona",
  "bupropiona", "vortioxetina", "agomelatina", "fluvoxamina",
  // antipsicóticos
  "haloperidol", "risperidona", "quetiapina", "olanzapina", "aripiprazol", "clozapina", "ziprasidona",
  "clorpromazina", "levomepromazina", "periciazina", "paliperidona", "lurasidona", "tioridazina",
  // anticonvulsivantes / estabilizadores
  "carbamazepina", "oxcarbazepina", "valproato", "acido valproico", "divalproato", "lamotrigina",
  "topiramato", "gabapentina", "pregabalina", "levetiracetam", "fenitoina", "primidona", "lacosamida",
  "carbonato de litio", "litio",
  // outros comuns
  "biperideno", "tramadol", "codeina",
];

const ANTIMICROBIAL_HINTS = [
  "amoxicilina", "azitromicina", "cefalexina", "ciprofloxacino", "levofloxacino", "moxifloxacino",
  "claritromicina", "clindamicina", "doxiciclina", "nitrofurantoina", "sulfametoxazol", "metronidazol",
  "cefuroxima", "ceftriaxona", "fosfomicina", "norfloxacino", "penicilina", "ampicilina", "eritromicina",
];

const includesWord = (text: string, term: string) => new RegExp(`(^|[^a-z])${term}([^a-z]|$)`).test(text);

/** Classifica o nome digitado do medicamento (alerta; o servidor usa a mesma função para bloquear). */
export function classifyMedication(name: string): { notification?: string; controlled: boolean; antimicrobial: boolean } {
  const n = norm(name);
  const notif = Object.entries(NOTIFICATION_SUBSTANCES).find(([s]) => includesWord(n, s));
  return {
    notification: notif ? `${notif[0]} (lista ${notif[1]})` : undefined,
    controlled: CONTROLLED_SUBSTANCES.some((s) => includesWord(n, s)),
    antimicrobial: ANTIMICROBIAL_HINTS.some((s) => includesWord(n, s)),
  };
}
