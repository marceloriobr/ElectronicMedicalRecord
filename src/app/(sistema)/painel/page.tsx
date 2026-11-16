import Link from "next/link";
import { FormMessage } from "@/components/form-field";
import { countDay, doctorsFor } from "@/lib/appointment-service";
import { formatBRL } from "@/lib/availability-constants";
import { requireUser } from "@/lib/auth";
import { todayIso } from "@/lib/br-docs";
import { financeSummary } from "@/lib/forecast-service";
import { can } from "@/lib/permissions";
import { ROLE_LABELS } from "@/lib/roles";

export const metadata = { title: "Painel | Prontuário Eletrônico" };

export default async function PainelPage({ searchParams }: PageProps<"/painel">) {
  const user = await requireUser();
  const params = await searchParams;

  return (
    <div className="space-y-6">
      {params.senha === "alterada" && <FormMessage tone="success">Senha alterada com sucesso.</FormMessage>}
      {params.erro === "acesso-negado" && (
        <FormMessage tone="error">Você não tem permissão para acessar aquela página.</FormMessage>
      )}

      <div>
        <h1 className="font-serif text-3xl text-petrol">Olá, {user.name.split(" ")[0]}</h1>
        <p className="mt-1 text-ink/70">Perfil: {ROLE_LABELS[user.role]}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {can(user.role, "agenda:ler") && (
          <Link
            href="/agenda"
            className="rounded-lg border border-brand-gray/60 bg-white p-5 shadow-sm transition hover:border-petrol/50 hover:shadow"
          >
            <h2 className="font-serif text-lg text-petrol">Agenda</h2>
            <p className="mt-1 text-sm text-ink/70" data-testid="painel-agenda">
              {(() => {
                const n = countDay(user, todayIso());
                return n === 0 ? "Nenhuma consulta hoje." : `${n} consulta(s) hoje.`;
              })()}
            </p>
          </Link>
        )}
        {can(user.role, "agenda:previsao") && <FinanceCard doctorIds={doctorsFor(user).map((d) => d.id)} own={user.role === "medico"} />}
        {can(user.role, "pacientes:ler") && (
          <Link
            href="/pacientes"
            className="rounded-lg border border-brand-gray/60 bg-white p-5 shadow-sm transition hover:border-petrol/50 hover:shadow"
          >
            <h2 className="font-serif text-lg text-petrol">Pacientes</h2>
            <p className="mt-1 text-sm text-ink/70">Cadastre, busque e atualize os dados dos pacientes.</p>
          </Link>
        )}
        {can(user.role, "usuarios:gerenciar") && (
          <Link
            href="/usuarios"
            className="rounded-lg border border-brand-gray/60 bg-white p-5 shadow-sm transition hover:border-petrol/50 hover:shadow"
          >
            <h2 className="font-serif text-lg text-petrol">Usuários</h2>
            <p className="mt-1 text-sm text-ink/70">Cadastre médicos, secretárias e administradores.</p>
          </Link>
        )}
      </div>
    </div>
  );
}

/** Visão financeira dos próximos 3 meses (médico: a própria agenda; secretária: todos os médicos). */
function FinanceCard({ doctorIds, own }: { doctorIds: number[]; own: boolean }) {
  const f = financeSummary(doctorIds, 3);
  return (
    <Link
      href="/agenda/previsao"
      className="rounded-lg border border-brand-gray/60 bg-white p-5 shadow-sm transition hover:border-petrol/50 hover:shadow sm:col-span-2 lg:col-span-1"
      data-testid="painel-financeiro"
    >
      <h2 className="font-serif text-lg text-petrol">Visão financeira · próximos 3 meses</h2>
      {f.configured === 0 ? (
        <p className="mt-1 text-sm text-ink/70">
          {own ? "Configure sua disponibilidade e o valor da consulta para ver a previsão." : "Nenhum médico configurou a disponibilidade ainda."}
        </p>
      ) : (
        <>
          <dl className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs text-ink/60">Receita agendada</dt>
              <dd className="font-serif text-xl tabular-nums text-petrol">{formatBRL(f.scheduledCents)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink/60">Potencial ({f.free} livres)</dt>
              <dd className="font-serif text-xl tabular-nums text-coral-dark">{formatBRL(f.potentialCents)}</dd>
            </div>
          </dl>
          {f.pricesMissing && <p className="mt-2 text-xs text-amber-800">Há médico sem valor de consulta configurado.</p>}
          <p className="mt-2 text-sm font-semibold text-petrol">Ver previsão e oportunidades →</p>
        </>
      )}
    </Link>
  );
}
