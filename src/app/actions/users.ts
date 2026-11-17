"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { USER_ROLES } from "@/db/schema";
import { audit, audited } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { BR_UFS } from "@/lib/br-ufs";
import { HashBusyError } from "@/lib/password-hash";
import { createUser, resetPassword, setUserActive, unlockUser, updateUserEmail, UserError } from "@/lib/user-service";

const schema = z
  .object({
    name: z.string().trim().min(3, "Informe o nome completo.").max(120),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9._-]{3,32}$/, "Use de 3 a 32 caracteres: letras minúsculas, números, ponto, hífen ou _."),
    // Obrigatório: é para este endereço que vai o código da verificação em duas etapas.
    email: z.email("Informe um e-mail válido (ele recebe o código de verificação do login).").trim().toLowerCase().max(160),
    role: z.enum(USER_ROLES, "Selecione o perfil."),
    crm: z.string().trim(),
    crmUf: z.string().trim().toUpperCase(),
    password: z.string(),
    confirmPassword: z.string(),
  })
  .superRefine((d, ctx) => {
    if (d.password !== d.confirmPassword) {
      ctx.addIssue({ code: "custom", path: ["confirmPassword"], message: "As senhas não coincidem." });
    }
    if (d.role === "medico") {
      if (!/^\d{4,7}$/.test(d.crm)) {
        ctx.addIssue({ code: "custom", path: ["crm"], message: "Informe o CRM (somente números)." });
      }
      if (!(BR_UFS as readonly string[]).includes(d.crmUf)) {
        ctx.addIssue({ code: "custom", path: ["crmUf"], message: "Selecione a UF do CRM." });
      }
    }
  });

type Fields = z.input<typeof schema>;

export type CreateUserState = {
  values?: Partial<Record<"name" | "username" | "email" | "role" | "crm" | "crmUf", string>>;
  message?: string;
  fieldErrors?: Partial<Record<keyof Fields, string>>;
};

export async function createUserAction(
  _prev: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  const admin = await requirePermission("usuarios:gerenciar");

  const raw = {
    name: String(formData.get("name") ?? ""),
    username: String(formData.get("username") ?? ""),
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? ""),
    crm: String(formData.get("crm") ?? ""),
    crmUf: String(formData.get("crmUf") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  };
  // Devolvidos ao formulário em caso de erro (nunca as senhas).
  const values = { name: raw.name, username: raw.username, email: raw.email, role: raw.role, crm: raw.crm, crmUf: raw.crmUf };

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error).fieldErrors;
    const fieldErrors = Object.fromEntries(
      Object.entries(flat).map(([k, v]) => [k, v?.[0]]),
    ) as CreateUserState["fieldErrors"];
    return { values, fieldErrors };
  }

  const d = parsed.data;
  try {
    const created = await createUser({
      name: d.name,
      username: d.username,
      email: d.email || null,
      role: d.role,
      crm: d.crm || null,
      crmUf: d.crmUf || null,
      password: d.password,
      mustChangePassword: true, // senha provisória: troca obrigatória no 1º acesso
      createdBy: admin.id,
    });
    await audit({ userId: admin.id, action: "criar", resource: "usuario", resourceId: created.id, details: { perfil: d.role } });
  } catch (e) {
    if (e instanceof UserError) {
      return { values, fieldErrors: { [e.field ?? "name"]: e.message } };
    }
    if (e instanceof HashBusyError) return { values, message: e.message };
    throw e;
  }

  redirect(`/usuarios?criado=${encodeURIComponent(d.username)}`);
}

// ---------------------------------------------------------------------------
// Administração de um usuário existente (somente admin; tudo auditado)
// ---------------------------------------------------------------------------

export type UserAdminState = { message?: string; tone?: "error" | "success"; fieldErrors?: { email?: string; password?: string } };

const userId = z.coerce.number().int().positive();

/** Desativa (encerra as sessões) ou reativa. Usuários nunca são excluídos: preserva a autoria dos registros. */
export async function setUserActiveAction(_prev: UserAdminState, formData: FormData): Promise<UserAdminState> {
  const admin = await requirePermission("usuarios:gerenciar");
  const id = userId.safeParse(formData.get("id"));
  if (!id.success) return { tone: "error", message: "Usuário inválido." };
  const active = formData.get("active") === "1";
  try {
    await audited(
      () => setUserActive(id.data, active, admin.id),
      (changed) => (changed ? { userId: admin.id, action: active ? "reativar" : "inativar", resource: "usuario", resourceId: id.data } : null),
    );
  } catch (e) {
    if (e instanceof UserError) return { tone: "error", message: e.message };
    throw e;
  }
  redirect(`/usuarios/${id.data}?ok=${active ? "reativado" : "desativado"}`);
}

export async function unlockUserAction(_prev: UserAdminState, formData: FormData): Promise<UserAdminState> {
  const admin = await requirePermission("usuarios:gerenciar");
  const id = userId.safeParse(formData.get("id"));
  if (!id.success) return { tone: "error", message: "Usuário inválido." };
  try {
    await audited(
      () => unlockUser(id.data),
      (changed) => (changed ? { userId: admin.id, action: "desbloquear", resource: "usuario", resourceId: id.data } : null),
    );
  } catch (e) {
    if (e instanceof UserError) return { tone: "error", message: e.message };
    throw e;
  }
  redirect(`/usuarios/${id.data}?ok=desbloqueado`);
}

/** Senha provisória: o usuário é obrigado a trocá-la no próximo acesso; sessões dele são encerradas. */
export async function resetPasswordAction(_prev: UserAdminState, formData: FormData): Promise<UserAdminState> {
  const admin = await requirePermission("usuarios:gerenciar");
  const id = userId.safeParse(formData.get("id"));
  if (!id.success) return { tone: "error", message: "Usuário inválido." };
  const password = String(formData.get("password") ?? "");
  if (password !== String(formData.get("confirmPassword") ?? "")) {
    return { tone: "error", fieldErrors: { password: "As senhas não coincidem." } };
  }
  try {
    await resetPassword(id.data, password, admin.id);
    await audit({ userId: admin.id, action: "redefinir_senha", resource: "usuario", resourceId: id.data });
  } catch (e) {
    if (e instanceof UserError) return { tone: "error", ...(e.field ? { fieldErrors: { password: e.message } } : { message: e.message }) };
    if (e instanceof HashBusyError) return { tone: "error", message: e.message };
    throw e;
  }
  redirect(`/usuarios/${id.data}?ok=senha`);
}

export async function updateUserEmailAction(_prev: UserAdminState, formData: FormData): Promise<UserAdminState> {
  const admin = await requirePermission("usuarios:gerenciar");
  const id = userId.safeParse(formData.get("id"));
  if (!id.success) return { tone: "error", message: "Usuário inválido." };
  const email = z.email().trim().toLowerCase().max(160).safeParse(String(formData.get("email") ?? ""));
  if (!email.success) return { tone: "error", fieldErrors: { email: "Informe um e-mail válido." } };
  try {
    await audited(
      () => updateUserEmail(id.data, email.data),
      // Só o NOME do campo alterado — o endereço não vai para a trilha.
      (changed) => (changed ? { userId: admin.id, action: "alterar", resource: "usuario", resourceId: id.data, details: { campos: ["email"] } } : null),
    );
  } catch (e) {
    if (e instanceof UserError) return { tone: "error", fieldErrors: { email: e.message } };
    throw e;
  }
  redirect(`/usuarios/${id.data}?ok=email`);
}
