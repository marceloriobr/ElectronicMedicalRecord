"use client";

import Link from "next/link";
import { useActionState } from "react";
import { searchPatientsAction, type PatientSearchState } from "@/app/actions/patients";
import type { PatientRow } from "@/lib/patient-service";
import { Badge } from "./badge";
import { FormMessage } from "./form-field";
import { inputClass, primaryButtonClass } from "./ui";

/**
 * Busca de pacientes. O termo é enviado por POST (Server Action) e nunca entra na URL.
 * As linhas chegam do servidor com CPF e telefone já mascarados.
 */
export function PatientSearch({ recent }: { recent: PatientRow[] }) {
  const [state, formAction, pending] = useActionState(searchPatientsAction, {} as PatientSearchState);
  const rows = state.searched ? (state.results ?? []) : recent;

  return (
    <div className="space-y-4">
      <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end" role="search" autoComplete="off">
        <div className="flex-1">
          <label htmlFor="q" className="sr-only">
            Buscar paciente
          </label>
          <input
            key={`q-${state.term}`}
            defaultValue={state.term}
            id="q"
            name="q"
            type="search"
            placeholder="Buscar por nome, nome social ou CPF completo"
            className={inputClass}
            autoComplete="off"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink/80 sm:pb-3">
          <input type="checkbox" name="inativos" defaultChecked={state.includeInactive} className="h-4 w-4 accent-petrol" />
          Incluir inativos
        </label>
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Buscando…" : "Buscar"}
        </button>
      </form>

      {state.message && <FormMessage tone="error">{state.message}</FormMessage>}

      <p className="text-sm text-ink/60" aria-live="polite">
        {state.searched ? `${rows.length} paciente(s) encontrado(s).` : "Atualizados recentemente:"}
      </p>

      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-brand-gray/60 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-petrol/5 text-petrol">
              <tr>
                <th className="px-4 py-3 font-semibold">Paciente</th>
                <th className="px-4 py-3 font-semibold">Nascimento</th>
                <th className="px-4 py-3 font-semibold">CPF</th>
                <th className="px-4 py-3 font-semibold">Telefone</th>
                <th className="px-4 py-3 font-semibold">Atendimento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-gray/40">
              {rows.map((p) => (
                <tr key={p.id} className={p.active ? "hover:bg-petrol/5" : "text-ink/50 hover:bg-petrol/5"}>
                  <td className="px-4 py-3">
                    <Link href={`/pacientes/${p.id}`} className="font-semibold text-petrol hover:underline">
                      {p.displayName}
                    </Link>
                    {p.civilName && <span className="block text-xs text-ink/60">Nome civil: {p.civilName}</span>}
                    {!p.active && (
                      <span className="mt-1 block">
                        <Badge tone="muted">Inativo</Badge>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {p.birthDate}
                    <span className="block text-xs text-ink/60">{p.age} anos</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{p.cpf}</td>
                  <td className="px-4 py-3 font-mono text-xs">{p.phone}</td>
                  <td className="px-4 py-3">{p.coverage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-brand-gray bg-white/50 p-6 text-center text-ink/60">
          {state.searched ? "Nenhum paciente encontrado." : "Nenhum paciente cadastrado ainda."}
        </p>
      )}
    </div>
  );
}
