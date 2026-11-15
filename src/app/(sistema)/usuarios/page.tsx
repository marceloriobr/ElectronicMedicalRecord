import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { Badge } from "@/components/badge";
import { FormMessage } from "@/components/form-field";
import { primaryButtonClass } from "@/components/ui";
import { requirePermission } from "@/lib/auth";
import { isPasswordExpired } from "@/lib/password-policy";
import { ROLE_LABELS } from "@/lib/roles";

export const metadata = { title: "Usuários | Prontuário Eletrônico" };

const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export default async function UsuariosPage({ searchParams }: PageProps<"/usuarios">) {
  await requirePermission("usuarios:gerenciar");
  const { criado } = await searchParams;

  const list = db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      email: users.email,
      role: users.role,
      crm: users.crm,
      crmUf: users.crmUf,
      active: users.active,
      mustChangePassword: users.mustChangePassword,
      passwordChangedAt: users.passwordChangedAt,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .orderBy(asc(users.name))
    .all();

  return (
    <div className="space-y-6">
      {typeof criado === "string" && (
        <FormMessage tone="success">
          Usuário <strong>{criado}</strong> cadastrado. Ele deverá trocar a senha provisória no primeiro acesso.
        </FormMessage>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl text-petrol">Usuários</h1>
          <p className="mt-1 text-ink/70">{list.length} cadastrado(s)</p>
        </div>
        <Link href="/usuarios/novo" className={primaryButtonClass}>
          + Novo usuário
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-brand-gray/60 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-petrol/5 text-petrol">
            <tr>
              <th className="px-4 py-3 font-semibold">Nome</th>
              <th className="px-4 py-3 font-semibold">Usuário</th>
              <th className="px-4 py-3 font-semibold">Perfil</th>
              <th className="px-4 py-3 font-semibold">Situação da senha</th>
              <th className="px-4 py-3 font-semibold">Último acesso</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-gray/40">
            {list.map((u) => {
              const expired = isPasswordExpired(u.passwordChangedAt);
              return (
                <tr key={u.id} className={u.active ? "" : "text-ink/40"}>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-ink">{u.name}</span>
                    {u.email && <span className="block text-xs text-ink/60">{u.email}</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{u.username}</td>
                  <td className="px-4 py-3">
                    {ROLE_LABELS[u.role]}
                    {u.crm && (
                      <span className="block text-xs text-ink/60">
                        CRM {u.crm}/{u.crmUf}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {!u.active ? (
                      <Badge tone="muted">Desativado</Badge>
                    ) : u.mustChangePassword ? (
                      <Badge tone="warn">Provisória</Badge>
                    ) : expired ? (
                      <Badge tone="warn">Vencida</Badge>
                    ) : (
                      <Badge tone="ok">Em dia</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink/70">
                    {u.lastLoginAt ? dateFmt.format(u.lastLoginAt) : "Nunca acessou"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}