// E2E do cadastro de pacientes. Depende dos usuários criados em usuarios-e-senhas.mjs (roda antes, em run.sh).
// Dados 100% fictícios: CPFs aleatórios válidos e nomes com sufixo aleatório a cada execução.
import Database from 'better-sqlite3';
import { open, go, BASE, login as hLogin } from './harness.mjs';

const DB = process.env.DATABASE_FILE ?? 'data/test.db';
const db = new Database(DB);
const sql = (q, ...a) => db.prepare(q).all(...a);

const PW = { admin: 'Lotus!Petrol42xy', medico: 'Prontuario@Seguro9', secretaria: 'Novembro#Orquidea3' };

const { browser: b, page: p, problems } = await open();
console.log('Google Chrome', b.version(), 'via', BASE);
const ok = (c, m) => { if (!c) throw new Error('FALHOU: ' + m); console.log('✓', m); };
const shot = (n) => p.screenshot({ path: `test-results/pac-${n}.png`, fullPage: true });
const urls = [];
p.on('request', (r) => urls.push(decodeURIComponent(r.url())));

// ---------- dados fictícios ----------
const letters = 'abcdefghijklmnopqrstuvwxyz';
const T = Array.from({ length: 5 }, () => letters[Math.floor(Math.random() * 26)]).join('');
const Tcap = T[0].toUpperCase() + T.slice(1);
function randomCpf() {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  for (const k of [9, 10]) { let s = 0; for (let i = 0; i < k; i++) s += n[i] * (k + 1 - i); n.push(((s * 10) % 11) % 10); }
  return n.join('');
}
const fmtCpf = (d) => `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
const CPF1 = randomCpf(), CPF2 = randomCpf(), CPF3 = randomCpf(), CPF_RESP = randomCpf();
const NAME1 = `Maria ${Tcap} da Conceição`;

// ---------- helpers ----------
const login = (u, pw) => hLogin(p, u, pw); // senha + código da verificação em duas etapas
async function logout() { await p.click('button:has-text("Sair")'); await p.waitForURL(BASE + '/'); await p.waitForLoadState('networkidle'); }
async function submit(label) {
  await p.click(`button:has-text("${label}")`);
  await p.waitForSelector('text=Salvando…', { timeout: 3000 }).catch(() => {});
  await p.waitForFunction(() => !document.body.innerText.includes('Salvando…'), null, { timeout: 30000 });
  await p.waitForLoadState('networkidle');
}
async function fillAdult({ name, cpf, birth = '1948-05-20' }) {
  await p.fill('#fullName', name);
  await p.fill('#birthDate', birth);
  await p.selectOption('#sex', 'feminino');
  await p.fill('#cpf', cpf);
  await p.fill('#phone', '21987654321');
}
const patientIdFromUrl = () => Number(new URL(p.url()).pathname.split('/')[2]);
/** Espera a ficha após salvar; se não chegar, mostra os erros da tela. */
async function expectSaved(msg) {
  const saved = await p.waitForURL(/\/pacientes\/\d+\?salvo=1$/, { timeout: 15000 }).then(() => true, () => false);
  if (!saved) {
    const errs = await p.locator('[id$=-error], [role=alert], .text-coral-dark').allInnerTexts();
    console.log('URL:', p.url(), 'erros na tela:', errs);
    await shot('erro-' + msg.replace(/\W+/g, '-'));
  }
  ok(saved, msg);
  await p.waitForLoadState('networkidle');
  return patientIdFromUrl();
}
async function search(term, inactive = false) {
  await go(p, '/pacientes');
  await p.fill('#q', term);
  if (inactive) await p.check('input[name=inativos]');
  await p.click('button:has-text("Buscar")');
  await p.waitForSelector('text=encontrado(s)', { timeout: 15000 });
  if ((await p.inputValue('#q')) !== term) throw new Error('FALHOU: termo de busca deveria continuar no campo');
  return p.locator('tbody tr').count();
}

// ---------- 0. sem sessão ----------
await go(p, '/pacientes'); ok(p.url() === BASE + '/', 'sem sessão: /pacientes redireciona para login');

// ---------- 1. secretária cadastra ----------
await login('ana.souza', PW.secretaria);
ok(await p.locator('nav >> text=Pacientes').isVisible(), 'secretária vê o menu Pacientes');
ok(!(await p.locator('nav >> text=Usuários').isVisible()), 'secretária não vê o menu Usuários');

await go(p, '/pacientes/novo');
await submit('Cadastrar paciente');
ok(await p.isVisible('text=Corrija os campos destacados'), 'formulário vazio: erros no servidor');
ok(await p.isVisible('text=CPF inválido.'), 'CPF obrigatório/inválido');
await shot('01-novo-erros');

await fillAdult({ name: NAME1, cpf: CPF1.slice(0, 10) + String((Number(CPF1[10]) + 1) % 10) });
ok((await p.inputValue('#cpf')) === fmtCpf(CPF1.slice(0, 10) + String((Number(CPF1[10]) + 1) % 10)), 'máscara de CPF aplicada');
ok((await p.inputValue('#phone')) === '(21) 98765-4321', 'máscara de telefone aplicada');
await p.fill('#email', `paciente.${T}@example.com`);
await p.fill('#city', 'Rio de Janeiro'); await p.selectOption('#uf', 'RJ');
await p.check('input[name=consentWhatsapp]');
await submit('Cadastrar paciente');
ok(await p.isVisible('text=CPF inválido.'), 'CPF com dígito verificador errado é rejeitado');
ok((await p.inputValue('#fullName')) === NAME1, 'dados preenchidos são mantidos após erro');
ok((await p.inputValue('#sex')) === 'feminino' && (await p.inputValue('#uf')) === 'RJ', 'seleções (sexo/UF) mantidas após erro');
ok(await p.isChecked('input[name=consentWhatsapp]'), 'consentimento marcado é mantido após erro');
await p.fill('#cpf', CPF1);
await submit('Cadastrar paciente');
await expectSaved('paciente adulto cadastrado');
const ID1 = patientIdFromUrl();
ok(await p.isVisible(`text=${fmtCpf(CPF1)}`), 'ficha mostra o CPF completo');
ok(!(await p.isVisible('button:has-text("Inativar cadastro")')), 'secretária não vê "Inativar cadastro"');
await shot('02-ficha');

// CPF duplicado
await go(p, '/pacientes/novo');
await fillAdult({ name: `Joana ${Tcap} Pereira`, cpf: CPF1 });
await submit('Cadastrar paciente');
ok(await p.isVisible('text=Já existe um paciente cadastrado com este CPF.'), 'CPF duplicado é rejeitado');

// homônimo: mesmo nome + nascimento, CPF diferente
await go(p, '/pacientes/novo');
await fillAdult({ name: NAME1.toUpperCase(), cpf: CPF2 });
await submit('Cadastrar paciente');
ok(await p.isVisible('text=mesmo nome e data de nascimento'), 'homônimo: aviso de possível duplicidade');
await shot('03-homonimo');
await p.check('input[name=confirmHomonym]');
await submit('Cadastrar paciente');
await expectSaved('homônimo confirmado é cadastrado');
const ID2 = patientIdFromUrl();

// menor de idade + convênio
await go(p, '/pacientes/novo');
await fillAdult({ name: `Pedro ${Tcap} Lima`, cpf: CPF3, birth: '2016-02-10' });
ok(await p.isVisible('text=o responsável legal é obrigatório'), 'menor de idade: aviso de responsável obrigatório');
await p.locator('label:has(input[value=convenio])').click();
await submit('Cadastrar paciente');
ok(await p.isVisible('text=informe o responsável legal'), 'menor sem responsável é rejeitado');
ok(await p.isVisible('text=Informe o convênio.'), 'convênio sem nome é rejeitado');
await p.fill('#guardianName', `Clara ${Tcap} Lima`); await p.fill('#guardianRelationship', 'mãe');
await p.fill('#guardianCpf', CPF_RESP); await p.fill('#guardianPhone', '2133334444');
await p.fill('#insurerName', 'Saúde Fictícia'); await p.fill('#insurerCardNumber', '000123');
await submit('Cadastrar paciente');
await expectSaved('menor com responsável e convênio cadastrado');
ok(await p.isVisible('text=Menor de idade'), 'ficha sinaliza menor de idade');

// busca (POST, sem acento, sem diferenciar maiúsculas)
let n = await search(`${T} da conceicao`);
ok(n === 2, `busca por nome sem acento encontra 2 (titular + homônimo): ${n}`);
const page = await p.content();
ok(page.includes(`***.${CPF1.slice(3, 6)}.${CPF1.slice(6, 9)}-**`), 'lista mostra CPF mascarado');
ok(!page.includes(fmtCpf(CPF1)) && !page.includes(CPF1), 'lista NÃO contém o CPF completo');
ok(!page.includes('98765-4321'), 'lista NÃO contém o telefone completo');
await shot('04-busca');
n = await search(fmtCpf(CPF3));
ok(n === 1, 'busca por CPF completo');

// edição + revogação de consentimento
await go(p, `/pacientes/${ID1}/editar`);
ok((await p.inputValue('#cpf')) === fmtCpf(CPF1), 'edição carrega dados atuais');
await p.fill('#phone', '2133221100');
await p.uncheck('input[name=consentWhatsapp]');
await p.check('input[name=consentEmail]');
await submit('Salvar alterações');
ok(p.url().endsWith(`/pacientes/${ID1}?salvo=1`), 'edição salva');
ok(await p.isVisible('text=(21) 3322-1100'), 'telefone atualizado');
ok(await p.isVisible('text=Histórico de consentimentos (4)'), 'consentimento: histórico preservado (2 iniciais + 2 mudanças)');
await p.click('text=Histórico de consentimentos'); await shot('05-ficha-editada');

// acesso negado é auditado
await go(p, '/usuarios'); ok(p.url().includes('acesso-negado'), 'secretária não acessa /usuarios');
await logout();

// ---------- 2. médico inativa / reativa ----------
await login('veronica', PW.medico);
await go(p, `/pacientes/${ID2}`);
await p.click('button:has-text("Inativar cadastro")');
await p.fill('#reason', 'dup');
await p.click('button:has-text("Confirmar inativação")');
await p.waitForSelector('text=mínimo de 5 caracteres');
ok(true, 'inativação exige motivo');
await p.fill('#reason', 'Cadastro duplicado');
await p.click('button:has-text("Confirmar inativação")');
await p.waitForURL(/situacao=inativado/);
ok(await p.isVisible('text=Motivo: Cadastro duplicado'), 'paciente inativado com motivo');
ok(!(await p.isVisible('a:has-text("Editar cadastro")')), 'inativo não pode ser editado');
await shot('06-inativo');
n = await search(`${T} da conceicao`); ok(n === 1, 'busca padrão oculta inativos');
n = await search(`${T} da conceicao`, true); ok(n === 2, 'busca com "Incluir inativos"');
await go(p, `/pacientes/${ID2}`);
await p.click('button:has-text("Reativar cadastro")'); await p.waitForURL(/situacao=reativado/);
ok(await p.isVisible('text=Cadastro reativado'), 'paciente reativado');
await logout();

// ---------- 3. banco: auditoria e guardrails ----------
const acts = Object.fromEntries(sql(
  "select action, count(*) n from audit_log where patient_id in (?,?) or (resource='paciente' and action='buscar') or action='acesso_negado' group by action", ID1, ID2,
).map((r) => [r.action, r.n]));
console.log('auditoria:', acts);
for (const a of ['criar', 'alterar', 'ler', 'buscar', 'inativar', 'reativar', 'acesso_negado']) ok(acts[a] > 0, `auditoria registra "${a}"`);
const leak = sql(
  "select count(*) n from audit_log where lower(coalesce(details,'') || coalesce(resource_id,'')) like ? or coalesce(details,'') || coalesce(resource_id,'') like ?",
  `%${T}%`, `%${CPF1}%`,
)[0].n;
ok(leak === 0, 'auditoria não contém nome nem CPF de pacientes');
const alt = JSON.parse(sql("select details from audit_log where action='alterar' and patient_id=? order by id desc limit 1", ID1)[0].details);
ok(JSON.stringify(alt.campos) === '["phone"]', 'auditoria de alteração guarda só o NOME do campo alterado');
const threw = (q) => { try { db.prepare(q).run(); return false; } catch { return true; } };
ok(threw(`delete from patients where id=${ID1}`), 'banco bloqueia DELETE de paciente');
ok(threw('update audit_log set action=\'ler\' where id=(select max(id) from audit_log)'), 'banco bloqueia UPDATE na auditoria');
ok(threw('delete from audit_log'), 'banco bloqueia DELETE na auditoria');
ok(threw(`delete from patient_consents where patient_id=${ID1}`), 'banco bloqueia DELETE no histórico de consentimentos');
const leakedUrl = urls.filter((u) => u.toLowerCase().includes(T) || [CPF1, CPF2, CPF3].some((c) => u.includes(c) || u.includes(fmtCpf(c))));
ok(leakedUrl.length === 0, 'nenhuma URL contém nome ou CPF de paciente' + (leakedUrl.length ? ': ' + leakedUrl.join(', ') : ''));

// ---------- 4. mobile ----------
await p.setViewportSize({ width: 390, height: 844 });
await login('admin', PW.admin);
ok(await p.locator('nav >> text=Pacientes').isVisible(), 'admin vê o menu Pacientes');
await go(p, '/pacientes/novo'); await shot('07-mobile-novo');
await go(p, `/pacientes/${ID1}`); await shot('08-mobile-ficha');
ok(await p.isVisible('button:has-text("Inativar cadastro")'), 'admin pode inativar');

ok(problems.length === 0, 'nenhum erro de console/JS/HTTP 5xx no navegador' + (problems.length ? ': ' + JSON.stringify(problems) : ''));
await b.close();
db.close();
