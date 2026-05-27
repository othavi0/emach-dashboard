# Remover API Keys — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover por completo o conceito legado de API Key do dashboard (tabela `api_key`, valor `apiKey` do enum `actor_type`, colunas FK de auditoria, CHECKs de coerência, capability `apikeys.manage`), conforme ADR-0004.

**Architecture:** O ADR-0004 estabelece que admin e e-commerce só compartilham o banco — não existe API entre eles. Logo o ator `apiKey` nunca é usado: toda mutação automática passa a ser `actorType=system`. A remoção é puramente subtrativa em três camadas: (1) código TypeScript de schema + app, num único commit atômico porque os tipos cruzam pacotes; (2) migration Drizzle versionada que dropa estruturas no Postgres; (3) documentação.

**Tech Stack:** Bun + Turborepo, Drizzle 0.45 + Postgres (Supabase), Next 16 / React 19, Better Auth.

**Branch:** `chore/remover-api-keys` (já criada a partir de `main`).

**Out of scope (follow-up):** O app e-commerce mantém uma cópia versionada do schema das tabelas compartilhadas (`stock_movement`, `order_status_history` — ver `docs/integration/admin-ecommerce.md`). Após este PR ser aplicado, a remoção de `api_key_id` / `actor_api_key_id` precisa ser propagada lá manualmente. Não faz parte deste plano; registrar como issue separada no repo do e-commerce.

---

## File Structure

Arquivos tocados, agrupados por responsabilidade:

**Schema (`packages/db/src/`)**
- `schema/api-keys.ts` — **deletar** (tabela + relations + tipos).
- `schema/shared-enums.ts` — enum `actor_type` reduzido a `["user","system"]`.
- `schema/client-audit.ts` — remover coluna `actorApiKeyId`, relation, simplificar CHECK.
- `schema/orders.ts` — idem para `orderStatusHistory`.
- `schema/stock-movements.ts` — remover coluna `apiKeyId`, relation, ajustar index `stock_movement_actor_idx`, simplificar CHECK.
- `schema/index.ts` — remover `export * from "./api-keys"`.
- `index.ts` — remover import + entradas `apiKey`/`apiKeyRelations` do objeto `schema`.
- `migrations/0001_remover_api_keys.sql` — **criar** (migration versionada).

**App (`apps/web/src/`)**
- `lib/permissions.ts` — remover capability `apikeys.manage` da union `Capability` e de `ALL_CAPS`.
- `app/dashboard/customers/data.ts` — remover import `apiKey`, JOIN, campo `actorApiKeyName`, branch `apiKey` em `formatActorLabel`.
- `app/dashboard/orders/data.ts` — idem.
- `app/dashboard/customers/actions.ts` — remover `actorApiKeyId: null` de 7 inserts em `clientAuditLog`.

**Docs**
- `CONTEXT.md` — remover a entrada "API Key — legado a remover".
- `CLAUDE.md` (raiz) — remover linha `api-keys.ts` da tabela de schema; corrigir descrições de `shared-enums.ts` e `stock-movements.ts`.
- `packages/db/CLAUDE.md` e `packages/db/AGENTS.md` — corrigir a seção "Auditoria".
- `apps/web/CLAUDE.md` — corrigir a seção "Auditoria de mutações em DB".

---

## Task 1: Remoção do código (schema + app)

Esta task é **um único commit atômico**: os tipos do enum `actor_type` e da tabela `apiKey` cruzam os pacotes `@emach/db` e `apps/web`. Mexer só num lado deixa o monorepo sem compilar. Os steps são pequenos, mas a verificação e o commit acontecem só no fim.

**Files:**
- Delete: `packages/db/src/schema/api-keys.ts`
- Modify: `packages/db/src/schema/shared-enums.ts`
- Modify: `packages/db/src/schema/client-audit.ts`
- Modify: `packages/db/src/schema/orders.ts`
- Modify: `packages/db/src/schema/stock-movements.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/src/index.ts`
- Modify: `apps/web/src/lib/permissions.ts`
- Modify: `apps/web/src/app/dashboard/customers/data.ts`
- Modify: `apps/web/src/app/dashboard/orders/data.ts`
- Modify: `apps/web/src/app/dashboard/customers/actions.ts`

- [ ] **Step 1: Reduzir o enum `actor_type`**

Em `packages/db/src/schema/shared-enums.ts`, linha 3, trocar:

```ts
export const actorTypeEnum = pgEnum("actor_type", ["user", "apiKey", "system"]);
```

por:

```ts
export const actorTypeEnum = pgEnum("actor_type", ["user", "system"]);
```

- [ ] **Step 2: Deletar o arquivo da tabela `api_key`**

Deletar `packages/db/src/schema/api-keys.ts` por completo.

- [ ] **Step 3: Remover `api-keys` do barrel de schema**

Em `packages/db/src/schema/index.ts`, remover a linha:

```ts
export * from "./api-keys";
```

- [ ] **Step 4: Remover `apiKey` do `packages/db/src/index.ts`**

Remover o import (linha 4):

```ts
import { apiKey, apiKeyRelations } from "./schema/api-keys";
```

E remover, dentro do objeto `const schema = { ... }`, as duas linhas:

```ts
	apiKey,
	apiKeyRelations,
```

- [ ] **Step 5: Limpar `client-audit.ts`**

Em `packages/db/src/schema/client-audit.ts`:

a) Remover o import (linha 12): `import { apiKey } from "./api-keys";`

b) Remover a coluna `actorApiKeyId` (linhas 41-43):

```ts
		actorApiKeyId: text("actor_api_key_id").references(() => apiKey.id, {
			onDelete: "set null",
		}),
```

c) Substituir o CHECK `client_audit_actor_coherence` (linhas 59-66) por:

```ts
		check(
			"client_audit_actor_coherence",
			sql`(
				(${table.actorType} = 'user'   AND ${table.actorUserId} IS NOT NULL)
				OR (${table.actorType} = 'system' AND ${table.actorUserId} IS NULL)
			)`
		),
```

d) Remover a relation `actorApiKey` (linhas 79-82):

```ts
	actorApiKey: one(apiKey, {
		fields: [clientAuditLog.actorApiKeyId],
		references: [apiKey.id],
	}),
```

- [ ] **Step 6: Limpar `orders.ts`**

Em `packages/db/src/schema/orders.ts`:

a) Remover o import (linha 14): `import { apiKey } from "./api-keys";`

b) Remover a coluna `actorApiKeyId` de `orderStatusHistory` (linhas 154-156):

```ts
		actorApiKeyId: text("actor_api_key_id").references(() => apiKey.id, {
			onDelete: "set null",
		}),
```

c) Substituir o CHECK `actor_coherence` de `orderStatusHistory` (linhas 165-172) por:

```ts
		check(
			"actor_coherence",
			sql`(
				(${table.actorType} = 'user'   AND ${table.actorUserId} IS NOT NULL)
				OR (${table.actorType} = 'system' AND ${table.actorUserId} IS NULL)
			)`
		),
```

d) Remover a relation `actorApiKey` de `orderStatusHistoryRelations` (linhas 224-227):

```ts
		actorApiKey: one(apiKey, {
			fields: [orderStatusHistory.actorApiKeyId],
			references: [apiKey.id],
		}),
```

- [ ] **Step 7: Limpar `stock-movements.ts`**

Em `packages/db/src/schema/stock-movements.ts`:

a) Remover o import (linha 11): `import { apiKey } from "./api-keys";`

b) Remover a coluna `apiKeyId` (linhas 51-53):

```ts
		apiKeyId: text("api_key_id").references(() => apiKey.id, {
			onDelete: "set null",
		}),
```

c) Ajustar o index `stock_movement_actor_idx` (linhas 62-66) — remover `table.apiKeyId`:

```ts
		index("stock_movement_actor_idx").on(table.actorType, table.actorId),
```

d) Substituir o CHECK `actor_coherence` (linhas 68-75) por:

```ts
		check(
			"actor_coherence",
			sql`(
				(${table.actorType} = 'user'   AND ${table.actorId} IS NOT NULL)
				OR (${table.actorType} = 'system' AND ${table.actorId} IS NULL)
			)`
		),
```

e) Remover a relation `apiKey` de `stockMovementRelations` (linhas 92-95):

```ts
	apiKey: one(apiKey, {
		fields: [stockMovement.apiKeyId],
		references: [apiKey.id],
	}),
```

- [ ] **Step 8: Remover a capability `apikeys.manage`**

Em `apps/web/src/lib/permissions.ts`:

a) Na union `Capability` (linha 49), remover: `	| "apikeys.manage"`

b) No array `ALL_CAPS` (linha 96), remover: `	"apikeys.manage",`

(A capability não aparece em `USER_CAPS`/`MANAGER_CAPS`/`SUPER_ADMIN_EXCLUSIVE` — nenhuma outra edição é necessária.)

- [ ] **Step 9: Limpar `customers/data.ts`**

Em `apps/web/src/app/dashboard/customers/data.ts`:

a) Remover o import (linha 2): `import { apiKey } from "@emach/db/schema/api-keys";`

b) Substituir `formatActorLabel` (linhas 149-161) por:

```ts
function formatActorLabel(entry: {
	actorType: "system" | "user";
	actorUserName: string | null;
}) {
	if (entry.actorType === "system") {
		return "Sistema";
	}
	return entry.actorUserName ?? "Usuário";
}
```

c) No `db.select({ ... })` da auditoria (linhas 582-592), remover o campo: `			actorApiKeyName: apiKey.name,`

d) Remover o `.leftJoin` com `apiKey` (linha 595): `		.leftJoin(apiKey, eq(apiKey.id, clientAuditLog.actorApiKeyId))`

e) No `rows.map`, dentro de `formatActorLabel({ ... })` (linhas 602-606), remover a linha: `				actorApiKeyName: r.actorApiKeyName,`

- [ ] **Step 10: Limpar `orders/data.ts`**

Em `apps/web/src/app/dashboard/orders/data.ts`:

a) Remover o import (linha 2): `import { apiKey } from "@emach/db/schema/api-keys";`

b) Substituir `formatActorLabel` (linhas 153-165) por:

```ts
function formatActorLabel(entry: {
	actorType: "system" | "user";
	actorUserName: string | null;
}) {
	if (entry.actorType === "system") {
		return "Sistema";
	}
	return entry.actorUserName ?? "Usuário";
}
```

c) No `db.select({ ... })` do histórico de status (linhas 635-643), remover o campo: `				actorApiKeyName: apiKey.name,`

d) Remover o `.leftJoin` com `apiKey` (linha 647): `			.leftJoin(apiKey, eq(orderStatusHistory.actorApiKeyId, apiKey.id))`

(O `formatActorLabel(entry)` em `history.map` continua válido — `entry` deixa de ter `actorApiKeyName` e o tipo já não o exige.)

- [ ] **Step 11: Limpar `customers/actions.ts`**

Em `apps/web/src/app/dashboard/customers/actions.ts`, remover **todas** as 7 ocorrências da linha `actorApiKeyId: null,` dentro dos `tx.insert(clientAuditLog).values({ ... })` (server actions `updateCustomerProfile`, `updateCustomerStatus`, `updateCustomerNotes`, `updateCustomerType`, `revokeClientSession`, `revokeAllClientSessions`, `generatePasswordResetLink`). A coluna deixou de existir no schema; os inserts ficam com `actorType: "user"` + `actorUserId`.

- [ ] **Step 12: Verificar tipos no monorepo inteiro**

Run: `bun check-types`
Expected: PASS, sem erros. (`tsc --noEmit` em todos os workspaces; cobre `@emach/db` e `apps/web` juntos.)

- [ ] **Step 13: Rodar lint/format**

Run: `bun check`
Expected: PASS (sem violações Biome/Ultracite).

- [ ] **Step 14: Rodar a suíte de testes existente como regressão**

Run: `bun --cwd apps/web test`
Expected: PASS — `permissions.test.ts` continua verde após a remoção de `apikeys.manage`.

- [ ] **Step 15: Commit**

```bash
git add packages/db/src apps/web/src
git commit -m "refactor: remover código de API Key (schema e app)"
```

---

## Task 2: Migration Drizzle

Gera e aplica a migration versionada que dropa as estruturas de API Key no Postgres. A remoção de um valor de `pgEnum` exige **recriar o tipo** — Postgres não suporta `ALTER TYPE ... DROP VALUE`. O `drizzle-kit generate` produz a maior parte do SQL, mas o bloco de recriação do enum precisa ser conferido à mão.

> **Pré-condição:** não existe CRUD de API Key (nunca houve UI nem server action de criação), portanto não há linhas com `actor_type = 'apiKey'` em `client_audit_log`, `order_status_history` ou `stock_movement`. Se houvesse, o cast do enum falharia — nesse caso, atualizar essas linhas para `'system'` antes de recriar o tipo.

**Files:**
- Create: `packages/db/src/migrations/0001_remover_api_keys.sql` (nome real definido pelo `drizzle-kit`)
- Possivelmente modificado: `packages/db/src/migrations/meta/_journal.json` e snapshot (gerados pelo `drizzle-kit`)

- [ ] **Step 1: Gerar a migration**

Run: `bun db:generate`
Expected: cria um arquivo novo em `packages/db/src/migrations/` (ex.: `0001_*.sql`) com `DROP TABLE`, `ALTER TABLE ... DROP COLUMN`, `DROP CONSTRAINT` e a recriação do tipo `actor_type`.

- [ ] **Step 2: Revisar o SQL gerado**

Abrir o arquivo gerado e conferir que ele contém, na ordem correta:
1. `DROP CONSTRAINT` das FKs `actor_api_key_id`/`api_key_id` → `api_key` nas 3 tabelas.
2. `DROP CONSTRAINT` dos CHECKs `actor_coherence` e `client_audit_actor_coherence` (versão antiga).
3. `DROP INDEX "stock_movement_actor_idx"` e recriação sem `api_key_id`.
4. `ALTER TABLE ... DROP COLUMN "actor_api_key_id"` (em `client_audit_log` e `order_status_history`) e `DROP COLUMN "api_key_id"` (em `stock_movement`).
5. `DROP TABLE "api_key"`.
6. Recriação do tipo `actor_type` sem `'apiKey'`.
7. Recriação dos CHECKs `actor_coherence` simplificados.

Se o `drizzle-kit` **não** tiver gerado a recriação do enum corretamente (item 6 — é o ponto frágil), substituir esse trecho pelo bloco canônico abaixo. Conferir os nomes exatos de constraint/FK no SQL gerado antes de aplicar:

```sql
-- Recriação do enum actor_type sem 'apiKey'
ALTER TYPE "public"."actor_type" RENAME TO "actor_type_old";
CREATE TYPE "public"."actor_type" AS ENUM('user', 'system');

ALTER TABLE "client_audit_log"
  ALTER COLUMN "actor_type" TYPE "public"."actor_type"
  USING "actor_type"::text::"public"."actor_type";

ALTER TABLE "order_status_history"
  ALTER COLUMN "actor_type" TYPE "public"."actor_type"
  USING "actor_type"::text::"public"."actor_type";

-- stock_movement.actor_type tem DEFAULT 'system' — dropar antes do cast, re-adicionar depois
ALTER TABLE "stock_movement" ALTER COLUMN "actor_type" DROP DEFAULT;
ALTER TABLE "stock_movement"
  ALTER COLUMN "actor_type" TYPE "public"."actor_type"
  USING "actor_type"::text::"public"."actor_type";
ALTER TABLE "stock_movement" ALTER COLUMN "actor_type" SET DEFAULT 'system';

DROP TYPE "public"."actor_type_old";
```

- [ ] **Step 3: Aplicar a migration no banco de dev**

Run: `bun db:migrate`
Expected: aplica a migration sem erro. (Se o banco de dev estiver desalinhado e a migration falhar, ver "Drop & recreate em dev" em `packages/db/CLAUDE.md` — só em dev.)

- [ ] **Step 4: Reaplicar triggers**

Run: `bun --cwd packages/db db:apply-triggers`
Expected: idempotente, sem erro. (A migration recriou colunas de `stock_movement`; reaplicar garante os triggers de idempotência de venda.)

- [ ] **Step 5: Confirmar o estado do schema no banco**

Run: `bun db:studio` (ou via `psql`)
Expected: a tabela `api_key` não existe; `client_audit_log`/`order_status_history` não têm `actor_api_key_id`; `stock_movement` não tem `api_key_id`; o tipo `actor_type` tem só `user` e `system`.

- [ ] **Step 6: Smoke run-time das rotas de auditoria**

Run: `bun dev:web` e visitar, com um usuário logado:
- `/dashboard/customers/[id]` — aba de auditoria LGPD (consome `formatActorLabel` em `customers/data.ts`).
- `/dashboard/orders/[id]` — histórico de status do pedido (consome `formatActorLabel` em `orders/data.ts`).

Expected: as duas páginas carregam sem erro de SQL. Conferir erros de SSR com `nextjs_call <port> get_errors` (MCP `next-devtools`).

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/migrations
git commit -m "feat: migration removendo estruturas de API Key"
```

---

## Task 3: Documentação

Atualiza os documentos vivos que descrevem o domínio. `CONTEXT.md` é fonte de linguagem ubíqua; os `CLAUDE.md`/`AGENTS.md` orientam agentes futuros.

**Files:**
- Modify: `CONTEXT.md`
- Modify: `CLAUDE.md` (raiz)
- Modify: `packages/db/CLAUDE.md`
- Modify: `packages/db/AGENTS.md`
- Modify: `apps/web/CLAUDE.md`

- [ ] **Step 1: `CONTEXT.md`**

Remover a entrada da linha ~124 que descreve "API Key" como legado a remover (tabela `api_key`, valor `apiKey` no enum, colunas `actorApiKeyId`/`apiKeyId`). Se houver um glossário de "Actor", deixar registrado que `actor_type` tem apenas `user` e `system`.

- [ ] **Step 2: `CLAUDE.md` (raiz)**

- Na tabela "Schema Drizzle", remover a linha de `api-keys.ts`.
- Na linha de `stock-movements.ts`, remover a menção a `apiKeyId` no `actorType`.
- Onde o doc cita `actor_type` = `pgEnum('actor_type', ['user','apiKey','system'])`, trocar para `['user','system']`.

- [ ] **Step 3: `packages/db/CLAUDE.md` e `packages/db/AGENTS.md`**

Na seção "Convenções de schema" → bullet "Auditoria", trocar:

> `actorType pgEnum('actor_type', ['user','apiKey','system'])` + `actorId` (FK user) + `apiKeyId` (FK apiKey)

por uma descrição que reflita só `user`/`system` + `actorId` (FK user), sem `apiKeyId`. Aplicar a mesma correção no `AGENTS.md` (conteúdo espelhado).

- [ ] **Step 4: `apps/web/CLAUDE.md`**

Na seção "Auditoria de mutações em DB", remover o bullet "Quando origem é apiKey externa (site ecomerce): `actorType: "apiKey"` ...". Deixar só os casos `user` (admin) e `system` (seed/script e mutações automáticas do e-commerce).

- [ ] **Step 5: Verificar lint dos docs**

Run: `bun check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add CONTEXT.md CLAUDE.md packages/db/CLAUDE.md packages/db/AGENTS.md apps/web/CLAUDE.md
git commit -m "docs: remover referências a API Key"
```

---

## Verification Plan (final)

Antes de abrir o PR, rodar da raiz do repo e confirmar o output:

1. `bun check-types` → PASS (monorepo inteiro).
2. `bun check` → PASS.
3. `bun --cwd apps/web test` → PASS.
4. Smoke: `bun dev:web`, visitar `/dashboard/customers/[id]` e `/dashboard/orders/[id]` — auditoria carrega sem erro de SQL.
5. `git grep -in "apikey\|api_key" -- '*.ts' '*.tsx'` → só restam matches em `node_modules`/`.next` e em skills vendoradas (`.agents/skills/`); zero em `packages/db/src`, `apps/web/src` e docs do projeto.

Acceptance criteria do issue #37:
- [ ] Tabela `api_key` removida → Task 1 Step 2 + Task 2.
- [ ] Enum `actor_type` reduzido a `user`/`system` → Task 1 Step 1 + Task 2.
- [ ] Colunas `actorApiKeyId`/`apiKeyId` removidas das 3 tabelas → Task 1 Steps 5-7 + Task 2.
- [ ] CHECKs `actor_coherence` simplificados → Task 1 Steps 5-7 + Task 2.
- [ ] Capability `apikeys.manage` removida → Task 1 Step 8.
- [ ] Rota/UI de API keys removida → não existe (confirmado no mapeamento); nada a fazer.
- [ ] `bun check-types` e `bun check` passam → Verification Plan 1-2.
