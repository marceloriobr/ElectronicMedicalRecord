"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { audit, requestInfo, writeAudit } from "@/lib/audit";
import { createSession, destroySession, getSessionUser } from "@/lib/auth";
import { tooManyLoginFailures } from "@/lib/login-throttle";
import {
  cancelChallenge,
  MFA_COOKIE,
  MFA_TTL_MS,
  MfaError,
  resendChallenge,
  startChallenge,
  verifyChallenge,
} from "@/lib/mfa-service";
import { getDummyHash, HashBusyError, verifyPassword } from "@/lib/password-hash";
import { isPasswordExpired } from "@/lib/password-policy";
import { changePassword, UserError } from "@/lib/user-service";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export type LoginState = {
  username?: string;
  message?: string;
  fieldErrors?: { username?: string; password?: string };
};

/**
 * 1ª etapa do login: usuário e senha. Se conferem, envia o código por e-mail e segue para /verificar.
 *
 * A resposta para "usuário não existe", "senha errada" e "usuário bloqueado" é a MESMA (mensagem e tempo
 * de cálculo): quem tenta adivinhar não descobre quais contas existem.
 */
export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim().toLowerCase().slice(0, 64);
  const password = String(formData.get("password") ?? "").slice(0, 256);

  const fieldErrors: LoginState["fieldErrors"] = {};
  if (!username) fieldErrors.username = "Informe o usuário.";
  if (!password) fieldErrors.password = "Informe a senha.";
  if (fieldErrors.username || fieldErrors.password) return { username, fieldErrors };

  const info = await requestInfo();
  // Limite por origem ANTES de qualquer cálculo de senha (que é caro de propósito).
  if (tooManyLoginFailures(info.ip)) {
    return { username, message: "Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente." };
  }

  const invalid: LoginState = {
    username,
    message: `Usuário ou senha inválidos. Após ${MAX_FAILED_ATTEMPTS} tentativas incorretas, o acesso fica bloqueado por ${LOCK_MINUTES} minutos.`,
  };
  /** Registra a falha (sem o usuário digitado: pode ser um dado pessoal ou até a senha, por engano). */
  const fail = (userId: number | null, motivo: string, state: LoginState = invalid) => {
    writeAudit({ userId, action: "login_falho", resource: "sessao", details: { motivo } }, info);
    return state;
  };

  const user = db.select().from(users).where(eq(users.username, username)).get();
  let passwordOk: boolean;
  try {
    // Sempre calcula um hash, exista ou não o usuário, esteja ou não bloqueado: mesmo tempo de resposta.
    passwordOk = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));
  } catch (e) {
    if (e instanceof HashBusyError) return { username, message: e.message };
    throw e;
  }
  if (!user) return fail(null, "credenciais");
  if (user.lockedUntil && user.lockedUntil > new Date()) return fail(user.id, "bloqueado");

  if (!passwordOk) {
    const attempts = user.failedLoginAttempts + 1;
    const lock = attempts >= MAX_FAILED_ATTEMPTS;
    db.update(users)
      .set({
        failedLoginAttempts: lock ? 0 : attempts,
        lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      })
      .where(eq(users.id, user.id))
      .run();
    return fail(user.id, lock ? "bloqueio" : "credenciais");
  }

  // Daqui em diante a senha está correta: as mensagens podem ser específicas.
  if (!user.active) {
    return fail(user.id, "desativado", { username, message: "Usuário desativado. Procure o administrador." });
  }
  db.update(users).set({ failedLoginAttempts: 0, lockedUntil: null }).where(eq(users.id, user.id)).run();

  if (!user.email) {
    return fail(user.id, "sem_email", {
      username,
      message: "Seu cadastro não tem e-mail para a verificação em duas etapas. Procure o administrador.",
    });
  }

  let token: string;
  try {
    token = await startChallenge({ id: user.id, email: user.email });
  } catch (e) {
    if (e instanceof MfaError) return { username, message: e.message };
    throw e;
  }
  (await cookies()).set(MFA_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MFA_TTL_MS / 1000,
  });
  redirect("/verificar");
}

export type MfaState = { message?: string; tone?: "error" | "success" };

/** 2ª etapa do login: código enviado por e-mail. Só aqui a sessão é criada. */
export async function verifyMfa(_prev: MfaState, formData: FormData): Promise<MfaState> {
  const store = await cookies();
  const token = store.get(MFA_COOKIE)?.value;
  const code = String(formData.get("code") ?? "").replace(/\D/g, "");
  if (code.length !== 6) return { tone: "error", message: "Digite os 6 números do código." };

  const info = await requestInfo();
  if (tooManyLoginFailures(info.ip)) {
    return { tone: "error", message: "Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente." };
  }

  const result = verifyChallenge(token, code);
  if (!result.ok) {
    writeAudit({ userId: result.userId, action: "login_falho", resource: "sessao", details: { motivo: "codigo" } }, info);
    if (result.expired) {
      store.delete(MFA_COOKIE);
      redirect("/?verificacao=expirada");
    }
    return { tone: "error", message: `Código incorreto. Restam ${result.remaining} tentativa(s).` };
  }

  const user = db.select().from(users).where(eq(users.id, result.userId)).get();
  store.delete(MFA_COOKIE);
  if (!user || !user.active) redirect("/");

  db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id)).run();
  await createSession(user.id);
  writeAudit({ userId: user.id, action: "login", resource: "sessao" }, info);

  if (user.mustChangePassword || isPasswordExpired(user.passwordChangedAt)) redirect("/alterar-senha");
  redirect("/painel");
}

export async function resendMfa(_prev: MfaState): Promise<MfaState> {
  void _prev;
  const store = await cookies();
  try {
    await resendChallenge(store.get(MFA_COOKIE)?.value);
  } catch (e) {
    if (e instanceof MfaError) {
      if (e.code === "expired" || e.code === "limit") {
        cancelChallenge(store.get(MFA_COOKIE)?.value);
        store.delete(MFA_COOKIE);
        redirect("/?verificacao=expirada");
      }
      return { tone: "error", message: e.message };
    }
    throw e;
  }
  return { tone: "success", message: "Enviamos um novo código. O anterior deixou de valer." };
}

/** Desiste da verificação e volta para a tela de login. */
export async function cancelMfa() {
  const store = await cookies();
  cancelChallenge(store.get(MFA_COOKIE)?.value);
  store.delete(MFA_COOKIE);
  redirect("/");
}

export async function logout() {
  const info = await requestInfo();
  const userId = await destroySession();
  if (userId !== null) writeAudit({ userId, action: "logout", resource: "sessao" }, info);
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
  try {
    if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
      return { fieldErrors: { currentPassword: "Senha atual incorreta." } };
    }
    await changePassword(user.id, newPassword, session.sessionId);
  } catch (e) {
    if (e instanceof UserError) return { fieldErrors: { newPassword: e.message } };
    if (e instanceof HashBusyError) return { message: e.message };
    throw e;
  }
  await audit({ userId: user.id, action: "trocar_senha", resource: "usuario", resourceId: user.id });

  redirect("/painel?senha=alterada");
}
