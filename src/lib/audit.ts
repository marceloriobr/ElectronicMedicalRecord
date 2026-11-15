import "server-only";
import { headers } from "next/headers";
import { db } from "@/db";
import { auditLog, type AuditAction } from "@/db/schema";

export type AuditEntry = {
  userId: number | null;
  action: AuditAction;
  resource: string;
  resourceId?: string | number | null;
  patientId?: number | null;
  /** Somente metadados sem dados pessoais (ex.: nomes de campos alterados, contagens). */
  details?: Record<string, unknown>;
};

/**
 * Grava uma entrada na trilha de auditoria (append-only).
 * NUNCA passe em `details` nomes, CPF, telefones, termos de busca ou conteúdo clínico.
 */
export async function audit(entry: AuditEntry) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  db.insert(auditLog)
    .values({
      at: new Date(),
      userId: entry.userId,
      action: entry.action,
      resource: entry.resource,
      resourceId: entry.resourceId == null ? null : String(entry.resourceId),
      patientId: entry.patientId ?? null,
      ip,
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
      details: entry.details ? JSON.stringify(entry.details) : null,
    })
    .run();
}
