import Link from "next/link";
import { redirect } from "next/navigation";
import { logout } from "@/app/actions/auth";
import { LotusIcon } from "@/components/lotus-icon";
import { getSessionUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { ROLE_LABELS } from "@/lib/roles";

/**
 * Layout das áreas internas. A verificação definitiva de acesso é feita
 * em cada página/action com requireUser(); aqui só montamos o cabeçalho.
 */
export default async function SistemaLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/");

  return (
    <div className="flex flex-1 flex-col">
      <header className="bg-petrol text-cream">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <Link href="/painel" className="flex items-center gap-3">
            <LotusIcon className="h-8 w-8 text-coral" />
            <span className="font-serif uppercase leading-tight tracking-[0.15em] text-gold">
              Dra. Verônica Avolio
              <span className="block text-[0.65rem] tracking-[0.25em] text-gold/70">Prontuário eletrônico</span>
            </span>
          </Link>

          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <Link href="/painel" className="hover:text-gold">
              Painel
            </Link>
            {can(user.role, "agenda:ler") && (
              <Link href="/agenda" className="hover:text-gold">
                Agenda
              </Link>
            )}
            {can(user.role, "agenda:previsao") && (
              <Link href="/agenda/previsao" className="hover:text-gold">
                Previsão
              </Link>
            )}
            {can(user.role, "pacientes:ler") && (
              <Link href="/pacientes" className="hover:text-gold">
                Pacientes
              </Link>
            )}
            {can(user.role, "usuarios:gerenciar") && (
              <Link href="/usuarios" className="hover:text-gold">
                Usuários
              </Link>
            )}
            <Link href="/alterar-senha" className="hover:text-gold">
              Alterar senha
            </Link>
            <span className="hidden h-5 w-px bg-cream/20 sm:block" aria-hidden="true" />
            <span className="text-cream/70">
              {user.name} · {ROLE_LABELS[user.role]}
            </span>
            <form action={logout}>
              <button type="submit" className="font-semibold text-coral hover:text-gold">
                Sair
              </button>
            </form>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">{children}</main>
    </div>
  );
}
