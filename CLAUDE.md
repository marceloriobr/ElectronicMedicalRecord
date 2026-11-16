@AGENTS.md

# CLAUDE.md — Prontuário Eletrônico (EMR)

Instruções permanentes para o desenvolvimento deste projeto. **Leia tudo antes de escrever código.**
Em caso de conflito entre velocidade de entrega e as regras de segurança/LGPD abaixo, **as regras vencem**.
Se uma tarefa exigir violar um guardrail, pare e pergunte ao responsável pelo projeto.

---

## 1. O que é o sistema

Plataforma web segura de **prontuário eletrônico do paciente (PEP)** para consultórios médicos
(consultório inicial: Geriatria & Clínica Médica). O sistema trata **dados pessoais sensíveis de saúde**
e está sujeito à **LGPD (Lei 13.709/2018)**, ao **sigilo médico** e às normas do **CFM**.

### Módulos funcionais

| # | Módulo | Status |
|---|---|---|
| 1 | Gestão de cadastro de usuários (login, perfis, política de senha) | ✅ Implementado |
| 2a | Cadastro de pacientes (`/pacientes`: busca, cadastro, ficha, edição, inativação, consentimentos) | ✅ Implementado |
| 2b | Gestão de agenda (`/agenda`: dia por médico, agendar, remarcar, confirmar, cancelar, falta, atendimento) | ✅ Implementado |
| 3 | Gestão clínica do paciente (`/pacientes/[id]/prontuario`: anamnese, evolução, sinais vitais, CID-10 principal e secundários, alergias/medicamentos, aditamento) | 🟡 Parcial: falta upload de anexos/exames, atestado e pedido de exame |
| 4 | Relatórios gerenciais | ⏳ A fazer |
| 5 | Receituário médico (simples e controle especial, impressão em 2 vias, cancelamento) | 🟡 Parcial: falta assinatura digital ICP-Brasil e QR Code |
| 6 | Envio de mensagens por WhatsApp e e-mail | ⏳ A fazer |
| 7 | Trilha de auditoria e painel LGPD (transversal a todos os módulos) | 🟡 Parcial: `audit_log` + `audit()` prontos (pacientes e acesso negado); falta login/logout e tela de consulta |

Atualize esta tabela quando um módulo for entregue.

---

## 2. Stack e comandos

- **Next.js 16** (App Router, Server Components, Server Actions) + **React 19** + **TypeScript** estrito
- **Tailwind CSS 4**
- **SQLite** via **Drizzle ORM** (`better-sqlite3`) — arquivo em `data/` (fora do Git)
- **Zod 4** para validação
- **Node.js 24** (`.nvmrc`)

> ⚠️ Esta versão do Next.js tem mudanças incompatíveis com versões anteriores (ex.: `middleware.ts` virou
> `src/proxy.ts`). Consulte `node_modules/next/dist/docs/` antes de usar qualquer API do Next.

```bash
npm run dev              # servidor de desenvolvimento
npm run typecheck        # next typegen + tsc --noEmit  (obrigatório antes de commit)
npm run lint             # eslint                        (obrigatório antes de commit)
npm run db:generate      # gera migração após alterar src/db/schema.ts
npm run db:migrate       # aplica migrações
npm run db:seed          # cria o admin inicial (.env.local)
npm run db:reset-admin   # volta o admin para a senha provisória
npm run db:seed-pacientes # cadastra 15 pacientes FICTÍCIOS (idempotente)
npm run test:e2e         # E2E no Chrome contra data/test.db
```

Testes E2E: rode o app com `DATABASE_FILE=data/test.db npm run dev` e depois `npm run test:e2e`.
**Nunca** rode testes contra `data/emr.db`. No Codespaces, valide pelo endereço público
`https://<codespace>-3000.app.github.dev` (mesmo caminho do usuário).

### Estrutura

```
src/app/(sistema)/        páginas autenticadas (layout com menu)
src/app/actions/          Server Actions ("use server") — fronteira de entrada de dados
src/lib/                  regras de negócio e segurança (auth, senhas, serviços)
src/db/schema.ts          schema Drizzle (fonte da verdade do banco)
drizzle/                  migrações SQL geradas — nunca editar migrações já aplicadas
src/components/           componentes de UI
scripts/                  scripts de manutenção (migrate, seed, reset)
tests/e2e/                testes de ponta a ponta (Playwright + Chrome)
```

---

## 3. Perfis e controle de acesso (RBAC)

Perfis definidos em `src/lib/roles.ts`: `admin`, `medico`, `secretaria`.
Princípio: **mínimo privilégio e necessidade de saber** (LGPD art. 6º, III). Na dúvida, **negue**.

| Funcionalidade | Administrador | Médico(a) | Secretária |
|---|:---:|:---:|:---:|
| Cadastrar/editar/desativar usuários | ✅ | ❌ | ❌ |
| Desbloquear usuário / redefinir senha provisória | ✅ | ❌ | ❌ |
| Cadastro de pacientes (dados de identificação e contato) | ✅ | ✅ | ✅ |
| Agenda: ver, marcar, remarcar, cancelar, confirmar, registrar falta | ❌ | ✅ (só a própria agenda) | ✅ (todos os médicos) |
| Agenda: iniciar / finalizar atendimento | ❌ | ✅ (só consultas dele) | ❌ |
| Ver **prontuário clínico** (anamnese, evolução, exames, diagnósticos) | ❌ | ✅ | ❌ |
| Registrar / aditar prontuário | ❌ | ✅ (somente autor) | ❌ |
| Emitir receituário, atestado, pedido de exame | ❌ | ✅ | ❌ |
| Reimprimir receita já emitida | ❌ | ✅ | ❌ |
| Relatórios gerenciais (agenda, produtividade, faltas — **agregados**) | ✅ | ✅ | ✅ (só agenda) |
| Relatórios clínicos (com dados de saúde) | ❌ | ✅ | ❌ |
| Enviar mensagens administrativas (lembrete/confirmação de consulta) | ✅ | ✅ | ✅ |
| Enviar mensagens com conteúdo clínico (ex.: receita, resultado) | ❌ | ✅ | ❌ |
| Consultar trilha de auditoria | ✅ | ❌ | ❌ |
| Atender solicitações do titular (LGPD art. 18) | ✅ | ✅ | ❌ |

Regras:

- O **administrador não acessa dados clínicos**. Ele administra o sistema, não o paciente.
- A **secretária** vê apenas dados cadastrais, agenda e status administrativo — nunca diagnóstico, CID,
  evolução, medicamentos ou anexos clínicos.
- Um usuário pode ter só um perfil. Médico precisa de CRM + UF válidos (já validado no cadastro).
- Toda página e **toda Server Action** protegida começa com `await requirePermission("modulo:acao")`
  (`src/lib/auth.ts`), que também audita o acesso negado. O `src/proxy.ts` é apenas verificação
  otimista — **nunca** é a única barreira.
- A autorização é sempre feita **no servidor**. Esconder botão na UI não é controle de acesso.
- Checar também **autorização no nível do registro** (ex.: o médico só adita evoluções que ele mesmo
  escreveu; o paciente pertence ao consultório do usuário). Nunca confie em IDs vindos do cliente.
- Ao criar uma nova rota protegida, adicione-a ao `matcher` de `src/proxy.ts`.
- As permissões ficam centralizadas em `src/lib/permissions.ts` (`PERMISSIONS` + `can(role, "...")`).
  Novo módulo = novas chaves lá (ex.: `"prontuario:ler"`); não espalhe `if (role === ...)`.

---

## 4. LGPD e dados sensíveis — guardrails obrigatórios

Dados de saúde são **dados pessoais sensíveis** (LGPD art. 5º, II e art. 11). Base legal principal:
**tutela da saúde, por profissional de saúde** (art. 11, II, "f") e cumprimento de obrigação legal
(guarda do prontuário). Comunicação por WhatsApp/e-mail exige **consentimento específico** do paciente.

### 4.1 Classificação dos dados

| Classe | Exemplos | Tratamento |
|---|---|---|
| **Sensível clínico** | anamnese, evolução, diagnóstico/CID, prescrições, exames, anexos, alergias | Criptografado em repouso no nível do campo; só perfil `medico`; auditado em leitura e escrita |
| **Pessoal identificador** | nome, CPF, RG, CNS, data de nascimento, endereço, telefone, e-mail | Acesso por perfil; CPF/telefone mascarados em listagens; auditado em escrita |
| **Credenciais** | senhas, tokens de sessão, chaves de API | Somente hash (scrypt/SHA-256) ou variável de ambiente; nunca em log, nunca no Git |
| **Operacional** | agenda (data/hora/status), métricas agregadas | Acesso por perfil |

### 4.2 Regras invioláveis

1. **Nunca** coloque dados de paciente (nome, CPF, diagnóstico etc.) em: logs (`console.log`), mensagens
   de erro, URLs/query strings, nomes de arquivo, títulos de página, analytics, mensagens de commit,
   issues/PRs, fixtures de teste ou prompts para serviços externos. Use IDs internos.
2. **Nunca** use dados reais de pacientes em desenvolvimento, testes ou demonstrações. Use dados
   **fictícios** gerados (CPFs válidos de teste, nomes inventados). `data/` e `.env*` jamais vão para o Git.
3. **Nunca** envie dados de pacientes para APIs de terceiros (IA, tradução, OCR, monitoramento de erros)
   sem aprovação explícita, contrato (operador LGPD) e anonimização quando possível.
4. **Criptografia em repouso** para campos sensíveis clínicos: AES-256-GCM, chave fora do banco
   (variável de ambiente / KMS), IV único por registro, com suporte a rotação de chave (`key_version`).
   Backups também criptografados.
5. **Criptografia em trânsito**: HTTPS obrigatório em produção (HSTS). Cookies `httpOnly`, `secure`,
   `sameSite`.
6. **Minimização**: colete só o necessário para a finalidade. Não crie campos "por via das dúvidas".
7. **Prontuário não se apaga**: registros clínicos são **imutáveis**. Correções são feitas por
   **aditamento/retificação** com autor, data/hora e motivo, preservando a versão original.
   Exclusão de paciente = **inativação lógica**; dados clínicos ficam retidos pelo prazo legal.
8. **Retenção**: prontuário guardado por no mínimo **20 anos** a partir do último registro
   (Lei 13.787/2018, Res. CFM 1.821/2007). Dados não clínicos (ex.: logs de mensagens) com prazo
   definido e expurgo documentado.
9. **Direitos do titular** (art. 18): o sistema deve permitir confirmar existência, dar acesso/cópia
   (exportação legível do prontuário ao paciente), corrigir dados cadastrais, registrar e revogar
   consentimentos (comunicação), e informar com quem os dados foram compartilhados.
   Pedido de "exclusão" de dado clínico é negado com fundamento na obrigação legal de guarda — registre a resposta.
10. **Consentimento**: registrar data/hora, finalidade, canal e versão do termo; revogável a qualquer momento;
    checar o consentimento **antes** de cada envio de WhatsApp/e-mail.
11. **Incidentes**: qualquer suspeita de vazamento deve ser registrada e comunicada ao encarregado (DPO);
    a ANPD e os titulares devem ser comunicados quando houver risco relevante (art. 48).
12. **Dados de menores e idosos/incapazes**: registrar responsável legal e tratar no melhor interesse do titular.

### 4.3 Trilha de auditoria (obrigatória para novos módulos)

Use a tabela `audit_log` via `audit()` (`src/lib/audit.ts`). Ela é **append-only**: gatilhos no banco
bloqueiam UPDATE/DELETE (o mesmo vale para DELETE em `patients` e para `patient_consents`).
Ao adicionar ações, estenda `AUDIT_ACTIONS` em `src/db/schema.ts`. Registre:
`quem` (userId), `quando`, `ação` (login, login_falho, logout, ler, criar, alterar, aditar, imprimir,
exportar, enviar_mensagem, acesso_negado), `recurso` + `id do recurso`, `paciente_id` quando aplicável,
IP e user-agent. **Não** grave o conteúdo clínico no log — só a referência.
Leituras de prontuário também são auditadas (quem viu o quê).

---

## 5. Guardrails de segurança da aplicação (OWASP)

- **Validação**: toda entrada de Server Action/rota passa por **Zod** no servidor. Mensagens de erro
  genéricas para o usuário; nunca exponha stack trace, SQL ou se um usuário existe.
- **SQL**: somente via Drizzle (consultas parametrizadas). Proibido montar SQL com interpolação de string
  vinda do usuário (`sql.raw` com input é proibido).
- **XSS**: não use `dangerouslySetInnerHTML`. Texto clínico livre é exibido como texto puro.
- **CSRF**: Server Actions já validam a origem; não crie endpoints `GET` que alterem estado.
- **Sessão**: token aleatório no cookie, só o hash SHA-256 no banco; expira em 8 h; troca de senha encerra
  outras sessões. Adicionar **timeout por inatividade** (ex.: 15–30 min) nas áreas clínicas.
- **Senhas** (já implementado — não enfraquecer): ≥ 12 caracteres com maiúscula, minúscula, número e
  especial; scrypt com sal; validade de 90 dias; sem reutilizar as 5 últimas; bloqueio após 5 tentativas
  por 15 min; senha provisória com troca obrigatória. Regras em `src/lib/password-policy.ts`
  (compartilhadas entre cliente e servidor).
- **MFA (2FA/TOTP)**: planejar para médicos e administradores antes de produção.
- **Cabeçalhos**: configurar CSP, `X-Frame-Options: DENY`/`frame-ancestors 'none'`, `Referrer-Policy`,
  `Permissions-Policy`, HSTS em `next.config.ts`.
- **Uploads** (exames/anexos): validar tipo real (magic bytes) e tamanho, renomear com UUID, guardar fora de
  `public/`, servir apenas via rota autenticada e auditada, criptografados em repouso.
- **Segredos**: só em variáveis de ambiente (`.env.local`, nunca commitado). Documente novas variáveis em
  `.env.example` **sem valores reais**.
- **Dependências**: não adicionar pacotes sem necessidade clara; preferir bibliotecas mantidas;
  rodar `npm audit` ao adicionar dependências.
- **`server-only`**: todo módulo que acessa banco, chaves ou dados sensíveis importa `"server-only"`.
  Componentes cliente nunca recebem mais dados do que exibem (não passe o objeto inteiro do paciente).
- **Cache**: páginas com dados de paciente são dinâmicas e não podem ser cacheadas/compartilhadas entre
  usuários. Nunca use cache estático para dados clínicos.
- **Rate limiting** em login, recuperação de senha e envio de mensagens.

---

## 6. Regras por módulo

### 6.1 Usuários (implementado)
- Apenas admin cadastra. Desativar em vez de excluir (preserva autoria de registros clínicos).
- Usuário não pode alterar o próprio perfil nem desativar a si mesmo.

### 6.2 Pacientes e agenda
- Cadastro: nome, nome social, data de nascimento, sexo, CPF (validar dígitos, único), CNS opcional,
  telefone, e-mail, endereço, responsável legal, convênio/particular, consentimentos de comunicação.
- Evitar duplicidade (CPF único; alerta de homônimos com mesma data de nascimento).
- Agenda: por médico, com status (agendado, confirmado, em atendimento, atendido, faltou, cancelado),
  impedir conflito de horário, registrar quem agendou/alterou.
- A secretária vê o motivo da consulta apenas como texto administrativo curto — nunca dados clínicos.
- Implementação (`src/lib/appointment-service.ts`, `src/lib/appointment-constants.ts`):
  - Administrada pela **secretária** (todos os médicos) e pelo **médico** (somente a própria agenda,
    imposto no servidor via `canManageDoctor`). O administrador não acessa a agenda.
  - Conflitos: o paciente nunca pode ter duas consultas sobrepostas; sobreposição na agenda do médico
    só como **encaixe** confirmado explicitamente. Horário permitido: 07:00–20:00, nunca no passado.
  - Transições em `STATUS_TRANSITIONS`; `em_atendimento`/`atendido` só pelo médico da consulta;
    falta só após o horário; cancelamento exige motivo. Remarcar volta o status para "agendado".
  - Consultas não são excluídas (gatilho); `appointment_events` guarda o histórico (append-only).
  - Horários gravados em UTC; conversão do fuso do consultório em `src/lib/clinic-time.ts`.

### 6.3 Gestão clínica (prontuário)
- Seguir a Res. CFM 1.638/2002 e 1.821/2007: identificação do paciente, anamnese, exame físico,
  hipóteses diagnósticas/CID, plano terapêutico, evolução datada com identificação do médico (nome + CRM).
- Cada registro: autor, data/hora do servidor (não do cliente), imutável após "finalizar";
  correção por aditamento.
- Alergias e medicamentos em uso sempre visíveis no topo do prontuário.
- Considerar assinatura digital ICP-Brasil (padrão NGS2/SBIS) para o prontuário 100% eletrônico sem papel.
- Implementação (`src/lib/clinical-service.ts`, `clinical-schema.ts`, `clinical-constants.ts`, `clinical-crypto.ts`):
  - Todo conteúdo clínico fica no campo `payload` cifrado (AES-256-GCM, chave em `EMR_CLINICAL_KEYS`,
    AAD = tabela + paciente). **Nunca** grave texto clínico em colunas em claro; para consultar, decifre no servidor.
  - Rascunho: visível e editável só pelo autor. Finalizar exige CID principal, queixa/quadro atual e plano.
    Gatilhos no banco impedem alterar registro finalizado e excluir qualquer registro, aditamento ou
    versão de alergias/medicamentos (`clinical_profiles`, versionado).
  - Aditamento só pelo autor e só em registro finalizado. Todo médico lê os registros finalizados.
  - CID-10: tabela oficial DATASUS (`src/data/cid10.json`), busca no servidor via Server Action.
  - Áreas clínicas usam `requireClinicalPermission()` (perfil + **encerramento após 30 min de inatividade**).

### 6.4 Relatórios gerenciais
- Por padrão, relatórios são **agregados e sem identificação** (atendimentos por período, taxa de faltas,
  ocupação da agenda, novos pacientes, produtividade por médico).
- Relatórios com dados identificáveis ou clínicos: só para médico, auditados na geração e exportação.
- Exportação (CSV/PDF) é auditada e deve indicar "documento confidencial".

### 6.5 Receituário médico
- Emitido somente por `medico`, com nome, CRM/UF, endereço do consultório, data, identificação do paciente,
  medicamento, posologia, quantidade e duração.
- Prescrição eletrônica conforme Res. CFM 2.299/2021: assinatura digital **ICP-Brasil** e, quando
  possível, QR Code de validação (ex.: validar.iti.gov.br).
- Medicamentos controlados (Portaria SVS/MS 344/1998): receita de controle especial em 2 vias; as
  **notificações de receita** (amarela A / azul B) têm regras próprias e talonário oficial — não gerar
  como receita comum. Na dúvida, bloquear e sinalizar.
- Receita emitida é imutável; cancelamento registra motivo e mantém o original. Toda emissão, impressão e
  envio é auditado.
- Implementação: `classifyMedication()` (`clinical-constants.ts`) bloqueia no servidor substâncias de
  **notificação** (A, B1, B2, C2, C3) e controladas (C1 etc.) em receita simples — listas **parciais**,
  revisar com a médica. Controle especial exige endereço do paciente; impressão em 2 vias (farmácia/paciente)
  com campos de comprador e fornecedor; antimicrobiano em receita simples também sai em 2 vias (RDC 471/2021).
  Identificação do médico e do paciente é copiada na emissão. Endereço do consultório: `CLINIC_ADDRESS`.

### 6.6 Mensagens por WhatsApp e e-mail
- Usar **somente APIs oficiais** (WhatsApp Business Platform/Cloud API; provedor de e-mail transacional
  com SPF/DKIM/DMARC). Proibido automatizar WhatsApp Web ou bibliotecas não oficiais.
- Checar **consentimento** do paciente para o canal antes de cada envio; respeitar opt-out.
- Mensagens administrativas (lembrete, confirmação) **não contêm dados clínicos** — apenas nome, data,
  hora e local.
- Conteúdo clínico (receita, resultado) nunca vai no corpo da mensagem: enviar **link autenticado e com
  validade curta** (ou PDF protegido), somente por médico.
- Envio assíncrono (fila), com retentativas, registro de status (enviado, entregue, falhou) e auditoria —
  sem guardar o conteúdo sensível no log. Chaves dos provedores só em variáveis de ambiente.
- Provedores são operadores LGPD: exigir contrato/DPA antes de produção.

---

## 7. Convenções de código

- Idioma: **interface, mensagens e comentários em português do Brasil**; identificadores de código podem
  seguir o padrão existente (inglês no schema/serviços, português nas rotas).
- Datas no banco em `timestamp_ms` (UTC); exibição em `America/Sao_Paulo`, formato `dd/MM/yyyy HH:mm`.
- Alterações no banco: editar `src/db/schema.ts` → `npm run db:generate` → revisar o SQL gerado →
  `npm run db:migrate`. Nunca editar migrações já aplicadas. Use `CHECK` constraints para regras críticas.
- Regras de negócio ficam em `src/lib/*-service.ts`; Server Actions apenas validam, autorizam e delegam.
- Componentes acessíveis (labels, foco visível, contraste) — usuários incluem idosos.
- Não introduzir novas bibliotecas de UI/estado sem necessidade.

## 8. Definição de pronto (checklist antes de entregar)

- [ ] `npm run typecheck` e `npm run lint` sem erros
- [ ] Toda nova página/Server Action chama `requireUser([...])` com os perfis corretos da matriz (seção 3)
- [ ] Autorização por registro verificada no servidor
- [ ] Entradas validadas com Zod; erros não vazam detalhes
- [ ] Nenhum dado de paciente em logs, URLs, testes ou commits
- [ ] Ações sensíveis gravam `audit_log`
- [ ] Dados clínicos novos criptografados em repouso e sem exclusão física
- [ ] Migração gerada e revisada (se houve mudança no schema)
- [ ] Teste E2E cobrindo o fluxo principal **e** o acesso negado para perfis sem permissão,
      executado no Chrome contra `data/test.db`
- [ ] README/CLAUDE.md atualizados (módulos, variáveis de ambiente, scripts)

## 9. Referências normativas

- LGPD — Lei 13.709/2018 (arts. 5º, 6º, 11, 18, 37, 46–49)
- Lei 13.787/2018 — digitalização e guarda do prontuário
- Res. CFM 1.638/2002 — prontuário médico
- Res. CFM 1.821/2007 — prontuário eletrônico, guarda e certificação (SBIS/CFM, NGS2)
- Res. CFM 2.299/2021 — documentos médicos eletrônicos (prescrição, atestado)
- Res. CFM 2.314/2022 — telemedicina
- Código de Ética Médica (Res. CFM 2.217/2018) — sigilo profissional
- Portaria SVS/MS 344/1998 — medicamentos sujeitos a controle especial
- MP 2.200-2/2001 — ICP-Brasil
- OWASP Top 10 / OWASP ASVS
