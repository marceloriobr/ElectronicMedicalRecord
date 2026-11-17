/**
 * Redefine a senha do administrador para a senha provisória do .env.local
 * (EMR_ADMIN_USERNAME / EMR_ADMIN_PASSWORD), desbloqueia o usuário e exige
 * a troca no próximo acesso. Se EMR_ADMIN_EMAIL estiver definido, também grava o e-mail do administrador
 * (destino do código da verificação em duas etapas). Uso: npm run db:reset-admin
 */
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { passwordHistory, users } from "../src/db/schema";
import { hashPassword } from "../src/lib/password-hash";
import { passwordPolicyError } from "../src/lib/password-policy";

async function main() {
  const username = (process.env.EMR_ADMIN_USERNAME ?? "admin").trim().toLowerCase();
  const password = process.env.EMR_ADMIN_PASSWORD;
  if (!password) throw new Error("Defina EMR_ADMIN_PASSWORD no .env.local.");

  const user = db.select().from(users).where(eq(users.username, username)).get();
  if (!user) throw new Error(`Usuário "${username}" não encontrado. Rode npm run db:seed.`);

  const policyError = passwordPolicyError(password, user);
  if (policyError) throw new Error(policyError);

  const email = process.env.EMR_ADMIN_EMAIL?.trim().toLowerCase() || undefined;
  if (!email && !user.email) {
    throw new Error("Defina EMR_ADMIN_EMAIL no .env.local: sem e-mail o administrador não consegue entrar (verificação em duas etapas).");
  }
  const passwordHash = await hashPassword(password);
  const now = new Date();
  db.transaction((tx) => {
    tx.update(users)
      .set({
        passwordHash,
        passwordChangedAt: now,
        mustChangePassword: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
        active: true,
        ...(email ? { email } : {}),
        updatedAt: now,
      })
      .where(eq(users.id, user.id))
      .run();
    tx.insert(passwordHistory).values({ userId: user.id, passwordHash, createdAt: now }).run();
  });
  console.log(`Senha provisória de "${username}" redefinida. Troca obrigatória no próximo acesso.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
