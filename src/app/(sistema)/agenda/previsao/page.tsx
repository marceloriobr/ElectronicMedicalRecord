import Link from "next/link";
import { BarChart, type Bar } from "@/components/bar-chart";
import { DischargeForm } from "@/components/discharge-form";
import { FormMessage } from "@/components/form-field";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui";
import { doctorsFor } from "@/lib/appointment-service";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import {
  FOLLOW_UP_MONTHS,
  FORECAST_HORIZONS,
  formatBRL,
  PRICE_FIELDS,
  WEEKDAY_LABELS,
  WEEKDAY_SHORT,
  type ForecastHorizon,
} from "@/lib/availability-constants";
import { ageFromBirthDate, formatDateBr, maskPhone } from "@/lib/br-docs";
import { addDays } from "@/lib/clinic-time";
import { forecast, overdueFollowUps } from "@/lib/forecast-service";
import { can } from "@/lib/permissions";

export const metadata = { title: "Previsão da agenda | Prontuário Eletrônico" };

/** Cores validadas (scripts/validate_palette.js do método de dataviz): passam CVD e contraste. */
const OCUPADO = { key: "ocupados", label: "Ocupados", color: "#0b8aa6" };
const LIVRE = { key: "livres", label: "Livres", color: "#e55c3e" };
// Mesma semântica (e mesmas cores) na visão financeira: receita dos horários ocupados × dos livres.
const AGENDADA = { key: "agendada", label: "Receita agendada", color: "#0b8aa6" };
const POTENCIAL = { key: "potencial", label: "Receita potencial (livres)", color: "#e55c3e" };
const monthLabel = (m: string) =>
  new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-15T12:00:00Z`)).replace(" de ", "/").replace(".", "");

const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const weekday = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
const PERIOD_LABELS = { manha: "Manhã (antes das 12h)", tarde: "Tarde (12h–18h)", noite: "Noite (após 18h)" } as const;
const OK: Record<string, string> = {
  disponibilidade: "Disponibilidade salva. A previsão abaixo já usa a nova grade.",
  alta: "Alta registrada: o paciente deixa de ser sinalizado até voltar a ser atendido.",
};
const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function PrevisaoPage({ searchParams }: PageProps<"/agenda/previsao">) {
  const user = await requirePermission("agenda:previsao");
  const sp = await searchParams;
  const months: ForecastHorizon = sp.meses === "6" ? 6 : 3;

  const doctors = doctorsFor(user);
  if (!doctors.length) {
    return (
      <div className="space-y-4">
        <h1 className="font-serif text-3xl text-petrol">Previsão da agenda</h1>
        <FormMessage tone="error">Nenhum médico ativo cadastrado.</FormMessage>
      </div>
    );
  }
  const requested = doctors.find((d) => d.id === Number(sp.medico));
  if (sp.medico && !requested) {
    await audit({ userId: user.id, action: "acesso_negado", resource: "previsao", resourceId: String(sp.medico).slice(0, 20) });
  }
  const doctor = requested ?? doctors.find((d) => d.id === user.id) ?? doctors[0];
  const isOwn = doctor.id === user.id;
  const canBook = can(user.role, "agenda:gerenciar");

  const f = forecast(doctor.id, months);
  const followUps = overdueFollowUps(doctor.id);
  // Contém identificação de pacientes (lista de retorno): leitura auditada, sem nomes no log.
  await audit({
    userId: user.id,
    action: "ler",
    resource: "previsao",
    resourceId: doctor.id,
    details: { meses: months, sinalizados: followUps.length },
  });

  const book = (date: string, time: string) =>
    `/agenda/nova?medico=${doctor.id}&data=${date}&hora=${time}${f ? `&duracao=${f.slotMinutes}` : ""}`;
  const q = (m: number) => `/agenda/previsao?medico=${doctor.id}&meses=${m}`;

  // Gráfico 1: ocupação por semana (empilhado). Marca o 1º dia de cada mês no eixo.
  const weekBars: Bar[] = (f?.weeks ?? []).map((w, i, all) => ({
    label: `Semana de ${ddmm(w.start)}`,
    tick: i === 0 || w.start.slice(5, 7) !== all[i - 1].start.slice(5, 7) ? ddmm(w.start) : undefined,
    values: { ocupados: w.booked, livres: w.free },
  }));
  // Gráfico 2: horários livres por dia da semana (uma série).
  const weekdayBars: Bar[] = (f?.byWeekday ?? []).map((d) => ({
    label: WEEKDAY_LABELS[d.weekday],
    tick: WEEKDAY_SHORT[d.weekday],
    values: { livres: d.free },
  }));

  const occupancy = f && f.capacity ? Math.round((f.booked / f.capacity) * 100) : 0;
  const bestWeek = f?.weeks.reduce((a, b) => (b.free > a.free ? b : a), f.weeks[0]);
  const bestWeekday = f?.byWeekday.reduce((a, b) => (b.free > a.free ? b : a), f.byWeekday[0]);
  const bestPeriod = f?.byPeriod.reduce((a, b) => (b.free > a.free ? b : a), f.byPeriod[0]);
  const nextDays = f?.days.slice(0, 12) ?? [];
  const moneyBars: Bar[] = (f?.finance.months ?? []).map((m) => ({
    label: monthLabel(m.month),
    tick: monthLabel(m.month),
    values: { agendada: m.scheduledCents / 100, potencial: m.potentialCents / 100 },
  }));
  const pricesSet = !!f && PRICE_FIELDS.some((p) => f.finance.prices[p.type] > 0);

  return (
    <div className="space-y-8">
      {typeof sp.ok === "string" && OK[sp.ok] && <FormMessage tone="success">{OK[sp.ok]}</FormMessage>}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href={`/agenda?medico=${doctor.id}`} className="text-sm font-semibold text-petrol/70 hover:text-petrol">
            ← Agenda
          </Link>
          <h1 className="mt-2 font-serif text-3xl text-petrol">Previsão da agenda</h1>
          <p className="text-sm text-ink/70" data-testid="forecast-doctor">
            {doctor.name}
            {doctor.crm && ` · CRM ${doctor.crm}/${doctor.crmUf}`}
          </p>
        </div>
        {isOwn && can(user.role, "agenda:disponibilidade") && (
          <Link href="/agenda/disponibilidade" className={secondaryButtonClass}>
            Configurar minha disponibilidade
          </Link>
        )}
      </div>

      <form action="/agenda/previsao" className="flex flex-wrap items-end gap-3 rounded-lg border border-brand-gray/60 bg-white p-4 shadow-sm">
        {doctors.length > 1 ? (
          <label className="min-w-48 flex-1 text-sm font-semibold text-petrol">
            Médico(a)
            <select name="medico" defaultValue={doctor.id} className={inputClass}>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <input type="hidden" name="medico" value={doctor.id} />
        )}
        <fieldset className="text-sm font-semibold text-petrol">
          <legend>Período</legend>
          <div className="mt-1 flex gap-2">
            {FORECAST_HORIZONS.map((m) => (
              <Link
                key={m}
                href={q(m)}
                aria-current={m === months ? "page" : undefined}
                className={m === months ? primaryButtonClass : secondaryButtonClass}
              >
                Próximos {m} meses
              </Link>
            ))}
          </div>
        </fieldset>
        {doctors.length > 1 && (
          <>
            <input type="hidden" name="meses" value={months} />
            <button type="submit" className={secondaryButtonClass}>
              Ver médico
            </button>
          </>
        )}
      </form>

      {!f ? (
        <FormMessage tone="error">
          {isOwn ? (
            <>
              Você ainda não configurou seus dias e horários de atendimento.{" "}
              <Link href="/agenda/disponibilidade" className="font-semibold underline">
                Configurar agora
              </Link>
              .
            </>
          ) : (
            "Este médico ainda não configurou os dias e horários de atendimento: não há como calcular a previsão."
          )}
        </FormMessage>
      ) : (
        <>
          <section aria-label="Resumo" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="forecast-kpis">
            <Kpi label="Capacidade" value={f.capacity} hint={`consultas de ${f.slotMinutes} min até ${formatDateBr(addDays(f.to, -1))}`} />
            <Kpi label="Ocupados" value={f.booked} hint="horários da grade já marcados" testId="kpi-booked" />
            <Kpi label="Livres" value={f.free} hint="horários a oferecer" testId="kpi-free" accent />
            <Kpi label="Ocupação" value={`${occupancy}%`} hint={f.outsideGrid ? `+${f.outsideGrid} consulta(s) fora da grade` : "da grade configurada"} />
          </section>

          <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            <BarChart
              title="Ocupação por semana"
              description="Horários da grade: ocupados × livres. Passe o mouse ou toque numa barra para ver os números."
              series={[OCUPADO, LIVRE]}
              bars={weekBars}
              unit="horários"
              testId="chart-weeks"
            />
            <BarChart
              title="Horários livres por dia da semana"
              description={`Soma dos próximos ${months} meses.`}
              series={[LIVRE]}
              bars={weekdayBars}
              unit="horários"
              testId="chart-weekdays"
            />
          </div>

          <section className="space-y-4" aria-labelledby="financeiro" data-testid="finance">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="financeiro" className="font-serif text-2xl text-petrol">
                Visão financeira
              </h2>
              {pricesSet && (
                <p className="text-sm text-ink/60">
                  Valores particulares:{" "}
                  {PRICE_FIELDS.map((p) => `${p.label.toLowerCase()} ${formatBRL(f.finance.prices[p.type])}`).join(" · ")}
                </p>
              )}
            </div>
            {!pricesSet ? (
              <FormMessage tone="error">
                {isOwn ? (
                  <>
                    Informe o valor da consulta para ver a receita prevista.{" "}
                    <Link href="/agenda/disponibilidade" className="font-semibold underline">
                      Configurar valores
                    </Link>
                    .
                  </>
                ) : (
                  "O médico ainda não informou o valor da consulta: não há como calcular a receita."
                )}
              </FormMessage>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Kpi
                    label="Receita agendada"
                    value={formatBRL(f.finance.scheduledCents)}
                    hint={`consultas marcadas nos próximos ${months} meses`}
                    testId="kpi-revenue-scheduled"
                  />
                  <Kpi
                    label="Receita potencial"
                    value={formatBRL(f.finance.potentialCents)}
                    hint={`se os ${f.free} horários livres forem preenchidos`}
                    testId="kpi-revenue-potential"
                    accent
                  />
                  <Kpi
                    label="Total possível"
                    value={formatBRL(f.finance.scheduledCents + f.finance.potentialCents)}
                    hint="agendada + potencial"
                    testId="kpi-revenue-total"
                  />
                </div>
                <BarChart
                  title="Receita por mês"
                  description="Agendada (consultas marcadas, pelo tipo de cada uma) × potencial (horários livres pelo valor da consulta)."
                  series={[AGENDADA, POTENCIAL]}
                  bars={moneyBars}
                  format="brl"
                  testId="chart-revenue"
                />
                <p className="text-xs text-ink/50">
                  Estimativa com os valores de consulta particular configurados pelo médico; convênios, descontos e faltas não são
                  descontados.
                </p>
              </>
            )}
          </section>

          <section className="rounded-lg border border-brand-gray/60 bg-white p-5 shadow-sm">
            <h2 className="font-serif text-lg text-petrol">Oportunidades</h2>
            {f.free === 0 ? (
              <p className="mt-2 text-sm text-ink/70">Agenda cheia no período: nenhum horário livre na grade configurada.</p>
            ) : (
              <>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink/80" data-testid="opportunity-highlights">
                  {bestWeek && bestWeek.free > 0 && (
                    <li>
                      Semana com mais horários livres: <strong>{ddmm(bestWeek.start)}</strong> ({bestWeek.free} livres).
                    </li>
                  )}
                  {bestWeekday && bestWeekday.free > 0 && (
                    <li>
                      Dia da semana com mais vagas: <strong>{WEEKDAY_LABELS[bestWeekday.weekday]}</strong> ({bestWeekday.free} livres de{" "}
                      {bestWeekday.capacity}).
                    </li>
                  )}
                  {bestPeriod && bestPeriod.free > 0 && (
                    <li>
                      Período com mais vagas: <strong>{PERIOD_LABELS[bestPeriod.period]}</strong> ({bestPeriod.free} livres).
                    </li>
                  )}
                  {pricesSet && f.finance.potentialCents > 0 && (
                    <li>
                      Preencher os horários livres representa até <strong>{formatBRL(f.finance.potentialCents)}</strong> no período.
                    </li>
                  )}
                  {followUps.length > 0 && (
                    <li>
                      <strong>{followUps.length}</strong> paciente(s) em acompanhamento sem retorno marcado (lista abaixo) para ocupar esses horários.
                    </li>
                  )}
                </ul>

                <h3 className="mt-5 text-sm font-bold uppercase tracking-wide text-petrol">Próximos dias com horários livres</h3>
                <ul className="mt-2 divide-y divide-brand-gray/40" data-testid="opportunity-days">
                  {nextDays.map((d) => (
                    <li key={d.date} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2" data-date={d.date}>
                      <span className="w-36 text-sm">
                        <strong>{WEEKDAY_SHORT[weekday(d.date)]}</strong>, {formatDateBr(d.date)}
                        <span className="block text-xs text-ink/60">
                          {d.free.length} de {d.capacity} livres
                        </span>
                      </span>
                      <span className="flex flex-1 flex-wrap gap-1.5">
                        {d.free.slice(0, 10).map((t) =>
                          canBook ? (
                            <Link
                              key={t}
                              href={book(d.date, t)}
                              className="rounded-md border border-coral/50 bg-coral/5 px-2 py-1 text-xs font-semibold tabular-nums text-coral-dark hover:bg-coral/15"
                              aria-label={`Agendar ${formatDateBr(d.date)} às ${t}`}
                            >
                              {t}
                            </Link>
                          ) : (
                            <span key={t} className="rounded-md border border-brand-gray/60 px-2 py-1 text-xs tabular-nums">
                              {t}
                            </span>
                          ),
                        )}
                        {d.free.length > 10 && <span className="self-center text-xs text-ink/60">+{d.free.length - 10}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
                {f.days.length > nextDays.length && (
                  <p className="mt-2 text-xs text-ink/60">
                    Mostrando os {nextDays.length} primeiros de {f.days.length} dias com horários livres. Os demais estão no gráfico semanal.
                  </p>
                )}
              </>
            )}
            <p className="mt-4 text-xs text-ink/50">Feriados e ausências não são descontados automaticamente.</p>
          </section>
        </>
      )}

      <section className="rounded-lg border border-brand-gray/60 bg-white p-5 shadow-sm">
        <h2 className="font-serif text-lg text-petrol">Pacientes sem retorno marcado</h2>
        <p className="mt-1 text-sm text-ink/70">
          Em acompanhamento com {doctor.name} há mais de {FOLLOW_UP_MONTHS} meses (primeira consulta atendida), sem alta e sem nenhuma
          consulta futura marcada. Os que estão há mais tempo sem consulta aparecem primeiro.
        </p>
        {followUps.length === 0 ? (
          <p className="mt-3 text-sm text-ink/60">Nenhum paciente nessa situação.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm" data-testid="follow-ups">
              <thead>
                <tr className="border-b border-brand-gray/60 text-ink/70">
                  <th className="py-2 pr-4 font-semibold">Paciente</th>
                  <th className="py-2 pr-4 font-semibold">Telefone</th>
                  <th className="py-2 pr-4 font-semibold">1ª consulta</th>
                  <th className="py-2 pr-4 font-semibold">Última consulta</th>
                  <th className="py-2 pr-4 text-right font-semibold">Consultas</th>
                  <th className="py-2 font-semibold">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {followUps.map((p) => (
                  <tr key={p.id} className="border-b border-brand-gray/30 align-top" data-patient={p.id}>
                    <td className="py-2 pr-4">
                      <Link href={`/pacientes/${p.id}`} className="font-semibold text-petrol hover:underline">
                        {p.name}
                      </Link>
                      <span className="block text-xs text-ink/60">{ageFromBirthDate(p.birthDate)} anos</span>
                    </td>
                    <td className="py-2 pr-4 font-mono">{maskPhone(p.phone)}</td>
                    <td className="py-2 pr-4">{dateFmt.format(p.firstVisit)}</td>
                    <td className="py-2 pr-4">{dateFmt.format(p.lastVisit)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{p.visits}</td>
                    <td className="space-y-1 py-2">
                      {canBook && (
                        <Link
                          href={`/agenda/nova?medico=${doctor.id}&paciente=${p.id}${f ? `&duracao=${f.slotMinutes}` : ""}`}
                          className="block text-sm font-semibold text-petrol hover:underline"
                        >
                          Agendar retorno
                        </Link>
                      )}
                      {isOwn && can(user.role, "pacientes:alta") && <DischargeForm patientId={p.id} months={months} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Kpi({ label, value, hint, accent, testId }: { label: string; value: number | string; hint: string; accent?: boolean; testId?: string }) {
  return (
    <div className={`rounded-lg border bg-white p-4 shadow-sm ${accent ? "border-coral/60" : "border-brand-gray/60"}`}>
      <p className="text-sm font-semibold text-ink/70">{label}</p>
      <p className="mt-1 font-serif text-2xl tabular-nums text-petrol sm:text-3xl" data-testid={testId}>
        {value}
      </p>
      <p className="mt-1 text-xs text-ink/60">{hint}</p>
    </div>
  );
}
