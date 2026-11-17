"use client";

import { useActionState } from "react";
import { cancelMfa, resendMfa, verifyMfa, type MfaState } from "@/app/actions/auth";
import { FormField, FormMessage } from "./form-field";
import { inputClass, primaryButtonClass } from "./ui";

export function MfaForm({ canResend }: { canResend: boolean }) {
  const [state, verifyAction, verifying] = useActionState(verifyMfa, {} as MfaState);
  const [resendState, resendAction, resending] = useActionState(resendMfa, {} as MfaState);

  return (
    <div className="mt-8 space-y-5">
      <form action={verifyAction} className="space-y-5" noValidate>
        <FormField id="code" label="Código de verificação" hint="Confira também a caixa de spam.">
          <input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            autoFocus
            className={`${inputClass} text-center font-mono text-2xl tracking-[0.4em]`}
          />
        </FormField>

        <div aria-live="polite">
          {state.message && <FormMessage tone="error">{state.message}</FormMessage>}
        </div>

        <button type="submit" disabled={verifying} className={`${primaryButtonClass} w-full`}>
          {verifying ? "Verificando…" : "Verificar e entrar"}
        </button>
      </form>

      <div className="flex justify-between text-sm">
        {canResend ? (
          <form action={resendAction}>
            <button type="submit" disabled={resending} className="font-semibold text-petrol hover:underline disabled:opacity-60">
              {resending ? "Enviando…" : "Enviar novo código"}
            </button>
          </form>
        ) : (
          <span className="text-ink/60">Limite de reenvios atingido.</span>
        )}
        <form action={cancelMfa}>
          <button type="submit" className="font-semibold text-petrol/70 hover:text-petrol hover:underline">
            Voltar ao login
          </button>
        </form>
      </div>
      <div aria-live="polite">
        {resendState.message && <FormMessage tone={resendState.tone ?? "error"}>{resendState.message}</FormMessage>}
      </div>
    </div>
  );
}
