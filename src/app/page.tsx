import { redirect } from "next/navigation";
import { BrandPanel } from "@/components/brand-panel";
import { FormMessage } from "@/components/form-field";
import { LoginForm } from "@/components/login-form";
import { getSessionUser } from "@/lib/auth";

export default async function LoginPage({ searchParams }: PageProps<"/">) {
  const { sessao, verificacao } = await searchParams;
  const user = await getSessionUser();
  if (user) redirect(user.passwordChangeRequired ? "/alterar-senha" : "/painel");

  return (
    <main className="flex flex-1 flex-col lg:flex-row">
      <BrandPanel subtitle="Prontuário eletrônico do consultório. Acesso restrito à equipe autorizada." />

      <section className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <h1 className="font-serif text-2xl text-petrol">Acesso ao prontuário</h1>
          <p className="mt-2 text-sm text-ink/70">Entre com seu usuário e senha para continuar.</p>
          {sessao === "expirada" && (
            <div className="mt-4">
              <FormMessage tone="error">Sua sessão foi encerrada por inatividade. Entre novamente.</FormMessage>
            </div>
          )}
          {verificacao === "expirada" && (
            <div className="mt-4">
              <FormMessage tone="error">A verificação em duas etapas expirou ou foi cancelada. Entre novamente.</FormMessage>
            </div>
          )}
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
