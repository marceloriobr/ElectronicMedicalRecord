/**
 * Matriz de permissões por perfil — fonte única da verdade (ver CLAUDE.md, seção 3).
 * Use `can(user.role, "...")` na UI e `requirePermission("...")` (src/lib/auth.ts) no servidor.
 * Na dúvida, não conceda: perfis não listados não têm acesso.
 */
import type { UserRole } from "./roles";

export const PERMISSIONS = {
  "usuarios:gerenciar": ["admin"],
  /** Dados de identificação e contato (nunca dados clínicos). */
  "pacientes:ler": ["admin", "medico", "secretaria"],
  "pacientes:editar": ["admin", "medico", "secretaria"],
  "pacientes:inativar": ["admin", "medico"],
  /** Agenda: administrada pela secretária (todos os médicos) e pelo médico (somente a própria). */
  "agenda:ler": ["medico", "secretaria"],
  "agenda:gerenciar": ["medico", "secretaria"],
  /** Ver e gerenciar a agenda de QUALQUER médico. Sem esta permissão, o médico só acessa a própria. */
  "agenda:todos-medicos": ["secretaria"],
  /** Iniciar/finalizar atendimento (ato médico; além disso, só o médico da consulta). */
  "agenda:atender": ["medico"],
  "auditoria:ler": ["admin"],
} as const satisfies Record<string, readonly UserRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: UserRole, permission: Permission) {
  return (PERMISSIONS[permission] as readonly UserRole[]).includes(role);
}
