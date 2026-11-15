export const USER_ROLES = ["admin", "medico", "secretaria"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  medico: "Médico(a)",
  secretaria: "Secretária",
};
