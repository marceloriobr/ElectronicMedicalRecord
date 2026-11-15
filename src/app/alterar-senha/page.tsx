import Link from "next/link";
import { redirect } from "next/navigation";
import { logout } from "@/app/actions/auth";
import { BrandPanel } from "@/components/brand-panel";
import { ChangePasswordForm } from "@/components/change-password-form";
import { FormMessage } from "@/components/form-field";
import { getSessionUser } from "@/lib/auth";
import { PASSWORD_HISTORY_SIZE, PASSWORD_MAX_AGE_DAYS } from "@/lib/password-policy";

export const metadata = { title: "Alterar senha | Prontuário Eletrônico" };

export default async function ChangePasswordPage() {
  const user = await getSessionUser();
  if (!user) redirect("/");

  let notice: string | null = null;
  if (user.passwordExpired) {
    notice = `Sua senha tem mais de ${PASSWORD_MAX_AGE_DAYS} dias (3 meses). Por segurança, crie uma nova senha para continuar.`;
  } else if (user.passwordChangeRequired) {
    notice = "Este é seu primeiro acesso ou sua senha foi redefinida. Crie uma senha pessoal para continuar.";
  }

  return (
    <main className="flex flex-1 flex-col lg:flex-row">
      <BrandPanel subtitle="Senhas fortes protegem os dados dos pacientes." />

      <section className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <h1 className="font-serif text-2xl text-petrol">Alterar senha</h1>
          <p className="mt-2 text-sm text-ink/70">
            Olá, {user.name.split(" ")[0]}. A nova senha deve ser diferente das suas {PASSWORD_HISTORY_SIZE}{" "}
            últimas senhas e vale por {PASSWORD_MAX_AGE_DAYS} dias.
          </p>
          {notice && (
            <div className="mt-4">
              <FormMessage tone="error">{notice}</FormMessage>
            </div>
          )}

          <ChangePasswordForm username={user.username} name={user.name} />

          <div className="mt-6 flex justify-between text-sm">
            {user.passwordChangeRequired ? (
              <span />
            ) : (
              <Link href="/painel" className="font-semibold text-petrol hover:underline">
                ← Voltar ao painel
              </Link>
            )}
            <form action={logout}>
              <button type="submit" className="font-semibold text-petrol/70 hover:text-petrol hover:underline">
                Sair
              </button>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
