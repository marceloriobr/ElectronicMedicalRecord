/**
 * Regras de negócio de usuários e senhas.
 * Sem dependência do Next.js para poder ser usado também pelo script de seed.
 */
import { and, desc, eq, ne, notInArray } from "drizzle-orm";
import { db } from "@/db";
import { mfaChallenges, passwordHistory, sessions, users, type UserRole } from "@/db/schema";
import { hashPassword, verifyPassword } from "./password-hash";
import { PASSWORD_HISTORY_SIZE, passwordPolicyError } from "./password-policy";

export class UserError extends Error {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message);
  }
}

export type NewUserInput = {
  name: string;
  username: string;
  email?: string | null;
  role: UserRole;
  crm?: string | null;
  crmUf?: string | null;
  password: string;
  mustChangePassword?: boolean;
  createdBy?: number | null;
};

export async function createUser(input: NewUserInput) {
  const policyError = passwordPolicyError(input.password, input);
  if (policyError) throw new UserError(policyError, "password");

  if (db.select({ id: users.id }).from(users).where(eq(users.username, input.username)).get()) throw new UserError("Este nome de usuário já está em uso.", "username");
  if (input.email && db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).get()) {
    throw new UserError("Este e-mail já está cadastrado.", "email");
  }

  const passwordHash = await hashPassword(input.password);
  const now = new Date();

  return db.transaction((tx) => {
    const user = tx
      .insert(users)
      .values({
        name: input.name,
        username: input.username,
        email: input.email || null,
        role: input.role,
        crm: input.role === "medico" ? input.crm : null,
        crmUf: input.role === "medico" ? input.crmUf : null,
        passwordHash,
        passwordChangedAt: now,
        mustChangePassword: input.mustChangePassword ?? true,
        createdBy: input.createdBy ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: users.id })
      .get();
    tx.insert(passwordHistory).values({ userId: user.id, passwordHash, createdAt: now }).run();
    return user;
  });
}

/**
 * Troca a senha do usuário, verificando a política e o histórico
 * (não permite repetir nenhuma das últimas PASSWORD_HISTORY_SIZE senhas).
 * Encerra todas as outras sessões do usuário.
 */
export async function changePassword(
  userId: number,
  newPassword: string,
  keepSessionId?: string,
  /** Senha PROVISÓRIA definida pelo administrador: troca obrigatória no próximo acesso e desbloqueio. */
  provisional = false,
) {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) throw new UserError("Usuário não encontrado.");

  const policyError = passwordPolicyError(newPassword, user);
  if (policyError) throw new UserError(policyError, "newPassword");

  const previous = db
    .select({ passwordHash: passwordHistory.passwordHash })
    .from(passwordHistory)
    .where(eq(passwordHistory.userId, userId))
    .orderBy(desc(passwordHistory.createdAt), desc(passwordHistory.id))
    .limit(PASSWORD_HISTORY_SIZE)
    .all()
    .map((h) => h.passwordHash);
  if (!previous.includes(user.passwordHash)) previous.push(user.passwordHash);

  for (const hash of previous) {
    if (await verifyPassword(newPassword, hash)) {
      throw new UserError(
        `A nova senha não pode ser igual a nenhuma das suas ${PASSWORD_HISTORY_SIZE} últimas senhas.`,
        "newPassword",
      );
    }
  }

  const passwordHash = await hashPassword(newPassword);
  const now = new Date();

  db.transaction((tx) => {
    tx.update(users)
      .set({
        passwordHash,
        passwordChangedAt: now,
        mustChangePassword: provisional,
        ...(provisional ? { failedLoginAttempts: 0, lockedUntil: null } : {}),
        updatedAt: now,
      })
      .where(eq(users.id, userId))
      .run();
    tx.insert(passwordHistory).values({ userId, passwordHash, createdAt: now }).run();

    // Mantém só as últimas PASSWORD_HISTORY_SIZE entradas do histórico.
    const keep = tx
      .select({ id: passwordHistory.id })
      .from(passwordHistory)
      .where(eq(passwordHistory.userId, userId))
      .orderBy(desc(passwordHistory.createdAt), desc(passwordHistory.id))
      .limit(PASSWORD_HISTORY_SIZE)
      .all()
      .map((h) => h.id);
    tx.delete(passwordHistory)
      .where(and(eq(passwordHistory.userId, userId), notInArray(passwordHistory.id, keep)))
      .run();

    // Encerra as demais sessões (ex.: outro computador com a senha antiga).
    tx.delete(sessions)
      .where(
        keepSessionId
          ? and(eq(sessions.userId, userId), notInArray(sessions.id, [keepSessionId]))
          : eq(sessions.userId, userId),
      )
      .run();
  });
}

// ---------------------------------------------------------------------------
// Administração de usuários (somente admin — a autorização por perfil fica nas actions)
// ---------------------------------------------------------------------------

function getTarget(id: number) {
  const user = db.select().from(users).where(eq(users.id, id)).get();
  if (!user) throw new UserError("Usuário não encontrado.");
  return user;
}

/** Desativa (encerrando as sessões) ou reativa um usuário. Ninguém desativa a si mesmo. Retorna se mudou. */
export function setUserActive(id: number, active: boolean, actorId: number) {
  const user = getTarget(id);
  if (id === actorId) throw new UserError("Você não pode desativar o seu próprio usuário.");
  if (user.active === active) return false;
  db.transaction((tx) => {
    tx.update(users).set({ active, updatedAt: new Date() }).where(eq(users.id, id)).run();
    if (!active) {
      tx.delete(sessions).where(eq(sessions.userId, id)).run();
      tx.delete(mfaChallenges).where(eq(mfaChallenges.userId, id)).run();
    }
  });
  return true;
}

/** Remove o bloqueio por excesso de tentativas. Retorna se havia bloqueio/tentativas a zerar. */
export function unlockUser(id: number) {
  const user = getTarget(id);
  if (!user.lockedUntil && user.failedLoginAttempts === 0) return false;
  db.update(users).set({ lockedUntil: null, failedLoginAttempts: 0, updatedAt: new Date() }).where(eq(users.id, id)).run();
  return true;
}

/**
 * Define uma senha PROVISÓRIA para outro usuário: troca obrigatória no próximo acesso, desbloqueio e
 * encerramento de todas as sessões dele. A própria senha se troca em "Alterar senha".
 */
export async function resetPassword(id: number, provisionalPassword: string, actorId: number) {
  getTarget(id);
  if (id === actorId) throw new UserError("Para a sua própria senha, use \"Alterar senha\".");
  await changePassword(id, provisionalPassword, undefined, true);
}

/** Altera o e-mail (destino do código da verificação em duas etapas). Retorna se mudou. */
export function updateUserEmail(id: number, email: string) {
  const user = getTarget(id);
  if (user.email === email) return false;
  if (db.select({ id: users.id }).from(users).where(and(eq(users.email, email), ne(users.id, id))).get()) {
    throw new UserError("Este e-mail já está cadastrado.", "email");
  }
  db.transaction((tx) => {
    tx.update(users).set({ email, updatedAt: new Date() }).where(eq(users.id, id)).run();
    tx.delete(mfaChallenges).where(eq(mfaChallenges.userId, id)).run(); // código em trânsito ia para o e-mail antigo
  });
  return true;
}
