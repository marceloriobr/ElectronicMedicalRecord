/**
 * Datas e horas no fuso do consultório (America/Sao_Paulo).
 * No banco tudo fica em UTC (timestamp_ms); a conversão acontece só na entrada e na exibição.
 */
import { CLINIC_TIME_ZONE } from "./br-docs";

const partsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: CLINIC_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function zonedParts(date: Date) {
  const p = Object.fromEntries(partsFmt.formatToParts(date).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, second: Number(p.second) };
}

/** Diferença (ms) entre o relógio do consultório e UTC naquele instante. */
function offsetAt(ms: number) {
  const z = zonedParts(new Date(ms));
  const [y, mo, d] = z.date.split("-").map(Number);
  const [h, mi] = z.time.split(":").map(Number);
  return Date.UTC(y, mo - 1, d, h, mi, z.second) - Math.floor(ms / 1000) * 1000;
}

/** "2026-11-20" + "09:30" no fuso do consultório → Date (UTC). */
export function clinicDateTime(date: string, time: string) {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const first = guess - offsetAt(guess);
  // Segunda passada cobre mudanças de horário de verão, caso voltem a existir.
  return new Date(guess - offsetAt(first));
}

/** Date → { date: "AAAA-MM-DD", time: "HH:MM" } no fuso do consultório. */
export function toClinic(date: Date) {
  const { date: d, time } = zonedParts(date);
  return { date: d, time };
}

/** Início e fim (exclusivo) do dia do consultório, em UTC. */
export function clinicDayRange(date: string) {
  return { start: clinicDateTime(date, "00:00"), end: clinicDateTime(addDays(date, 1), "00:00") };
}

export function addDays(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function addMinutes(time: string, minutes: number) {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** AAAA-MM-DD de uma data que existe (rejeita 2026-02-30, que o JS "rolaria" para março). */
export const isIsoDate = (v: unknown): v is string =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(v + "T00:00:00Z")) &&
  new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v;

export const isTime = (v: unknown): v is string => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

const weekdayFmt = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });
/** "2026-11-20" → "Sexta-feira, 20 de novembro de 2026" */
export function longDate(date: string) {
  const s = weekdayFmt.format(new Date(date + "T12:00:00Z"));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Instante atual (ms). Isolado em função porque as páginas da agenda são renderizadas
 * no servidor a cada requisição (dinâmicas): ler o relógio ali é intencional.
 */
export function nowMs() {
  return Date.now();
}
