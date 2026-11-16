/** Constantes da disponibilidade dos médicos e da previsão de agenda (sem dependências: schema, servidor e navegador). */
import { APPOINTMENT_DURATIONS, CLINIC_CLOSE, CLINIC_OPEN } from "./appointment-constants";

/** 0 = domingo … 6 = sábado (mesma convenção de Date.getUTCDay). */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const;
export const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;
export const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

/** Durações de consulta configuráveis: as mesmas aceitas pelo agendamento. */
export const SLOT_MINUTES = APPOINTMENT_DURATIONS;
export const MAX_WINDOWS_PER_DAY = 3;
export { CLINIC_CLOSE, CLINIC_OPEN };

/** Horizontes da previsão, em meses. */
export const FORECAST_HORIZONS = [3, 6] as const;
export type ForecastHorizon = (typeof FORECAST_HORIZONS)[number];

/** Paciente "em acompanhamento há mais de" este número de meses, sem alta e sem consulta marcada: sinalizar. */
export const FOLLOW_UP_MONTHS = 6;

/** Motivos de alta (categorias administrativas — nunca texto clínico livre). */
export const DISCHARGE_REASONS = ["alta_medica", "encaminhado", "desistencia", "obito", "outro"] as const;
export type DischargeReason = (typeof DISCHARGE_REASONS)[number];
export const DISCHARGE_REASON_LABELS: Record<DischargeReason, string> = {
  alta_medica: "Alta médica",
  encaminhado: "Encaminhado a outro serviço",
  desistencia: "Desistência / mudou de médico",
  obito: "Óbito",
  outro: "Outro motivo",
};

/** Tipos de consulta com valor configurável, na ordem de exibição. */
export const PRICE_FIELDS = [
  { type: "primeira_consulta", name: "priceFirst", label: "Primeira consulta" },
  { type: "consulta", name: "price", label: "Consulta" },
  { type: "retorno", name: "priceReturn", label: "Retorno" },
] as const;
export const MAX_PRICE_CENTS = 10_000_000; // R$ 100.000,00

/** "R$ 1.250,50" | "350" | "350,5" → centavos; "" → 0; inválido → null. */
export function parseMoneyToCents(raw: string): number | null {
  const v = raw.replace(/R\$|\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "");
  if (v === "") return 0;
  if (!/^\d{1,6}(,\d{1,2})?$/.test(v)) return null;
  const [int, dec = ""] = v.split(",");
  const cents = Number(int) * 100 + Number(dec.padEnd(2, "0"));
  return cents <= MAX_PRICE_CENTS ? cents : null;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const formatBRL = (cents: number) => brl.format(cents / 100);
/** Centavos → "350,00" (valor de campo de formulário). */
export const centsToInput = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
