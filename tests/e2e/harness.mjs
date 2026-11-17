// Navegador real (Google Chrome) acessando o app pelo proxy do Codespaces.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
// Por padrão testa pelo endereço público do Codespace (mesmo caminho do usuário);
// fora do Codespaces, ou com E2E_BASE_URL definido, usa essa URL.
export const BASE =
  process.env.E2E_BASE_URL ??
  (process.env.CODESPACE_NAME
    ? `https://${process.env.CODESPACE_NAME}-3000.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`
    : 'http://localhost:3000');
export async function open(viewport = { width: 1280, height: 900 }) {
  const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'chrome' });
  const ctx = await browser.newContext({ viewport, extraHTTPHeaders: process.env.GITHUB_TOKEN ? { 'X-Github-Token': process.env.GITHUB_TOKEN } : {} });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && problems.push('console: ' + m.text()));
  page.on('response', (r) => r.status() >= 500 && problems.push(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`));
  return { browser, page, problems };
}
/** Navega e, se aparecer o aviso do GitHub para portas de codespace, clica em Continue. */
export async function go(page, path) {
  await page.goto(BASE + path);
  const cont = page.getByRole('button', { name: 'Continue', exact: true });
  if (await cont.isVisible().catch(() => false)) {
    await Promise.all([page.waitForURL((u) => u.hostname.endsWith('.app.github.dev')), cont.click()]);
    await page.goto(BASE + path);
  }
  await page.waitForLoadState('networkidle');
}

// ---------------------------------------------------------------------------
// Login em duas etapas. Nos testes o servidor roda com EMAIL_TRANSPORT=arquivo (padrão fora de produção):
// o e-mail com o código é gravado em <pasta do banco>/outbox, de onde o teste o lê.
// ---------------------------------------------------------------------------
const OUTBOX = path.join(path.dirname(process.env.DATABASE_FILE ?? 'data/test.db'), 'outbox');

/** Código do e-mail mais recente gravado a partir de `sinceMs` (espera até 10 s pelo arquivo). */
export async function mfaCode(sinceMs) {
  for (let i = 0; i < 50; i++) {
    const files = fs.existsSync(OUTBOX) ? fs.readdirSync(OUTBOX).filter((f) => f.endsWith('.json') && Number(f.split('-')[0]) >= sinceMs).sort() : [];
    if (files.length) return JSON.parse(fs.readFileSync(path.join(OUTBOX, files.at(-1)), 'utf8')).text.match(/\b(\d{6})\b/)[1];
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('e-mail com o código de verificação não chegou em ' + OUTBOX);
}

/** Envia usuário e senha e espera a resposta (mudança de página ou mensagem de erro). */
export async function submitPassword(page, username, password) {
  const since = Date.now();
  await go(page, '/');
  await page.fill('#username', username);
  await page.fill('#password', password);
  await page.click('button[type=submit]');
  await page.waitForSelector('text=Entrando…', { timeout: 3000 }).catch(() => {});
  await page.waitForFunction(() => location.pathname !== '/' || !document.body.innerText.includes('Entrando…'), null, { timeout: 30000 });
  await page.waitForLoadState('networkidle');
  return since;
}

/** Login completo: senha + código do e-mail. Se a senha for recusada, fica na tela de login. */
export async function login(page, username, password) {
  const since = await submitPassword(page, username, password);
  if (!page.url().endsWith('/verificar')) return;
  await page.fill('#code', await mfaCode(since));
  await page.click('button:has-text("Verificar e entrar")');
  await page.waitForURL((u) => u.pathname !== '/verificar', { timeout: 30000 });
  await page.waitForLoadState('networkidle');
}
