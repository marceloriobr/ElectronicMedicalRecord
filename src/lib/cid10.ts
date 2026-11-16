import "server-only";
/**
 * Tabela CID-10 oficial (DATASUS, versão 2008): categorias e subcategorias, ~14 mil códigos.
 * Fonte: http://www2.datasus.gov.br/cid10/V2008/ — arquivo gerado em src/data/cid10.json ([código, descrição]).
 */
import table from "@/data/cid10.json";

export type Cid = { code: string; description: string };

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

const ENTRIES = (table as [string, string][]).map(([code, description]) => ({
  code,
  description,
  /** Código sem ponto + descrição normalizada, para busca. */
  key: `${code.replace(".", "").toLowerCase()} ${norm(description)}`,
  bare: code.replace(".", "").toLowerCase(),
}));
const BY_CODE = new Map(ENTRIES.map((e) => [e.code, e]));

/** "e119", "E11.9", "e11,9" → "E11.9" (se existir). */
export function normalizeCidCode(raw: string): string | undefined {
  const bare = raw.trim().toUpperCase().replace(/[.,\s]/g, "");
  if (!/^[A-Z]\d{2}[0-9X]?$/.test(bare)) return undefined;
  const code = bare.length > 3 ? `${bare.slice(0, 3)}.${bare.slice(3)}` : bare;
  return BY_CODE.has(code) ? code : undefined;
}

export function getCid(code: string): Cid | undefined {
  const e = BY_CODE.get(code);
  return e && { code: e.code, description: e.description };
}

/** Busca por código (prefixo) ou por palavras da descrição (sem acentos, todas as palavras). */
export function searchCid(term: string, limit = 20): Cid[] {
  let t = norm(term.trim());
  if (/^[a-z]\d{2}[.,]?[0-9x]?$/.test(t)) t = t.replace(/[.,]/, ""); // "E11.9" → "e119"
  if (t.length < 2) return [];
  const words = t.split(/\s+/).filter(Boolean);
  const codeLike = words.length === 1 && /^[a-z]\d{0,3}x?$/.test(words[0]);

  const out: Cid[] = [];
  if (codeLike) {
    for (const e of ENTRIES) {
      if (e.bare.startsWith(words[0])) out.push({ code: e.code, description: e.description });
      if (out.length >= limit) return out;
    }
    if (out.length) return out;
  }
  for (const e of ENTRIES) {
    if (words.every((w) => e.key.includes(w))) out.push({ code: e.code, description: e.description });
    if (out.length >= limit) break;
  }
  return out;
}
