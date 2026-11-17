"use client";

import { useActionState, useState } from "react";
import {
  resetPasswordAction,
  setUserActiveAction,
  unlockUserAction,
  updateUserEmailAction,
  type UserAdminState,
} from "@/app/actions/users";
import { isStrongPassword } from "@/lib/password-policy";
import { FormField, FormMessage } from "./form-field";
import { PasswordInput } from "./password-input";
import { PasswordStrength } from "./password-strength";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "./ui";

const cardClass = "rounded-lg border border-brand-gray/60 bg-white p-6 shadow-sm";
const titleClass = "font-serif text-lg text-petrol";
const empty = {} as UserAdminState;

type Props = {
  user: { id: number; name: string; username: string; email: string; active: boolean };
  /** Bloqueado ou com tentativas erradas acumuladas. */
  locked: boolean;
  /** O administrador está vendo o próprio cadastro: não pode se desativar nem redefinir a própria senha aqui. */
  self: boolean;
};

export function UserAdminForms({ user, locked, self }: Props) {
  const [emailState, emailAction, savingEmail] = useActionState(updateUserEmailAction, empty);
  const [unlockState, unlockAction, unlocking] = useActionState(unlockUserAction, empty);
  const [resetState, resetAction, resetting] = useActionState(resetPasswordAction, empty);
  const [activeState, activeAction, toggling] = useActionState(setUserActiveAction, empty);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const strong = isStrongPassword(password, { username: user.username, name: user.name });

  return (
    <>
      <section className={cardClass}>
        <h2 className={titleClass}>E-mail da verificação em duas etapas</h2>
        <form action={emailAction} className="mt-4 space-y-4" noValidate>
          <input type="hidden" name="id" value={user.id} />
          <FormField
            id="email"
            label="E-mail"
            error={emailState.fieldErrors?.email}
            hint={user.email ? "O código de cada login é enviado para este endereço." : "Sem e-mail, o usuário não consegue entrar."}
          >
            <input id="email" name="email" type="email" required maxLength={160} defaultValue={user.email} className={inputClass} />
          </FormField>
          {emailState.message && <FormMessage tone="error">{emailState.message}</FormMessage>}
          <button type="submit" disabled={savingEmail} className={secondaryButtonClass}>
            {savingEmail ? "Salvando…" : "Salvar e-mail"}
          </button>
        </form>
      </section>

      {locked && (
        <section className={cardClass}>
          <h2 className={titleClass}>Bloqueio por tentativas incorretas</h2>
          <p className="mt-2 text-sm text-ink/70">
            Confirme com a pessoa que foi ela quem errou a senha. Se não foi, redefina a senha em vez de só desbloquear.
          </p>
          <form action={unlockAction} className="mt-4 space-y-3">
            <input type="hidden" name="id" value={user.id} />
            {unlockState.message && <FormMessage tone="error">{unlockState.message}</FormMessage>}
            <button type="submit" disabled={unlocking} className={secondaryButtonClass}>
              {unlocking ? "Desbloqueando…" : "Desbloquear usuário"}
            </button>
          </form>
        </section>
      )}

      {!self && (
        <section className={cardClass}>
          <h2 className={titleClass}>Redefinir senha provisória</h2>
          <p className="mt-2 text-sm text-ink/70">
            O usuário será obrigado a criar uma senha pessoal no próximo acesso. As sessões abertas dele são encerradas.
          </p>
          <form action={resetAction} className="mt-4 space-y-4" noValidate>
            <input type="hidden" name="id" value={user.id} />
            <FormField id="password" label="Senha provisória" error={resetState.fieldErrors?.password}>
              <PasswordInput
                id="password"
                name="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={resetState.fieldErrors?.password}
              />
            </FormField>
            <PasswordStrength password={password} username={user.username} name={user.name} />
            <FormField id="confirmPassword" label="Confirmar senha provisória">
              <PasswordInput
                id="confirmPassword"
                name="confirmPassword"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </FormField>
            {resetState.message && <FormMessage tone="error">{resetState.message}</FormMessage>}
            <button type="submit" disabled={resetting || !strong || confirm !== password} className={primaryButtonClass}>
              {resetting ? "Redefinindo… (alguns segundos)" : "Redefinir senha"}
            </button>
          </form>
        </section>
      )}

      {!self && (
        <section className={cardClass}>
          <h2 className={titleClass}>{user.active ? "Desativar usuário" : "Reativar usuário"}</h2>
          <p className="mt-2 text-sm text-ink/70">
            {user.active
              ? "O usuário perde o acesso imediatamente. O cadastro é preservado, porque identifica a autoria dos registros."
              : "O usuário volta a poder entrar com a senha que já tinha."}
          </p>
          <form action={activeAction} className="mt-4 space-y-3">
            <input type="hidden" name="id" value={user.id} />
            <input type="hidden" name="active" value={user.active ? "0" : "1"} />
            {activeState.message && <FormMessage tone="error">{activeState.message}</FormMessage>}
            <button type="submit" disabled={toggling} className={secondaryButtonClass}>
              {toggling ? "Salvando…" : user.active ? "Desativar usuário" : "Reativar usuário"}
            </button>
          </form>
        </section>
      )}
    </>
  );
}
