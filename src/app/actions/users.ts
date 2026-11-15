"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { USER_ROLES } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { BR_UFS } from "@/lib/br-ufs";
import { createUser, UserError } from "@/lib/user-service";

const schema = z
  .object({
    name: z.string().trim().min(3, "Informe o nome completo.").max(120),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9._-]{3,32}$/, "Use de 3 a 32 caracteres: letras minúsculas, números, ponto, hífen ou _."),
    email: z.union([z.literal(""), z.email("E-mail inválido.").trim().toLowerCase()]),
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
  const admin = await requireUser(["admin"]);

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
    await createUser({
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
  } catch (e) {
    if (e instanceof UserError) {
      return { values, fieldErrors: { [e.field ?? "name"]: e.message } };
    }
    throw e;
  }

  redirect(`/usuarios?criado=${encodeURIComponent(d.username)}`);
}
