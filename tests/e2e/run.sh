#!/usr/bin/env bash
# Roda os testes E2E no Google Chrome contra um banco de teste separado (data/test.db).
# Pré-requisito: o servidor deve estar rodando com o MESMO banco:
#   DATABASE_FILE=data/test.db npm run dev
set -euo pipefail
cd "$(dirname "$0")/../.."
export DATABASE_FILE=data/test.db
# Admin do banco de TESTE: senha própria, independente do .env.local.
export EMR_ADMIN_USERNAME=admin
export EMR_ADMIN_NAME="Administrador Geral"
export EMR_ADMIN_PASSWORD="Lirio#Seguro-2027x"
mkdir -p test-results
# Sempre aplica migrações novas; depois zera os usuários do banco de TESTE.
# Pacientes, consentimentos e auditoria NÃO podem ser apagados (gatilhos no banco):
# o teste de pacientes usa CPFs e nomes aleatórios a cada execução.
npm run --silent db:migrate
# Registros clínicos e receitas (que nunca são apagados) referenciam os usuários: no banco de TESTE,
# a checagem de chave estrangeira é desligada só para este reset.
node -e "const d=require('better-sqlite3')(process.env.DATABASE_FILE);d.pragma('foreign_keys = OFF');d.exec('delete from sessions; delete from password_history; delete from users;')"
npm run --silent db:seed
node tests/e2e/usuarios-e-senhas.mjs
node tests/e2e/pacientes.mjs
node tests/e2e/agenda.mjs
node tests/e2e/prontuario.mjs
node tests/e2e/previsao.mjs
