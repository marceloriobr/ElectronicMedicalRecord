"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import {
  APPOINTMENT_DURATIONS,
  APPOINTMENT_NOTE_MAX,
  APPOINTMENT_STATUS,
  APPOINTMENT_TYPES,
} from "@/lib/appointment-constants";
import {
  AppointmentError,
  changeAppointmentStatus,
  createAppointment,
  rescheduleAppointment,
} from "@/lib/appointment-service";
import { formatDateBr } from "@/lib/br-docs";
import { isIsoDate, isTime } from "@/lib/clinic-time";
import { getPatient } from "@/lib/patient-service";

const id = z.coerce.number().int().positive();

const appointmentSchema = z.object({
  doctorId: z.coerce.number("Selecione o médico.").int().positive("Selecione o médico."),
  patientId: z.coerce.number("Selecione o paciente.").int().positive("Selecione o paciente."),
  date: z.string().refine(isIsoDate, "Informe a data."),
  time: z.string().refine(isTime, "Informe o horário."),
  duration: z.coerce
    .number()
    .refine((v) => (APPOINTMENT_DURATIONS as readonly number[]).includes(v), "Selecione a duração."),
  type: z.enum(APPOINTMENT_TYPES, "Selecione o tipo de consulta."),
  note: z
    .string()
    .trim()
    .max(APPOINTMENT_NOTE_MAX, `Use no máximo ${APPOINTMENT_NOTE_MAX} caracteres.`)
    .transform((v) => v || null),
  allowOverlap: z.boolean(),
});

const FIELDS = ["doctorId", "patientId", "date", "time", "duration", "type", "note"] as const;
type Field = (typeof FIELDS)[number];

export type AppointmentFormState = {
  values?: Partial<Record<Field, string>>;
  /** Rótulo do paciente selecionado (para não perder a seleção após erro). */
  patientLabel?: string;
  fieldErrors?: Partial<Record<Field | "allowOverlap", string>>;
  message?: string;
  /** Médico já tem consulta no horário: o usuário pode confirmar o encaixe. */
  conflict?: boolean;
};

function patientLabel(patientId: string | undefined) {
  const n = Number(patientId);
  const p = Number.isInteger(n) && n > 0 ? getPatient(n) : undefined;
  return p ? `${p.socialName ?? p.fullName} · nasc. ${formatDateBr(p.birthDate)}` : undefined;
}

/** Agenda (sem `id`) ou remarca (com `id`) uma consulta. */
export async function saveAppointmentAction(_prev: AppointmentFormState, formData: FormData): Promise<AppointmentFormState> {
  const user = await requirePermission("agenda:gerenciar");

  const rawId = formData.get("id");
  const existing = rawId ? id.safeParse(rawId) : null;
  if (existing && !existing.success) return { message: "Consulta inválida." };

  const values = Object.fromEntries(FIELDS.map((k) => [k, String(formData.get(k) ?? "")])) as Record<Field, string>;
  const label = patientLabel(values.patientId);
  const parsed = appointmentSchema.safeParse({ ...values, allowOverlap: formData.get("allowOverlap") === "on" });
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
    return {
      values,
      patientLabel: label,
      fieldErrors: Object.fromEntries(Object.entries(flat).map(([k, v]) => [k, v?.[0]])),
      message: "Corrija os campos destacados.",
    };
  }

  const actor = { id: user.id, role: user.role };
  let appointmentId: number;
  try {
    if (existing) {
      appointmentId = existing.data;
      const { moved, resized } = rescheduleAppointment(appointmentId, parsed.data, actor);
      await audit({
        userId: user.id,
        action: "alterar",
        resource: "consulta",
        resourceId: appointmentId,
        patientId: parsed.data.patientId,
        details: { remarcada: moved, duracao: resized, medicoId: parsed.data.doctorId },
      });
    } else {
      appointmentId = createAppointment(parsed.data, actor);
      await audit({
        userId: user.id,
        action: "criar",
        resource: "consulta",
        resourceId: appointmentId,
        patientId: parsed.data.patientId,
        details: { medicoId: parsed.data.doctorId, encaixe: parsed.data.allowOverlap },
      });
    }
  } catch (e) {
    if (e instanceof AppointmentError) {
      if (e.code === "forbidden") {
        await audit({ userId: user.id, action: "acesso_negado", resource: "agenda", resourceId: parsed.data.doctorId });
      }
      return {
        values,
        patientLabel: label,
        conflict: e.code === "doctor_conflict",
        fieldErrors: e.field ? { [e.field]: e.message } : undefined,
        message: e.code === "doctor_conflict" ? undefined : e.message,
      };
    }
    throw e;
  }

  redirect(`/agenda/${appointmentId}?ok=${existing ? "remarcada" : "agendada"}`);
}

export type AppointmentStatusState = { message?: string };

const statusSchema = z.object({
  id,
  to: z.enum(APPOINTMENT_STATUS),
  reason: z.string().trim().max(200, "Use no máximo 200 caracteres."),
});

/** Confirma, cancela (com motivo), registra falta, inicia ou finaliza o atendimento. */
export async function changeAppointmentStatusAction(
  _prev: AppointmentStatusState,
  formData: FormData,
): Promise<AppointmentStatusState> {
  const user = await requirePermission("agenda:gerenciar");

  const parsed = statusSchema.safeParse({
    id: formData.get("id"),
    to: formData.get("to"),
    reason: String(formData.get("reason") ?? ""),
  });
  if (!parsed.success) return { message: parsed.error.issues[0].message };
  const { to, reason } = parsed.data;
  if (to === "cancelado" && reason.length < 5) return { message: "Informe o motivo do cancelamento (mínimo de 5 caracteres)." };

  try {
    const before = changeAppointmentStatus(parsed.data.id, to, { id: user.id, role: user.role }, reason || undefined);
    await audit({
      userId: user.id,
      action: "alterar",
      resource: "consulta",
      resourceId: parsed.data.id,
      patientId: before.patientId,
      details: { status: { de: before.status, para: to } },
    });
  } catch (e) {
    if (e instanceof AppointmentError) {
      if (e.code === "forbidden") {
        await audit({ userId: user.id, action: "acesso_negado", resource: "consulta", resourceId: parsed.data.id });
      }
      return { message: e.message };
    }
    throw e;
  }

  redirect(`/agenda/${parsed.data.id}?ok=${to}`);
}
