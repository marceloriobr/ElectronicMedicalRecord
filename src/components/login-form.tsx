"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/app/actions/auth";
import { FormField, FormMessage } from "./form-field";
import { PasswordInput } from "./password-input";
import { inputClass, primaryButtonClass } from "./ui";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, {} as LoginState);
  const errors = state.fieldErrors;

  return (
    <form action={formAction} className="mt-8 space-y-5" noValidate>
      <FormField id="username" label="Usuário" error={errors?.username}>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          defaultValue={state.username}
          aria-invalid={!!errors?.username}
          aria-describedby={errors?.username ? "username-error" : undefined}
          className={inputClass}
        />
      </FormField>

      <FormField id="password" label="Senha" error={errors?.password}>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          required
          error={errors?.password}
        />
      </FormField>

      <div aria-live="polite">{state.message && <FormMessage tone="error">{state.message}</FormMessage>}</div>

      <button type="submit" disabled={pending} className={`${primaryButtonClass} w-full`}>
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
