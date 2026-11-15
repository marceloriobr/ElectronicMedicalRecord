"use client";

import { useActionState, useState } from "react";
import { changeOwnPassword, type ChangePasswordState } from "@/app/actions/auth";
import { isStrongPassword } from "@/lib/password-policy";
import { FormField, FormMessage } from "./form-field";
import { PasswordInput } from "./password-input";
import { PasswordStrength } from "./password-strength";
import { primaryButtonClass } from "./ui";

type Props = { username: string; name: string };

export function ChangePasswordForm({ username, name }: Props) {
  const [state, formAction, pending] = useActionState(changeOwnPassword, {} as ChangePasswordState);
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const errors = state.fieldErrors;

  const strong = isStrongPassword(newPassword, { username, name });
  const mismatch = confirm.length > 0 && confirm !== newPassword;

  return (
    <form action={formAction} className="mt-8 space-y-5" noValidate>
      <FormField id="currentPassword" label="Senha atual" error={errors?.currentPassword}>
        <PasswordInput
          id="currentPassword"
          name="currentPassword"
          autoComplete="current-password"
          required
          error={errors?.currentPassword}
        />
      </FormField>

      <FormField id="newPassword" label="Nova senha" error={errors?.newPassword}>
        <PasswordInput
          id="newPassword"
          name="newPassword"
          autoComplete="new-password"
          required
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          error={errors?.newPassword}
        />
        <PasswordStrength password={newPassword} username={username} name={name} />
      </FormField>

      <FormField
        id="confirmPassword"
        label="Confirme a nova senha"
        error={errors?.confirmPassword ?? (mismatch ? "As senhas não coincidem." : undefined)}
      >
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors?.confirmPassword ?? (mismatch ? "mismatch" : undefined)}
        />
      </FormField>

      <div aria-live="polite">{state.message && <FormMessage tone="error">{state.message}</FormMessage>}</div>

      <button
        type="submit"
        disabled={pending || !strong || confirm !== newPassword}
        className={`${primaryButtonClass} w-full disabled:cursor-not-allowed`}
      >
        {pending ? "Salvando…" : "Salvar nova senha"}
      </button>
    </form>
  );
}
