# ElectronicMedicalRecord

Prontuário eletrônico básico para o consultório da Dra. Verônica Avolio (Geriatria & Clínica Médica).

## Stack

- [Next.js](https://nextjs.org) 16 (App Router, Server Actions) + React 19 + TypeScript
- Tailwind CSS 4
- Banco SQLite via [Drizzle ORM](https://orm.drizzle.team) (`better-sqlite3`)
- Node.js 24 (ver `.nvmrc`)

## Como rodar

```bash
nvm use
npm install
cp .env.example .env.local   # defina EMR_ADMIN_PASSWORD (senha provisória forte) e EMR_ADMIN_EMAIL
npm run db:migrate           # cria as tabelas em data/emr.db
npm run db:seed              # cria o primeiro administrador
npm run dev                  # http://localhost:3000
```

No primeiro acesso, o administrador é obrigado a trocar a senha provisória.

## Scripts

| Script | O que faz |
|---|---|
| `npm run db:generate` | Gera uma nova migração em `drizzle/` após alterar `src/db/schema.ts` |
| `npm run db:migrate` | Aplica as migrações no banco |
| `npm run db:seed` | Cria o administrador inicial a partir do `.env.local` |
| `npm run db:reset-admin` | Volta o administrador para a senha provisória do `.env.local` (desbloqueia e exige troca) |
| `npm run db:backup` | Backup **criptografado** em `data/backups/` (exige `EMR_BACKUP_KEY`); `npm run db:backup -- restaurar <arquivo.enc> <destino.db>` restaura |
| `npm run mail:ultimo` | Só em desenvolvimento: mostra o último e-mail gravado em `data/outbox/` (código da verificação em duas etapas) |
| `npm run db:seed-pacientes` | Cadastra 15 pacientes **fictícios** para testes (idempotente) |
| `npm run typecheck` | Checagem de tipos |
| `npm run test:e2e` | Testes de ponta a ponta no Google Chrome (ver abaixo) |

## Testes E2E

Rodam no Google Chrome (via Playwright) contra um banco **separado** (`data/test.db`),
sem tocar no banco real. No GitHub Codespaces, o teste acessa o app pelo endereço
público do codespace (`https://<codespace>-3000.app.github.dev`), o mesmo caminho do usuário.

```bash
DATABASE_FILE=data/test.db npm run dev   # terminal 1
npm run test:e2e                         # terminal 2
```

> Dica: evite acentos nas senhas. Em alguns teclados o Chrome bloqueia as teclas de acento em campos de senha.

## Segurança do acesso

- **Verificação em duas etapas (MFA) para todos os perfis**: depois da senha, um código de 6 números é enviado ao
  e-mail do usuário (validade de 10 min, 5 tentativas, até 3 envios). Por isso **todo usuário precisa de e-mail**.
  Em desenvolvimento, sem SMTP, o e-mail é gravado em `data/outbox/` — veja com `npm run mail:ultimo`
  (para o banco de teste: `DATABASE_FILE=data/test.db npm run mail:ultimo`). Em produção configure o SMTP (`.env.example`).
- **Login**: a resposta é a mesma para usuário inexistente, senha errada e usuário bloqueado; além do bloqueio por
  usuário (5 erros → 15 min) há limite de 30 falhas por IP a cada 15 min; no máximo 2 cálculos de senha simultâneos.
- **Inatividade**: após 30 min sem uso, o prontuário e as receitas exigem novo login, mesmo que o usuário navegue
  antes por outra área.
- **Administração de usuários** (`/usuarios/[id]`, somente admin): e-mail, desbloqueio, senha provisória e
  desativação/reativação — tudo auditado. Usuários não são excluídos.
- **Auditoria**: login, login falho, logout, troca/redefinição de senha e administração de usuários; toda escrita
  grava o dado e a auditoria na mesma transação.
- **Cabeçalhos**: CSP com nonce por requisição (`src/proxy.ts`), `X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy`, `Permissions-Policy` e HSTS em produção (`next.config.ts`).
- **Textos livres** (motivo de cancelamento/inativação, observação da consulta) ficam cifrados no banco.
- **Backups** criptografados com `npm run db:backup`. O arquivo do banco em uso (`data/*.db`) guarda nome, CPF e
  telefone em claro: em produção, mantenha-o em **disco/volume criptografado** e com acesso restrito.
- **Proxy reverso**: ajuste `TRUSTED_PROXY_HOPS` para que o IP da auditoria não possa ser forjado.

## Usuários e perfis

| Perfil | Acesso |
|---|---|
| Administrador | Cadastra usuários (`/usuarios`); cadastra, edita e inativa pacientes |
| Médico(a) | Exige CRM + UF no cadastro; cadastra, edita e inativa pacientes; gerencia a **própria** agenda e inicia/finaliza seus atendimentos |
| Secretária | Cadastra e edita pacientes (não inativa); gerencia a agenda de **todos** os médicos |

A matriz completa está em `src/lib/permissions.ts` (e na seção 3 do `CLAUDE.md`).

## Cadastro de pacientes (`/pacientes`)

- Busca por nome, nome social (sem diferenciar acentos/maiúsculas) ou CPF completo. A busca é enviada
  por POST: o termo **nunca** aparece na URL. Listas mostram CPF e telefone **mascarados**.
- Cadastro com validação de CPF e CNS (dígitos verificadores), telefone, CEP e e-mail.
  CPF e CNS são únicos; mesmo nome + data de nascimento gera aviso de possível duplicidade.
- Menor de 18 anos exige responsável legal; convênio exige nome e carteirinha.
- Consentimento para WhatsApp/e-mail com versão do termo e **histórico** (revogação preserva o registro).
- Pacientes **não são excluídos**: inativação com motivo (só administrador e médico); reativação possível.
- Toda leitura, busca, criação, alteração, inativação e acesso negado vai para a trilha de auditoria,
  sem nomes, CPFs ou termos pesquisados (apenas ids e nomes de campos alterados).

## Política de senhas

- Mínimo de 12 caracteres, com maiúscula, minúscula, número e caractere especial.
- Sem 3 caracteres iguais seguidos, sem conter nome/usuário e sem senhas comuns.
- Indicador de força em tempo real ao cadastrar ou trocar a senha
  (regras compartilhadas entre navegador e servidor em `src/lib/password-policy.ts`).
- Validade de **90 dias**: depois disso, o usuário é levado a `/alterar-senha` após o login.
- Não pode repetir nenhuma das **5 últimas senhas** (tabela `password_history`).
- Senha definida pelo administrador é provisória: troca obrigatória no primeiro acesso.
- Senhas armazenadas com hash **scrypt** (sal aleatório por senha).
- 5 tentativas de login erradas bloqueiam o usuário por 15 minutos.

## Banco de dados

Tabelas (ver `src/db/schema.ts` e `drizzle/*.sql`):

- `users`: cadastro, perfil (`admin` | `medico` | `secretaria`), CRM/UF, hash da senha,
  data da última troca, troca obrigatória, ativo, tentativas de login.
- `password_history`: hashes das últimas senhas de cada usuário.
- `sessions`: sessões ativas (o cookie guarda um token aleatório; o banco guarda só o hash SHA-256 dele).
  Sessões expiram em 8 horas; trocar a senha encerra as demais sessões do usuário.
- `patients`: identificação e contato dos pacientes (sem dados clínicos). DELETE bloqueado por gatilho.
- `patient_consents`: histórico de consentimentos por canal (somente inclusão).
- `audit_log`: trilha de auditoria (somente inclusão; UPDATE/DELETE bloqueados por gatilho).
- `appointments`: consultas (médico, paciente, início/fim em UTC, tipo, situação, observação
  administrativa, encaixe, motivo do cancelamento). DELETE bloqueado por gatilho.
- `appointment_events`: histórico de cada consulta (agendada, remarcada, mudanças de situação), somente inclusão.
- `clinical_records`: anamneses e evoluções (conteúdo **cifrado**; rascunho → finalizado; finalizado imutável).
- `clinical_addenda`: aditamentos dos registros finalizados (cifrados, somente inclusão).
- `clinical_profiles`: alergias e medicamentos em uso, versionados (cifrados, somente inclusão).
- `doctor_schedules` / `doctor_availability`: duração e valores da consulta e faixas semanais de cada médico.
- `patient_discharges`: altas do acompanhamento (somente inclusão).
- `prescriptions`: receitas emitidas (itens e identificação cifrados; só podem ser canceladas, com motivo).

## Agenda de consultas (`/agenda`)

- Agenda do dia por médico, com navegação entre dias e horários livres (08:00–18:00, a cada 30 min)
  que levam direto ao agendamento. Telefone mascarado; sem CPF.
- Agendar: busca do paciente (POST, fora da URL), data, horário (07:00–20:00), duração (15–90 min),
  tipo (primeira consulta, consulta, retorno) e observação **administrativa**.
- Conflitos: paciente nunca em duas consultas ao mesmo tempo; horário já ocupado do médico só como
  **encaixe** confirmado.
- Situações: Agendado → Confirmado → Em atendimento → Atendido; ou Faltou (após o horário) /
  Cancelado (com motivo). Remarcar volta para "Agendado". Histórico completo em cada consulta.
- Médico só vê e gerencia a própria agenda; a secretária, a de todos. Administrador não acessa.
- A ficha do paciente mostra as consultas e tem atalho "Agendar consulta".

## Prontuário e receituário (somente médico)

- Acesso pela ficha do paciente (botão **Prontuário**) ou pela consulta em atendimento
  (**Registrar no prontuário**). Administrador e secretária não acessam dados clínicos.
- Alergias e medicamentos em uso sempre no topo. Anamnese (primeira consulta) e evolução (retorno) com
  sinais vitais, **CID-10 principal e secundários** (tabela oficial DATASUS), avaliação e plano.
- Rascunho visível só para o autor; após **finalizar**, o registro é imutável — correções por aditamento.
- Receitas: simples ou de **controle especial** (2 vias, Portaria 344/1998). Substâncias que exigem
  notificação (A/B) são bloqueadas. Receita emitida não muda; pode ser cancelada com motivo.
- Conteúdo clínico cifrado com AES-256-GCM. Configure no `.env.local`:
  - `EMR_CLINICAL_KEYS` — **guarde uma cópia segura: sem a chave o prontuário fica ilegível**;
  - `CLINIC_NAME`, `CLINIC_ADDRESS`, `CLINIC_PHONE` — impressos nas receitas.
- Áreas clínicas encerram a sessão após 30 minutos sem atividade.

## Previsão da agenda (`/agenda/previsao`)

- O médico configura em **Minha disponibilidade** os dias e horários em que atende e a duração da consulta.
- Para os próximos **3 ou 6 meses**: capacidade, ocupados, livres e taxa de ocupação; gráfico de barras
  semanal (ocupados × livres) e de horários livres por dia da semana; destaques (semana, dia e período com
  mais vagas) e os próximos dias com horários livres — cada horário leva direto ao agendamento.
- **Pacientes sem retorno marcado**: em acompanhamento há mais de 6 meses, sem alta e sem consulta futura,
  com atalho "Agendar retorno". O médico pode registrar a **alta** (o paciente volta a aparecer se for atendido de novo).
- **Visão financeira**: com os valores de consulta particular (primeira, consulta, retorno) informados na
  disponibilidade, mostra receita agendada, receita potencial dos horários livres e gráfico mensal; o Painel
  traz o resumo dos próximos 3 meses. Convênios, descontos e faltas não são descontados.
- Secretária: previsão de todos os médicos (sem registrar alta). Médico: só a própria. Administrador: sem acesso.
