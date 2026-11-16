import "server-only";
/**
 * Criptografia em repouso dos dados clínicos (CLAUDE.md, seção 4.2, regra 4).
 *
 * - AES-256-GCM, IV aleatório de 12 bytes por gravação, tag de autenticação de 16 bytes.
 * - Chaves só em variável de ambiente: EMR_CLINICAL_KEYS="1:<base64 32 bytes>,2:<base64 32 bytes>".
 *   A versão mais alta cifra as novas gravações; as anteriores continuam decifrando (rotação de chave).
 * - AAD (dados associados) amarra o texto cifrado à tabela e ao paciente: um payload copiado para outro
 *   registro/paciente não decifra.
 *
 * Gerar uma chave: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 * PERDER A CHAVE = PERDER O PRONTUÁRIO. Guarde uma cópia segura fora do servidor.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";

type Keyring = { current: number; keys: Map<number, Buffer> };
let keyring: Keyring | undefined;

function loadKeys(): Keyring {
  if (keyring) return keyring;
  const raw = process.env.EMR_CLINICAL_KEYS?.trim();
  if (!raw) {
    throw new Error("EMR_CLINICAL_KEYS não configurada: o prontuário não pode ser lido nem gravado sem a chave de criptografia.");
  }
  const keys = new Map<number, Buffer>();
  for (const entry of raw.split(",")) {
    const m = /^\s*(\d+):([A-Za-z0-9+/=]+)\s*$/.exec(entry);
    const key = m ? Buffer.from(m[2], "base64") : undefined;
    if (!m || key?.length !== 32) throw new Error("EMR_CLINICAL_KEYS inválida: use versao:chave_base64_de_32_bytes.");
    keys.set(Number(m[1]), key);
  }
  keyring = { current: Math.max(...keys.keys()), keys };
  return keyring;
}

/** Contexto que vincula o texto cifrado ao lugar onde ele está guardado. */
export type CryptoContext = { table: string; patientId: number };
const aad = (c: CryptoContext) => Buffer.from(`emr:${c.table}:${c.patientId}`);

/** Cifra um objeto JSON. Retorna a versão da chave e o texto "iv.tag.dados" em base64url. */
export function encryptJson(value: unknown, ctx: CryptoContext): { keyVersion: number; payload: string } {
  const { current, keys } = loadKeys();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, keys.get(current)!, iv);
  cipher.setAAD(aad(ctx));
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const payload = [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
  return { keyVersion: current, payload };
}

/** Decifra e devolve o objeto. Falha (exceção) se a chave, o contexto ou o conteúdo não conferirem. */
export function decryptJson<T>(keyVersion: number, payload: string, ctx: CryptoContext): T {
  const key = loadKeys().keys.get(keyVersion);
  if (!key) throw new Error(`Chave de criptografia versão ${keyVersion} indisponível.`);
  const [iv, tag, data] = payload.split(".").map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAAD(aad(ctx));
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8")) as T;
}
