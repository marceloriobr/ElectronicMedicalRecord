import "server-only";
/**
 * Envio de e-mail do SISTEMA para a EQUIPE (hoje: código da verificação em duas etapas).
 * Nunca use este módulo para mensagens a pacientes: essas seguem as regras do CLAUDE.md, seção 6.6
 * (consentimento, fila, auditoria).
 *
 * EMAIL_TRANSPORT=smtp     → envia por SMTP (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM).
 * EMAIL_TRANSPORT=arquivo  → SOMENTE desenvolvimento/testes: grava a mensagem em data/outbox/ (fora do Git).
 *                            Recusado em produção, porque o código ficaria legível no disco.
 * Padrão: "arquivo" fora de produção; em produção é obrigatório configurar o SMTP.
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createTransport, type Transporter } from "nodemailer";

export type Mail = { to: string; subject: string; text: string };

export class MailError extends Error {}

const isProduction = process.env.NODE_ENV === "production";

/** Pasta das mensagens no modo "arquivo": ao lado do banco (data/outbox). */
export function outboxDir() {
  return path.join(path.dirname(process.env.DATABASE_FILE ?? "data/emr.db"), "outbox");
}

let smtp: Transporter | undefined;
function smtpTransport() {
  if (smtp) return smtp;
  const host = process.env.SMTP_HOST?.trim();
  if (!host || !process.env.EMAIL_FROM?.trim()) throw new MailError("SMTP não configurado (SMTP_HOST e EMAIL_FROM).");
  const port = Number(process.env.SMTP_PORT ?? 587);
  smtp = createTransport({
    host,
    port,
    secure: port === 465, // 465 = TLS direto; demais portas usam STARTTLS
    requireTLS: port !== 465, // nunca envia o código sem criptografia em trânsito
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" } : undefined,
  });
  return smtp;
}

export async function sendMail(mail: Mail) {
  const transport = (process.env.EMAIL_TRANSPORT ?? (isProduction ? "smtp" : "arquivo")).trim().toLowerCase();

  if (transport === "arquivo") {
    if (isProduction) throw new MailError("EMAIL_TRANSPORT=arquivo não é permitido em produção.");
    const dir = outboxDir();
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const file = path.join(dir, `${Date.now()}-${randomBytes(4).toString("hex")}.json`);
    fs.writeFileSync(file, JSON.stringify({ ...mail, at: new Date().toISOString() }, null, 2), { mode: 0o600 });
    return;
  }
  if (transport !== "smtp") throw new MailError("EMAIL_TRANSPORT inválido: use smtp ou arquivo.");

  try {
    await smtpTransport().sendMail({ from: process.env.EMAIL_FROM, to: mail.to, subject: mail.subject, text: mail.text });
  } catch (e) {
    if (e instanceof MailError) throw e;
    // Não repassa o erro do provedor (pode conter endereço/host): só o tipo, para diagnóstico.
    throw new MailError(`Falha no envio por SMTP (${e instanceof Error ? e.name : "erro"}).`);
  }
}
