import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { USER_ROLES } from "../lib/roles";

export { USER_ROLES, ROLE_LABELS, type UserRole } from "../lib/roles";

const now = sql`(unixepoch() * 1000)`;

/** Cadastro de usuários do sistema. */
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  username: text("username").notNull().unique(),
  email: text("email").unique(),
  role: text("role", { enum: USER_ROLES }).notNull(),
  /** Obrigatório para médicos. */
  crm: text("crm"),
  crmUf: text("crm_uf"),
  passwordHash: text("password_hash").notNull(),
  passwordChangedAt: integer("password_changed_at", { mode: "timestamp_ms" }).notNull().default(now),
  /** Força a troca no próximo login (ex.: senha provisória definida pelo administrador). */
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(true),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  lockedUntil: integer("locked_until", { mode: "timestamp_ms" }),
  lastLoginAt: integer("last_login_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(now),
  createdBy: integer("created_by"),
}, (t) => [
  check("users_role_check", sql`${t.role} in ('admin', 'medico', 'secretaria')`),
  check("users_medico_crm_check", sql`${t.role} <> 'medico' or (${t.crm} is not null and ${t.crmUf} is not null)`),
]);

/** Histórico de senhas, para impedir a reutilização de senhas anteriores. */
export const passwordHistory = sqliteTable(
  "password_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    passwordHash: text("password_hash").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [index("password_history_user_idx").on(t.userId)],
);

/** Sessões ativas. O cookie guarda o token; aqui fica apenas o hash SHA-256 dele. */
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(now),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export type User = typeof users.$inferSelect;
