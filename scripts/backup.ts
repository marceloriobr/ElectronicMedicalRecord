/**
 * Backup CRIPTOGRAFADO do banco (CLAUDE.md, seção 4.2, regra 4).
 *
 *   npm run db:backup                         → cria data/backups/<banco>-<data>.db.enc
 *   npm run db:backup -- restaurar <arquivo.enc> <destino.db>
 *
 * AES-256-GCM com a chave EMR_BACKUP_KEY (base64 de 32 bytes), que NÃO fica no banco nem no backup.
 * Gere com: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 * Guarde a chave em cofre de senhas, fora do servidor: sem ela o backup não abre.
 * Formato do arquivo: "EMRBK1" + IV (12 bytes) + dados cifrados + tag de autenticação (16 bytes).
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const MAGIC = Buffer.from("EMRBK1");
const DATABASE_FILE = process.env.DATABASE_FILE ?? "data/emr.db";

function loadKey() {
  const key = Buffer.from(process.env.EMR_BACKUP_KEY?.trim() ?? "", "base64");
  if (key.length !== 32) {
    throw new Error("EMR_BACKUP_KEY não configurada ou inválida: use uma chave base64 de 32 bytes (veja .env.example).");
  }
  return key;
}

async function backup() {
  const key = loadKey();
  const dir = path.join(path.dirname(DATABASE_FILE), "backups");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
  const out = path.join(dir, `${path.basename(DATABASE_FILE, ".db")}-${stamp}.db.enc`);
  const tmp = path.join(dir, `.tmp-${randomBytes(6).toString("hex")}.db`);

  try {
    // Cópia consistente mesmo com o sistema em uso (API de backup do SQLite).
    const source = new Database(DATABASE_FILE, { readonly: true, fileMustExist: true });
    await source.backup(tmp);
    source.close();

    // O banco de um consultório cabe com folga na memória; cifrar de uma vez mantém o código simples.
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(MAGIC);
    const data = Buffer.concat([cipher.update(fs.readFileSync(tmp)), cipher.final()]);
    fs.writeFileSync(out, Buffer.concat([MAGIC, iv, data, cipher.getAuthTag()]), { mode: 0o600, flag: "wx" });
  } finally {
    fs.rmSync(tmp, { force: true }); // a cópia em claro nunca fica no disco
  }
  console.log(`Backup criptografado criado: ${out}`);
}

async function restore(file: string | undefined, dest: string | undefined) {
  if (!file || !dest) throw new Error("Uso: npm run db:backup -- restaurar <arquivo.enc> <destino.db>");
  if (fs.existsSync(dest)) throw new Error(`O destino ${dest} já existe: escolha outro nome (nada é sobrescrito).`);
  const key = loadKey();
  const raw = fs.readFileSync(file);
  const headerLen = MAGIC.length + 12;
  if (raw.length < headerLen + 16 || !raw.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Arquivo de backup inválido.");

  const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(MAGIC.length, headerLen));
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(raw.subarray(raw.length - 16));
  let plain: Buffer;
  try {
    plain = Buffer.concat([decipher.update(raw.subarray(headerLen, raw.length - 16)), decipher.final()]);
  } catch {
    throw new Error("Não foi possível abrir o backup: chave incorreta ou arquivo corrompido/adulterado.");
  }
  fs.writeFileSync(dest, plain, { mode: 0o600, flag: "wx" });
  console.log(`Backup restaurado em ${dest}. Confira o conteúdo antes de colocá-lo no lugar do banco em uso.`);
}

const [command, a, b] = process.argv.slice(2);
(command === "restaurar" ? restore(a, b) : backup()).catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
