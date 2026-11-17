import "server-only";
/**
 * Verificação em duas etapas (MFA) por código enviado ao e-mail do usuário.
 *
 * Depois que a senha confere, abre-se um "desafio": um token aleatório vai para um cookie httpOnly e um
 * código de 6 dígitos vai para o e-mail. No banco ficam só o hash do token e o HMAC do código.
 * Limites: validade de 10 min, 5 códigos errados, 3 envios, 60 s entre envios.
 */
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { eq, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { mfaChallenges, users } from "@/db/schema";
import { sendMail } from "./mailer";

export const MFA_COOKIE = "emr_mfa";
export const MFA_TTL_MS = 10 * 60 * 1000;
export const MFA_MAX_ATTEMPTS = 5;
export const MFA_MAX_SENDS = 3;
export const MFA_RESEND_INTERVAL_MS = 60 * 1000;

export class MfaError extends Error {
  constructor(
    message: string,
    public code: "expired" | "wait" | "limit" | "mail",
  ) {
    super(message);
  }
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const hashCode = (token: string, code: string) => createHmac("sha256", token).update(code).digest("hex");
const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

/** "maria.silva@exemplo.com" → "m•••••@exemplo.com" (a tela não precisa do endereço inteiro). */
export function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}•••••@${domain}`;
}

async function sendCode(to: string, code: string) {
  await sendMail({
    to,
    subject: "Código de verificação — Prontuário Eletrônico",
    text:
      `Seu código de verificação é: ${code}\n\n` +
      `Ele vale por ${MFA_TTL_MS / 60_000} minutos e só pode ser usado uma vez.\n` +
      "Se você não tentou entrar no prontuário eletrônico, avise o administrador: alguém pode ter a sua senha.\n",
  });
}

/** Abre o desafio e envia o código. Devolve o token (para o cookie). */
export async function startChallenge(user: { id: number; email: string }) {
  const now = Date.now();
  // Um desafio por usuário; aproveita para expurgar os vencidos.
  db.delete(mfaChallenges)
    .where(or(eq(mfaChallenges.userId, user.id), lt(mfaChallenges.expiresAt, new Date(now))))
    .run();

  const token = randomBytes(32).toString("base64url");
  const code = newCode();
  const id = hashToken(token);
  db.insert(mfaChallenges)
    .values({ id, userId: user.id, codeHash: hashCode(token, code), expiresAt: new Date(now + MFA_TTL_MS), lastSentAt: new Date(now) })
    .run();
  try {
    await sendCode(user.email, code);
  } catch {
    db.delete(mfaChallenges).where(eq(mfaChallenges.id, id)).run();
    throw new MfaError("Não foi possível enviar o código de verificação. Tente novamente ou procure o administrador.", "mail");
  }
  return token;
}

function load(token: string) {
  const row = db
    .select({ c: mfaChallenges, email: users.email, active: users.active })
    .from(mfaChallenges)
    .innerJoin(users, eq(users.id, mfaChallenges.userId))
    .where(eq(mfaChallenges.id, hashToken(token)))
    .get();
  if (!row) return null;
  if (!row.active || !row.email || row.c.expiresAt.getTime() <= Date.now() || row.c.attempts >= MFA_MAX_ATTEMPTS) {
    db.delete(mfaChallenges).where(eq(mfaChallenges.id, row.c.id)).run();
    return null;
  }
  return { ...row.c, email: row.email };
}

/** Dados do desafio para a tela (e-mail mascarado). null = inexistente/vencido. */
export function getChallenge(token: string | undefined) {
  const c = token ? load(token) : null;
  return c && { userId: c.userId, maskedEmail: maskEmail(c.email), canResend: c.sends < MFA_MAX_SENDS };
}

export type VerifyResult =
  | { ok: true; userId: number }
  /** `userId` (quando conhecido) serve só para a auditoria da tentativa. */
  | { ok: false; userId: number | null; expired: boolean; remaining: number };

/** Confere o código. Acerto consome o desafio; 5 erros o invalidam (o usuário volta para a senha). */
export function verifyChallenge(token: string | undefined, code: string): VerifyResult {
  const c = token ? load(token) : null;
  if (!token || !c) return { ok: false, userId: null, expired: true, remaining: 0 };

  const given = Buffer.from(hashCode(token, code));
  const expected = Buffer.from(c.codeHash);
  if (given.length === expected.length && timingSafeEqual(given, expected)) {
    db.delete(mfaChallenges).where(eq(mfaChallenges.id, c.id)).run();
    return { ok: true, userId: c.userId };
  }
  const attempts = c.attempts + 1;
  if (attempts >= MFA_MAX_ATTEMPTS) db.delete(mfaChallenges).where(eq(mfaChallenges.id, c.id)).run();
  else db.update(mfaChallenges).set({ attempts }).where(eq(mfaChallenges.id, c.id)).run();
  return { ok: false, userId: c.userId, expired: attempts >= MFA_MAX_ATTEMPTS, remaining: MFA_MAX_ATTEMPTS - attempts };
}

/** Gera e envia um NOVO código para o mesmo desafio (o anterior deixa de valer). */
export async function resendChallenge(token: string | undefined) {
  const c = token ? load(token) : null;
  if (!token || !c) throw new MfaError("A verificação expirou. Entre novamente com usuário e senha.", "expired");
  if (c.sends >= MFA_MAX_SENDS) throw new MfaError("Limite de reenvios atingido. Entre novamente com usuário e senha.", "limit");
  const wait = c.lastSentAt.getTime() + MFA_RESEND_INTERVAL_MS - Date.now();
  if (wait > 0) throw new MfaError(`Aguarde ${Math.ceil(wait / 1000)} segundos para pedir um novo código.`, "wait");

  const code = newCode();
  db.update(mfaChallenges)
    .set({ codeHash: hashCode(token, code), sends: c.sends + 1, lastSentAt: new Date() })
    .where(eq(mfaChallenges.id, c.id))
    .run();
  try {
    await sendCode(c.email, code);
  } catch {
    throw new MfaError("Não foi possível enviar o código de verificação. Tente novamente em instantes.", "mail");
  }
}

export function cancelChallenge(token: string | undefined) {
  if (token) db.delete(mfaChallenges).where(eq(mfaChallenges.id, hashToken(token))).run();
}
