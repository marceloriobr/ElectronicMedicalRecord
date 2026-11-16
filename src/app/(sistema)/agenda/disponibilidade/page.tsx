import Link from "next/link";
import { AvailabilityForm } from "@/components/availability-form";
import { requirePermission } from "@/lib/auth";
import { DEFAULT_DURATION } from "@/lib/appointment-constants";
import { getSchedule } from "@/lib/forecast-service";

export const metadata = { title: "Minha disponibilidade | Prontuário Eletrônico" };

const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function DisponibilidadePage() {
  // Somente o médico, e sempre a PRÓPRIA grade (o id vem da sessão, nunca do cliente).
  const user = await requirePermission("agenda:disponibilidade");
  const schedule = getSchedule(user.id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/agenda/previsao" className="text-sm font-semibold text-petrol/70 hover:text-petrol">
          ← Previsão da agenda
        </Link>
        <h1 className="mt-2 font-serif text-3xl text-petrol">Minha disponibilidade</h1>
        <p className="mt-1 text-sm text-ink/70">
          Dias e horários em que você atende, a duração e o valor de cada consulta. A previsão usa esta grade para calcular os horários
          livres dos próximos meses.
        </p>
        {schedule && <p className="mt-1 text-xs text-ink/60">Última alteração: {dateTime.format(schedule.updatedAt)}</p>}
      </div>
      <AvailabilityForm
        slotMinutes={schedule?.slotMinutes ?? DEFAULT_DURATION}
        prices={schedule?.prices ?? { primeira_consulta: 0, consulta: 0, retorno: 0 }}
        windows={schedule?.windows ?? []}
      />
    </div>
  );
}
