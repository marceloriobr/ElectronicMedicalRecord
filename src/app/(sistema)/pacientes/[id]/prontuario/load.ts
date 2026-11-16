import "server-only";
import { notFound } from "next/navigation";
import { ClinicalError } from "@/lib/clinical-service";

/** Converte o parâmetro da rota em id numérico; 404 se inválido. */
export function routeId(raw: string) {
  if (!/^\d{1,10}$/.test(raw)) notFound();
  return Number(raw);
}

/** Executa a leitura e transforma "não encontrado"/"sem acesso ao registro" em 404 (não revela existência). */
export function orNotFound<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof ClinicalError) notFound();
    throw e;
  }
}
