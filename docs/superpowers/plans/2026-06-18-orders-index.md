# Índice de orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover o índice redundante `order_number_idx` e adicionar o composto `order_branch_status_created_idx (branch_id, status, created_at DESC)` na tabela `order`.

**Architecture:** Schema TS é a fonte de verdade (push-only, ADR-0006). Edita-se `packages/db/src/schema/orders.ts` e aplica-se o DDL direto no banco (o drop de índice trava o `drizzle-kit push` sem TTY), deixando schema≡banco.

**Tech Stack:** Drizzle 0.45, Postgres 17 (Supabase `emach-ferramentas`), `bun`.

## Global Constraints

- Banco de **produção compartilhado** com o app ecommerce — aplicar DDL exige **OK explícito** do usuário no momento de executar; o schema TS sincroniza pro ecommerce via CI (`sync-db-schema.yml`, ADR-0009).
- Index é não-destrutivo; `CREATE INDEX` em ~12 linhas é instantâneo (sem `CONCURRENTLY`).
- Spec de referência: `docs/superpowers/specs/2026-06-18-orders-index-design.md`.

---

### Task 1: Índice composto + remoção do redundante

**Files:**
- Modify: `packages/db/src/schema/orders.ts:151-156` (array de índices da tabela `order`)
- DB: aplicar DDL no projeto Supabase `emach-ferramentas` (`wrxohbzepoyscsacjzvd`)

**Interfaces:**
- Consumes: nada (mudança isolada de schema).
- Produces: índice `order_branch_status_created_idx`; remove `order_number_idx`. Nenhum código TS importa esses nomes — só o banco.

- [ ] **Step 1: Editar o array de índices no schema TS**

Em `packages/db/src/schema/orders.ts`, trocar o bloco `(table) => [ ... ]` da tabela `order` (atualmente terminando em `index("order_number_idx").on(table.number),`) por:

```ts
	(table) => [
		index("order_client_id_idx").on(table.clientId),
		index("order_branch_id_idx").on(table.branchId),
		index("order_status_created_idx").on(table.status, table.createdAt.desc()),
		index("order_branch_status_created_idx").on(
			table.branchId,
			table.status,
			table.createdAt.desc()
		),
	]
```

(Remove `order_number_idx` — o `.unique()` em `number` já gera `order_number_unique`; adiciona o composto.)

- [ ] **Step 2: check-types (schema ainda compila)**

Run: `bun --cwd packages/db check-types && bun --cwd apps/web check-types`
Expected: ambos passam sem erro (mudança de índice não altera tipos).

- [ ] **Step 3: Aplicar o DDL no banco de produção — PEDIR OK ANTES**

Confirmar com o usuário. Então aplicar (via `mcp__supabase__execute_sql` no projeto `wrxohbzepoyscsacjzvd`, ou `! bun db:sync` interativo):

```sql
DROP INDEX IF EXISTS order_number_idx;
CREATE INDEX IF NOT EXISTS order_branch_status_created_idx
  ON "order" (branch_id, status, created_at DESC);
```

- [ ] **Step 4: Verificar no banco (o "teste")**

Run (via `mcp__supabase__execute_sql`):

```sql
SELECT indexname FROM pg_indexes WHERE tablename = 'order' ORDER BY indexname;
```

Expected: lista contém `order_branch_status_created_idx` e **NÃO** contém `order_number_idx`. (`order_number_unique` permanece.)

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/orders.ts
git commit -m "perf(db): índice composto branch+status+created em order; remove redundante"
```
