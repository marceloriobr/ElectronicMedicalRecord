"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { searchCidAction } from "@/app/actions/clinical";
import type { Cid } from "@/lib/cid10";
import { MAX_SECONDARY_CIDS } from "@/lib/clinical-constants";
import { inputClass, labelClass } from "./ui";

type Props = {
  principal: Cid | null;
  secundarios: Cid[];
  errors?: Record<string, string>;
};

/** Seleção do CID principal e dos secundários. A busca roda no servidor (tabela oficial DATASUS). */
export function CidPicker({ principal: initialPrincipal, secundarios: initialSec, errors = {} }: Props) {
  const [principal, setPrincipal] = useState<Cid | null>(initialPrincipal);
  const [secundarios, setSecundarios] = useState<Cid[]>(initialSec);
  const secError = Object.entries(errors).find(([k]) => k.startsWith("cidsSecundarios"))?.[1];

  return (
    <div className="space-y-5">
      <div>
        <span className={labelClass} id="cidPrincipal-label">
          CID-10 principal (hipótese diagnóstica)
        </span>
        <input type="hidden" name="cidPrincipal" value={principal?.code ?? ""} />
        {principal ? (
          <ul className="mt-2" data-testid="cid-principal">
            <CidChip cid={principal} onRemove={() => setPrincipal(null)} primary />
          </ul>
        ) : (
          <CidSearch
            id="cidPrincipal"
            labelledBy="cidPrincipal-label"
            exclude={secundarios.map((c) => c.code)}
            onPick={setPrincipal}
            invalid={!!errors.cidPrincipal}
          />
        )}
        {errors.cidPrincipal && (
          <p id="cidPrincipal-error" className="mt-1 text-sm text-coral-dark">
            {errors.cidPrincipal}
          </p>
        )}
      </div>

      <div>
        <span className={labelClass} id="cidSec-label">
          CIDs secundários (comorbidades)
        </span>
        {secundarios.map((c) => (
          <input key={c.code} type="hidden" name="cidsSecundarios" value={c.code} />
        ))}
        {secundarios.length > 0 && (
          <ul className="mt-2 flex flex-col gap-2" data-testid="cids-secundarios">
            {secundarios.map((c) => (
              <CidChip key={c.code} cid={c} onRemove={() => setSecundarios(secundarios.filter((s) => s.code !== c.code))} />
            ))}
          </ul>
        )}
        {secundarios.length < MAX_SECONDARY_CIDS && (
          <CidSearch
            id="cidSecundario"
            labelledBy="cidSec-label"
            exclude={[principal?.code ?? "", ...secundarios.map((c) => c.code)]}
            onPick={(c) => setSecundarios([...secundarios, c])}
            placeholder="Adicionar CID secundário: código ou descrição"
            invalid={!!secError}
          />
        )}
        {secError && <p className="mt-1 text-sm text-coral-dark">{secError}</p>}
      </div>
    </div>
  );
}

function CidChip({ cid, onRemove, primary }: { cid: Cid; onRemove: () => void; primary?: boolean }) {
  return (
    <li
      className={`flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm ${
        primary ? "border-petrol/40 bg-petrol/5" : "border-brand-gray/60 bg-white"
      }`}
    >
      <span>
        <span className="font-mono font-semibold text-petrol">{cid.code}</span> — {cid.description}
      </span>
      <button type="button" onClick={onRemove} className="shrink-0 text-xs font-semibold text-coral-dark hover:underline" aria-label={`Remover ${cid.code}`}>
        Remover
      </button>
    </li>
  );
}

function CidSearch({
  id,
  labelledBy,
  exclude,
  onPick,
  placeholder = "Digite o código (ex.: I10) ou parte da descrição (ex.: hipertensão)",
  invalid,
}: {
  id: string;
  labelledBy: string;
  exclude: string[];
  onPick: (c: Cid) => void;
  placeholder?: string;
  invalid?: boolean;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Cid[] | null>(null);
  const [pending, startTransition] = useTransition();
  const listId = useId();
  const seq = useRef(0);

  useEffect(() => {
    const t = term.trim();
    if (t.length < 2) return;
    const n = ++seq.current;
    const timer = setTimeout(() => {
      startTransition(async () => {
        const r = await searchCidAction(t);
        if (n === seq.current) setResults(r);
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [term]);

  const visible = term.trim().length >= 2 ? (results ?? []).filter((r) => !exclude.includes(r.code)) : [];

  return (
    <div className="relative mt-1">
      <input
        id={id}
        type="search"
        autoComplete="off"
        aria-labelledby={labelledBy}
        aria-controls={listId}
        aria-invalid={invalid}
        className={inputClass}
        placeholder={placeholder}
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        // Enter não pode enviar o formulário do prontuário.
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (visible[0]) {
              onPick(visible[0]);
              setTerm("");
            }
          }
        }}
      />
      {term.trim().length >= 2 && (
        <ul id={listId} role="listbox" className="mt-1 max-h-64 overflow-auto rounded-md border border-brand-gray/60 bg-white shadow-sm" data-testid={`${id}-results`}>
          {pending && visible.length === 0 && <li className="px-3 py-2 text-sm text-ink/60">Buscando…</li>}
          {!pending && results && visible.length === 0 && <li className="px-3 py-2 text-sm text-ink/60">Nenhum CID encontrado.</li>}
          {visible.map((c) => (
            <li key={c.code} role="option" aria-selected={false}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-petrol/5 focus:bg-petrol/10 focus:outline-none"
                onClick={() => {
                  onPick(c);
                  setTerm("");
                  setResults(null);
                }}
              >
                <span className="font-mono font-semibold text-petrol">{c.code}</span> — {c.description}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
