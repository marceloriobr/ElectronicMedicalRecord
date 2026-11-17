"use server";
/** Server Actions da disponibilidade dos médicos e da alta do acompanhamento. */
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit, audited } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { DISCHARGE_REASONS, MAX_WINDOWS_PER_DAY, parseMoneyToCents, PRICE_FIELDS } from "@/lib/availability-constants";
import { isTime } from "@/lib/clinic-time";
import { dischargePatient, ForecastError, saveSchedule, validateWindows, type Prices, type Window } from "@/lib/forecast-service";

export type ScheduleFormState = { fieldErrors?: Record<string, string>; message?: string };

const time = z.string().refine(isTime, "Horário inválido.");

/** Salva a grade semanal do PRÓPRIO médico. Faixas chegam como w.<dia>.<n>.start / .end. */
export async function saveScheduleAction(_prev: ScheduleFormState, formData: FormData): Promise<ScheduleFormState> {
  const user = await requirePermission("agenda:disponibilidade");

  const slot = z.coerce.number().int().safeParse(formData.get("slotMinutes"));
  if (!slot.success) return { fieldErrors: { slotMinutes: "Selecione a duração da consulta." } };

  const windows: Window[] = [];
  const fieldErrors: Record<string, string> = {};
  for (let wd = 0; wd <= 6; wd++) {
    for (let n = 0; n < MAX_WINDOWS_PER_DAY + 1; n++) {
      const start = String(formData.get(`w.${wd}.${n}.start`) ?? "");
      const end = String(formData.get(`w.${wd}.${n}.end`) ?? "");
      if (!start && !end) continue;
      if (!time.safeParse(start).success || !time.safeParse(end).success) {
        fieldErrors[`day.${wd}`] = "Informe início e fim da faixa.";
        continue;
      }
      windows.push({ weekday: wd, start, end });
    }
  }
  const prices = {} as Prices;
  for (const f of PRICE_FIELDS) {
    const cents = parseMoneyToCents(String(formData.get(f.name) ?? ""));
    if (cents === null) fieldErrors[f.name] = "Valor inválido (ex.: 350,00).";
    else prices[f.type] = cents;
  }
  // Mostra todos os problemas de uma vez (valores e horários), não um por tentativa.
  Object.assign(fieldErrors, { ...validateWindows(slot.data, windows), ...fieldErrors });
  if (Object.keys(fieldErrors).length) return { fieldErrors, message: "Corrija os campos destacados." };

  try {
    await audited(
      () => saveSchedule(user.id, { slotMinutes: slot.data, prices, windows }, user.id),
      // Configuração da agenda: sem dado de paciente.
      () => ({
        userId: user.id,
        action: "alterar",
        resource: "disponibilidade",
        resourceId: user.id,
        details: { duracao: slot.data, faixas: windows.length, valores: true },
      }),
    );
  } catch (e) {
    if (e instanceof ForecastError) {
      return { fieldErrors: (e as ForecastError & { fieldErrors?: Record<string, string> }).fieldErrors, message: e.message };
    }
    throw e;
  }
  redirect("/agenda/previsao?ok=disponibilidade");
}

export type DischargeState = { message?: string };

const dischargeSchema = z.object({
  patientId: z.coerce.number().int().positive(),
  reason: z.enum(DISCHARGE_REASONS, "Selecione o motivo da alta."),
  meses: z.enum(["3", "6"]).catch("3"),
});

/** Alta do acompanhamento (ato médico): o paciente deixa de ser sinalizado até voltar a ser atendido. */
export async function dischargeAction(_prev: DischargeState, formData: FormData): Promise<DischargeState> {
  const user = await requirePermission("pacientes:alta");
  const parsed = dischargeSchema.safeParse({
    patientId: formData.get("patientId"),
    reason: formData.get("reason"),
    meses: formData.get("meses"),
  });
  if (!parsed.success) return { message: parsed.error.issues[0].message };
  const { patientId, reason, meses } = parsed.data;

  try {
    await audited(
      () => dischargePatient(patientId, user.id, reason, user.id),
      (id) => ({ userId: user.id, action: "criar", resource: "alta", resourceId: id, patientId, details: { motivo: reason } }),
    );
  } catch (e) {
    if (e instanceof ForecastError) {
      if (e.code === "forbidden") await audit({ userId: user.id, action: "acesso_negado", resource: "alta", patientId });
      return { message: e.message };
    }
    throw e;
  }
  redirect(`/agenda/previsao?meses=${meses}&ok=alta`);
}
