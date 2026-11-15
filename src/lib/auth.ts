import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users, type UserRole } from "@/db/schema";
import { audit } from "./audit";
import { isPasswordExpired } from "./password-policy";
import { can, type Permission } from "./permissions";

export const SESSION_COOKIE = "emr_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 horas

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  db.insert(sessions).values({ id: hashToken(token), userId, expiresAt }).run();

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) db.delete(sessions).where(eq(sessions.id, hashToken(token))).run();
  store.delete(SESSION_COOKIE);
}

export type SessionUser = {
  id: number;
  name: string;
  username: string;
  role: UserRole;
  sessionId: string;
  /** Senha provisória ou vencida (mais de 3 meses): precisa ser trocada. */
  passwordChangeRequired: boolean;
  passwordExpired: boolean;
};

/** Lê a sessão do cookie e confere no banco. Retorna null se inválida. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const sessionId = hashToken(token);
  const row = db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      role: users.role,
      active: users.active,
      mustChangePassword: users.mustChangePassword,
      passwordChangedAt: users.passwordChangedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())))
    .get();

  if (!row || !row.active) return null;

  const passwordExpired = isPasswordExpired(row.passwordChangedAt);
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    role: row.role,
    sessionId,
    passwordExpired,
    passwordChangeRequired: row.mustChangePassword || passwordExpired,
  };
});

/**
 * Exige usuário autenticado e com senha em dia.
 * Use no início de toda página e Server Action protegida.
 */
export async function requireUser(roles?: UserRole[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/");
  if (user.passwordChangeRequired) redirect("/alterar-senha");
  if (roles && !roles.includes(user.role)) redirect("/painel?erro=acesso-negado");
  return user;
}

/**
 * Exige usuário autenticado com a permissão indicada (matriz em src/lib/permissions.ts).
 * Acessos negados são registrados na trilha de auditoria.
 * Use no início de toda página e Server Action protegida.
 */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) {
    await audit({ userId: user.id, action: "acesso_negado", resource: "permissao", resourceId: permission });
    redirect("/painel?erro=acesso-negado");
  }
  return user;
}
