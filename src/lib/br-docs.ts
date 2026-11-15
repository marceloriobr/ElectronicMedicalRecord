/**
 * Validação, formatação e mascaramento de documentos e dados brasileiros.
 * Sem dependências de servidor: usado tanto no navegador (máscaras) quanto no servidor (validação).
 */

export const onlyDigits = (v: string) => v.replace(/\D/g, "");

/** CPF: 11 dígitos, não repetidos, com os 2 dígitos verificadores corretos. */
export function isValidCpf(value: string) {
  const d = onlyDigits(value);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const n of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Number(d[i]) * (n + 1 - i);
    if (((sum * 10) % 11) % 10 !== Number(d[n])) return false;
  }
  return true;
}

/** Cartão Nacional de Saúde (CNS): 15 dígitos, começa com 1, 2, 7, 8 ou 9 e soma ponderada múltipla de 11. */
export function isValidCns(value: string) {
  const d = onlyDigits(value);
  if (d.length !== 15 || !"12789".includes(d[0])) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) sum += Number(d[i]) * (15 - i);
  return sum % 11 === 0;
}

/** Telefone com DDD: fixo (10 dígitos) ou celular (11 dígitos, começando com 9). */
export function isValidPhone(value: string) {
  const d = onlyDigits(value);
  if (!/^[1-9][1-9]/.test(d)) return false;
  return d.length === 10 ? /^[2-5]$/.test(d[2]) : d.length === 11 && d[2] === "9";
}

export const isValidCep = (value: string) => onlyDigits(value).length === 8;

// ---------- formatação progressiva (enquanto digita) ----------

export function formatCpf(value: string) {
  const d = onlyDigits(value).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}

export function formatPhone(value: string) {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  const ddd = `(${d.slice(0, 2)}) `;
  const rest = d.slice(2);
  if (rest.length <= 4) return ddd + rest;
  const split = d.length === 11 ? 5 : 4;
  return `${ddd}${rest.slice(0, split)}-${rest.slice(split)}`;
}

export function formatCep(value: string) {
  const d = onlyDigits(value).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export function formatCns(value: string) {
  const d = onlyDigits(value).slice(0, 15);
  return d.replace(/^(\d{3})(\d{0,4})(\d{0,4})(\d{0,4}).*/, (_, a, b, c, e) => [a, b, c, e].filter(Boolean).join(" "));
}

// ---------- mascaramento para listagens (LGPD: minimização na exibição) ----------

/** "123.456.789-09" → "***.456.789-**" */
export function maskCpf(value: string) {
  const d = onlyDigits(value);
  return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : "***";
}

/** "(21) 98765-4321" → "(21) *****-4321" */
export function maskPhone(value: string) {
  const d = onlyDigits(value);
  if (d.length < 10) return "****";
  return `(${d.slice(0, 2)}) ${"*".repeat(d.length - 6)}-${d.slice(-4)}`;
}

// ---------- datas (fuso do consultório) ----------

export const CLINIC_TIME_ZONE = "America/Sao_Paulo";

/** Data de hoje (AAAA-MM-DD) no fuso do consultório. */
export function todayIso(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CLINIC_TIME_ZONE }).format(now);
}

/** Idade completa em anos para uma data AAAA-MM-DD. */
export function ageFromBirthDate(birthDate: string, today = todayIso()) {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

/** "1950-03-07" → "07/03/1950" */
export function formatDateBr(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** Nome em minúsculas, sem acentos e com espaços simples — usado na busca. */
export function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
