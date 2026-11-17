// E2E de segurança: cabeçalhos, verificação em duas etapas, mensagens uniformes do login, administração de
// usuários, encerramento por inatividade, cifragem de textos livres, limite por IP e trilha de auditoria.
// Depende dos usuários criados em usuarios-e-senhas.mjs. Dados 100% fictícios. Roda por último (run.sh).
import Database from 'better-sqlite3';
import { open, go, BASE, login as hLogin, submitPassword, mfaCode } from './harness.mjs';

const DB = process.env.DATABASE_FILE ?? 'data/test.db';
const db = new Database(DB);
const one = (q, ...a) => db.prepare(q).get(...a);
const PW = { admin: 'Lotus!Petrol42xy', medico: 'Prontuario@Seguro9', secretaria: 'Novembro#Orquidea3' };
const START = Date.now();

const { browser: b, page: p, problems } = await open();
console.log('Google Chrome', b.version(), 'via', BASE);
const ok = (c, m) => { if (!c) throw new Error('FALHOU: ' + m); console.log('✓', m); };
const shot = (n) => p.screenshot({ path: `test-results/seg-${n}.png`, fullPage: true });
const login = (u, pw) => hLogin(p, u, pw);
const logout = async () => { await p.click('button:has-text("Sair")'); await p.waitForURL(BASE + '/'); await p.waitForLoadState('networkidle'); };
/** Espera o texto aparecer (a resposta da Server Action chega depois do clique). */
const sees = (sel) => p.waitForSelector(sel, { timeout: 15000 }).then(() => true, () => false);
const loginMessage = () => p.innerText('form p.text-coral-dark');
const audits = (action, resource) => one('select count(*) n from audit_log where at >= ? and action = ? and resource = ?', START, action, resource).n;
/** Clica no botão e espera a navegação/resposta da Server Action. */
async function act(label) {
  await p.click(`button:has-text("${label}")`);
  await p.waitForLoadState('networkidle');
}

// ---------- 1. cabeçalhos de segurança ----------
await go(p, '/');
const res = await p.request.get(BASE + '/');
const h = res.headers();
const csp = h['content-security-policy'] ?? '';
ok(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/.test(csp) && csp.includes("frame-ancestors 'none'") && csp.includes("object-src 'none'") && csp.includes("form-action 'self'"), 'Content-Security-Policy com nonce, sem frames e sem objetos');
ok(!/script-src[^;]*'unsafe-inline'/.test(csp), 'CSP não libera script inline');
const csp2 = (await p.request.get(BASE + '/')).headers()['content-security-policy'];
ok(csp !== csp2, 'o nonce da CSP muda a cada requisição');
ok(h['x-frame-options'] === 'DENY' && (h['x-content-type-options'] ?? '').includes('nosniff') && h['referrer-policy'] === 'same-origin' && !!h['permissions-policy'], 'X-Frame-Options, nosniff, Referrer-Policy e Permissions-Policy presentes');
ok(!('x-powered-by' in h), 'servidor não se identifica (sem X-Powered-By)');

// ---------- 2. login não revela quais contas existem ----------
await submitPassword(p, 'nao.existe', 'Qualquer#Senha123');
const msgUnknown = await loginMessage();
await submitPassword(p, 'veronica', 'Senha#Errada1234');
ok(msgUnknown === await loginMessage() && p.url() === BASE + '/', 'usuário inexistente e senha errada: mesma mensagem');
db.prepare("update users set failed_login_attempts = 0, locked_until = null where username = 'veronica'").run();

// ---------- 3. verificação em duas etapas ----------
const sessionsBefore = one("select count(*) n from sessions s join users u on u.id = s.user_id where u.username = 'veronica'").n;
let since = await submitPassword(p, 'veronica', PW.medico);
ok(p.url().endsWith('/verificar'), 'senha correta leva para a verificação em duas etapas (ainda sem sessão)');
ok(await sees('text=m•••••@example.com'), 'tela mostra o e-mail mascarado');
ok(one("select count(*) n from sessions s join users u on u.id = s.user_id where u.username = 'veronica'").n === sessionsBefore, 'nenhuma sessão é criada antes do código');
await shot('01-verificar');
const code = await mfaCode(since);
const stored = one("select code_hash from mfa_challenges c join users u on u.id = c.user_id where u.username = 'veronica'").code_hash;
ok(!stored.includes(code) && stored.length === 64, 'o banco guarda só o HMAC do código, nunca o código');
await go(p, '/painel');
ok(p.url() === BASE + '/', 'sem o código, as áreas internas continuam fechadas');
await go(p, '/verificar');
await p.fill('#code', code === '000000' ? '000001' : '000000'); await act('Verificar e entrar');
ok(await sees('text=Código incorreto. Restam 4 tentativa(s).'), 'código errado é recusado e as tentativas são contadas');
await act('Enviar novo código');
ok(await sees('text=/Aguarde \\d+ segundos/'), 'reenvio do código respeita o intervalo de 60 s');
await p.fill('#code', code); await p.click('button:has-text("Verificar e entrar")');
await p.waitForURL(/painel/, { timeout: 30000 });
ok(true, 'código correto conclui o login');
ok(one("select count(*) n from mfa_challenges c join users u on u.id = c.user_id where u.username = 'veronica'").n === 0, 'o código é de uso único (desafio apagado)');

// 5 códigos errados invalidam o desafio: volta para a senha
await logout();
since = await submitPassword(p, 'veronica', PW.medico);
const good = await mfaCode(since);
const bad = good === '111111' ? '222222' : '111111';
for (let i = 0; i < 5; i++) {
  await p.fill('#code', bad);
  await p.click('button:has-text("Verificar e entrar")');
  await (i < 4 ? p.waitForSelector(`text=Restam ${4 - i} tentativa(s).`) : p.waitForURL(/verificacao=expirada/, { timeout: 30000 }));
}
ok(await sees('text=A verificação em duas etapas expirou'), '5 códigos errados invalidam a verificação e exigem a senha de novo');

// ---------- 4. inatividade: navegar por página não clínica NÃO reabre o prontuário ----------
await login('veronica', PW.medico);
const vId = one("select id from users where username = 'veronica'").id;
const patientId = one('select id from patients where active = 1 order by id desc limit 1').id;
db.prepare('update sessions set last_seen_at = ? where user_id = ?').run(Date.now() - 31 * 60_000, vId);
const openSessions = one('select count(*) n from sessions where user_id = ?', vId).n;
await go(p, '/painel');
ok(p.url().endsWith('/painel'), 'após 31 min parado, a área não clínica continua acessível');
await go(p, '/pacientes');
await go(p, `/pacientes/${patientId}/prontuario`);
ok(p.url().includes('sessao=expirada'), 'o prontuário exige novo login mesmo depois de passar pelo Painel e por Pacientes');
ok(one('select count(*) n from sessions where user_id = ?', vId).n === openSessions - 1, 'a sessão inativa foi encerrada no servidor');

// ---------- 5. administração de usuários ----------
await login('veronica', PW.medico);
const anaId = one("select id from users where username = 'ana.souza'").id;
await go(p, `/usuarios/${anaId}`);
ok(p.url().includes('acesso-negado'), 'médico não acessa a administração de usuários');
await logout();

await login('admin', PW.admin);
await go(p, '/usuarios/novo');
await p.fill('#name', 'Tereza Temporaria Lima'); await p.fill('#username', 'tereza.temp'); await p.fill('#email', 'tereza@example.com');
await p.getByText('Secretária', { exact: true }).click();
await p.fill('#password', 'Recepcao!Flor88'); await p.fill('#confirmPassword', 'Recepcao!Flor88');
await p.click('button:has-text("Cadastrar usuário")'); await p.waitForURL(/usuarios\?criado/, { timeout: 30000 });
const T = one("select id from users where username = 'tereza.temp'").id;
ok(audits('criar', 'usuario') >= 1, 'cadastro de usuário é auditado');

// e-mail
await go(p, `/usuarios/${T}`);
await p.fill('#email', 'secretaria@example.com'); await act('Salvar e-mail');
ok(await sees('text=já está cadastrado'), 'e-mail de outro usuário é recusado');
await p.fill('#email', 'tereza.nova@example.com'); await act('Salvar e-mail');
ok(await sees('text=E-mail atualizado.') && one('select email from users where id = ?', T).email === 'tereza.nova@example.com', 'administrador altera o e-mail da verificação');

// bloqueio → desbloqueio
db.prepare('update users set locked_until = ? where id = ?').run(Date.now() + 15 * 60_000, T);
await go(p, '/usuarios');
ok(await p.locator('tr', { hasText: 'tereza.temp' }).getByText('Bloqueado').isVisible(), 'lista mostra o usuário bloqueado');
await go(p, `/usuarios/${T}`); await shot('02-usuario-bloqueado');
await act('Desbloquear usuário');
ok(await sees('text=Usuário desbloqueado.') && one('select locked_until l from users where id = ?', T).l === null, 'administrador desbloqueia o usuário');

// senha provisória
await p.fill('#password', 'Provisoria#Jasmim42'); await p.fill('#confirmPassword', 'Provisoria#Jasmim42');
await p.click('button:has-text("Redefinir senha")'); await p.waitForURL(/ok=senha/, { timeout: 30000 });
ok(one('select must_change_password m from users where id = ?', T).m === 1, 'administrador define senha provisória (troca obrigatória)');

// desativar → não entra; reativar → entra e é obrigado a trocar a senha
await act('Desativar usuário');
ok(await sees('text=Usuário desativado.') && one('select active a from users where id = ?', T).a === 0, 'administrador desativa o usuário');
await logout();
await submitPassword(p, 'tereza.temp', 'Provisoria#Jasmim42');
ok(p.url() === BASE + '/' && (await loginMessage()).includes('Usuário desativado'), 'usuário desativado não entra');
await login('admin', PW.admin);
await go(p, `/usuarios/${T}`); await act('Reativar usuário');
ok(await sees('text=Usuário reativado.'), 'administrador reativa o usuário');
// o administrador não desativa a si mesmo nem redefine a própria senha por aqui
const adminId = one("select id from users where username = 'admin'").id;
await go(p, `/usuarios/${adminId}`);
ok(!(await p.isVisible('button:has-text("Desativar usuário")')) && !(await p.isVisible('button:has-text("Redefinir senha")')), 'administrador não desativa a si mesmo pela tela');
await logout();
await login('tereza.temp', 'Provisoria#Jasmim42');
ok(p.url().endsWith('/alterar-senha'), 'senha provisória obriga a troca no primeiro acesso');
await p.fill('#currentPassword', 'Provisoria#Jasmim42'); await p.fill('#newPassword', 'Pessoal#Girassol73'); await p.fill('#confirmPassword', 'Pessoal#Girassol73');
await p.click('button[type=submit]'); await p.waitForURL(/painel/, { timeout: 30000 });
await logout();

// ---------- 6. trilha de auditoria ----------
for (const [action, resource, label] of [
  ['login', 'sessao', 'login'], ['login_falho', 'sessao', 'login falho'], ['logout', 'sessao', 'logout'],
  ['alterar', 'usuario', 'alteração de e-mail'], ['desbloquear', 'usuario', 'desbloqueio'], ['redefinir_senha', 'usuario', 'redefinição de senha'],
  ['inativar', 'usuario', 'desativação'], ['reativar', 'usuario', 'reativação'], ['trocar_senha', 'usuario', 'troca de senha'],
]) ok(audits(action, resource) >= 1, `auditoria registra ${label}`);
const leaked = one("select count(*) n from audit_log where at >= ? and (details like '%example.com%' or details like '%tereza%' or details like '%nao.existe%')", START).n;
ok(leaked === 0, 'a trilha não guarda e-mail nem o usuário digitado');

// ---------- 7. textos livres cifrados em repouso (gravados pelos testes anteriores desta execução) ----------
const recent = Date.now() - 30 * 60_000;
const plain = {
  consulta_motivo: one("select count(*) n, sum(cancel_reason like 'enc:v%') e from appointments where cancel_reason is not null and cancel_reason <> 'Paciente pediu para cancelar' and updated_at >= ?", recent), // exceto o dado que previsao.mjs insere direto por SQL
  consulta_obs: one("select count(*) n, sum(note like 'enc:v%') e from appointments where note is not null and updated_at >= ?", recent),
  receita_motivo: one("select count(*) n, sum(cancel_reason like 'enc:v%') e from prescriptions where cancel_reason is not null and cancelled_at >= ?", recent),
  paciente_motivo: one("select count(*) n, sum(inactivation_reason like 'enc:v%') e from patients where inactivation_reason is not null and inactivated_at >= ?", recent),
};
for (const [k, v] of Object.entries(plain)) ok(v.n === (v.e ?? 0), `texto livre cifrado no banco: ${k} (${v.n} registro(s) recente(s))`);

// ---------- 8. limite de tentativas por IP ----------
// Descobre o IP com que o servidor enxerga este navegador e simula 30 falhas que vencem em ~20 s.
const ip = one("select ip from audit_log where action = 'login' order by id desc limit 1").ip;
const ins = db.prepare("insert into audit_log (at, user_id, action, resource, ip) values (?, null, 'login_falho', 'sessao', ?)");
const aged = Date.now() - 15 * 60_000 + 20_000;
db.transaction(() => { for (let i = 0; i < 30; i++) ins.run(aged, ip); })();
await submitPassword(p, 'veronica', PW.medico);
ok(p.url() === BASE + '/' && (await loginMessage()).includes('Muitas tentativas de acesso'), 'após 30 falhas em 15 min do mesmo IP, o login é recusado antes de conferir a senha');
await shot('03-limite-ip');
await p.waitForTimeout(21_000);
await login('veronica', PW.medico);
ok(p.url().endsWith('/painel'), 'passada a janela, o login volta a funcionar');

ok(problems.length === 0, 'nenhum erro de console/JS/HTTP 5xx no navegador' + (problems.length ? ': ' + JSON.stringify(problems) : ''));
await b.close();
console.log('\nSEGURANÇA: todos os testes passaram.');
