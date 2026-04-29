# Drizzle snapshot baseline reset — Plano de Implementação

> **Goal:** Reconciliar `packages/db/src/migrations/` com o schema TS atual eliminando o drift causado por `bun db:push` ad-hoc, deixando o ambiente pronto para `db:generate` futuras.

**Contexto:** Durante a Task 1 do plano `2026-04-29-categorias-atributos-embedded.md`, `bun db:generate` falhou com prompt TTY porque `0001_snapshot.json` estava fora de sync com o schema TS — várias tabelas (`attribute_definition`, `tool_attribute_value`, `tool_attribute_assignment`, `tool_variant`) foram criadas via `db:push` sem migration versionada. A migration `0002_attributes_require_category.sql` foi criada manualmente para contornar (sem snapshot `0002`). Hoje há 3 migrations no disco mas apenas 2 snapshots, e nenhum dos snapshots reflete o schema atual.

**Solução:** Reset de baseline em dev — apagar `0000`, `0001`, `0002` + snapshots + journal, depois `db:generate` gera `0000_baseline.sql` único refletindo o schema TS atual. Dados preservados via `pg_dump --data-only`.

**Aplicabilidade:** este reset é **dev-only**. Em produção/staging, o histórico de migrations versionadas deve ser preservado e merges futuros geram migrations incrementais sobre o novo baseline.

---

## Steps

### Step 1: Backup do estado atual do DB de dev

```bash
# Conferir DATABASE_URL
grep DATABASE_URL /home/othavio/noctua/emach-dashboard/apps/web/.env

# Dump apenas dos dados (estrutura é regenerada)
pg_dump "$DATABASE_URL" \
  --data-only \
  --no-owner \
  --no-acl \
  --disable-triggers \
  --column-inserts \
  -f /tmp/emach-dev-data-backup.sql

ls -lh /tmp/emach-dev-data-backup.sql
```

Esperado: arquivo `.sql` com INSERTs de todas as tabelas. Tamanho > 0.

### Step 2: Drop public schema (apaga tudo no DB)

```bash
psql "$DATABASE_URL" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres, public;"
```

### Step 3: Apagar migrations 0000-0002 + snapshots + journal

```bash
cd /home/othavio/noctua/emach-dashboard/packages/db
rm src/migrations/0000_*.sql src/migrations/0001_*.sql src/migrations/0002_*.sql
rm src/migrations/meta/0000_snapshot.json src/migrations/meta/0001_snapshot.json
# Resetar journal para vazio
echo '{"version":"7","dialect":"postgresql","entries":[]}' > src/migrations/meta/_journal.json
ls src/migrations/
ls src/migrations/meta/
```

Esperado: pasta `migrations/` só com `_triggers.sql`. Pasta `meta/` vazia. `_journal.json` zerado.

### Step 4: Gerar baseline 0000

```bash
cd /home/othavio/noctua/emach-dashboard
bun --cwd packages/db db:generate
```

Esperado: `0000_<adjective>.sql` criado refletindo o schema atual + `0000_snapshot.json` consistente + `_journal.json` com entry para `0000`.

### Step 5: Aplicar baseline ao DB

```bash
bun --cwd packages/db db:migrate
```

Esperado: tabelas todas criadas, sem erros.

### Step 6: Reaplicar triggers

```bash
bun --cwd packages/db db:apply-triggers
```

### Step 7: Restaurar dados

```bash
psql "$DATABASE_URL" -f /tmp/emach-dev-data-backup.sql 2>&1 | tail -20
```

Possíveis warnings sobre `disable-triggers` se SUPERUSER não tiver permissão direta — não bloqueia. Se houver erro de constraint, investigar (provavelmente schema mudou em algo que o data dump não previu).

### Step 8: Validar contagens

```bash
psql "$DATABASE_URL" <<'SQL'
SELECT 'category' AS t, count(*) FROM category
UNION ALL SELECT 'attribute_definition', count(*) FROM attribute_definition
UNION ALL SELECT 'tool', count(*) FROM tool
UNION ALL SELECT 'user', count(*) FROM "user"
UNION ALL SELECT 'supplier', count(*) FROM supplier;
SQL
```

Comparar com contagens conhecidas (categoria=11, supplier=2 conforme dashboard pré-reset).

### Step 9: Verificar typecheck e dev server

```bash
cd /home/othavio/noctua/emach-dashboard
bun tsc --noEmit 2>&1 | grep -E "categories|attributes|^error" | head
```

Sem erros novos. Se OK, dev server deve rodar normalmente.

### Step 10: Commit

```bash
git status --short
git add packages/db/src/migrations
git commit -m "chore(db): reset migrations baseline para sincronizar snapshot

Apaga 0000-0002 + snapshots órfãos e regenera 0000_baseline
único refletindo o schema TS atual. Resolve drift causado por
db:push ad-hoc anterior. Dev-only — produção segue do baseline."
```

---

## Verificação final

- `db:generate` em mudança futura de schema gera migration limpa sem prompt TTY.
- Dashboard abre sem regressão (categorias listadas, atributos no painel, tools form com specs).
- 0 erros TS novos.
