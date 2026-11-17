import { open, go, BASE, login as hLogin } from './harness.mjs';
import { execSync } from 'node:child_process';
const DB = process.env.DATABASE_FILE ?? 'data/test.db';
const ADMIN_PW = process.env.EMR_ADMIN_PASSWORD; // senha provisória do admin do banco de TESTE (definida em run.sh)
const sql = (q) => execSync(`node -e "const d=require('better-sqlite3')('${DB}');console.log(JSON.stringify(d.prepare(\\"${q}\\").${q.startsWith('select')?'all':'run'}()))"`).toString().trim();
const { browser: b, page: p, problems } = await open();
console.log('Google Chrome', b.version(), 'via', BASE);
const ok = (c, m) => { if (!c) throw new Error('FALHOU: ' + m); console.log('✓', m); };
const shot = (n) => p.screenshot({ path: `test-results/${n}.png`, fullPage: true });

const login = (u, pw) => hLogin(p, u, pw); // senha + código da verificação em duas etapas
async function changePw(cur, nw) {
  await p.fill('#currentPassword', cur); await p.fill('#newPassword', nw); await p.fill('#confirmPassword', nw);
  await p.click('button[type=submit]');
  await p.waitForSelector('text=Salvando…', { timeout: 3000 }).catch(() => {});
  await p.waitForFunction(() => location.pathname === '/painel' || !document.body.innerText.includes('Salvando…'), null, { timeout: 15000 });
  await p.waitForLoadState('networkidle');
}
async function logout() { await p.click('button:has-text("Sair")'); await p.waitForURL(BASE + '/'); await p.waitForLoadState('networkidle'); }

// proxy sem cookie
await go(p, '/usuarios'); ok(p.url() === BASE + '/', 'sem sessão: /usuarios redireciona para login');

// 1. admin com senha provisória
await login('admin', ADMIN_PW);
ok(p.url().endsWith('/alterar-senha'), 'admin com senha provisória vai para /alterar-senha');
await go(p, '/painel'); ok(p.url().endsWith('/alterar-senha'), 'não consegue acessar /painel antes de trocar');
// senha fraca: botão desabilitado
await p.fill('#newPassword', 'abc'); 
ok(await p.isDisabled('button[type=submit]'), 'senha fraca: botão desabilitado');
await p.fill('#newPassword', 'Admin#Forte2026x');
ok(await p.textContent('[role=meter] + span') !== 'Forte' , 'senha contendo o usuário não é considerada forte');
await p.fill('#newPassword', 'Lotus!Petrol42xy'); await p.waitForTimeout(100);
await shot('01-alterar-senha-forte');
// reutilizar senha atual
await changePw(ADMIN_PW, ADMIN_PW);
ok(await p.isVisible('text=não pode ser igual'), 'não aceita repetir a senha atual');
await shot('02-repetir-senha');
await changePw(ADMIN_PW, 'Lotus!Petrol42xy');
ok(p.url().includes('/painel'), 'troca válida leva ao painel');
ok(await p.isVisible('text=Senha alterada com sucesso'), 'mensagem de sucesso');
await shot('03-painel-admin');

// 2. cadastro de médico
await go(p, '/usuarios/novo');
await shot('04-novo-usuario-vazio');
await p.fill('#name', 'Verônica Avolio'); await p.fill('#username', 'veronica');
await p.fill('#email', 'medica@example.com');
await p.getByText('Médico(a)', { exact: true }).click(); await p.fill('#crm', '123456'); await p.selectOption('#crmUf', 'RJ');
await p.fill('#password', 'fraca'); await p.waitForTimeout(100);
await shot('05-novo-usuario-senha-fraca');
await p.fill('#password', 'Consulta#Lirio77'); await p.fill('#confirmPassword', 'Consulta#Lirio77');
await shot('06-novo-usuario-preenchido');
await p.click('button:has-text("Cadastrar usuário")'); await p.waitForURL(/usuarios\?criado/, { timeout: 30000 });
ok(true, 'médico cadastrado');
// e-mail é obrigatório (recebe o código da verificação em duas etapas)
await go(p, '/usuarios/novo');
await p.fill('#name', 'Sem Email Teste'); await p.fill('#username', 'sem.email'); await p.getByText('Secretária', { exact: true }).click();
await p.fill('#password', 'Recepcao!Flor88'); await p.fill('#confirmPassword', 'Recepcao!Flor88');
await p.click('button:has-text("Cadastrar usuário")'); await p.waitForSelector('text=Informe um e-mail válido');
ok(true, 'usuário sem e-mail é rejeitado no servidor');
// secretária
await go(p, '/usuarios/novo');
await p.fill('#name', 'Ana Souza'); await p.fill('#username', 'ana.souza'); await p.fill('#email', 'secretaria@example.com'); await p.getByText('Secretária', { exact: true }).click();
await p.fill('#password', 'Recepcao!Flor88'); await p.fill('#confirmPassword', 'Recepcao!Flor88');
await p.click('button:has-text("Cadastrar usuário")'); await p.waitForURL(/usuarios\?criado/, { timeout: 30000 });
ok(true, 'secretária cadastrada');
// duplicado
await go(p, '/usuarios/novo');
await p.fill('#name', 'Outra Pessoa'); await p.fill('#username', 'veronica'); await p.fill('#email', 'outra@example.com'); await p.getByText('Secretária', { exact: true }).click();
await p.fill('#password', 'Recepcao!Flor88'); await p.fill('#confirmPassword', 'Recepcao!Flor88');
await p.click('button:has-text("Cadastrar usuário")'); await p.waitForSelector('text=já está em uso');
ok(await p.inputValue('#name') === 'Outra Pessoa', 'usuário duplicado: erro e dados mantidos');
// médico sem CRM (bypass de cliente via servidor): tenta com CRM vazio
await go(p, '/usuarios/novo');
await p.fill('#name', 'Dr Teste Silva'); await p.fill('#username', 'drteste'); await p.fill('#email', 'drteste@example.com'); await p.getByText('Médico(a)', { exact: true }).click();
await p.fill('#password', 'Recepcao!Flor88'); await p.fill('#confirmPassword', 'Recepcao!Flor88');
await p.click('button:has-text("Cadastrar usuário")'); await p.waitForSelector('text=Informe o CRM');
ok(true, 'médico sem CRM é rejeitado no servidor');
await go(p, '/usuarios'); await shot('07-lista-usuarios');
await logout();

// 3. médico: primeiro acesso, sem acesso a /usuarios
await login('veronica', 'Consulta#Lirio77');
ok(p.url().endsWith('/alterar-senha'), 'médico no 1º acesso precisa trocar senha');
await changePw('Consulta#Lirio77', 'Prontuario@Seguro9');
ok(p.url().includes('/painel'), 'médico trocou a senha');
await go(p, '/usuarios'); ok(p.url().includes('acesso-negado'), 'médico não acessa /usuarios');
await logout();

// 4. senha vencida (> 90 dias) da secretária
await login('ana.souza', 'Recepcao!Flor88'); await changePw('Recepcao!Flor88', 'Agenda#Tulipa55');
await logout();
sql("update users set password_changed_at = (unixepoch()-100*86400)*1000 where username='ana.souza'");
await login('ana.souza', 'Agenda#Tulipa55');
ok(p.url().endsWith('/alterar-senha'), 'senha com 100 dias: obrigado a trocar');
ok(await p.isVisible('text=mais de 90 dias'), 'aviso de senha vencida');
await shot('08-senha-vencida');
await changePw('Agenda#Tulipa55', 'Recepcao!Flor88');
ok(await p.isVisible('text=não pode ser igual'), 'não aceita senha anterior do histórico');
await changePw('Agenda#Tulipa55', 'Novembro#Orquidea3');
ok(p.url().includes('/painel'), 'senha vencida trocada com sucesso');
await logout();

// 5. bloqueio por tentativas
for (let i = 0; i < 5; i++) await login('veronica', 'errada' + i);
await login('veronica', 'Prontuario@Seguro9');
ok(p.url() === BASE + '/' && sql("select count(*) n from users where username='veronica' and locked_until > unixepoch()*1000").includes('"n":1'), 'bloqueio após 5 tentativas erradas: nem a senha certa entra');
const lockedMsg = await p.innerText('form p.text-coral-dark');
await login('nao.existe', 'Qualquer#Senha123');
ok(lockedMsg === await p.innerText('form p.text-coral-dark') && lockedMsg.includes('Usuário ou senha inválidos'), 'usuário bloqueado e usuário inexistente recebem a MESMA mensagem (sem revelar contas)');
sql("update users set locked_until=null, failed_login_attempts=0 where username='veronica'");

console.log(sql("select username, role, crm, crm_uf, must_change_password, active from users"));
console.log(sql("select user_id, count(*) n from password_history group by user_id"));
await p.setViewportSize({ width: 390, height: 844 });
await login('admin', 'Lotus!Petrol42xy'); await go(p, '/usuarios/novo'); await shot('09-mobile-novo');
ok(problems.length === 0, 'nenhum erro de console/JS/HTTP 5xx no navegador' + (problems.length ? ': ' + JSON.stringify(problems) : ''));
await b.close();
