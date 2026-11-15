import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

// scrypt (nativo do Node) com parâmetros recomendados pela OWASP.
const N = 2 ** 17;
const r = 8;
const p = 1;
const KEY_LEN = 64;

function scryptAsync(password: string, salt: Buffer, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, KEY_LEN, { ...opts, maxmem: 256 * N * r }, (err, key) =>
      err ? reject(err) : resolve(key),
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
