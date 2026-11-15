/**
 * Política de senha forte — usada tanto no navegador (indicador de força)
 * quanto no servidor (validação definitiva).
 */

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
/** Validade da senha: 3 meses. */
export const PASSWORD_MAX_AGE_DAYS = 90;
/** Quantas senhas anteriores não podem ser reutilizadas (inclui a atual). */
export const PASSWORD_HISTORY_SIZE = 5;

const COMMON_PASSWORDS = [
  "123456", "1234567", "12345678", "123456789", "1234567890", "senha", "password",
  "qwerty", "abc123", "admin", "mudar", "trocar", "brasil", "clinica", "consultorio",
  "medico", "medica", "doutor", "doutora", "geriatria", "avolio", "veronica",
  "iloveyou", "welcome", "letmein", "abcdef", "111111", "000000",
];

export type PasswordContext = {
  username?: string;
  name?: string;
};

export type PasswordRule = {
  id: string;
  label: string;
  ok: boolean;
};

function normalize(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function evaluatePassword(password: string, ctx: PasswordContext = {}): PasswordRule[] {
  const lower = normalize(password);
  const personalTokens = [ctx.username ?? "", ...(ctx.name ?? "").split(/\s+/)]
    .map(normalize)
    .filter((t) => t.length >= 3);

  return [
    {
      id: "length",
      label: `Pelo menos ${PASSWORD_MIN_LENGTH} caracteres`,
      ok: password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH,
    },
    { id: "upper", label: "Uma letra maiúscula", ok: /\p{Lu}/u.test(password) },
    { id: "lower", label: "Uma letra minúscula", ok: /\p{Ll}/u.test(password) },
    { id: "digit", label: "Um número", ok: /\d/.test(password) },
    { id: "symbol", label: "Um caractere especial (ex.: ! @ # $ %)", ok: /[^\p{L}\d\s]/u.test(password) },
    {
      id: "repeat",
      label: "Sem 3 caracteres iguais seguidos",
      ok: password.length > 0 && !/(.)\1\1/u.test(password),
    },
    {
      id: "personal",
      label: "Não conter seu nome ou usuário",
      ok: password.length > 0 && !personalTokens.some((t) => lower.includes(t)),
    },
    {
      id: "common",
      label: "Não ser uma senha comum",
      ok: password.length > 0 && !COMMON_PASSWORDS.some((c) => lower.includes(c)),
    },
  ];
}

export function isStrongPassword(password: string, ctx: PasswordContext = {}) {
  return evaluatePassword(password, ctx).every((r) => r.ok);
}

/** Mensagem única com as regras que faltam (para o servidor). */
export function passwordPolicyError(password: string, ctx: PasswordContext = {}): string | null {
  const failed = evaluatePassword(password, ctx).filter((r) => !r.ok);
  if (failed.length === 0) return null;
  return "A senha não atende aos requisitos: " + failed.map((r) => r.label.toLowerCase()).join("; ") + ".";
}

/** Pontuação de 0 a 4 para o indicador visual. */
export function passwordScore(password: string, ctx: PasswordContext = {}): 0 | 1 | 2 | 3 | 4 {
  if (!password) return 0;
  const rules = evaluatePassword(password, ctx);
  const passed = rules.filter((r) => r.ok).length;
  if (passed === rules.length) return password.length >= 16 ? 4 : 3;
  if (passed >= rules.length - 2) return 2;
  return 1;
}

export function isPasswordExpired(passwordChangedAt: Date, now = new Date()) {
  const ageMs = now.getTime() - passwordChangedAt.getTime();
  return ageMs > PASSWORD_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}
