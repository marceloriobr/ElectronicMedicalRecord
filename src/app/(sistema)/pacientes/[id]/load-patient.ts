import "server-only";
import { notFound } from "next/navigation";
import { getPatient } from "@/lib/patient-service";

/** Lê o paciente a partir do parâmetro da rota; 404 se o id for inválido ou inexistente. */
export function loadPatient(rawId: string) {
  if (!/^\d{1,10}$/.test(rawId)) notFound();
  const patient = getPatient(Number(rawId));
  if (!patient) notFound();
  return patient;
}
