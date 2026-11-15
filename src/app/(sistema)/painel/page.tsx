import Link from "next/link";
import { FormMessage } from "@/components/form-field";
import { requireUser } from "@/lib/auth";
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
        <div className="rounded-lg border border-dashed border-brand-gray bg-white/50 p-5">
          <h2 className="font-serif text-lg text-petrol/60">Agenda</h2>
          <p className="mt-1 text-sm text-ink/50">Em breve.</p>
        </div>
      </div>
    </div>
  );
}
