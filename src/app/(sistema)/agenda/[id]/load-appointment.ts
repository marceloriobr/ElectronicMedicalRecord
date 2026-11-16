import "server-only";
import { notFound, redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { canManageDoctor, getAppointmentDetail, type Actor } from "@/lib/appointment-service";

/**
 * Lê a consulta do parâmetro da rota e aplica a autorização POR REGISTRO:
 * médico só abre consultas da própria agenda. 404 para id inválido/inexistente.
 */
export async function loadAppointmentFor(actor: Actor, rawId: string) {
  if (!/^\d{1,10}$/.test(rawId)) notFound();
  const detail = getAppointmentDetail(Number(rawId));
  if (!detail) notFound();
  if (!canManageDoctor(actor, detail.a.doctorId)) {
    await audit({ userId: actor.id, action: "acesso_negado", resource: "consulta", resourceId: detail.a.id });
    redirect("/painel?erro=acesso-negado");
  }
  return detail;
}
