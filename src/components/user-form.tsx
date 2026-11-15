"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createUserAction, type CreateUserState } from "@/app/actions/users";
import { BR_UFS } from "@/lib/br-ufs";
import { isStrongPassword } from "@/lib/password-policy";
import { ROLE_LABELS, USER_ROLES } from "@/lib/roles";
import { FormField, FormMessage } from "./form-field";
import { PasswordInput } from "./password-input";
import { PasswordStrength } from "./password-strength";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "./ui";

const ROLE_DESCRIPTIONS = {
  admin: "Gerencia usuários e configurações do sistema.",
  medico: "Acessa e registra prontuários, prescrições e evoluções.",
  secretaria: "Agenda, cadastro de pacientes e recepção.",
} as const;

export function UserForm() {
  const [state, formAction, pending] = useActionState(createUserAction, {} as CreateUserState);
  const v = state.values ?? {};
  const errors = state.fieldErrors ?? {};

  const [role, setRole] = useState(v.role ?? "");
  const [name, setName] = useState(v.name ?? "");
  const [username, setUsername] = useState(v.username ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const strong = isStrongPassword(password, { username, name });
  const mismatch = confirm.length > 0 && confirm !== password;
  const invalid = (k: keyof typeof errors) => ({
    "aria-invalid": !!errors[k],
    "aria-describedby": errors[k] ? `${k}-error` : undefined,
  });

  return (
    <form action={formAction} className="space-y-8" noValidate>
      <fieldset className="space-y-5">
        <legend className="mb-4 font-serif text-lg text-petrol">Dados pessoais</legend>

        <FormField id="name" label="Nome completo" error={errors.name}>
          <input
            id="name"
            name="name"
            required
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            {...invalid("name")}
          />
        </FormField>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            id="username"
            label="Usuário (login)"
            error={errors.username}
            hint="Letras minúsculas, números, ponto, hífen ou _"
          >
            <input
              id="username"
              name="username"
              required
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              className={inputClass}
              {...invalid("username")}
            />
          </FormField>

          <FormField id="email" label="E-mail (opcional)" error={errors.email}>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="off"
              defaultValue={v.email}
              className={inputClass}
              {...invalid("email")}
            />
          </FormField>
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-4 font-serif text-lg text-petrol">Perfil de acesso</legend>
        <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-describedby={errors.role ? "role-error" : undefined}>
          {USER_ROLES.map((r) => (
            <label
              key={r}
              className={`cursor-pointer rounded-md border bg-white p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-petrol/30 ${
                role === r ? "border-petrol ring-1 ring-petrol" : "border-brand-gray hover:border-petrol/50"
              }`}
            >
              <input
                type="radio"
                name="role"
                value={r}
                checked={role === r}
                onChange={() => setRole(r)}
                className="sr-only"
              />
              <span className="block font-semibold text-petrol">{ROLE_LABELS[r]}</span>
              <span className="mt-1 block text-xs text-ink/60">{ROLE_DESCRIPTIONS[r]}</span>
            </label>
          ))}
        </div>
        {errors.role && (
          <p id="role-error" className="mt-1 text-sm text-coral-dark">
            {errors.role}
          </p>
        )}

        {role === "medico" && (
          <div className="mt-5 grid gap-5 sm:grid-cols-[1fr_8rem]">
            <FormField id="crm" label="CRM" error={errors.crm}>
              <input
                id="crm"
                name="crm"
                inputMode="numeric"
                required
                defaultValue={v.crm}
                className={inputClass}
                {...invalid("crm")}
              />
            </FormField>
            <FormField id="crmUf" label="UF" error={errors.crmUf}>
              <select
                id="crmUf"
                name="crmUf"
                required
                defaultValue={v.crmUf || "RJ"}
                className={inputClass}
                {...invalid("crmUf")}
              >
                {BR_UFS.map((uf) => (
                  <option key={uf}>{uf}</option>
                ))}
              </select>
            </FormField>
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-5">
        <legend className="mb-1 font-serif text-lg text-petrol">Senha provisória</legend>
        <p className="text-sm text-ink/70">
          O usuário será obrigado a criar uma nova senha no primeiro acesso.
        </p>

        <FormField id="password" label="Senha" error={errors.password}>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
          />
          <PasswordStrength password={password} username={username} name={name} />
        </FormField>

        <FormField
          id="confirmPassword"
          label="Confirme a senha"
          error={errors.confirmPassword ?? (mismatch ? "As senhas não coincidem." : undefined)}
        >
          <PasswordInput
            id="confirmPassword"
            name="confirmPassword"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={errors.confirmPassword ?? (mismatch ? "mismatch" : undefined)}
          />
        </FormField>
      </fieldset>

      <div aria-live="polite">{state.message && <FormMessage tone="error">{state.message}</FormMessage>}</div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link href="/usuarios" className={secondaryButtonClass}>
          Cancelar
        </Link>
        <button
          type="submit"
          disabled={pending || !strong || confirm !== password || !role}
          className={`${primaryButtonClass} disabled:cursor-not-allowed`}
        >
          {pending ? "Salvando…" : "Cadastrar usuário"}
        </button>
      </div>
    </form>
  );
}
