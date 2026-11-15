/**
 * Regras de negócio de usuários e senhas.
 * Sem dependência do Next.js para poder ser usado também pelo script de seed.
 */
import { and, desc, eq, notInArray } from "drizzle-orm";
import { db } from "@/db";
import { passwordHistory, sessions, users, type UserRole } from "@/db/schema";
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
export async function changePassword(userId: number, newPassword: string, keepSessionId?: string) {
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
      .set({ passwordHash, passwordChangedAt: now, mustChangePassword: false, updatedAt: now })
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
