import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/clinical-forms";
import { loadPatient } from "@/app/(sistema)/pacientes/[id]/load-patient";
import { orNotFound, routeId } from "@/app/(sistema)/pacientes/[id]/prontuario/load";
import { audit } from "@/lib/audit";
import { requireClinicalPermission } from "@/lib/auth";
import { ageFromBirthDate } from "@/lib/br-docs";
import { ANTIMICROBIAL_VALIDITY_DAYS, classifyMedication, CONTROLLED_VALIDITY_DAYS } from "@/lib/clinical-constants";
import { getPrescription, type PrescriptionView } from "@/lib/clinical-service";

// Título genérico: nunca colocar nome do paciente no título da página (CLAUDE.md, 4.2).
export const metadata = { title: "Impressão de receita | Prontuário Eletrônico" };

const longDate = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "America/Sao_Paulo" });

export default async function ImprimirReceitaPage({ params }: PageProps<"/impressao/pacientes/[id]/receitas/[receita]">) {
  const user = await requireClinicalPermission("receita:emitir");
  const { id, receita } = await params;
  const patient = loadPatient(id);
  const rx = orNotFound(() => getPrescription(patient.id, routeId(receita)));
  if (rx.status !== "emitida") notFound();

  await audit({ userId: user.id, action: "imprimir", resource: "receita", resourceId: rx.id, patientId: patient.id });

  const controlled = rx.type === "controle_especial";
  const antimicrobial = rx.content.items.some((i) => classifyMedication(i.medicamento).antimicrobial);
  const vias = controlled || antimicrobial ? ["1ª via — Farmácia", "2ª via — Paciente"] : [null];

  return (
    <div className="bg-white text-black">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-4 print:hidden">
        <Link href={`/pacientes/${patient.id}/receitas/${rx.id}`} className="text-sm font-semibold text-petrol hover:underline">
          ← Voltar
        </Link>
        <PrintButton />
      </div>
      {vias.map((via, i) => (
        <Sheet key={i} rx={rx} via={via} controlled={controlled} antimicrobial={antimicrobial} last={i === vias.length - 1} />
      ))}
    </div>
  );
}

function Sheet({
  rx,
  via,
  controlled,
  antimicrobial,
  last,
}: {
  rx: PrescriptionView;
  via: string | null;
  controlled: boolean;
  antimicrobial: boolean;
  last: boolean;
}) {
  const { consultorio: clinic, paciente } = rx.content;
  const validity = controlled ? CONTROLLED_VALIDITY_DAYS : antimicrobial ? ANTIMICROBIAL_VALIDITY_DAYS : null;

  return (
    <section
      className={`mx-auto flex min-h-[27cm] max-w-3xl flex-col border border-black/20 p-10 text-[13px] leading-relaxed print:min-h-[26cm] print:border-0 print:p-0 ${
        last ? "" : "break-after-page"
      } mb-6 print:mb-0`}
      data-testid="rx-sheet"
    >
      {controlled ? (
        <header className="grid grid-cols-[1fr_auto] gap-4 border-b border-black pb-3">
          <div>
            <h1 className="text-lg font-bold uppercase tracking-wide">Receituário de controle especial</h1>
            <div className="mt-2 border border-black p-2 text-xs">
              <p className="font-bold uppercase">Identificação do emitente</p>
              <p>Nome: {rx.doctorName}</p>
              <p>
                CRM: {rx.doctorCrm} · UF: {rx.doctorCrmUf}
              </p>
              <p>Endereço: {clinic.address}</p>
              {clinic.phone && <p>Telefone: {clinic.phone}</p>}
            </div>
          </div>
          {via && <p className="self-start rounded border border-black px-2 py-1 text-xs font-bold uppercase">{via}</p>}
        </header>
      ) : (
        <header className="border-b border-black pb-3 text-center">
          <p className="text-base font-bold">{rx.doctorName}</p>
          <p>
            CRM {rx.doctorCrm}/{rx.doctorCrmUf}
          </p>
          <p className="text-xs">{clinic.name}</p>
          <p className="text-xs">
            {clinic.address}
            {clinic.phone && ` · ${clinic.phone}`}
          </p>
          {via && <p className="mt-2 text-xs font-bold uppercase">{via}</p>}
        </header>
      )}

      <div className="mt-4 space-y-1">
        <p>
          <span className="font-bold">Paciente:</span> {paciente.nome}
          {!controlled && <> · {ageFromBirthDate(paciente.nascimento)} anos</>}
        </p>
        {(controlled || antimicrobial) && (
          <p>
            <span className="font-bold">Endereço:</span> {paciente.endereco || "—"}
          </p>
        )}
      </div>

      <p className="mt-6 text-base font-bold uppercase">{controlled ? "Prescrição" : "Uso"}</p>
      <ol className="mt-2 flex-1 list-decimal space-y-4 pl-6">
        {rx.content.items.map((it, i) => (
          <li key={i}>
            <p className="font-bold">
              {it.medicamento}
              <span className="font-normal"> ............ {it.quantidade}</span>
            </p>
            <p>
              {it.via && <>Via {it.via.toLowerCase()}: </>}
              {it.posologia}
              {it.duracao && <> — {it.duracao}</>}
            </p>
          </li>
        ))}
      </ol>
      {rx.content.observacoes && <p className="mt-4 whitespace-pre-line">{rx.content.observacoes}</p>}

      <div className="mt-10 grid grid-cols-2 items-end gap-8">
        <p>
          Data: {longDate.format(rx.issuedAt)}
          {validity && <span className="block text-xs">Validade: {validity} dias a partir da emissão</span>}
        </p>
        <div className="text-center">
          <div className="border-t border-black pt-1">
            {rx.doctorName}
            <br />
            CRM {rx.doctorCrm}/{rx.doctorCrmUf}
          </div>
        </div>
      </div>

      {controlled && (
        <div className="mt-6 grid grid-cols-2 gap-4 text-xs">
          <div className="border border-black p-2">
            <p className="font-bold uppercase">Identificação do comprador</p>
            <p className="mt-1">Nome: ____________________________________</p>
            <p>Ident.: ______________ Órg. emissor: _______</p>
            <p>End.: _____________________________________</p>
            <p>Cidade: _________________ UF: ____</p>
            <p>Telefone: _______________</p>
          </div>
          <div className="border border-black p-2">
            <p className="font-bold uppercase">Identificação do fornecedor</p>
            <p className="mt-8 border-t border-black pt-1 text-center">Assinatura do farmacêutico</p>
            <p className="mt-2">Data: ____/____/______</p>
          </div>
        </div>
      )}

      <p className="mt-6 text-[10px] text-black/60">
        Receita nº {rx.id}. Documento sem assinatura digital ICP-Brasil: válido somente com assinatura manuscrita do médico.
      </p>
    </section>
  );
}
