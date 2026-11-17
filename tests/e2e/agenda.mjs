// E2E da agenda de consultas. Depende dos usuários criados em usuarios-e-senhas.mjs (roda antes, em run.sh).
// Dados 100% fictícios: pacientes com CPF aleatório e nomes com sufixo aleatório; data da agenda no futuro.
import Database from 'better-sqlite3';
import { open, go, BASE, login as hLogin } from './harness.mjs';

const DB = process.env.DATABASE_FILE ?? 'data/test.db';
const db = new Database(DB);
const sql = (q, ...a) => db.prepare(q).all(...a);
const PW = { admin: 'Lotus!Petrol42xy', medico: 'Prontuario@Seguro9', secretaria: 'Novembro#Orquidea3' };

const { browser: b, page: p, problems } = await open();
console.log('Google Chrome', b.version(), 'via', BASE);
const ok = (c, m) => { if (!c) throw new Error('FALHOU: ' + m); console.log('✓', m); };
const shot = (n) => p.screenshot({ path: `test-results/ag-${n}.png`, fullPage: true });
const urls = [];
p.on('request', (r) => urls.push(decodeURIComponent(r.url()).toLowerCase()));

// ---------- dados fictícios ----------
const letters = 'abcdefghijklmnopqrstuvwxyz';
const T = Array.from({ length: 5 }, () => letters[Math.floor(Math.random() * 26)]).join('');
const Tcap = T[0].toUpperCase() + T.slice(1);
function randomCpf() {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  for (const k of [9, 10]) { let s = 0; for (let i = 0; i < k; i++) s += n[i] * (k + 1 - i); n.push(((s * 10) % 11) % 10); }
  return n.join('');
}
const todaySP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const addDays = (d, n) => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
const D = addDays(todaySP, 10 + Math.floor(Math.random() * 200));
const YESTERDAY = addDays(todaySP, -1);

const adminId = sql("select id from users where username='admin'")[0].id;
const VID = sql("select id from users where username='veronica'")[0].id;
const insPatient = db.prepare(
  "insert into patients (full_name, search_name, birth_date, sex, cpf, phone, created_by, updated_by) values (?,?,?,?,?,?,?,?)",
);
const P1 = { name: `Helena ${Tcap} Alfa`, cpf: randomCpf() };
const P2 = { name: `Rui ${Tcap} Beta`, cpf: randomCpf() };
for (const pt of [P1, P2]) {
  pt.id = Number(insPatient.run(pt.name, pt.name.toLowerCase(), '1945-04-12', 'feminino', pt.cpf, '21987654321', adminId, adminId).lastInsertRowid);
}

// ---------- helpers ----------
const login = (u, pw) => hLogin(p, u, pw); // senha + código da verificação em duas etapas
async function logout() { await p.click('button:has-text("Sair")'); await p.waitForURL(BASE + '/'); await p.waitForLoadState('networkidle'); }
async function submit(label, busy = 'Salvando…') {
  await p.click(`button:has-text("${label}")`);
  await p.waitForSelector(`text=${busy}`, { timeout: 3000 }).catch(() => {});
  await p.waitForFunction((t) => !document.body.innerText.includes(t), busy, { timeout: 30000 });
  await p.waitForLoadState('networkidle');
}
async function pickPatient(term) {
  await p.fill('#patientSearch', term);
  await p.press('#patientSearch', 'Enter');
  await p.click('button:has-text("Selecionar")');
  await p.waitForSelector('[data-testid=selected-patient]');
}
async function expectUrl(re, msg) {
  const hit = await p.waitForURL(re, { timeout: 15000 }).then(() => true, () => false);
  if (!hit) {
    console.log('URL:', p.url(), 'erros:', await p.locator('[id$=-error], [role=alert], .text-coral-dark').allInnerTexts());
    await shot('erro-' + msg.replace(/\W+/g, '-'));
  }
  ok(hit, msg);
  await p.waitForLoadState('networkidle');
  return Number(new URL(p.url()).pathname.split('/')[2]);
}
async function newAppointment({ doctor, time, date = D, patient }) {
  await go(p, `/agenda/nova?${doctor ? `medico=${doctor}&` : ''}data=${date}&hora=${time}`);
  if (patient) await pickPatient(patient);
}
const status = () => p.locator('h1 + p + div span').first().innerText();

// ---------- 0. sem sessão / administrador ----------
await go(p, '/agenda'); ok(p.url() === BASE + '/', 'sem sessão: /agenda redireciona para login');
await login('admin', PW.admin);
ok(!(await p.locator('nav >> text=Agenda').isVisible()), 'administrador não vê o menu Agenda');
await go(p, '/agenda'); ok(p.url().includes('acesso-negado'), 'administrador não acessa /agenda');
// segundo médico (só como alvo de agenda; não faz login)
await go(p, '/usuarios/novo');
await p.fill('#name', 'Paulo Medico Souza'); await p.fill('#username', `paulo.${T}`); await p.fill('#email', `paulo.${T}@example.com`);
await p.getByText('Médico(a)', { exact: true }).click(); await p.fill('#crm', '654321'); await p.selectOption('#crmUf', 'SP');
await p.fill('#password', 'Consulta#Lirio77'); await p.fill('#confirmPassword', 'Consulta#Lirio77');
await p.click('button:has-text("Cadastrar usuário")'); await p.waitForURL(/usuarios\?criado/, { timeout: 30000 });
const DOC2 = sql('select id from users where username=?', `paulo.${T}`)[0].id;
ok(DOC2 > 0, 'segundo médico cadastrado');
await logout();

// ---------- 1. secretária ----------
await login('ana.souza', PW.secretaria);
ok(await p.locator('nav >> text=Agenda').isVisible(), 'secretária vê o menu Agenda');
ok(await p.isVisible('[data-testid=painel-agenda]'), 'painel mostra o card da agenda');
await go(p, `/agenda?data=${D}&medico=${VID}`);
ok((await p.innerText('[data-testid=agenda-doctor]')).includes('Verônica'), 'agenda do dia da médica escolhida');
ok((await p.locator('a:has-text("Livre · agendar")').count()) === 20, 'grade com 20 horários livres (08:00–18:00, 30 min)');
await shot('01-dia-vazio');

await p.click(`a[href*="hora=09:00"]`);
await p.waitForURL(/\/agenda\/nova/); await p.waitForLoadState('networkidle');
ok((await p.inputValue('#time')) === '09:00' && (await p.inputValue('#doctorId')) === String(VID), 'horário livre pré-preenche médico, data e hora');
await submit('Agendar consulta');
ok(await p.isVisible('text=Selecione o paciente.'), 'agendar sem paciente é rejeitado');
ok((await p.inputValue('#doctorId')) === String(VID), 'médico escolhido mantido após erro');
await pickPatient(`${T} alfa`);
await p.fill('#note', 'Trazer exames anteriores');
await shot('02-nova-preenchida');
await submit('Agendar consulta');
const A1 = await expectUrl(/\/agenda\/\d+\?ok=agendada$/, 'consulta agendada');
ok((await status()) === 'Agendado', 'situação inicial: Agendado');
ok(await p.isVisible('text=agendou a consulta'), 'histórico registra o agendamento');

// conflito do médico -> encaixe
await newAppointment({ doctor: VID, time: '09:00', patient: `${T} beta` });
await submit('Agendar consulta');
ok(await p.isVisible('text=Horário ocupado'), 'horário ocupado do médico é detectado');
await shot('03-conflito');
await p.check('input[name=allowOverlap]');
await submit('Agendar consulta');
const A2 = await expectUrl(/\/agenda\/\d+\?ok=agendada$/, 'encaixe confirmado é agendado');
ok(await p.isVisible('text=Encaixe'), 'consulta marcada como encaixe');

// conflito do paciente (outro médico, horário sobreposto)
await newAppointment({ doctor: DOC2, time: '09:15', patient: `${T} alfa` });
await submit('Agendar consulta');
ok(await p.isVisible('text=O paciente já tem consulta marcada'), 'paciente não pode ter duas consultas no mesmo horário');
// fora do horário da clínica
await newAppointment({ doctor: DOC2, time: '06:00', patient: `${T} beta` });
await submit('Agendar consulta');
ok(await p.isVisible('text=A consulta deve ocorrer entre'), 'horário fora do expediente é rejeitado');
// no passado
await p.fill('#date', YESTERDAY); await p.fill('#time', '10:00');
await submit('Agendar consulta');
ok(await p.isVisible('text=já passou'), 'agendamento no passado é rejeitado');
// consulta do 2º médico (usada depois no teste de acesso do médico)
await p.fill('#date', D); await p.fill('#time', '14:00');
await submit('Agendar consulta');
const A4 = await expectUrl(/\/agenda\/\d+\?ok=agendada$/, 'secretária agenda para outro médico');

// confirmar A1
await go(p, `/agenda/${A1}`);
ok(!(await p.isVisible('button:has-text("Iniciar atendimento")')), 'secretária não vê "Iniciar atendimento"');
ok(!(await p.isVisible('button:has-text("Registrar falta")')), 'falta só aparece depois do horário');
await submit('Confirmar presença', 'Confirmar presença…');
await expectUrl(/ok=confirmado$/, 'presença confirmada');
ok((await status()) === 'Confirmado', 'situação: Confirmado');

// remarcar A2 (sai do encaixe)
await go(p, `/agenda/${A2}/remarcar`);
ok((await p.innerText('[data-testid=selected-patient]')).includes('Rui'), 'remarcação mantém o paciente');
await p.fill('#time', '10:30');
await submit('Salvar remarcação');
await expectUrl(/ok=remarcada$/, 'consulta remarcada');
ok(await p.isVisible('text=remarcou de'), 'histórico registra a remarcação');
ok(!(await p.isVisible('text=Encaixe')), 'remarcada para horário livre deixa de ser encaixe');

// cancelar A2
await p.click('button:has-text("Cancelar consulta")');
await submit('Confirmar cancelamento', 'Cancelando…');
ok(await p.isVisible('text=Informe o motivo do cancelamento'), 'cancelamento exige motivo');
await p.fill('#reason', 'Paciente pediu para cancelar');
await submit('Confirmar cancelamento', 'Cancelando…');
await expectUrl(/ok=cancelado$/, 'consulta cancelada');
ok(await p.isVisible('text=Motivo do cancelamento: Paciente pediu para cancelar'), 'motivo do cancelamento exibido');

await go(p, `/agenda?data=${D}&medico=${VID}`);
ok(await p.isVisible(`text=${P1.name}`), 'agenda do dia lista o paciente');
ok(await p.locator('a[href*="hora=10:30"]').isVisible(), 'horário da consulta cancelada volta a ficar livre');
ok(!(await p.content()).includes(P1.cpf), 'agenda não exibe CPF');
await shot('04-dia');
await go(p, `/pacientes/${P1.id}`);
ok(await p.isVisible('[data-testid=patient-appointments]'), 'ficha do paciente lista as consultas');
await logout();

// ---------- 2. médico ----------
await login('veronica', PW.medico);
ok(await p.locator('nav >> text=Agenda').isVisible(), 'médico vê o menu Agenda');
await go(p, `/agenda?data=${D}&medico=${DOC2}`);
const shown = await p.innerText('[data-testid=agenda-doctor]');
ok(shown.includes('Verônica') && !shown.includes('Paulo'), 'médico não abre a agenda de outro médico (mostra a própria)');
await go(p, `/agenda/${A4}`);
ok(p.url().includes('acesso-negado'), 'médico não abre consulta de outro médico');

// tentativa de burlar: altera o médico no formulário (campo oculto) -> servidor recusa
await newAppointment({ time: '11:00', patient: `${T} beta` });
ok((await p.locator('select#doctorId').count()) === 0, 'médico não escolhe médico no formulário');
await p.evaluate((id) => { document.querySelector('input[name=doctorId]').value = String(id); }, DOC2);
await submit('Agendar consulta');
ok(await p.isVisible('text=Você só pode gerenciar a sua própria agenda'), 'servidor recusa agendamento na agenda de outro médico');
await newAppointment({ time: '11:00', patient: `${T} beta` });
await submit('Agendar consulta');
const A3 = await expectUrl(/\/agenda\/\d+\?ok=agendada$/, 'médico agenda na própria agenda');

// atendimento
await go(p, `/agenda/${A1}`);
await submit('Iniciar atendimento', 'Iniciar atendimento…');
await expectUrl(/ok=em_atendimento$/, 'atendimento iniciado');
ok((await status()) === 'Em atendimento', 'situação: Em atendimento');
await submit('Finalizar atendimento', 'Finalizar atendimento…');
await expectUrl(/ok=atendido$/, 'atendimento finalizado');
ok((await status()) === 'Atendido', 'situação: Atendido');
ok(!(await p.isVisible('button:has-text("Cancelar consulta")')) && !(await p.isVisible('a:has-text("Remarcar")')), 'consulta atendida não pode ser cancelada nem remarcada');
await shot('05-atendido');

await go(p, `/pacientes/${P2.id}`);
const list = await p.innerText('[data-testid=patient-appointments]');
ok(!list.includes('Paulo'), 'na ficha, médico só vê consultas da própria agenda');
await logout();

// ---------- 3. banco: histórico, auditoria e guardrails ----------
const ev = sql('select event, to_status from appointment_events where appointment_id=? order by id', A1).map((r) => r.to_status);
ok(JSON.stringify(ev) === JSON.stringify(['agendado', 'confirmado', 'em_atendimento', 'atendido']), 'histórico completo da consulta: ' + ev.join(' → '));
const acts = Object.fromEntries(sql(
  "select action || ':' || resource k, count(*) n from audit_log where resource in ('consulta','agenda') and at >= ? group by k",
  Date.now() - 30 * 60_000,
).map((r) => [r.k, r.n]));
console.log('auditoria:', acts);
for (const k of ['criar:consulta', 'alterar:consulta', 'ler:consulta', 'ler:agenda', 'acesso_negado:agenda', 'acesso_negado:consulta']) ok(acts[k] > 0, `auditoria registra "${k}"`);
const leak = sql("select count(*) n from audit_log where lower(coalesce(details,'')) like ? or coalesce(details,'') like ?", `%${T}%`, `%${P1.cpf}%`)[0].n;
ok(leak === 0, 'auditoria não contém nome nem CPF');
const threw = (q) => { try { db.prepare(q).run(); return false; } catch { return true; } };
ok(threw(`delete from appointments where id=${A1}`), 'banco bloqueia DELETE de consulta');
ok(threw(`update appointment_events set to_status='cancelado' where appointment_id=${A1}`), 'banco bloqueia UPDATE no histórico');
ok(threw(`delete from appointment_events where appointment_id=${A1}`), 'banco bloqueia DELETE no histórico');
const leaked = urls.filter((u) => u.includes(' alfa') || u.includes(' beta') || u.includes(`${T} `) || u.includes(P1.cpf) || u.includes(P2.cpf));
ok(leaked.length === 0, 'nenhuma URL contém nome ou CPF de paciente' + (leaked.length ? ': ' + leaked.join(', ') : ''));
void A3;

// ---------- 4. mobile ----------
await p.setViewportSize({ width: 390, height: 844 });
await login('ana.souza', PW.secretaria);
await go(p, `/agenda?data=${D}&medico=${VID}`); await shot('06-mobile-dia');
await go(p, `/agenda/nova?medico=${VID}&data=${D}`); await shot('07-mobile-nova');

ok(problems.length === 0, 'nenhum erro de console/JS/HTTP 5xx no navegador' + (problems.length ? ': ' + JSON.stringify(problems) : ''));
await b.close();
db.close();
