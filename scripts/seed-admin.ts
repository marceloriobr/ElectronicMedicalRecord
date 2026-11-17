/**
 * Cria o primeiro usuário administrador.
 * Uso: EMR_ADMIN_USERNAME=... EMR_ADMIN_NAME=... EMR_ADMIN_EMAIL=... EMR_ADMIN_PASSWORD=... npm run db:seed
 * (ou defina as variáveis no .env.local)
 */
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { users } from "../src/db/schema";
import { createUser, UserError } from "../src/lib/user-service";

const username = (process.env.EMR_ADMIN_USERNAME ?? "admin").trim().toLowerCase();
const name = process.env.EMR_ADMIN_NAME ?? "Administrador do Sistema";
const password = process.env.EMR_ADMIN_PASSWORD;
/** Obrigatório: o código da verificação em duas etapas do login vai para este endereço. */
const email = process.env.EMR_ADMIN_EMAIL?.trim().toLowerCase();

async function main() {
  if (!password) {
    console.error("Defina EMR_ADMIN_PASSWORD (senha provisória forte) no .env.local.");
    process.exit(1);
  }
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error("Defina EMR_ADMIN_EMAIL no .env.local: sem e-mail o administrador não consegue entrar (verificação em duas etapas).");
    process.exit(1);
  }
  if (db.select({ id: users.id }).from(users).where(eq(users.username, username)).get()) {
    console.log(`Usuário "${username}" já existe. Nada a fazer.`);
    return;
  }
  try {
    await createUser({ name, username, email, role: "admin", password, mustChangePassword: true });
    console.log(`Administrador "${username}" criado. A senha deverá ser trocada no primeiro acesso.`);
  } catch (e) {
    if (e instanceof UserError) {
      console.error(e.message);
      process.exit(1);
    }
    throw e;
  }
}

main();
