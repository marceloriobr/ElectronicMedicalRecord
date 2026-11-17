import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { Badge } from "@/components/badge";
import { FormMessage } from "@/components/form-field";
import { UserAdminForms } from "@/components/user-admin-forms";
import { requirePermission } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/roles";

export const metadata = { title: "Usuário | Prontuário Eletrônico" };

const OK: Record<string, string> = {
  desativado: "Usuário desativado. As sessões dele foram encerradas.",
  reativado: "Usuário reativado.",
  desbloqueado: "Usuário desbloqueado.",
  senha: "Senha provisória definida. O usuário deverá trocá-la no próximo acesso.",
  email: "E-mail atualizado.",
};

/** Administração de um usuário: e-mail, bloqueio, senha provisória e desativação (somente admin). */
export default async function UsuarioPage({ params, searchParams }: PageProps<"/usuarios/[id]">) {
  const admin = await requirePermission("usuarios:gerenciar");
  const { id: rawId } = await params;
  if (!/^\d{1,10}$/.test(rawId)) notFound();
  const u = db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      email: users.email,
      role: users.role,
      crm: users.crm,
      crmUf: users.crmUf,
      active: users.active,
      lockedUntil: users.lockedUntil,
      failedLoginAttempts: users.failedLoginAttempts,
    })
    .from(users)
    .where(eq(users.id, Number(rawId)))
    .get();
  if (!u) notFound();
  const { ok } = await searchParams;
  const locked = !!u.lockedUntil && u.lockedUntil > new Date();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/usuarios" className="text-sm font-semibold text-petrol/70 hover:text-petrol">
          ← Usuários
        </Link>
        <h1 className="mt-2 font-serif text-3xl text-petrol">{u.name}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-ink/70">
          <span className="font-mono text-sm">{u.username}</span> · {ROLE_LABELS[u.role]}
          {u.crm && (
            <span>
              · CRM {u.crm}/{u.crmUf}
            </span>
          )}
          {!u.active && <Badge tone="muted">Desativado</Badge>}
          {locked && <Badge tone="warn">Bloqueado</Badge>}
        </p>
      </div>

      {typeof ok === "string" && OK[ok] && <FormMessage tone="success">{OK[ok]}</FormMessage>}

      <UserAdminForms
        user={{ id: u.id, name: u.name, username: u.username, email: u.email ?? "", active: u.active }}
        locked={locked || u.failedLoginAttempts > 0}
        self={u.id === admin.id}
      />
    </div>
  );
}
