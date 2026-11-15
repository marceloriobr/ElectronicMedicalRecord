import Link from "next/link";
import { UserForm } from "@/components/user-form";
import { requirePermission } from "@/lib/auth";

export const metadata = { title: "Novo usuário | Prontuário Eletrônico" };

export default async function NovoUsuarioPage() {
  await requirePermission("usuarios:gerenciar");

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/usuarios" className="text-sm font-semibold text-petrol/70 hover:text-petrol">
        ← Usuários
      </Link>
      <h1 className="mt-2 font-serif text-3xl text-petrol">Novo usuário</h1>
      <p className="mt-1 text-ink/70">Cadastre um administrador, médico(a) ou secretária da clínica.</p>

      <div className="mt-8 rounded-lg border border-brand-gray/60 bg-white p-6 shadow-sm sm:p-8">
        <UserForm />
      </div>
    </div>
  );
}
