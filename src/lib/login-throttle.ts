import "server-only";
/**
 * Limite de tentativas de login por ORIGEM (IP), além do bloqueio por usuário (5 erros → 15 min).
 * Conta as falhas (`login_falho`) gravadas na trilha de auditoria: sem tabela extra e vale após reinício.
 * Um consultório inteiro costuma sair pelo mesmo IP, então o limite é folgado para uso legítimo.
 */
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog } from "@/db/schema";

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_MAX_FAILURES_PER_IP = 30;

export function tooManyLoginFailures(ip: string | null, nowMs = Date.now()) {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(auditLog)
    .where(
      and(
        gt(auditLog.at, new Date(nowMs - LOGIN_WINDOW_MS)),
        eq(auditLog.action, "login_falho"),
        ip === null ? isNull(auditLog.ip) : eq(auditLog.ip, ip),
      ),
    )
    .get();
  return (row?.n ?? 0) >= LOGIN_MAX_FAILURES_PER_IP;
}
