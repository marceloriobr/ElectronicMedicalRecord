/** Constantes da agenda (sem dependências: usadas no schema, no servidor e no navegador). */

export const APPOINTMENT_STATUS = ["agendado", "confirmado", "em_atendimento", "atendido", "faltou", "cancelado"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUS)[number];
export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  em_atendimento: "Em atendimento",
  atendido: "Atendido",
  faltou: "Faltou",
  cancelado: "Cancelado",
};

/** Status que ocupam o horário (os demais liberam o horário para outro agendamento). */
export const BLOCKING_STATUS = ["agendado", "confirmado", "em_atendimento", "atendido"] as const satisfies readonly AppointmentStatus[];

/** Transições permitidas. `atendido`, `faltou` e `cancelado` são finais. */
export const STATUS_TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  agendado: ["confirmado", "em_atendimento", "faltou", "cancelado"],
  confirmado: ["em_atendimento", "faltou", "cancelado"],
  em_atendimento: ["atendido"],
  atendido: [],
  faltou: [],
  cancelado: [],
};

/** Transições que são atos médicos: só o médico responsável pela consulta pode executar. */
export const DOCTOR_ONLY_STATUS: readonly AppointmentStatus[] = ["em_atendimento", "atendido"];

export const APPOINTMENT_TYPES = ["primeira_consulta", "consulta", "retorno"] as const;
export type AppointmentType = (typeof APPOINTMENT_TYPES)[number];
export const APPOINTMENT_TYPE_LABELS: Record<AppointmentType, string> = {
  primeira_consulta: "Primeira consulta",
  consulta: "Consulta",
  retorno: "Retorno",
};

export const APPOINTMENT_DURATIONS = [15, 20, 30, 45, 60, 90] as const;
export const DEFAULT_DURATION = 30;

/** Horário em que a clínica aceita agendamentos (fuso do consultório). */
export const CLINIC_OPEN = "07:00";
export const CLINIC_CLOSE = "20:00";
/** Faixa e intervalo dos horários livres exibidos na agenda do dia. */
export const DAY_VIEW_START = "08:00";
export const DAY_VIEW_END = "18:00";
export const DAY_VIEW_SLOT_MIN = 30;

/** Observação administrativa (nunca clínica). */
export const APPOINTMENT_NOTE_MAX = 140;
