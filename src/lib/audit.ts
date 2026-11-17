import "server-only";
import { headers } from "next/headers";
import { db } from "@/db";
import { auditLog, type AuditAction } from "@/db/schema";
import { clientIpFrom } from "./client-ip";

export type AuditEntry = {
  userId: number | null;
  action: AuditAction;
  resource: string;
  resourceId?: string | number | null;
  patientId?: number | null;
  /** Somente metadados sem dados pessoais (ex.: nomes de campos alterados, contagens). */
  details?: Record<string, unknown>;
};

/** Origem da requisição (lida uma vez, antes de abrir a transação — headers() é assíncrono). */
export type RequestInfo = { ip: string | null; userAgent: string | null };

export async function requestInfo(): Promise<RequestInfo> {
  const h = await headers();
  return { ip: clientIpFrom(h), userAgent: h.get("user-agent")?.slice(0, 300) ?? null };
}

/**
 * Grava (de forma síncrona) uma entrada na trilha de auditoria (append-only).
 * NUNCA passe em `details` nomes, CPF, telefones, termos de busca ou conteúdo clínico.
 */
export function writeAudit(entry: AuditEntry, info: RequestInfo) {
  db.insert(auditLog)
    .values({
      at: new Date(),
      userId: entry.userId,
      action: entry.action,
      resource: entry.resource,
      resourceId: entry.resourceId == null ? null : String(entry.resourceId),
      patientId: entry.patientId ?? null,
      ip: info.ip,
      userAgent: info.userAgent,
      details: entry.details ? JSON.stringify(entry.details) : null,
    })
    .run();
}

/** Auditoria avulsa (leituras, acessos negados). Para ESCRITAS use `audited()`. */
export async function audit(entry: AuditEntry) {
  writeAudit(entry, await requestInfo());
}

/**
 * Executa uma escrita e grava a auditoria NA MESMA TRANSAÇÃO: ou as duas acontecem, ou nenhuma.
 * `work` precisa ser síncrono (better-sqlite3); transações abertas dentro dele viram savepoints.
 * `entry` recebe o resultado e devolve a entrada de auditoria (ou null quando nada mudou).
 */
export async function audited<T>(work: () => T, entry: (result: T) => AuditEntry | null): Promise<T> {
  const info = await requestInfo();
  return db.transaction(() => {
    const result = work();
    const e = entry(result);
    if (e) writeAudit(e, info);
    return result;
  });
}
