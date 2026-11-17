/**
 * SOMENTE desenvolvimento/testes (EMAIL_TRANSPORT=arquivo): mostra o último e-mail gravado em data/outbox —
 * é onde aparece o código da verificação em duas etapas quando não há SMTP configurado.
 * Uso: npm run mail:ultimo            (ou: DATABASE_FILE=data/test.db npm run mail:ultimo)
 */
import fs from "node:fs";
import path from "node:path";

const dir = path.join(path.dirname(process.env.DATABASE_FILE ?? "data/emr.db"), "outbox");
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort() : [];
if (!files.length) {
  console.log(`Nenhum e-mail em ${dir}.`);
} else {
  const mail = JSON.parse(fs.readFileSync(path.join(dir, files.at(-1)!), "utf8")) as { to: string; subject: string; text: string; at: string };
  console.log(`Para: ${mail.to}\nEm: ${mail.at}\nAssunto: ${mail.subject}\n\n${mail.text}`);
}
