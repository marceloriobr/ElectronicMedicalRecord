// Navegador real (Google Chrome) acessando o app pelo proxy do Codespaces.
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
