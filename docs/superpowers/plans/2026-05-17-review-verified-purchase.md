# Remover verifiedPurchase e tornar orderId obrigatório — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover a coluna `review.verified_purchase`, tornar `review.order_id` NOT NULL e eliminar a feature de "avaliação editorial" (única origem de review sem pedido), alinhando schema e código à invariante "toda Review nasce de uma compra verificada".

**Architecture:** O issue #36 parte da premissa (CONTEXT.md, "Ambiguidades resolvidas") de que `canCreateReview` é o único caminho de criação de review. O código contradiz isso: `createEditorialReview` cria review com `orderId: null` / `verifiedPurchase: false`. Decisão do usuário: remover a feature editorial inteira. Logo o plano tem dois eixos — (a) mudança de schema + migration Drizzle versionada, (b) remoção da feature editorial (rota, form, action, schema, botão).

**Tech Stack:** Drizzle 0.45 + node-postgres + Supabase Postgres; Next 16 / React 19; Bun + Turborepo; Biome/Ultracite.

**Validação:** Não há suíte de testes para `reviews/` (cobertura atual = só `permissions.test.ts`). Os critérios de aceite do issue são `bun check-types` + `bun check` + smoke manual. O plano usa esses comandos como verificação de cada task em vez de TDD.

**⚠️ DB compartilhada:** a tabela `review` é escrita também pelo app ecomerce (`docs/integration/admin-ecommerce.md`). `packages/db/CLAUDE.md` exige PR explícito + comunicar o ecomerce ao dropar coluna. A migration gerada aqui deve ser sincronizada byte-a-byte para o ecomerce após o merge — registrar no PR.

---

## File Structure

| Arquivo | Ação | Responsabilidade |
| --- | --- | --- |
| `packages/db/src/schema/reviews.ts` | Modificar | Remover coluna `verifiedPurchase` + import `boolean`; `orderId` vira `.notNull()`. |
| `packages/db/src/migrations/00NN_*.sql` | Criar (via `db:generate`) | DDL versionado: limpeza de órfãos + `SET NOT NULL` + `DROP COLUMN`. |
| `apps/web/src/app/dashboard/reviews/actions.ts` | Modificar | Remover `createEditorialReview` e imports órfãos. |
| `apps/web/src/app/dashboard/reviews/schema.ts` | Modificar | Remover `createEditorialReviewSchema` + tipo. |
| `apps/web/src/app/dashboard/reviews/_components/editorial-review-form.tsx` | Deletar | Form da feature editorial. |
| `apps/web/src/app/dashboard/reviews/new/page.tsx` | Deletar | Rota `/dashboard/reviews/new`. |
| `apps/web/src/app/dashboard/reviews/page.tsx` | Modificar | Remover botão "Nova editorial" + `canMutate`/`session` + imports órfãos. |
| `CONTEXT.md` | Modificar | Atualizar a entrada "Review sem Order" em "Ambiguidades resolvidas". |

`apps/web/src/app/dashboard/reviews/data.ts` **não muda** — `ReviewDetail.orderId` já é tipado `string` (não-nullable) e `getReviewDetail` já assume `order_id` preenchido.

---

### Task 1: Mudança de schema Drizzle

**Files:**
- Modify: `packages/db/src/schema/reviews.ts`

- [ ] **Step 1: Remover a coluna `verifiedPurchase` e tornar `orderId` NOT NULL**

Em `packages/db/src/schema/reviews.ts`, alterar a definição de `orderId` (linhas 37-39) para incluir `.notNull()`:

```ts
		orderId: text("order_id")
			.notNull()
			.references(() => order.id, {
				onDelete: "restrict",
			}),
```

E remover por completo a linha 44:

```ts
		verifiedPurchase: boolean("verified_purchase").notNull().default(false),
```

- [ ] **Step 2: Remover o import `boolean` agora órfão**

`boolean` era usado só por `verifiedPurchase`. No bloco de import de `drizzle-orm/pg-core` (linhas 2-12), remover a linha `boolean,`. Resultado:

```ts
import {
	check,
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	unique,
} from "drizzle-orm/pg-core";
```

Nota: o `unique("review_client_tool_order_unique").on(...).nullsNotDistinct()` (linhas 58-60) **fica como está** — com `orderId` NOT NULL o `nullsNotDistinct()` torna-se inócuo e não gera diff de migration. Não mexer.

- [ ] **Step 3: Verificar tipos do package db**

Run: `bun --cwd packages/db check-types`
Expected: PASS, sem erros.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/reviews.ts
git commit -m "refactor: remove verifiedPurchase e torna review.orderId NOT NULL"
```

---

### Task 2: Gerar e revisar a migration Drizzle

**Files:**
- Create: `packages/db/src/migrations/00NN_<nome-gerado>.sql` (NN/nome definidos pelo drizzle-kit)

- [ ] **Step 1: Gerar a migration versionada**

Run: `bun db:generate`
Expected: cria um novo arquivo `.sql` em `packages/db/src/migrations/` e atualiza `_journal.json`. O SQL deve conter aproximadamente:

```sql
ALTER TABLE "review" ALTER COLUMN "order_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "review" DROP COLUMN "verified_purchase";
```

- [ ] **Step 2: Editar a migration para limpar órfãos antes do `SET NOT NULL`**

`ALTER COLUMN ... SET NOT NULL` falha se existir alguma `review` com `order_id IS NULL` (ex.: reviews editoriais já criadas). Como a feature editorial está sendo removida, essas linhas são órfãs e devem ser apagadas. Abrir o `.sql` gerado e inserir, **como primeiro statement**, antes do `SET NOT NULL`:

```sql
DELETE FROM "review" WHERE "order_id" IS NULL;--> statement-breakpoint
```

Resultado final do arquivo:

```sql
DELETE FROM "review" WHERE "order_id" IS NULL;--> statement-breakpoint
ALTER TABLE "review" ALTER COLUMN "order_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "review" DROP COLUMN "verified_purchase";
```

- [ ] **Step 3: Aplicar a migration no DB de dev**

Run: `bun db:migrate`
Expected: aplica a migration pendente sem erro. Em seguida reaplicar triggers (idempotente):
Run: `bun --cwd packages/db db:apply-triggers`

- [ ] **Step 4: Confirmar o estado da tabela**

Run: `bun db:studio` (ou inspecionar via psql) e verificar que a tabela `review` não tem mais a coluna `verified_purchase` e que `order_id` está `NOT NULL`.
Expected: coluna ausente, `order_id` obrigatório.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/migrations/
git commit -m "feat: migration drop verified_purchase e order_id NOT NULL"
```

---

### Task 3: Remover a feature de avaliação editorial

**Files:**
- Modify: `apps/web/src/app/dashboard/reviews/actions.ts`
- Modify: `apps/web/src/app/dashboard/reviews/schema.ts`
- Delete: `apps/web/src/app/dashboard/reviews/_components/editorial-review-form.tsx`
- Delete: `apps/web/src/app/dashboard/reviews/new/page.tsx` (e o diretório `new/`)
- Modify: `apps/web/src/app/dashboard/reviews/page.tsx`

- [ ] **Step 1: Deletar os arquivos da feature editorial**

```bash
git rm apps/web/src/app/dashboard/reviews/_components/editorial-review-form.tsx
git rm apps/web/src/app/dashboard/reviews/new/page.tsx
```

(`new/` fica vazio e é removido automaticamente pelo git.)

- [ ] **Step 2: Remover `createEditorialReview` de `actions.ts`**

Em `apps/web/src/app/dashboard/reviews/actions.ts`, deletar a função `createEditorialReview` inteira (linhas 59-127). Manter `moderateReview` e o tipo `ActionResult`.

- [ ] **Step 3: Remover imports órfãos de `actions.ts`**

Após remover `createEditorialReview`, ficam órfãos: os schemas `client` e `tool`, o operador `and`, e os tipos/schemas editoriais. Ajustar os imports no topo do arquivo para:

```ts
"use server";

import { db } from "@emach/db";
import { review } from "@emach/db/schema/reviews";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { logger } from "@/lib/logger";
import { requireCapability } from "@/lib/permissions";
import { type ModerateReviewInput, moderateReviewSchema } from "./schema";
```

(Removidos: `client`, `tool`, `and`, `CreateEditorialReviewInput`, `createEditorialReviewSchema`. Mantidos: `db`, `review`, `eq`, `revalidatePath`, `logger`, `requireCapability`, `ModerateReviewInput`, `moderateReviewSchema`.)

- [ ] **Step 4: Remover `createEditorialReviewSchema` de `schema.ts`**

Em `apps/web/src/app/dashboard/reviews/schema.ts`, deletar o bloco `createEditorialReviewSchema` e o tipo `CreateEditorialReviewInput` (linhas 52-72). Manter `reviewsListFiltersSchema`, `moderateReviewSchema` e seus tipos. O import `z` continua usado.

- [ ] **Step 5: Remover o botão "Nova editorial" e o estado morto de `page.tsx`**

Em `apps/web/src/app/dashboard/reviews/page.tsx`:

5a. Remover as linhas 28-30 (`session`, `role`, `canMutate`) — usadas apenas pelo botão:

```ts
	await requireCapability("reviews.read");

	const raw = await searchParams;
```

5b. Substituir o `<PageHeader>` com `action` (linhas 61-74) por uma versão sem `action`:

```tsx
			<PageHeader
				description="Fila de moderação das avaliações publicadas no site, filtrável por status e nota."
				title="Avaliações"
			/>
```

5c. Remover os imports agora órfãos no topo do arquivo. `buttonVariants` (linha 1) e `getCurrentSession` (linha 13) deixam de ser usados. `Link` **continua** usado (linha 99, "Limpar filtros"). Imports resultantes:

```ts
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@emach/ui/components/empty";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { requireCapability } from "@/lib/permissions";
import { ReviewQueueTable } from "./_components/review-queue-table";
import { ReviewsFilters } from "./_components/reviews-filters";
import { getReviewsTabCounts, listReviews } from "./data";
import { reviewsListFiltersSchema } from "./schema";
import { REVIEW_TABS } from "./status-meta";
```

- [ ] **Step 6: Confirmar ausência de referências remanescentes**

Run: `grep -rn "verifiedPurchase\|verified_purchase\|createEditorialReview\|editorial\|reviews/new" apps/web/src packages/db/src`
Expected: nenhuma ocorrência (a migration `.sql` em `packages/db/src/migrations/` pode citar `verified_purchase` — isso é histórico e esperado).

- [ ] **Step 7: Verificar tipos e lint**

Run: `bun --cwd apps/web check-types && bun check`
Expected: ambos PASS, sem erros nem imports não usados.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/dashboard/reviews/
git commit -m "refactor: remove feature de avaliação editorial"
```

---

### Task 4: Atualizar CONTEXT.md

**Files:**
- Modify: `CONTEXT.md`

- [ ] **Step 1: Atualizar a entrada "Review sem Order"**

Na seção "Ambiguidades resolvidas" do `CONTEXT.md` (linha ~121), substituir a entrada atual:

```markdown
- **Review sem Order** — o schema de `review` permite `orderId` nulo e traz o flag `verifiedPurchase`, sugerindo Reviews não-verificadas. Resolvido: toda Review exige compra verificada; `orderId` é sempre preenchido e `verifiedPurchase` é sempre `true`. Os dois pontos são flexibilidade morta do schema — `verifiedPurchase` é candidato a remoção.
```

por:

```markdown
- **Review sem Order** — resolvido (issue #36): `review.order_id` é NOT NULL e a coluna `verified_purchase` foi removida. `canCreateReview` é o único caminho de criação; a feature de avaliação editorial (review sem pedido) foi eliminada.
```

- [ ] **Step 2: Commit**

```bash
git add CONTEXT.md
git commit -m "docs: atualiza CONTEXT.md sobre review verificada"
```

---

### Task 5: Verificação final

**Files:** nenhum (validação).

- [ ] **Step 1: Type-check do monorepo inteiro**

Run: `bun check-types`
Expected: PASS em todos os workspaces.

- [ ] **Step 2: Lint/format do monorepo**

Run: `bun check`
Expected: PASS, sem diagnósticos.

- [ ] **Step 3: Smoke run-time da UI de moderação**

`tsc` não detecta SQL inválido. Subir o dev server e visitar as rotas de reviews:

```bash
bun dev:web
```

Visitar:
- `http://localhost:3001/dashboard/reviews` — lista carrega, sem o botão "Nova editorial".
- `http://localhost:3001/dashboard/reviews/<id>` — detalhe de uma review carrega (link "Abrir pedido" funciona).
- `http://localhost:3001/dashboard/reviews/new` — deve retornar 404.

Conferir erros de SSR com o MCP `next-devtools`: `nextjs_call 3001 get_errors`.
Expected: nenhuma stack trace; rota `new` retorna 404.

- [ ] **Step 4: Checklist de aceite do issue #36**

Confirmar manualmente:
- [ ] Coluna `verified_purchase` removida (schema + migration).
- [ ] `review.order_id` é NOT NULL.
- [ ] Nenhuma query/action/componente referencia `verifiedPurchase`.
- [ ] UI de moderação funciona sem o campo.
- [ ] `bun check-types` e `bun check` passam.

---

## Notas de handoff

- A migration nova precisa ser **copiada byte-a-byte para o repo do app ecomerce** após o merge (DB compartilhada). Registrar no corpo do PR.
- O PR deve mencionar explicitamente o `DROP COLUMN` e que reviews com `order_id IS NULL` são deletadas pela migration (`packages/db/CLAUDE.md`: drops exigem PR explícito + comunicação ao ecomerce).
