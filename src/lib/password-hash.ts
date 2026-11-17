import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

// scrypt (nativo do Node) com parâmetros recomendados pela OWASP.
const N = 2 ** 17;
const r = 8;
const p = 1;
const KEY_LEN = 64;

/**
 * Cada cálculo reserva ~128 MB e ~0,5 s de CPU. Sem limite, uma rajada de logins esgotaria a memória do
 * servidor: no máximo MAX_CONCURRENT cálculos ao mesmo tempo e MAX_QUEUE aguardando; além disso, recusa.
 */
const MAX_CONCURRENT = 2;
const MAX_QUEUE = 16;
let running = 0;
const waiting: (() => void)[] = [];

/** O servidor está com cálculos de senha demais na fila: peça para tentar de novo. */
export class HashBusyError extends Error {
  constructor() {
    super("Sistema ocupado. Tente novamente em instantes.");
  }
}

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT) {
    if (waiting.length >= MAX_QUEUE) throw new HashBusyError();
    await new Promise<void>((resolve) => waiting.push(resolve)); // a vaga é passada adiante por quem termina
  } else {
    running++;
  }
  try {
    return await fn();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else running--;
  }
}

function scryptAsync(password: string, salt: Buffer, opts: ScryptOptions): Promise<Buffer> {
  return withSlot(
    () =>
      new Promise((resolve, reject) =>
        scrypt(password.normalize("NFKC"), salt, KEY_LEN, { ...opts, maxmem: 256 * N * r }, (err, key) =>
          err ? reject(err) : resolve(key),
        ),
      ),
  );
}

/** Formato: scrypt$N$r$p$salt(base64)$hash(base64) */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, { N, r, p });
  return ["scrypt", N, r, p, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, rr, pp, saltB64, keyB64] = stored.split("$");
  if (alg !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const key = await scryptAsync(password, Buffer.from(saltB64, "base64"), {
    N: Number(n),
    r: Number(rr),
    p: Number(pp),
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Hash usado quando o usuário não existe, para o login levar o mesmo tempo. */
let dummyHash: Promise<string> | undefined;
export function getDummyHash() {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  return dummyHash;
}
