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
cp .env.example .env.local   # defina EMR_ADMIN_PASSWORD (senha provisória forte)
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

## Usuários e perfis

| Perfil | Acesso |
|---|---|
| Administrador | Cadastra usuários (`/usuarios`) |
| Médico(a) | Exige CRM + UF no cadastro |
| Secretária | Acesso básico |

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
