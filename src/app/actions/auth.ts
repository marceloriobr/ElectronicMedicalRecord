"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, destroySession, getSessionUser } from "@/lib/auth";
import { getDummyHash, verifyPassword } from "@/lib/password-hash";
import { isPasswordExpired } from "@/lib/password-policy";
import { changePassword, UserError } from "@/lib/user-service";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export type LoginState = {
  username?: string;
  message?: string;
  fieldErrors?: { username?: string; password?: string };
};

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const fieldErrors: LoginState["fieldErrors"] = {};
  if (!username) fieldErrors.username = "Informe o usuário.";
  if (!password) fieldErrors.password = "Informe a senha.";
  if (fieldErrors.username || fieldErrors.password) return { username, fieldErrors };

  const invalid: LoginState = { username, message: "Usuário ou senha inválidos." };
  const user = db.select().from(users).where(eq(users.username, username)).get();

  if (!user) {
    await verifyPassword(password, await getDummyHash()); // mesmo tempo de resposta
    return invalid;
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return {
      username,
      message: `Acesso bloqueado temporariamente por excesso de tentativas. Tente novamente em ${LOCK_MINUTES} minutos.`,
    };
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    const attempts = user.failedLoginAttempts + 1;
    const lock = attempts >= MAX_FAILED_ATTEMPTS;
    db.update(users)
      .set({
        failedLoginAttempts: lock ? 0 : attempts,
        lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      })
      .where(eq(users.id, user.id))
      .run();
    return invalid;
  }

  if (!user.active) {
    return { username, message: "Usuário desativado. Procure o administrador." };
  }

  db.update(users)
    .set({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() })
    .where(eq(users.id, user.id))
    .run();
  await createSession(user.id);

  if (user.mustChangePassword || isPasswordExpired(user.passwordChangedAt)) {
    redirect("/alterar-senha");
  }
  redirect("/painel");
}

export async function logout() {
  await destroySession();
  redirect("/");
}

export type ChangePasswordState = {
  message?: string;
  fieldErrors?: { currentPassword?: string; newPassword?: string; confirmPassword?: string };
};

export async function changeOwnPassword(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const session = await getSessionUser();
  if (!session) redirect("/");

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const fieldErrors: ChangePasswordState["fieldErrors"] = {};
  if (!currentPassword) fieldErrors.currentPassword = "Informe a senha atual.";
  if (!newPassword) fieldErrors.newPassword = "Informe a nova senha.";
  if (newPassword !== confirmPassword) fieldErrors.confirmPassword = "As senhas não coincidem.";
  if (Object.keys(fieldErrors).length) return { fieldErrors };

  const user = db.select().from(users).where(eq(users.id, session.id)).get();
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    return { fieldErrors: { currentPassword: "Senha atual incorreta." } };
  }

  try {
    await changePassword(user.id, newPassword, session.sessionId);
  } catch (e) {
    if (e instanceof UserError) return { fieldErrors: { newPassword: e.message } };
    throw e;
  }

  redirect("/painel?senha=alterada");
}
