# DB Workflow Push-Only — Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolver o issue #44 adotando o workflow push-only — deletar o histórico de migrations com drift irrecuperável, limpar scripts mortos, fechar o buraco de RLS, e re-ancorar a documentação no schema TS como fonte de verdade.

**Architecture:** A pasta `packages/db/src/migrations/` é deletada (decisão registrada em ADR-0006). Antes, `_triggers.sql`/`_indexes.sql` — que não são histórico de migration, mas DDL idempotente aplicado pós-push — são movidos para `packages/db/src/sql/`. Os scripts `db:generate`/`db:migrate` são removidos (sem uso no modelo push-only, e footgun: recriariam a pasta). Um `db:sync` composto encadeia push + triggers + indexes. Operações one-off na DB viva (drop do schema `drizzle`, enable RLS deny-all nas 32 tabelas) feitas via Supabase MCP.

**Tech Stack:** Bun 1.3, Turborepo, Drizzle 0.45 + drizzle-kit, Supabase Postgres, git.

**Branch:** `chore/44-db-push-only`

**Escopo:** Este plano cobre o issue #44 (cleanup). O PR #45 / #38 é **pré-requisito** — deve ser mergeado no `main` ANTES da Task 1 (ver "Phase 0" no fim deste arquivo); senão o `db:sync` da Task 3 reverte a remoção dos artefatos `lead` no banco. Não cobre o seed realista (`db:seed-demo` — plano próprio).

---

## Estado atual verificado (2026-05-17)

- `_journal.json` tem 8 entradas (`0000`–`0007`); `drizzle.__drizzle_migrations` no banco tem 6 linhas (ids `1,2,3,4,8,9`), só 3 batem por timestamp. `db:migrate` está quebrado.
- O banco vivo já reflete o estado do PR #45 (`consent_log` sem `actor_type`/`lead_id`) — foi `db:push`'d antes do merge.
- 32 tabelas em `public` com RLS desabilitado. Role `postgres` tem `rolbypassrls=true` (confirmado) — os apps não são afetados por enable de RLS.
- `packages/db/src/migrations/` contém: `0000`–`0007` `.sql`, `meta/`, `_indexes.sql`, `_triggers.sql`.
- `packages/db/manual-migrations/` contém: `2026-05-17-remove-catchall-categories.sql`, `2026-05-17-review-verified-purchase.sql` (já aplicados).

---

## File Structure

| Arquivo | Ação | Responsabilidade |
| --- | --- | --- |
| `packages/db/src/sql/triggers.sql` | Criar (git mv de `src/migrations/_triggers.sql`) | DDL de triggers PL/pgSQL idempotente |
| `packages/db/src/sql/indexes.sql` | Criar (git mv de `src/migrations/_indexes.sql`) | DDL de índices fora do schema Drizzle |
| `packages/db/src/migrations/` | Deletar (pasta inteira, menos os 2 SQLs movidos) | — (era histórico de migration com drift) |
| `packages/db/manual-migrations/` | Deletar (pasta inteira) | — (SQL one-off já aplicado) |
| `packages/db/scripts/apply-triggers.ts` | Modificar | Path do SQL: `../src/sql/triggers.sql` |
| `packages/db/scripts/apply-indexes.ts` | Modificar | Path do SQL: `../src/sql/indexes.sql` |
| `packages/db/package.json` | Modificar | Remove `db:generate`/`db:migrate`; adiciona `db:sync` |
| `package.json` (root) | Modificar | Remove `db:generate`/`db:migrate`; adiciona `db:sync` |
| `turbo.json` | Modificar | Remove tasks `db:generate`/`db:migrate`; adiciona `db:sync` |
| `CLAUDE.md`, `AGENTS.md`, `README.md`, `packages/db/CLAUDE.md`, `packages/db/AGENTS.md` | Modificar | Re-ancorar docs no schema TS / push-only |

---

## Task 1: Branch + mover `_triggers.sql` e `_indexes.sql` para fora de `migrations/`

**Files:**
- Create: `packages/db/src/sql/triggers.sql` (git mv)
- Create: `packages/db/src/sql/indexes.sql` (git mv)
- Modify: `packages/db/scripts/apply-triggers.ts`
- Modify: `packages/db/scripts/apply-indexes.ts`

- [ ] **Step 1: Criar a branch**

```bash
git switch -c chore/44-db-push-only
```

- [ ] **Step 2: Mover os dois SQLs idempotentes para `src/sql/`**

```bash
mkdir -p packages/db/src/sql
git mv packages/db/src/migrations/_triggers.sql packages/db/src/sql/triggers.sql
git mv packages/db/src/migrations/_indexes.sql packages/db/src/sql/indexes.sql
```

- [ ] **Step 3: Atualizar o path em `apply-triggers.ts`**

Em `packages/db/scripts/apply-triggers.ts`, trocar a linha do `resolve`:

```ts
const sqlPath = resolve(scriptDir, "../src/sql/triggers.sql");
```

(era `"../src/migrations/_triggers.sql"`)

- [ ] **Step 4: Atualizar o path em `apply-indexes.ts`**

Em `packages/db/scripts/apply-indexes.ts`, trocar a linha do `resolve`:

```ts
const sqlPath = resolve(scriptDir, "../src/sql/indexes.sql");
```

(era `"../src/migrations/_indexes.sql"`)

- [ ] **Step 5: Verificar que os scripts ainda rodam contra o banco**

Run: `bun --cwd packages/db db:apply-triggers && bun --cwd packages/db db:apply-indexes`
Expected: `[apply-triggers] OK` e `[apply-indexes] OK`. Se falhar com `ENOENT`, o path do Step 3/4 está errado.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/sql packages/db/scripts/apply-triggers.ts packages/db/scripts/apply-indexes.ts
git commit -m "refactor: move triggers/indexes SQL para fora de migrations"
```

---

## Task 2: Deletar o histórico de migrations

**Files:**
- Delete: `packages/db/src/migrations/` (pasta inteira — neste ponto contém só `0000`–`0007` `.sql` + `meta/`)
- Delete: `packages/db/manual-migrations/` (pasta inteira)

- [ ] **Step 1: Deletar as duas pastas**

```bash
git rm -r packages/db/src/migrations
git rm -r packages/db/manual-migrations
```

- [ ] **Step 2: Verificar que nada de TypeScript quebrou**

Run: `bun check-types`
Expected: PASS nos 6 workspaces. (Os schemas TS não importam de `migrations/`; `drizzle.config.ts` referencia `out` como string, não import — segue válido.)

- [ ] **Step 3: Verificar que as pastas sumiram**

Run: `ls packages/db/src/migrations packages/db/manual-migrations 2>&1`
Expected: `No such file or directory` para ambas.

- [ ] **Step 4: Commit**

```bash
git add -A packages/db
git commit -m "chore: remove historico de migrations com drift (#44)"
```

---

## Task 3: Remover scripts mortos e adicionar `db:sync`

**Files:**
- Modify: `packages/db/package.json`
- Modify: `package.json` (root)
- Modify: `turbo.json`

- [ ] **Step 1: Editar `packages/db/package.json`**

No bloco `"scripts"`: **remover** as linhas `"db:generate"` e `"db:migrate"`. **Adicionar** `"db:sync"`. Resultado do bloco `scripts`:

```json
"scripts": {
  "db:push": "drizzle-kit push",
  "db:sync": "drizzle-kit push && bun run db:apply-triggers && bun run db:apply-indexes",
  "db:studio": "drizzle-kit studio",
  "db:apply-indexes": "bun run scripts/apply-indexes.ts",
  "db:apply-triggers": "bun run scripts/apply-triggers.ts",
  "db:seed-categories": "bun run scripts/seed-categories.ts",
  "db:seed-attributes": "bun run scripts/seed-attributes.ts",
  "check-types": "tsc --noEmit"
}
```

- [ ] **Step 2: Editar `package.json` (root)**

No bloco `"scripts"`: **remover** `"db:generate"` e `"db:migrate"`. **Adicionar** `"db:sync"`. As linhas de DB ficam:

```json
"db:push": "turbo -F @emach/db db:push",
"db:sync": "turbo -F @emach/db db:sync",
"db:studio": "turbo -F @emach/db db:studio",
```

- [ ] **Step 3: Editar `turbo.json`**

No objeto `"tasks"`: **remover** as entradas `"db:generate"` e `"db:migrate"`. **Adicionar** `"db:sync"`. As tasks de DB ficam:

```json
"db:push": {
  "cache": false
},
"db:sync": {
  "cache": false
},
"db:studio": {
  "cache": false,
  "persistent": true
}
```

(Nota: a entrada antiga `db:migrate` tinha `"persistent": true` incorretamente — sai junto.)

- [ ] **Step 4: Verificar que `db:sync` roda fim a fim**

Run: `bun db:sync`
Expected: drizzle-kit push reporta "No changes" ou aplica o schema, seguido de `[apply-triggers] OK` e `[apply-indexes] OK`. Exit 0.

- [ ] **Step 5: Verificar que os scripts mortos sumiram**

Run: `bun run 2>&1 | grep -E "db:generate|db:migrate" || echo "limpo"`
Expected: `limpo`

- [ ] **Step 6: Commit**

```bash
git add package.json packages/db/package.json turbo.json
git commit -m "chore: remove db:generate/db:migrate, adiciona db:sync (#44)"
```

---

## Task 4: One-off na DB viva — drop do schema `drizzle` + enable RLS

⚠️ **Esta task muta a DB compartilhada. Confirmar com o usuário antes de executar.** Não gera commit (não é código) — o SQL fica registrado neste plano como runbook.

**Execução:** via Supabase MCP `execute_sql` (project_id `wrxohbzepoyscsacjzvd`) ou `psql $DATABASE_URL`.

- [ ] **Step 1: Dropar o schema `drizzle` (tabela `__drizzle_migrations` stale)**

`drizzle-kit push` não usa essa tabela (push faz introspection). Deixá-la stale é footgun.

```sql
DROP SCHEMA IF EXISTS drizzle CASCADE;
```

- [ ] **Step 2: Habilitar RLS nas 32 tabelas de `public` (deny-all, sem policy)**

`postgres` tem `rolbypassrls=true` — os apps seguem funcionando. Isto fecha o PostgREST para `anon`/`authenticated`.

```sql
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;
```

- [ ] **Step 3: Verificar RLS**

```sql
SELECT count(*) FILTER (WHERE relrowsecurity) AS rls_on, count(*) AS total
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'r' AND n.nspname = 'public';
```

Expected: `rls_on = 32`, `total = 32`.

- [ ] **Step 4: Verificar via advisor**

Rodar `get_advisors` (type `security`) no projeto `wrxohbzepoyscsacjzvd`.
Expected: o aviso `rls_disabled` não aparece mais.

- [ ] **Step 5: Verificar que o schema `drizzle` sumiu**

```sql
SELECT count(*) AS drizzle_schema FROM information_schema.schemata WHERE schema_name = 'drizzle';
```

Expected: `drizzle_schema = 0`.

- [ ] **Step 6: Smoke do app**

Run: `bun dev:web` e visitar `http://localhost:3001/login` + uma rota de `dashboard/`.
Expected: app sobe e as queries funcionam (a conexão `postgres` bypassa RLS). Encerrar o dev server depois.

---

## Task 5: Re-ancorar a documentação no schema TS

**Files:**
- Modify: `CLAUDE.md`
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `packages/db/CLAUDE.md`
- Modify: `packages/db/AGENTS.md`

Regra geral para todos os 5 arquivos: **remover toda referência a `db:generate` e `db:migrate`**; substituir descrições do fluxo "dev push / prod generate+migrate" pelo fluxo push-only; trocar todo path `src/migrations/_triggers.sql` → `src/sql/triggers.sql` e `src/migrations/_indexes.sql` → `src/sql/indexes.sql`.

- [ ] **Step 1: `packages/db/CLAUDE.md` — reescrever a seção `## Migrations`**

Substituir o conteúdo da seção `## Migrations` (atualmente fala em Dev push / Staging-Prod generate+migrate) por:

```md
## Schema workflow (push-only)

Não há migrations versionadas — ver ADR-0006. O schema TS em `src/schema/` é a **única fonte de verdade**.

- **Aplicar schema no banco:** `bun db:sync` (= `drizzle-kit push` + `db:apply-triggers` + `db:apply-indexes`). Rodar após editar `src/schema/*.ts` e após todo `git checkout` — o banco compartilhado espelha a branch em checkout.
- `bun db:push` sozinho aplica só o schema Drizzle (sem triggers/indexes). Prefira `db:sync`.
- `drizzle-kit push` pede confirmação TTY em renames ambíguos — falha em ambiente scripted. Em dev, rodar interativo.
- Quando produção entrar no horizonte, gerar um baseline `0000` limpo a partir do schema atual e versionar a partir daí.
```

Na seção de triggers/índices, trocar os paths para `src/sql/triggers.sql` e `src/sql/indexes.sql`. No bloco de scripts (linhas ~69-79), remover `db:generate`/`db:migrate` e adicionar `db:sync`. Na seção `## Schema compartilhado com app ecomerce`, trocar "Cópia versionada do schema sincronizada manualmente a cada migration" por "Cópia do schema TS (`src/schema/`) sincronizada manualmente a cada mudança". Na seção "Drop & recreate em dev", manter (segue válido) mas trocar `bunx drizzle-kit push` se citar migrations.

- [ ] **Step 2: `CLAUDE.md` (root) — bloco "Comandos do dia-a-dia"**

Substituir o sub-bloco `# DB (em desenvolvimento)` / `# DB (produção/staging)` por:

```bash
# DB (push-only — ver ADR-0006)
bun db:sync                        # drizzle-kit push + apply-triggers + apply-indexes (rodar após editar schema e após git checkout)
bun db:push                        # só o schema Drizzle (sem triggers/indexes)
bun db:studio                      # UI inspetora de tabelas
```

Trocar o path em `bun --cwd packages/db db:apply-triggers # aplica src/sql/triggers.sql`. Atualizar a linha de "Triggers PL/pgSQL" (~170) para `packages/db/src/sql/triggers.sql`. No invariante 5 (~136) e no passo 2 do "Workflow de mudança" (~237), substituir o fluxo prod `db:generate`+`db:migrate` por: "schema é push-only — `bun db:sync` após editar `packages/db/src/schema/*.ts` (ver ADR-0006)". Remover a seção "Drop & recreate em dev" se citar drizzle-kit migrate, ou ajustá-la.

- [ ] **Step 3: `AGENTS.md` (root)**

Linha ~12: trocar `bun db:push (dev) / bun db:generate + bun db:migrate (prod)` por `bun db:sync (push-only — ver ADR-0006)`. Linha ~35 (invariante 5): trocar "Migrations em prod: drizzle-kit generate..." por "Schema é push-only — `bun db:sync`; sem migrations versionadas (ADR-0006)."

- [ ] **Step 4: `packages/db/AGENTS.md`**

Linha ~24: trocar path para `src/sql/triggers.sql` e "após qualquer push/migrate" → "após qualquer `db:push`/`db:sync`". Linhas ~31-32: remover `bun db:generate` e `bun db:migrate`; adicionar `bun db:sync # push + triggers + indexes`.

- [ ] **Step 5: `README.md`**

Linhas ~113-114: remover as linhas da tabela de `bun db:generate` e `bun db:migrate`. Adicionar uma linha `| bun db:sync | drizzle-kit push + triggers + indexes |`. Linha ~116: trocar o path para `src/sql/triggers.sql`.

- [ ] **Step 6: Registrar o gap do doc de integração**

`docs/integration/admin-ecommerce.md` é referenciado em `CLAUDE.md` e `packages/db/CLAUDE.md` mas **não existe**. NÃO criar agora (fora de escopo). Adicionar uma nota em `packages/db/CLAUDE.md`, na seção de schema compartilhado: `> Gap: docs/integration/admin-ecommerce.md ainda não foi escrito.`

- [ ] **Step 7: Verificar que não sobrou referência morta**

Run: `grep -rn -E "db:generate|db:migrate|src/migrations" --include="*.md" CLAUDE.md AGENTS.md README.md packages/db/`
Expected: nenhuma ocorrência (exceto `docs/superpowers/plans/` e `docs/adr/0006-*`, que são histórico/contexto e ficam fora do grep acima).

- [ ] **Step 8: `bun check` / `bun fix`**

Run: `bun fix && bun check-types`
Expected: format aplicado, `bun check-types` PASS.

- [ ] **Step 9: Commit**

```bash
git add CLAUDE.md AGENTS.md README.md packages/db/CLAUDE.md packages/db/AGENTS.md
git commit -m "docs: re-ancora documentacao no schema TS, push-only (#44)"
```

---

## Task 6: Comentar o issue #44 e abrir o PR

⚠️ `gh pr create` faz push — confirmar com o usuário antes.

- [ ] **Step 1: Comentar a resolução no issue #44**

O corpo do #44 assumia "realinhar `_journal.json`" e "validar que `db:migrate` roda limpo" — a resolução **divergiu** (adotamos push-only, ADR-0006). Comentar:

```bash
gh issue comment 44 --body "Resolvido via push-only (ADR-0006), não via reparo do histórico. A pasta src/migrations/ e os scripts db:generate/db:migrate foram removidos; _triggers.sql/_indexes.sql movidos para src/sql/. Os passos 2 e 3 do issue (realinhar journal, validar db:migrate) ficaram obsoletos. RLS habilitado nas 32 tabelas. PR: <link>"
```

- [ ] **Step 2: Abrir o PR**

```bash
gh pr create --title "chore: workflow de DB push-only (#44)" --body "$(cat <<'EOF'
## Summary

Resolve #44 adotando o workflow push-only (ADR-0006).

- Deleta `packages/db/src/migrations/` (histórico com drift irrecuperável) e `packages/db/manual-migrations/`
- Move `_triggers.sql`/`_indexes.sql` para `packages/db/src/sql/`
- Remove `db:generate`/`db:migrate` (root, packages/db, turbo.json); adiciona `db:sync`
- DROP do schema `drizzle` stale; RLS habilitado (deny-all) nas 32 tabelas de `public`
- Documentação re-ancorada no schema TS

## Test plan

- [x] `bun check-types` passa
- [x] `bun db:sync` roda fim a fim
- [x] `get_advisors` security sem `rls_disabled`
- [x] smoke `bun dev:web`

Closes #44
EOF
)"
```

---

## Self-review

- **Cobertura do #44:** estratégia decidida (push-only) ✓; "realinhar journal/validar migrate" — obsoletos, explicado no comentário do issue ✓; coordenação ecommerce — docs re-ancorados ✓.
- **`_triggers.sql`/`_indexes.sql`:** preservados via git mv antes do delete ✓.
- **RLS:** Task 4 ✓; `postgres` bypassa, apps intactos.
- **Sem placeholders:** paths e SQL completos.

---

## Phase 0 (pré-requisito) — rebase e merge do PR #45

⚠️ **Executar ANTES da Task 1.** Se o #45 não mergear primeiro, o schema do `main` (que ainda declara `actorType`/`leadId`) diverge do banco vivo, e o `db:sync` da Task 3 reverte a remoção desses artefatos. Procedimento manual, ~5 comandos.

```bash
git switch main && git pull
git switch refactor/38-remover-ator-lead-consent-log
git rebase main
```

Durante o rebase, dois conflitos esperados:

1. **Arquivos de migration re-adicionados** (`0006_daffy_firedrake.sql`, `meta/0006_snapshot.json`, `meta/_journal.json`): a pasta `src/migrations/` foi deletada no `main`. Resolver removendo-os:
   ```bash
   git rm -r packages/db/src/migrations
   git rebase --continue
   ```
2. **`CLAUDE.md`**: o #45 alterou 1 linha; este PR reescreveu o arquivo. Resolver mantendo a versão do `main` e re-aplicando a mudança de `consent_log` do #45 à mão, se ainda fizer sentido.

Após o rebase, a branch deve conter só `consent-log.ts`, `consent.ts` e (talvez) `CLAUDE.md`. Verificar: `bun check-types` + `bun --cwd apps/web test`. Force-push com lease, o PR #45 atualiza, mergear, fecha #38.
