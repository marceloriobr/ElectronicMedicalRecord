// E2E do prontuário clínico e do receituário. Depende dos usuários criados em usuarios-e-senhas.mjs
// e do 2º médico criado em agenda.mjs (rodam antes, em run.sh). Dados 100% fictícios.
import Database from 'better-sqlite3';
import { open, go, BASE, login as hLogin } from './harness.mjs';

const DB = process.env.DATABASE_FILE ?? 'data/test.db';
const db = new Database(DB);
const sql = (q, ...a) => db.prepare(q).all(...a);
const PW = { admin: 'Lotus!Petrol42xy', medico: 'Prontuario@Seguro9', secretaria: 'Novembro#Orquidea3' };

const { browser: b, page: p, problems } = await open();
console.log('Google Chrome', b.version(), 'via', BASE);
const ok = (c, m) => { if (!c) throw new Error('FALHOU: ' + m); console.log('✓', m); };
const shot = (n) => p.screenshot({ path: `test-results/pr-${n}.png`, fullPage: true });
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
const adminId = sql("select id from users where username='admin'")[0].id;
const insPatient = db.prepare(
  `insert into patients (full_name, search_name, birth_date, sex, cpf, phone, street, number, district, city, uf, cep, created_by, updated_by)
   values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
);
const P1 = { name: `Iolanda ${Tcap} Prontuaria`, cpf: randomCpf() };
const P2 = { name: `Osvaldo ${Tcap} Semendereco`, cpf: randomCpf() };
P1.id = Number(insPatient.run(P1.name, P1.name.toLowerCase(), '1941-02-03', 'feminino', P1.cpf, '21987654321', 'Rua Ficticia', '10', 'Centro', 'Rio de Janeiro', 'RJ', '20000000', adminId, adminId).lastInsertRowid);
P2.id = Number(insPatient.run(P2.name, P2.name.toLowerCase(), '1939-08-09', 'masculino', P2.cpf, '21987654322', null, null, null, null, null, null, adminId, adminId).lastInsertRowid);
const PR = `/pacientes/${P1.id}/prontuario`;

// ---------- helpers ----------
const login = (u, pw) => hLogin(p, u, pw); // senha + código da verificação em duas etapas
async function logout() { await p.click('button:has-text("Sair")'); await p.waitForURL(BASE + '/'); await p.waitForLoadState('networkidle'); }
async function submit(label, busy = 'Salvando…') {
  await p.click(`button:has-text("${label}")`);
  await p.waitForSelector(`text=${busy}`, { timeout: 3000 }).catch(() => {});
  await p.waitForFunction((t) => !document.body.innerText.includes(t), busy, { timeout: 30000 });
  await p.waitForLoadState('networkidle');
}
async function expectUrl(re, msg) {
  const hit = await p.waitForURL(re, { timeout: 15000 }).then(() => true, () => false);
  if (!hit) {
    console.log('URL:', p.url(), 'erros:', await p.locator('[id$=-error], [role=alert], .text-coral-dark').allInnerTexts());
    await shot('erro-' + msg.replace(/\W+/g, '-'));
  }
  ok(hit, msg);
  await p.waitForLoadState('networkidle');
  return Number(new URL(p.url()).pathname.split('/').at(-1));
}
async function pickCid(inputId, term, code) {
  await p.fill(`#${inputId}`, term);
  const opt = p.locator(`[data-testid=${inputId}-results] button`, { hasText: code });
  await opt.first().waitFor({ timeout: 15000 });
  await opt.first().click();
}
/** Status HTTP sem navegar (evita poluir o console com 404 esperados). */
const status = async (path) => (await p.request.get(BASE + path, { maxRedirects: 0 })).status();
const prontuarioLink = () => p.getByRole('link', { name: 'Prontuário', exact: true });
const denied = async (path) => { await go(p, path); return p.url().includes('acesso-negado'); };

// ---------- 0. administrador e secretária: sem acesso clínico ----------
await go(p, PR); ok(p.url() === BASE + '/', 'sem sessão: prontuário redireciona para login');
await login('admin', PW.admin);
ok(await denied(PR), 'administrador não acessa o prontuário');
ok(await denied(`/pacientes/${P1.id}/receitas/nova`), 'administrador não emite receita');
await go(p, `/pacientes/${P1.id}`);
ok(!(await prontuarioLink().isVisible()), 'administrador não vê o botão Prontuário na ficha');
await logout();

await login('ana.souza', PW.secretaria);
ok(await denied(PR), 'secretária não acessa o prontuário');
ok(await denied(`${PR}/novo?tipo=anamnese`), 'secretária não registra no prontuário');
ok(await denied(`${PR}/alergias`), 'secretária não vê alergias/medicamentos');
await go(p, `/pacientes/${P1.id}`);
ok(!(await prontuarioLink().isVisible()), 'secretária não vê o botão Prontuário na ficha');
await logout();

// ---------- 1. médica: alergias e medicamentos ----------
await login('veronica', PW.medico);
await go(p, `/pacientes/${P1.id}`);
await prontuarioLink().click();
await p.waitForURL(new RegExp(`${PR}$`)); await p.waitForLoadState('networkidle');
ok((await p.innerText('[data-testid=allergies]')).includes('Não informado'), 'prontuário novo: alergias "Não informado" no topo');
await p.click('text=Registrar alergias e medicamentos em uso');
await p.waitForURL(/alergias$/); await p.waitForLoadState('networkidle');
await p.check('input[name=negaAlergias]');
ok(await p.isDisabled('#alergias'), '"nega alergias" desabilita o campo de alergias');
await p.uncheck('input[name=negaAlergias]');
await p.fill('#alergias', 'Dipirona — urticária');
await p.fill('#medicamentosEmUso', 'Losartana 50 mg 1x/dia\nMetformina 850 mg 2x/dia');
await submit('Salvar');
await expectUrl(/prontuario\?ok=alergias$/, 'alergias e medicamentos salvos');
ok((await p.innerText('[data-testid=allergies]')).includes('Dipirona'), 'alergia aparece em destaque no topo');
ok((await p.innerText('[data-testid=current-meds]')).includes('Metformina'), 'medicamentos em uso aparecem no topo');

// ---------- 2. anamnese com CID principal e secundários ----------
await p.click('a:has-text("Nova anamnese")');
await p.waitForURL(/novo\?tipo=anamnese/); await p.waitForLoadState('networkidle');
ok((await p.innerText('[data-testid=allergies]')).includes('Dipirona'), 'alergias visíveis também no formulário');
await p.fill('#queixaPrincipal', 'Tontura ao levantar há 2 semanas');
await p.fill('#hda', 'Refere tontura postural, sem síncope.');
await p.fill('[id="vitals.paSistolica"]', '999');
await pickCid('cidPrincipal', 'hipertensao essencial', 'I10');
ok((await p.innerText('[data-testid=cid-principal]')).includes('I10'), 'busca por descrição (sem acento) encontra I10');
await pickCid('cidSecundario', 'E11.9', 'E11.9');
await pickCid('cidSecundario', 'alzheimer nao especificada', 'G30.9');
ok((await p.locator('[data-testid=cids-secundarios] li').count()) === 2, 'dois CIDs secundários selecionados');
await shot('01-anamnese');
await submit('Finalizar registro');
ok(await p.isVisible('text=Valor fora da faixa'), 'sinal vital implausível é rejeitado');
ok((await p.inputValue('#queixaPrincipal')).startsWith('Tontura'), 'texto preservado após erro');
ok((await p.innerText('[data-testid=cid-principal]')).includes('I10'), 'CID principal preservado após erro');
await p.fill('[id="vitals.paSistolica"]', '150');
await p.fill('[id="vitals.paDiastolica"]', '90');
await p.fill('[id="vitals.peso"]', '62,5');
await submit('Finalizar registro');
ok(await p.isVisible('text=Para finalizar, registre o plano'), 'finalizar exige plano terapêutico');
await p.fill('#plano', 'Ajustar anti-hipertensivo. Retorno em 30 dias.');
await submit('Finalizar registro');
const R1 = await expectUrl(/prontuario\/\d+\?ok=finalizado$/, 'anamnese finalizada');
const rec = await p.innerText('[data-testid=record-cids]');
ok(rec.includes('I10') && rec.includes('E11.9') && rec.includes('G30.9'), 'registro mostra CID principal e secundários');
ok(await p.isVisible('text=62,5 kg'), 'sinais vitais exibidos');
ok((await p.locator('textarea#queixaPrincipal').count()) === 0, 'registro finalizado não é editável');
await shot('02-registro-finalizado');

// aditamento
await p.click('button:has-text("Aditar registro")');
await submit('Registrar aditamento');
ok(await p.isVisible('text=Informe o motivo do aditamento'), 'aditamento exige motivo');
await p.fill('#motivo', 'Resultado de exame recebido');
await p.fill('#texto', 'Glicemia de jejum 132 mg/dL.');
await submit('Registrar aditamento');
await expectUrl(/ok=aditado$/, 'aditamento registrado');
ok((await p.innerText('[data-testid=addenda]')).includes('Glicemia de jejum'), 'aditamento listado com o registro original preservado');
ok((await p.innerText('[data-testid=record]')).includes('Tontura ao levantar'), 'conteúdo original permanece inalterado');

// evolução em rascunho
await go(p, `${PR}/novo?tipo=evolucao`);
await p.fill('#subjetivo', 'Rascunho: melhora parcial da tontura.');
await submit('Salvar rascunho');
const R2 = await expectUrl(/prontuario\/\d+\?ok=rascunho$/, 'evolução salva como rascunho');
ok((await p.inputValue('#subjetivo')).includes('melhora parcial'), 'rascunho reabre para edição');
await go(p, PR);
ok((await p.innerText('[data-testid=records]')).includes('Rascunho'), 'lista mostra o rascunho');

// ---------- 3. receitas ----------
await go(p, `/pacientes/${P1.id}/receitas/nova`);
await p.fill('[id="items.0.medicamento"]', 'Sertralina 50 mg, comprimido');
ok(await p.isVisible('text=Sujeito a controle especial'), 'alerta imediato: sertralina exige controle especial');
await p.fill('[id="items.0.posologia"]', '1 comprimido pela manhã');
await p.fill('[id="items.0.quantidade"]', '30 (trinta) comprimidos');
await submit('Emitir receita');
ok(await p.isVisible('text=use a receita de controle especial'), 'servidor bloqueia controlado em receita simples');
await p.fill('[id="items.0.medicamento"]', 'Clonazepam 2 mg, comprimido');
await p.check('input[value=controle_especial]');
await submit('Emitir receita');
ok(await p.isVisible('text=exige Notificação de Receita em talonário oficial'), 'servidor bloqueia substância de notificação (B1)');
// receita simples válida (com antimicrobiano -> 2 vias)
await p.check('input[value=simples]');
await p.fill('[id="items.0.medicamento"]', 'Losartana potássica 50 mg, comprimido');
await p.fill('[id="items.0.quantidade"]', '2 caixas');
await p.click('button:has-text("Adicionar medicamento")');
await p.fill('[id="items.1.medicamento"]', 'Amoxicilina 500 mg, cápsula');
await p.fill('[id="items.1.posologia"]', '1 cápsula de 8/8 h');
await p.fill('[id="items.1.quantidade"]', '21 cápsulas');
await p.fill('[id="items.1.duracao"]', '7 dias');
await shot('03-receita-simples');
await submit('Emitir receita');
const RX1 = await expectUrl(/receitas\/\d+\?ok=emitida$/, 'receita simples emitida');
ok((await p.innerText('[data-testid=prescription] h2')) === 'Receita simples', 'tipo escolhido após erro é o que foi emitido (sem reset do formulário)');
ok((await p.locator('[data-testid=prescription] li').count()) === 2, 'os dois medicamentos foram emitidos');
await go(p, `/impressao/pacientes/${P1.id}/receitas/${RX1}`);
ok((await p.locator('[data-testid=rx-sheet]').count()) === 2, 'receita com antimicrobiano imprime 2 vias');
ok(await p.isVisible('text=Validade: 10 dias'), 'antimicrobiano: validade de 10 dias');
ok((await p.title()).includes('Impressão de receita') && !(await p.title()).includes(Tcap), 'título da impressão não contém nome do paciente');
await shot('04-impressao-simples');

// controle especial: paciente sem endereço é bloqueado
await go(p, `/pacientes/${P2.id}/receitas/nova`);
await p.check('input[value=controle_especial]');
await p.fill('[id="items.0.medicamento"]', 'Sertralina 50 mg, comprimido');
await p.fill('[id="items.0.posologia"]', '1 comprimido pela manhã');
await p.fill('[id="items.0.quantidade"]', '30 (trinta) comprimidos');
await submit('Emitir receita');
ok(await p.isVisible('text=exige o endereço completo do paciente'), 'controle especial exige endereço do paciente');
// controle especial válido
await go(p, `/pacientes/${P1.id}/receitas/nova?registro=${R1}`);
await p.check('input[value=controle_especial]');
await p.fill('[id="items.0.medicamento"]', 'Sertralina 50 mg, comprimido');
await p.fill('[id="items.0.posologia"]', '1 comprimido pela manhã');
await p.fill('[id="items.0.quantidade"]', '30 (trinta) comprimidos');
await p.fill('[id="items.0.duracao"]', '30 dias');
await submit('Emitir receita');
const RX2 = await expectUrl(/receitas\/\d+\?ok=emitida$/, 'receita de controle especial emitida');
await go(p, `/impressao/pacientes/${P1.id}/receitas/${RX2}`);
ok((await p.locator('[data-testid=rx-sheet]').count()) === 2, 'controle especial imprime 2 vias');
const sheet = await p.innerText('body');
ok(/1ª via — Farmácia/i.test(sheet) && /2ª via — Paciente/i.test(sheet), 'vias identificadas (farmácia e paciente)');
ok(/Identificação do comprador/i.test(sheet) && /Identificação do fornecedor/i.test(sheet), 'campos de comprador e fornecedor (Portaria 344)');
ok(sheet.includes('Rua Ficticia'), 'endereço do paciente impresso');
await shot('05-impressao-controle-especial');

// cancelamento
await go(p, `/pacientes/${P1.id}/receitas/${RX1}`);
await p.click('button:has-text("Cancelar receita")');
await submit('Confirmar cancelamento', 'Cancelando…');
ok(await p.isVisible('text=Informe o motivo do cancelamento'), 'cancelamento exige motivo');
await p.fill('#reason', 'Erro de digitação na posologia');
await submit('Confirmar cancelamento', 'Cancelando…');
await expectUrl(/ok=cancelada$/, 'receita cancelada');
ok(await p.isVisible('text=Motivo: Erro de digitação'), 'motivo do cancelamento exibido; conteúdo original preservado');
ok(!(await p.isVisible('a:has-text("Imprimir receita")')), 'receita cancelada não oferece impressão');
ok((await status(`/impressao/pacientes/${P1.id}/receitas/${RX1}`)) === 404, 'impressão de receita cancelada é recusada');
ok((await status(`/pacientes/${P2.id}/receitas/${RX2}`)) === 404, 'receita não abre pelo id de outro paciente');
await go(p, PR);
ok((await p.innerText('[data-testid=prescriptions]')).includes('Cancelada'), 'lista de receitas mostra a cancelada');

// ---------- 4. encerramento por inatividade ----------
const vId = sql("select id from users where username='veronica'")[0].id;
db.prepare('update sessions set last_seen_at = ? where user_id = ?').run(Date.now() - 31 * 60_000, vId);
await go(p, PR);
ok(p.url().includes('sessao=expirada'), 'após 30 min sem atividade, área clínica encerra a sessão');
ok(await p.isVisible('text=encerrada por inatividade'), 'login explica o encerramento por inatividade');

// ---------- 5. outro médico ----------
const other = sql("select username from users where role='medico' and username like 'paulo.%' order by id desc limit 1")[0].username;
await login(other, 'Consulta#Lirio77');
if (p.url().endsWith('/alterar-senha')) {
  await p.fill('#currentPassword', 'Consulta#Lirio77'); await p.fill('#newPassword', 'Receita#Segura81'); await p.fill('#confirmPassword', 'Receita#Segura81');
  await submit('Salvar nova senha'); await p.waitForURL(/painel/);
}
await go(p, PR);
const list = await p.innerText('[data-testid=records]');
ok(list.includes('Anamnese') && !list.includes('Rascunho'), 'outro médico vê o registro finalizado, mas não o rascunho alheio');
ok((await status(`${PR}/${R2}`)) === 404, 'rascunho de outro médico não abre nem pela URL');
await go(p, `${PR}/${R1}`);
ok(!(await p.isVisible('button:has-text("Aditar registro")')), 'somente o autor pode aditar');
await go(p, `/pacientes/${P1.id}/receitas/${RX2}`);
ok(!(await p.isVisible('button:has-text("Cancelar receita")')), 'somente o emitente pode cancelar a receita');
await logout();

// ---------- 6. banco: criptografia, imutabilidade e auditoria ----------
const blobs = sql(
  `select payload from clinical_records where patient_id=? union all select payload from clinical_profiles where patient_id=?
   union all select payload from prescriptions where patient_id=? union all
   select a.payload from clinical_addenda a join clinical_records r on r.id=a.record_id where r.patient_id=?`,
  P1.id, P1.id, P1.id, P1.id,
).map((r) => r.payload).join('\n').toLowerCase();
ok(blobs.length > 0 && !['dipirona', 'tontura', 'i10', 'sertralina', 'glicemia', 'losartana', P1.name.toLowerCase()].some((w) => blobs.includes(w)),
  'conteúdo clínico gravado criptografado (nenhum texto em claro no banco)');
const threw = (q, ...a) => { try { db.prepare(q).run(...a); return false; } catch { return true; } };
ok(threw('update clinical_records set payload = payload where id = ?', R1), 'banco bloqueia alteração de registro finalizado');
ok(threw('delete from clinical_records where id = ?', R2), 'banco bloqueia exclusão de registro (inclusive rascunho)');
ok(threw('update clinical_addenda set payload = payload'), 'banco bloqueia alteração de aditamento');
ok(threw('delete from clinical_profiles where patient_id = ?', P1.id), 'banco bloqueia exclusão do histórico de alergias');
ok(threw("update prescriptions set payload = 'x' where id = ?", RX2), 'banco bloqueia alteração de receita emitida');
ok(threw('delete from prescriptions where id = ?', RX2), 'banco bloqueia exclusão de receita');
ok(threw("update prescriptions set status='emitida', cancelled_at=null, cancelled_by=null, cancel_reason=null where id = ?", RX1), 'receita cancelada não volta a valer');
ok(threw('insert into clinical_addenda (record_id, author_id, key_version, payload) values (?, ?, 1, ?)', R2, vId, 'x'), 'banco bloqueia aditamento em rascunho');

const acts = Object.fromEntries(sql(
  "select action || ':' || resource k, count(*) n from audit_log where patient_id in (?, ?) or resource = 'permissao' group by k", P1.id, P2.id,
).map((r) => [r.k, r.n]));
console.log('auditoria:', acts);
for (const k of ['ler:prontuario', 'ler:registro_clinico', 'criar:registro_clinico', 'aditar:registro_clinico', 'alterar:alergias_medicamentos',
  'emitir:receita', 'imprimir:receita', 'cancelar:receita', 'ler:receita', 'acesso_negado:permissao']) ok(acts[k] > 0, `auditoria registra "${k}"`);
ok(sql("select count(*) n from audit_log where action='sessao_expirada' and user_id=?", vId)[0].n > 0, 'auditoria registra a sessão expirada');
const auditText = sql('select coalesce(details, \'\') d from audit_log where patient_id in (?, ?)', P1.id, P2.id).map((r) => r.d).join(' ').toLowerCase();
ok(!['dipirona', 'tontura', 'i10', 'sertralina', T].some((w) => auditText.includes(w)), 'auditoria não contém conteúdo clínico nem nome');
const leaked = urls.filter((u) => ['tontura', 'dipirona', 'hipertens', 'sertralina', 'alzheimer', T].some((w) => u.includes(w)) || u.includes(P1.cpf));
ok(leaked.length === 0, 'nenhuma URL contém dado clínico, nome ou CPF' + (leaked.length ? ': ' + leaked.join(', ') : ''));

// ---------- 7. mobile ----------
await p.setViewportSize({ width: 390, height: 844 });
await login('veronica', PW.medico);
await go(p, PR); await shot('06-mobile-prontuario');
await go(p, `${PR}/${R1}`); await shot('07-mobile-registro');

ok(problems.length === 0, 'nenhum erro de console/JS/HTTP 5xx no navegador' + (problems.length ? ': ' + JSON.stringify(problems) : ''));
await b.close();
db.close();
