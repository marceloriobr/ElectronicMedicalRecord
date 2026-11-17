import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { BrandPanel } from "@/components/brand-panel";
import { MfaForm } from "@/components/mfa-form";
import { getSessionUser } from "@/lib/auth";
import { getChallenge, MFA_COOKIE, MFA_TTL_MS } from "@/lib/mfa-service";

export const metadata = { title: "Verificação em duas etapas | Prontuário Eletrônico" };

/** 2ª etapa do login: código de 6 dígitos enviado ao e-mail do usuário. */
export default async function VerificarPage() {
  if (await getSessionUser()) redirect("/painel");
  const challenge = getChallenge((await cookies()).get(MFA_COOKIE)?.value);
  if (!challenge) redirect("/?verificacao=expirada");

  return (
    <main className="flex flex-1 flex-col lg:flex-row">
      <BrandPanel subtitle="A verificação em duas etapas protege os dados dos pacientes mesmo que uma senha vaze." />

      <section className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <h1 className="font-serif text-2xl text-petrol">Verificação em duas etapas</h1>
          <p className="mt-2 text-sm text-ink/70">
            Enviamos um código de 6 números para <strong>{challenge.maskedEmail}</strong>. Ele vale por{" "}
            {MFA_TTL_MS / 60_000} minutos.
          </p>
          <MfaForm canResend={challenge.canResend} />
        </div>
      </section>
    </main>
  );
}
