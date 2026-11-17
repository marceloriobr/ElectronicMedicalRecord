import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users, type UserRole } from "@/db/schema";
import { audit } from "./audit";
import { isPasswordExpired } from "./password-policy";
import { can, type Permission } from "./permissions";

export const SESSION_COOKIE = "emr_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 horas
/** Áreas clínicas: sessão encerrada após este tempo sem nenhuma requisição (CLAUDE.md, seção 5). */
export const CLINICAL_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
/** Evita gravar no banco a cada requisição: atualiza a "última atividade" no máximo 1x por minuto. */
const TOUCH_INTERVAL_MS = 60 * 1000;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  db.delete(sessions).where(lt(sessions.expiresAt, new Date())).run(); // expurgo das sessões vencidas
  db.insert(sessions).values({ id: hashToken(token), userId, expiresAt, lastSeenAt: new Date() }).run();

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Encerra a sessão do cookie. Devolve o id do usuário (para a auditoria do logout), se havia sessão. */
export async function destroySession(): Promise<number | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  let userId: number | null = null;
  if (token) {
    const id = hashToken(token);
    userId = db.select({ userId: sessions.userId }).from(sessions).where(eq(sessions.id, id)).get()?.userId ?? null;
    db.delete(sessions).where(eq(sessions.id, id)).run();
  }
  store.delete(SESSION_COOKIE);
  return userId;
}

export type SessionUser = {
  id: number;
  name: string;
  username: string;
  role: UserRole;
  sessionId: string;
  /** Última atividade ANTES desta requisição (para o encerramento por inatividade). */
  lastSeenAt: Date;
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
      lastSeenAt: sessions.lastSeenAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())))
    .get();

  if (!row || !row.active) return null;

  // Renova a "última atividade" só enquanto a sessão está dentro do limite de inatividade. Passado o
  // limite, o valor antigo é PRESERVADO: assim a área clínica exige novo login mesmo que o usuário
  // navegue antes por uma página não clínica (que, do contrário, zeraria o relógio).
  const now = Date.now();
  const idle = now - row.lastSeenAt.getTime();
  if (idle > TOUCH_INTERVAL_MS && idle <= CLINICAL_IDLE_TIMEOUT_MS) {
    db.update(sessions).set({ lastSeenAt: new Date(now) }).where(eq(sessions.id, sessionId)).run();
  }

  const passwordExpired = isPasswordExpired(row.passwordChangedAt);
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    role: row.role,
    sessionId,
    lastSeenAt: row.lastSeenAt,
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

/**
 * Porta de entrada das áreas clínicas (prontuário, receitas): exige a permissão e encerra a sessão
 * se o usuário ficou mais de 30 minutos sem atividade — em QUALQUER área do sistema (ver getSessionUser).
 */
export async function requireClinicalPermission(permission: Permission): Promise<SessionUser> {
  const user = await requirePermission(permission);
  if (Date.now() - user.lastSeenAt.getTime() > CLINICAL_IDLE_TIMEOUT_MS) {
    // Em Server Components o cookie não pode ser apagado; invalidar a sessão no banco basta.
    db.delete(sessions).where(eq(sessions.id, user.sessionId)).run();
    await audit({ userId: user.id, action: "sessao_expirada", resource: "sessao", details: { motivo: "inatividade" } });
    redirect("/?sessao=expirada");
  }
  return user;
}
