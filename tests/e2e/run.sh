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
node -e "const d=require('better-sqlite3')(process.env.DATABASE_FILE);d.exec('delete from sessions; delete from password_history; delete from users;')" 2>/dev/null \
  || npm run --silent db:migrate
npm run --silent db:seed
node tests/e2e/usuarios-e-senhas.mjs
