// E2E da disponibilidade dos médicos e da previsão de agenda. Depende dos usuários criados em
// usuarios-e-senhas.mjs, agenda.mjs e prontuario.mjs (rodam antes, em run.sh). Dados 100% fictícios.
import Database from 'better-sqlite3';
import { open, go, BASE } from './harness.mjs';

const DB = process.env.DATABASE_FILE ?? 'data/test.db';
const db = new Database(DB);
const sql = (q, ...a) => db.prepare(q).all(...a);
const PW = { admin: 'Lotus!Petrol42xy', medico: 'Prontuario@Seguro9', secretaria: 'Novembro#Orquidea3' };

const { browser: b, page: p, problems } = await open();
console.log('Google Chrome', b.version(), 'via', BASE);
const ok = (c, m) => { if (!c) throw new Error('FALHOU: ' + m); console.log('✓', m); };
const shot = (n) => p.screenshot({ path: `test-results/pv-${n}.png`, fullPage: true });
const urls = [];
p.on('request', (r) => urls.push(decodeURIComponent(r.url()).toLowerCase()));

// ---------- datas no fuso do consultório (America/Sao_Paulo, UTC−3, sem horário de verão) ----------
const SP_OFFSET = 3 * 3600_000;
const todaySP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const addDays = (d, n) => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
const addMonths = (d, n) => {
  const [y, m, dd] = d.split('-').map(Number);
  const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + n, Math.min(dd, last))).toISOString().slice(0, 10);
};
const wd = (d) => new Date(`${d}T12:00:00Z`).getUTCDay();
const at = (d, t) => Date.parse(`${d}T${t}:00Z`) + SP_OFFSET; // "AAAA-MM-DD" + "HH:MM" (SP) → ms UTC
let nextMon = addDays(todaySP, 1);
while (wd(nextMon) !== 1) nextMon = addDays(nextMon, 1);
const nextTue = addDays(nextMon, 1);

// Grade usada no teste: segunda 08:00–12:00 e quarta 14:00–18:00, consultas de 30 min (8 horários por faixa).
const GRID = { 1: ['08:00', '12:00'], 3: ['14:00', '18:00'] };
function expectedCapacity(months) {
  let n = 0;
  const end = addMonths(todaySP, months);
  for (let d = todaySP; d < end; d = addDays(d, 1)) {
    const w = GRID[wd(d)];
    if (!w) continue;
    for (let m = Number(w[0].slice(0, 2)) * 60; m + 30 <= Number(w[1].slice(0, 2)) * 60; m += 30) {
      const t = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      if (at(d, t) > Date.now()) n++;
    }
  }
  return n;
}

// ---------- dados fictícios ----------
const letters = 'abcdefghijklmnopqrstuvwxyz';
const T = Array.from({ length: 5 }, () => letters[Math.floor(Math.random() * 26)]).join('');
const Tcap = T[0].toUpperCase() + T.slice(1);
function randomCpf() {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  for (const k of [9, 10]) { let s = 0; for (let i = 0; i < k; i++) s += n[i] * (k + 1 - i); n.push(((s * 10) % 11) % 10); }
  return n.join('');
}
const adminId = sql("select id from users where username='admin'")[0].id;
const VID = sql("select id from users where username='veronica'")[0].id;
const other = sql("select id, username from users where role='medico' and username like 'paulo.%' order by id desc limit 1")[0];
const insPatient = db.prepare('insert into patients (full_name, search_name, birth_date, sex, cpf, phone, created_by, updated_by) values (?,?,?,?,?,?,?,?)');
const mk = (first) => {
  const name = `${first} ${Tcap} Previsao`;
  return { name, id: Number(insPatient.run(name, name.toLowerCase(), '1944-05-06', 'feminino', randomCpf(), '21987650000', adminId, adminId).lastInsertRowid) };
};
const insAppt = db.prepare(
  'insert into appointments (doctor_id, patient_id, starts_at, ends_at, type, status, cancel_reason, created_by, updated_by) values (?,?,?,?,?,?,?,?,?)',
);
const appt = (doctor, patient, startMs, status, reason = null) => insAppt.run(doctor, patient, startMs, startMs + 30 * 60_000, 'consulta', status, reason, adminId, adminId);
const daysAgo = (n) => at(addDays(todaySP, -n), '10:00');

const FA = mk('Adelaide'); // 8 e 3 meses atrás, sem consulta futura → sinalizada
appt(VID, FA.id, daysAgo(240), 'atendido'); appt(VID, FA.id, daysAgo(90), 'atendido');
const FB = mk('Bernardo'); // 8 meses atrás, mas com consulta futura (outro médico) → não sinalizado
appt(VID, FB.id, daysAgo(240), 'atendido'); appt(other.id, FB.id, at(nextTue, '15:00'), 'agendado');
const FC = mk('Clotilde'); // acompanhamento recente (2 meses) → não sinalizada
appt(VID, FC.id, daysAgo(60), 'atendido');
const FD = mk('Dorival'); // 9 meses atrás → sinalizado; alta registrada pela médica durante o teste
appt(VID, FD.id, daysAgo(270), 'atendido');
const FE = mk('Etelvina'); // teve alta, mas voltou a ser atendida depois → sinalizada de novo
appt(VID, FE.id, daysAgo(250), 'atendido');
db.prepare("insert into patient_discharges (patient_id, doctor_id, reason, recorded_by, at) values (?, ?, 'alta_medica', ?, ?)").run(FE.id, VID, VID, daysAgo(200));
appt(VID, FE.id, daysAgo(30), 'atendido');

// Agenda futura da médica: 08:00 e 08:30 da próxima segunda ocupadas; 09:00 cancelada (volta a ser livre);
// terça 10:00 fora da grade.
const FX = mk('Xisto'); // paciente novo, só com consultas futuras
appt(VID, FC.id, at(nextMon, '08:00'), 'agendado');
appt(VID, FX.id, at(nextMon, '08:30'), 'confirmado');
appt(VID, FB.id, at(nextMon, '09:00'), 'cancelado', 'Paciente pediu para cancelar');
appt(VID, FX.id, at(nextTue, '10:00'), 'agendado');

// ---------- helpers ----------
async function login(u, pw) {
  await go(p, '/'); await p.fill('#username', u); await p.fill('#password', pw);
  await p.click('button[type=submit]');
  await p.waitForURL((url) => url.pathname !== '/', { timeout: 30000 });
  await p.waitForLoadState('networkidle');
}
async function logout() { await p.click('button:has-text("Sair")'); await p.waitForURL(BASE + '/'); await p.waitForLoadState('networkidle'); }
async function submit(label, busy = 'Salvando…') {
  await p.click(`button:has-text("${label}")`);
  await p.waitForSelector(`text=${busy}`, { timeout: 3000 }).catch(() => {});
  await p.waitForFunction((t) => !document.body.innerText.includes(t), busy, { timeout: 30000 });
  await p.waitForLoadState('networkidle');
}
const denied = async (path) => { await go(p, path); return p.url().includes('acesso-negado'); };
const kpi = async (id) => Number(await p.innerText(`[data-testid=${id}]`));
const flagged = async () => (await p.locator('[data-testid=follow-ups] tbody tr').evaluateAll((rows) => rows.map((r) => Number(r.dataset.patient))));

// ---------- 0. administrador ----------
await login('admin', PW.admin);
ok(!(await p.locator('nav >> text=Previsão').isVisible()), 'administrador não vê o menu Previsão');
ok(!(await p.isVisible('[data-testid=painel-financeiro]')), 'administrador não vê a visão financeira');
ok(await denied('/agenda/previsao'), 'administrador não acessa a previsão');
ok(await denied('/agenda/disponibilidade'), 'administrador não configura disponibilidade');
await logout();

// ---------- 1. médica configura a disponibilidade ----------
// Garante grade vazia (o banco de teste é reaproveitado entre execuções).
db.prepare('delete from doctor_availability where doctor_id = ?').run(VID);
db.prepare('delete from doctor_schedules where doctor_id = ?').run(VID);

await login('veronica', PW.medico);
await go(p, '/agenda/previsao');
ok(await p.isVisible('text=Você ainda não configurou seus dias e horários'), 'sem grade: previsão pede a configuração');
await p.click('a:has-text("Configurar minha disponibilidade")');
await p.waitForURL(/disponibilidade$/); await p.waitForLoadState('networkidle');

const addWin = (w) => p.locator(`[data-testid=weekday-${w}] button:has-text("Adicionar faixa")`).click();
await addWin(1);
ok((await p.inputValue('[id="w.1.0.start"]')) === '08:00' && (await p.inputValue('[id="w.1.0.end"]')) === '12:00', 'nova faixa sugere 08:00–12:00');
await addWin(1);
await p.fill('[id="w.1.1.start"]', '11:00'); await p.fill('[id="w.1.1.end"]', '13:00');
await p.fill('#price', '3,5,0');
await submit('Salvar disponibilidade');
ok(await p.isVisible('text=Valor inválido'), 'valor de consulta inválido é recusado');
ok(await p.isVisible('text=As faixas do mesmo dia não podem se sobrepor'), 'faixas sobrepostas são recusadas');
await p.locator('[data-testid=weekday-1] button:has-text("Remover")').nth(1).click();
await addWin(3);
await p.fill('[id="w.3.0.start"]', '18:00'); await p.fill('[id="w.3.0.end"]', '14:00');
await submit('Salvar disponibilidade');
ok(await p.isVisible('text=O fim deve ser depois do início'), 'faixa com fim antes do início é recusada');
ok((await p.inputValue('[id="w.1.0.start"]')) === '08:00', 'grade preservada após erro');
await p.fill('[id="w.3.0.start"]', '14:00'); await p.fill('[id="w.3.0.end"]', '18:00');
await p.selectOption('#slotMinutes', '30');
await p.fill('#priceFirst', '450');
await p.fill('#price', '350,00');
await p.fill('#priceReturn', '');
ok((await p.innerText('text=Capacidade por semana')).includes('16'), 'capacidade semanal calculada na tela (16 consultas)');
await shot('01-disponibilidade');
await submit('Salvar disponibilidade');
await p.waitForURL(/previsao\?ok=disponibilidade$/); await p.waitForLoadState('networkidle');
ok(true, 'disponibilidade salva');
const sch = sql('select price_first_cents f, price_cents c, price_return_cents r from doctor_schedules where doctor_id = ?', VID)[0];
ok(sch.f === 45000 && sch.c === 35000 && sch.r === 0, 'valores gravados em centavos (450,00 / 350,00 / retorno sem cobrança)');

// ---------- 2. previsão (3 meses) ----------
const cap3 = expectedCapacity(3);
ok((await p.innerText('[data-testid=forecast-kpis]')).includes(String(cap3)), `capacidade de 3 meses = ${cap3} horários`);
const booked = await kpi('kpi-booked');
const free = await kpi('kpi-free');
ok(booked >= 2 && booked + free === cap3, `ocupados (${booked}) + livres (${free}) = capacidade`);
ok((await p.innerText('[data-testid=forecast-kpis]')).includes('fora da grade'), 'consulta fora da grade é sinalizada');
const weeks3 = await p.locator('[data-testid=chart-weeks] [data-bar]').count();
ok(weeks3 >= 13 && weeks3 <= 15, `gráfico semanal com ${weeks3} barras (3 meses)`);
ok((await p.locator('[data-testid=chart-weekdays] [data-bar]').count()) === 2, 'gráfico por dia da semana mostra só os dias da grade (seg e qua)');
await p.locator('[data-testid=chart-weeks] [data-bar]').nth(1).hover();
const tip = await p.locator('[role=tooltip]').innerText();
ok(tip.includes('Ocupados') && tip.includes('Livres') && tip.includes('Semana de'), 'tooltip da barra mostra semana, ocupados e livres');
ok(await p.isVisible('[data-testid=chart-weeks] summary:has-text("Ver dados em tabela")'), 'gráfico tem tabela equivalente (acessibilidade)');

const monRow = p.locator(`[data-testid=opportunity-days] li[data-date="${nextMon}"]`);
const monTimes = await monRow.locator('a').allInnerTexts();
ok(!monTimes.includes('08:00') && !monTimes.includes('08:30'), 'horários ocupados não aparecem como oportunidade');
ok(monTimes.includes('09:00'), 'horário de consulta cancelada volta a ser oportunidade');
ok((await p.innerText('[data-testid=opportunity-highlights]')).includes('Dia da semana com mais vagas'), 'destaques das oportunidades listados');

// visão financeira
const brl = (t) => Number(t.replace(/[^\d,]/g, '').replace(',', '.'));
const revSched = brl(await p.innerText('[data-testid=kpi-revenue-scheduled]'));
const revPot = brl(await p.innerText('[data-testid=kpi-revenue-potential]'));
const revTotal = brl(await p.innerText('[data-testid=kpi-revenue-total]'));
ok(revPot === free * 350, `receita potencial = ${free} livres × R$ 350,00 = R$ ${revPot}`);
ok(revSched >= 3 * 350, `receita agendada inclui as consultas marcadas (R$ ${revSched})`);
ok(Math.abs(revTotal - (revSched + revPot)) < 0.01, 'total possível = agendada + potencial');
const months3 = await p.locator('[data-testid=chart-revenue] [data-bar]').count();
ok(months3 >= 3 && months3 <= 4, `gráfico de receita com ${months3} meses`);
await p.locator('[data-testid=chart-revenue] [data-bar]').first().hover();
ok((await p.locator('[role=tooltip]').innerText()).includes('R$'), 'tooltip da receita em reais');
await shot('02-previsao-3m');

// ---------- 3. pacientes sem retorno ----------
let ids = await flagged();
ok(ids.includes(FA.id), 'sinaliza paciente com +6 meses de acompanhamento, sem alta e sem consulta marcada');
ok(!ids.includes(FB.id), 'não sinaliza quem já tem consulta futura (mesmo com outro médico)');
ok(!ids.includes(FC.id), 'não sinaliza acompanhamento com menos de 6 meses');
ok(!ids.includes(FX.id), 'não sinaliza paciente sem atendimento anterior');
ok(ids.includes(FE.id), 'alta anterior a um novo atendimento não esconde o paciente');
ok(ids.includes(FD.id), 'paciente sem retorno há 9 meses é sinalizado');
ok(ids.indexOf(FD.id) < ids.indexOf(FA.id), 'ordenado por quem está há mais tempo sem consulta');
const row = p.locator(`[data-testid=follow-ups] tr[data-patient="${FD.id}"]`);
await row.locator('button:has-text("Registrar alta")').click();
await row.locator('select').selectOption('encaminhado');
await row.locator('button:has-text("Confirmar alta")').click();
await p.waitForURL(/ok=alta$/); await p.waitForLoadState('networkidle');
ids = await flagged();
ok(!ids.includes(FD.id), 'após a alta, o paciente deixa de ser sinalizado');

// agendar a partir de uma oportunidade
await p.locator(`[data-testid=opportunity-days] li[data-date="${nextMon}"] a`, { hasText: '09:00' }).click();
await p.waitForURL(/\/agenda\/nova\?/); await p.waitForLoadState('networkidle');
ok((await p.inputValue('#time')) === '09:00' && (await p.inputValue('#date')) === nextMon, 'oportunidade abre o agendamento com data e hora');
ok((await p.inputValue('#duration')) === '30', 'duração da consulta vem da grade do médico');

// 6 meses
await go(p, '/agenda/previsao?meses=6');
const weeks6 = await p.locator('[data-testid=chart-weeks] [data-bar]').count();
ok(weeks6 >= 26 && weeks6 <= 28, `6 meses: ${weeks6} barras semanais`);
ok((await p.innerText('[data-testid=forecast-kpis]')).includes(String(expectedCapacity(6))), 'capacidade de 6 meses confere');
await shot('03-previsao-6m');
await go(p, '/painel');
const card = await p.innerText('[data-testid=painel-financeiro]');
ok(card.includes('Receita agendada') && card.includes('R$'), 'painel do médico mostra a visão financeira');
await logout();

// ---------- 4. secretária ----------
await login('ana.souza', PW.secretaria);
ok(await denied('/agenda/disponibilidade'), 'secretária não configura a disponibilidade do médico');
await go(p, `/agenda/previsao?medico=${VID}`);
ok((await p.innerText('[data-testid=forecast-doctor]')).includes('Verônica'), 'secretária vê a previsão da médica escolhida');
ids = await flagged();
ok(ids.includes(FA.id), 'secretária vê a lista de pacientes sem retorno');
const tableText = await p.innerText('[data-testid=follow-ups]');
ok(!tableText.includes('987650000'), 'telefone mascarado na lista');
ok(!(await p.isVisible('button:has-text("Registrar alta")')), 'secretária não registra alta (ato médico)');
ok(await p.isVisible(`[data-testid=follow-ups] tr[data-patient="${FA.id}"] a:has-text("Agendar retorno")`), 'secretária pode agendar o retorno');
ok(await p.isVisible('[data-testid=chart-revenue]'), 'secretária vê a visão financeira do médico');
await go(p, '/painel');
ok((await p.innerText('[data-testid=painel-financeiro]')).includes('R$'), 'painel da secretária mostra a visão financeira (todos os médicos)');
await logout();

// ---------- 5. outro médico ----------
await login(other.username, 'Receita#Segura81');
await go(p, `/agenda/previsao?medico=${VID}`);
ok(!(await p.innerText('[data-testid=forecast-doctor]')).includes('Verônica'), 'médico não vê a previsão de outro médico');
ok(await p.isVisible('text=Você ainda não configurou'), 'cai na própria previsão (ainda sem grade)');
await logout();

// ---------- 6. banco e auditoria ----------
const threw = (q, ...a) => { try { db.prepare(q).run(...a); return false; } catch { return true; } };
ok(threw('delete from patient_discharges where patient_id = ?', FD.id), 'banco bloqueia exclusão de alta');
ok(threw("update patient_discharges set reason = 'outro' where patient_id = ?", FD.id), 'banco bloqueia alteração de alta');
ok(threw("insert into doctor_availability (doctor_id, weekday, start_time, end_time) values (?, 1, '12:00', '08:00')", VID), 'banco recusa faixa inválida');
ok(sql('select slot_minutes s from doctor_schedules where doctor_id = ?', VID)[0].s === 30, 'duração salva no banco');
const acts = Object.fromEntries(sql(
  "select action || ':' || resource k, count(*) n from audit_log where resource in ('previsao', 'disponibilidade', 'alta') group by k",
).map((r) => [r.k, r.n]));
console.log('auditoria:', acts);
for (const k of ['ler:previsao', 'alterar:disponibilidade', 'criar:alta', 'acesso_negado:previsao']) ok(acts[k] > 0, `auditoria registra "${k}"`);
const leak = sql("select count(*) n from audit_log where resource in ('previsao','alta') and lower(coalesce(details,'')) like ?", `%${T}%`)[0].n;
ok(leak === 0, 'auditoria não contém nomes de pacientes');
const leaked = urls.filter((u) => u.includes(T));
ok(leaked.length === 0, 'nenhuma URL contém nome de paciente');

// ---------- 7. mobile ----------
await p.setViewportSize({ width: 390, height: 844 });
await login('veronica', PW.medico);
await go(p, '/agenda/previsao'); await shot('04-mobile-previsao');

ok(problems.length === 0, 'nenhum erro de console/JS/HTTP 5xx no navegador' + (problems.length ? ': ' + JSON.stringify(problems) : ''));
await b.close();
db.close();
