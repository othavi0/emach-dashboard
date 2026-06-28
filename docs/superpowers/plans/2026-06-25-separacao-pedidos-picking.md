# Separação de Pedidos (Picking) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um sub-fluxo interno de separação física de itens (picking com bipagem) entre `paid` e `shipped`, com registro de quem/quando/o quê e gating do envio.

**Architecture:** Sub-eixo próprio em 3 tabelas novas (`order_picking` + `_item` + `_scan`) que o e-commerce ignora — o `order_status` continua em `preparing` aos olhos do cliente. Iniciar a separação move `paid → preparing`; concluir (tudo bipado) é pré-requisito para `shipped`. Lógica pura em `_lib`, mutações em `actions.ts` (`"use server"`), reads em `data.ts` (`server-only`), seguindo ADR-0019.

**Tech Stack:** Next 16, React 19, Drizzle 0.45 (push-only, ADR-0006), Postgres (Supabase), Zod, vitest, Tailwind v4 + base-ui.

**Spec:** `docs/superpowers/specs/2026-06-25-separacao-pedidos-picking-design.md`

## Global Constraints

- **Depende do spec de barcode** (`2026-06-24-barcode-variante-design.md`): `tool_variant.barcode` (NOT NULL UNIQUE) e `order_item.barcode` (nullable snapshot) precisam existir antes da Fase 4. Verificar antes de começar a Fase 2.
- **Nunca tocar `orderStatusEnum`** — o cliente vê `preparing`; a separação é sub-eixo separado.
- IDs: `text("id").primaryKey()` + `crypto.randomUUID()` no caller (sem nanoid/autoincrement).
- Timestamps: **sempre** `timestamp("x", { withTimezone: true })`.
- FK com nome auto-gerado > 63 chars → nome explícito via `foreignKey({ name })`.
- Server actions: `"use server"` no topo, `await requireCapability(cap)`/`lockOrderAndAuthorize` no início, retorno `ActionResult<T>`, validação Zod `safeParse`, catch usa `getPgError`/`logger.error` (nunca `console`, nunca `e.message.includes`).
- `"use server"` só exporta async functions — consts/helpers/tipos vão em `_lib`/`schema.ts`/`data.ts`.
- Reads chamados de Client Component → wrapper `"use server"` com guard; nunca importar `data.ts` (`server-only`) direto no client.
- Anti-patterns banidos (raiz `CLAUDE.md`): sem `console.*`, sem `: any`/`as any`, sem `key={index}`, `next/image` (exceto thumbs Supabase), sem `useMemo`/`useCallback` (React Compiler), sem barrel novo.
- Após schema/queries SSR: **smoke visual** (`check-types` não pega SQL inválido nem hook client em Server Component). Gate de commit: `bun verify` (check-types + check + test).
- `db.execute` raw devolve timestamp como string → usar `db.select()`/relational nas novas queries (devolvem `Date`).

---

## File Structure

**Schema (`packages/db/src/schema/`)**
- `orders.ts` (modify): enum `orderPickingStatusEnum` + 3 tabelas + relations + tipos.
- `index.ts` (modify): export dos tipos novos.

**Lógica e actions (`apps/web/src/app/dashboard/separacao/`)**
- `_lib/picking-logic.ts` (create): funções puras (`matchPickingItem`, `isPickingComplete`, `canScanMore`, `summarize`).
- `schema.ts` (create): Zod schemas + tipos das actions.
- `data.ts` (create, `server-only`): reads (`fetchPickingQueuePage`, `getPickingForOrder`, `hasCompletedPicking`).
- `actions.ts` (create, `"use server"`): `startPicking`, `scanItem`, `reportMissing`, `completePicking`, `cancelPicking` + wrappers de read.
- `_components/` (create): UI da fila e da execução.
- `page.tsx`, `[orderId]/page.tsx` (create): rotas.

**Capabilities & nav**
- `apps/web/src/lib/capabilities.ts` (modify): entrada `orders.pick`.
- `apps/web/src/app/dashboard/_components/nav-config.ts` (modify): item "Separação".

**Gating & timeline**
- `apps/web/src/app/dashboard/orders/actions.ts` (modify): gating do `shipped`.
- `apps/web/src/app/dashboard/orders/data.ts` (modify): 8ª query (picking) no `getOrderDetail`.
- `apps/web/src/app/dashboard/orders/[id]/_components/order-history-feed.tsx` (modify): `normalizePickings`.

**Cross-repo**
- `docs/integration/admin-ecommerce.md` (modify): ownership das tabelas de picking.

**Tests**
- `apps/web/src/app/dashboard/separacao/_lib/__tests__/picking-logic.test.ts`
- `apps/web/src/app/dashboard/separacao/__tests__/picking-actions.test.ts`

---

## FASE 1 — Schema

### Task 1: Tabelas de picking + enum + tipos

**Files:**
- Modify: `packages/db/src/schema/orders.ts`
- Modify: `packages/db/src/schema/index.ts`

**Interfaces:**
- Produces: `orderPicking`, `orderPickingItem`, `orderPickingScan` (tabelas Drizzle); tipos `OrderPicking`, `NewOrderPicking`, `OrderPickingItem`, `NewOrderPickingItem`, `OrderPickingScan`, `NewOrderPickingScan`; enum `orderPickingStatusEnum` com `OrderPickingStatus`. `foreignKey` precisa entrar no import de `drizzle-orm/pg-core`.

- [ ] **Step 1: Adicionar o enum** após `orderEventTypeEnum` em `orders.ts`:

```ts
export const orderPickingStatusEnum = pgEnum("order_picking_status", [
	"in_progress",
	"completed",
	"exception",
	"canceled",
]);
export type OrderPickingStatus =
	(typeof orderPickingStatusEnum.enumValues)[number];
```

- [ ] **Step 2: Adicionar `foreignKey` ao import** de `drizzle-orm/pg-core` (lista no topo do arquivo, ordem alfabética): incluir `foreignKey` entre `check` e `index`.

- [ ] **Step 3: Adicionar as 3 tabelas** após `refundRequest` (antes de `// --- Relations ---`):

```ts
export const orderPicking = pgTable(
	"order_picking",
	{
		id: text("id").primaryKey(),
		orderId: text("order_id")
			.notNull()
			.references(() => order.id, { onDelete: "restrict" }),
		branchId: text("branch_id")
			.notNull()
			.references(() => branch.id, { onDelete: "restrict" }),
		status: orderPickingStatusEnum("status").notNull().default("in_progress"),
		pickerUserId: text("picker_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		pickerName: text("picker_name").notNull(),
		startedAt: timestamp("started_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		exceptionReason: text("exception_reason"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		// 1 sessão ATIVA por pedido (anti-concorrência). Partial: só in_progress.
		uniqueIndex("order_picking_one_active")
			.on(table.orderId)
			.where(sql`status = 'in_progress'`),
		index("order_picking_branch_status_idx").on(
			table.branchId,
			table.status,
			table.startedAt.desc()
		),
	]
);

export const orderPickingItem = pgTable(
	"order_picking_item",
	{
		id: text("id").primaryKey(),
		pickingId: text("picking_id")
			.notNull()
			.references(() => orderPicking.id, { onDelete: "cascade" }),
		orderItemId: text("order_item_id").references(() => orderItem.id, {
			onDelete: "set null",
		}),
		variantId: text("variant_id").references(() => toolVariant.id, {
			onDelete: "set null",
		}),
		variantSnapshot: jsonb("variant_snapshot").notNull(),
		qtyExpected: integer("qty_expected").notNull(),
		qtyPicked: integer("qty_picked").notNull().default(0),
		notFound: boolean("not_found").notNull().default(false),
		lastScannedAt: timestamp("last_scanned_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		uniqueIndex("order_picking_item_unique").on(
			table.pickingId,
			table.orderItemId
		),
		check("qty_expected_positive", sql`${table.qtyExpected} > 0`),
		check(
			"qty_picked_within",
			sql`${table.qtyPicked} >= 0 AND ${table.qtyPicked} <= ${table.qtyExpected}`
		),
	]
);

export const orderPickingScan = pgTable(
	"order_picking_scan",
	{
		id: text("id").primaryKey(),
		pickingId: text("picking_id")
			.notNull()
			.references(() => orderPicking.id, { onDelete: "cascade" }),
		pickingItemId: text("picking_item_id")
			.notNull()
			.references(() => orderPickingItem.id, { onDelete: "cascade" }),
		variantId: text("variant_id").references(() => toolVariant.id, {
			onDelete: "set null",
		}),
		scannedCode: text("scanned_code").notNull(),
		scannedBy: text("scanned_by").references(() => user.id, {
			onDelete: "set null",
		}),
		scannedByName: text("scanned_by_name").notNull(),
		scannedAt: timestamp("scanned_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("order_picking_scan_session_idx").on(
			table.pickingId,
			table.scannedAt.desc()
		),
	]
);
```

> Os nomes de FK auto-gerados (`order_picking_item_order_item_id_order_item_id_fk` etc.) ficam abaixo de 63 chars — confirmar com `bun db:sync` que não há loop de diff; se algum estourar, dar nome via `foreignKey({ name })`.

- [ ] **Step 4: Adicionar as relations** após `orderEventRelations`:

```ts
export const orderPickingRelations = relations(
	orderPicking,
	({ one, many }) => ({
		order: one(order, {
			fields: [orderPicking.orderId],
			references: [order.id],
		}),
		branch: one(branch, {
			fields: [orderPicking.branchId],
			references: [branch.id],
		}),
		picker: one(user, {
			fields: [orderPicking.pickerUserId],
			references: [user.id],
		}),
		items: many(orderPickingItem),
		scans: many(orderPickingScan),
	})
);

export const orderPickingItemRelations = relations(
	orderPickingItem,
	({ one }) => ({
		picking: one(orderPicking, {
			fields: [orderPickingItem.pickingId],
			references: [orderPicking.id],
		}),
	})
);

export const orderPickingScanRelations = relations(
	orderPickingScan,
	({ one }) => ({
		picking: one(orderPicking, {
			fields: [orderPickingScan.pickingId],
			references: [orderPicking.id],
		}),
	})
);
```

Adicionar `pickings: many(orderPicking)` ao `orderRelations` existente.

- [ ] **Step 5: Adicionar os tipos** no fim de `orders.ts` (`// --- Types ---`):

```ts
export type OrderPicking = typeof orderPicking.$inferSelect;
export type NewOrderPicking = typeof orderPicking.$inferInsert;
export type OrderPickingItem = typeof orderPickingItem.$inferSelect;
export type NewOrderPickingItem = typeof orderPickingItem.$inferInsert;
export type OrderPickingScan = typeof orderPickingScan.$inferSelect;
export type NewOrderPickingScan = typeof orderPickingScan.$inferInsert;
```

- [ ] **Step 6: Confirmar o re-export** em `packages/db/src/schema/index.ts` — se ele faz `export * from "./orders"`, as tabelas/tipos novos já saem; senão adicionar à lista. Verificar com `grep -n "orders" packages/db/src/schema/index.ts`.

- [ ] **Step 7: Aplicar no banco**

Run: `bun db:sync`
Expected: cria `order_picking`, `order_picking_item`, `order_picking_scan`, o enum e os índices. As tabelas nascem vazias (sem backfill). Se pedir TTY em algo, rodar interativo.

- [ ] **Step 8: Verificar no banco**

Run (via `mcp__supabase__execute_sql` ou pg client):
```sql
SELECT table_name FROM information_schema.tables
WHERE table_name LIKE 'order_picking%';
SELECT indexname FROM pg_indexes WHERE indexname = 'order_picking_one_active';
```
Expected: 3 tabelas + o índice parcial presentes.

- [ ] **Step 9: check-types + commit**

Run: `bun check-types`
Expected: PASS.
```bash
git add packages/db/src/schema/orders.ts packages/db/src/schema/index.ts
git commit -m "feat: schema de separação de pedidos (picking)"
```

---

## FASE 2 — Lógica pura, capability, schemas, actions, gating

### Task 2: Capability `orders.pick`

**Files:**
- Modify: `apps/web/src/lib/capabilities.ts`

**Interfaces:**
- Produces: capability key `"orders.pick"` (default `SAU`), disponível no tipo `Capability`.

- [ ] **Step 1:** localizar o bloco de `orders.*` (`grep -n '"orders.' apps/web/src/lib/capabilities.ts`) e adicionar a entrada após `orders.update_status`:

```ts
	"orders.pick": {
		group: "Vendas",
		resource: "Pedidos",
		action: "Separar",
		description: "Separar/conferir itens do pedido (picking)",
		defaultRoles: SAU,
	},
```

> Usar o mesmo `group`/`resource` literais das outras `orders.*` (copiar da entrada vizinha — provavelmente `group: "Vendas"`, `resource: "Pedidos"`). O tipo `Capability` deriva de `keyof typeof CAPABILITIES` — sem mais nada.

- [ ] **Step 2:** check-types + commit

Run: `bun check-types`
Expected: PASS.
```bash
git add apps/web/src/lib/capabilities.ts
git commit -m "feat: capability orders.pick"
```

### Task 3: Funções puras de picking (TDD)

**Files:**
- Create: `apps/web/src/app/dashboard/separacao/_lib/picking-logic.ts`
- Test: `apps/web/src/app/dashboard/separacao/_lib/__tests__/picking-logic.test.ts`

**Interfaces:**
- Produces:
  - `type PickItem = { id: string; barcode: string | null; variantId: string | null; qtyExpected: number; qtyPicked: number; notFound: boolean }`
  - `matchPickItem(items: PickItem[], code: string, variantIdFromBarcode: string | null): { item: PickItem } | { error: "not_in_order" }`
  - `canScanMore(item: PickItem): boolean`
  - `isPickingComplete(items: PickItem[]): boolean`
  - `summarizePicking(items: PickItem[]): { totalUnits: number; pickedUnits: number; exceptions: number }`

- [ ] **Step 1: Escrever os testes**

```ts
import { describe, expect, it } from "vitest";
import {
	canScanMore,
	isPickingComplete,
	matchPickItem,
	type PickItem,
	summarizePicking,
} from "../picking-logic";

const item = (over: Partial<PickItem>): PickItem => ({
	id: "i1",
	barcode: "789",
	variantId: "v1",
	qtyExpected: 2,
	qtyPicked: 0,
	notFound: false,
	...over,
});

describe("matchPickItem", () => {
	it("casa pelo snapshot do barcode", () => {
		const items = [item({ id: "a", barcode: "111" }), item({ id: "b", barcode: "222" })];
		expect(matchPickItem(items, "222", null)).toEqual({ item: items[1] });
	});
	it("fallback pelo variantId quando snapshot é nulo", () => {
		const items = [item({ id: "a", barcode: null, variantId: "v9" })];
		expect(matchPickItem(items, "222", "v9")).toEqual({ item: items[0] });
	});
	it("erro not_in_order quando nada casa", () => {
		const items = [item({ id: "a", barcode: "111", variantId: "v1" })];
		expect(matchPickItem(items, "999", "vX")).toEqual({ error: "not_in_order" });
	});
});

describe("canScanMore", () => {
	it("true quando ainda falta", () => {
		expect(canScanMore(item({ qtyPicked: 1, qtyExpected: 2 }))).toBe(true);
	});
	it("false quando completo", () => {
		expect(canScanMore(item({ qtyPicked: 2, qtyExpected: 2 }))).toBe(false);
	});
	it("false quando reportado como falta", () => {
		expect(canScanMore(item({ qtyPicked: 0, notFound: true }))).toBe(false);
	});
});

describe("isPickingComplete", () => {
	it("true só quando todos batem e nenhum em falta", () => {
		expect(isPickingComplete([item({ qtyPicked: 2, qtyExpected: 2 })])).toBe(true);
	});
	it("false se algum incompleto", () => {
		expect(
			isPickingComplete([
				item({ qtyPicked: 2, qtyExpected: 2 }),
				item({ qtyPicked: 1, qtyExpected: 2 }),
			])
		).toBe(false);
	});
	it("false se algum notFound", () => {
		expect(isPickingComplete([item({ qtyPicked: 0, notFound: true })])).toBe(false);
	});
});

describe("summarizePicking", () => {
	it("soma unidades e conta exceções", () => {
		expect(
			summarizePicking([
				item({ qtyExpected: 2, qtyPicked: 2 }),
				item({ qtyExpected: 3, qtyPicked: 1, notFound: true }),
			])
		).toEqual({ totalUnits: 5, pickedUnits: 3, exceptions: 1 });
	});
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun --cwd apps/web test picking-logic`
Expected: FAIL ("Cannot find module ../picking-logic").

- [ ] **Step 3: Implementar**

```ts
export type PickItem = {
	id: string;
	barcode: string | null;
	variantId: string | null;
	qtyExpected: number;
	qtyPicked: number;
	notFound: boolean;
};

export function matchPickItem(
	items: PickItem[],
	code: string,
	variantIdFromBarcode: string | null
): { item: PickItem } | { error: "not_in_order" } {
	const bySnapshot = items.find((it) => it.barcode !== null && it.barcode === code);
	if (bySnapshot) {
		return { item: bySnapshot };
	}
	if (variantIdFromBarcode) {
		const byVariant = items.find((it) => it.variantId === variantIdFromBarcode);
		if (byVariant) {
			return { item: byVariant };
		}
	}
	return { error: "not_in_order" };
}

export function canScanMore(item: PickItem): boolean {
	return !item.notFound && item.qtyPicked < item.qtyExpected;
}

export function isPickingComplete(items: PickItem[]): boolean {
	return items.every((it) => !it.notFound && it.qtyPicked === it.qtyExpected);
}

export function summarizePicking(items: PickItem[]): {
	totalUnits: number;
	pickedUnits: number;
	exceptions: number;
} {
	return items.reduce(
		(acc, it) => ({
			totalUnits: acc.totalUnits + it.qtyExpected,
			pickedUnits: acc.pickedUnits + it.qtyPicked,
			exceptions: acc.exceptions + (it.notFound ? 1 : 0),
		}),
		{ totalUnits: 0, pickedUnits: 0, exceptions: 0 }
	);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun --cwd apps/web test picking-logic`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/separacao/_lib/picking-logic.ts apps/web/src/app/dashboard/separacao/_lib/__tests__/picking-logic.test.ts
git commit -m "feat: lógica pura de picking"
```

### Task 4: Zod schemas das actions

**Files:**
- Create: `apps/web/src/app/dashboard/separacao/schema.ts`

**Interfaces:**
- Produces: `startPickingSchema` (`{ orderId }`), `scanItemSchema` (`{ pickingId, code }`), `reportMissingSchema` (`{ pickingItemId, reason }`), `completePickingSchema` (`{ pickingId }`), `cancelPickingSchema` (`{ pickingId, reason? }`) + tipos inferidos. `ScanResult` discriminated union.

- [ ] **Step 1: Escrever o schema**

```ts
import { z } from "zod";

export const startPickingSchema = z.object({ orderId: z.string().uuid() });
export const scanItemSchema = z.object({
	pickingId: z.string().uuid(),
	code: z.string().trim().min(1).max(128),
});
export const reportMissingSchema = z.object({
	pickingItemId: z.string().uuid(),
	reason: z.string().trim().min(1, "Motivo obrigatório").max(500),
});
export const completePickingSchema = z.object({ pickingId: z.string().uuid() });
export const cancelPickingSchema = z.object({
	pickingId: z.string().uuid(),
	reason: z.string().trim().max(500).optional(),
});

export type StartPickingInput = z.infer<typeof startPickingSchema>;
export type ScanItemInput = z.infer<typeof scanItemSchema>;
export type ReportMissingInput = z.infer<typeof reportMissingSchema>;
export type CompletePickingInput = z.infer<typeof completePickingSchema>;
export type CancelPickingInput = z.infer<typeof cancelPickingSchema>;

export type ScanResult =
	| { kind: "accepted"; pickingItemId: string; qtyPicked: number; qtyExpected: number }
	| { kind: "already_complete" }
	| { kind: "not_in_order" };
```

- [ ] **Step 2: check-types + commit**

Run: `bun check-types`
```bash
git add apps/web/src/app/dashboard/separacao/schema.ts
git commit -m "feat: zod schemas de picking"
```

### Task 5: Reads (`data.ts`, server-only)

**Files:**
- Create: `apps/web/src/app/dashboard/separacao/data.ts`

**Interfaces:**
- Consumes: `getUserBranchScope` (`@/lib/branch-scope`), `db` (`@emach/db`), schema de orders.
- Produces:
  - `getPickingForOrder(orderId): Promise<{ picking: OrderPicking; items: OrderPickingItem[] } | null>`
  - `hasCompletedPicking(orderId): Promise<boolean>` (usado pelo gating)
  - `fetchPickingQueuePage(args): Promise<InfiniteResult<PickingQueueRow>>` (pedidos `paid` no escopo + os `preparing` com sessão ativa)
  - `getActivePickingForUser(userId, branchScope): Promise<...|null>` (banner de retomada)
  - tipo `PickingQueueRow`

- [ ] **Step 1:** criar `data.ts` com `import "server-only"`. Implementar as funções com `db.select()`/`db.query` (não `db.execute` raw — devolve `Date`). `fetchPickingQueuePage` aplica `orderBranchCondition(scope)` (mesmo helper usado em `orders/data.ts` — `grep -rn "orderBranchCondition" apps/web/src` para localizar) e ordena por `paidAt asc`. `hasCompletedPicking` = `select 1 from order_picking where order_id=$1 and status='completed' limit 1`.

> Esta task não tem teste unitário próprio (queries de DB); a verificação é o smoke visual das Tasks 11-13. O foco é seguir os padrões de `orders/data.ts` (paginação keyset, `InfiniteResult`, `BATCH_SIZE`).

- [ ] **Step 2:** check-types + commit

Run: `bun check-types`
```bash
git add apps/web/src/app/dashboard/separacao/data.ts
git commit -m "feat: reads de picking (queue, sessão, gating)"
```

### Task 6: Actions de picking (`actions.ts`)

**Files:**
- Create: `apps/web/src/app/dashboard/separacao/actions.ts`
- Test: `apps/web/src/app/dashboard/separacao/__tests__/picking-actions.test.ts`

**Interfaces:**
- Consumes: `lockOrderAndAuthorize` (exportada de `orders/actions.ts:128`), funções de `_lib/picking-logic.ts`, schemas de `schema.ts`, `getPgError` (`@/lib/db-error`), `ActionResult`.
- Produces: `startPicking(input): Promise<ActionResult<{ pickingId: string }>>`, `scanItem(input): Promise<ActionResult<ScanResult>>`, `reportMissing(input): Promise<ActionResult>`, `completePicking(input): Promise<ActionResult>`, `cancelPicking(input): Promise<ActionResult>`.

- [ ] **Step 1: Escrever os testes de integração** mockando `@emach/db` no padrão canônico (`vi.hoisted` + `vi.mock`, ver `apps/web/src/app/dashboard/orders/__tests__` ou `__tests__/activity.test.ts` como referência de como mockar o transaction/query builder do Drizzle). Cobrir, no mínimo:
  - `startPicking`: rejeita quando `status` não é `paid`/`preparing`; cria sessão + itens e transiciona `paid → preparing`.
  - `scanItem`: `accepted` incrementa `qtyPicked`; `already_complete` quando item no teto; `not_in_order` quando código não casa.
  - `completePicking`: rejeita quando `isPickingComplete` é false; marca `completed` quando true.
  - `reportMissing`: marca `notFound` + sessão `exception`.

> Se o mock completo do query builder ficar frágil, manter os testes focados nos **ramos de validação/decisão** (status inválido, item completo, conclusão bloqueada) que exercitam as funções puras já testadas na Task 3 — não re-testar o Drizzle.

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun --cwd apps/web test picking-actions`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar `actions.ts`** (`"use server"`). Esqueleto das 5 actions (cada uma em `db.transaction`, `lockOrderAndAuthorize(tx, "orders.pick", orderId)`, catch com `getPgError`/`logger.error`/`isCapabilityError`, `revalidatePath("/dashboard/separacao")` + `revalidatePath(\`/dashboard/separacao/\${orderId}\`)` + `revalidatePath(\`/dashboard/orders/\${orderId}\`)`):

  - **`startPicking`**: valida `locked.status in ('paid','preparing')` e `locked.branchId != null`; cria `orderPicking` (`in_progress`, `pickerUserId`/`pickerName` da sessão); `select` dos `orderItem` do pedido → insert de `orderPickingItem` por item (`qtyExpected = quantity`, `variantSnapshot = { sku, name, barcode, voltage }`); se `locked.status === 'paid'`, `tx.update(order).set(buildPreparingUpdate(branchId))` + `orderStatusHistory` (from `paid`, to `preparing`, `actorType:'user'`). Catch 23505 do índice `order_picking_one_active` → "Já existe separação em andamento". Retorna `{ pickingId }`.
  - **`scanItem`**: carrega `orderPicking` (→ `orderId`) + lock; valida `status === 'in_progress'`; carrega `orderPickingItem[]` da sessão → `matchPickItem(items, code, variantIdFromBarcode)` (fallback: `select id,variantId from tool_variant where barcode=code` → casa com itens); `not_in_order` → retorna ScanResult; se `!canScanMore` → `already_complete`; senão `qtyPicked++`, `lastScannedAt=now`, insere `orderPickingScan`; retorna `accepted`.
  - **`reportMissing`**: carrega item → picking → orderId; lock; `notFound=true`; sessão → `exception`, `exceptionReason=reason`.
  - **`completePicking`**: carrega picking + itens; lock; `status==='in_progress'`; `isPickingComplete(items)` senão erro "Conclua a conferência de todos os itens"; marca `completed`, `completedAt=now`.
  - **`cancelPicking`**: lock; sessão → `canceled`.

  Adicionar wrappers `"use server"` de read (`fetchPickingQueuePageAction`, etc.) que fazem `requireCapability("orders.pick")` e delegam ao `data.ts`.

- [ ] **Step 4: Rodar e ver passar**

Run: `bun --cwd apps/web test picking-actions`
Expected: PASS.

- [ ] **Step 5: check-types + build (regra "use server") + commit**

Run: `bun check-types && bun --cwd apps/web run build`
Expected: build PASS (só async functions exportadas do `actions.ts`).
```bash
git add apps/web/src/app/dashboard/separacao/actions.ts apps/web/src/app/dashboard/separacao/__tests__/picking-actions.test.ts
git commit -m "feat: server actions de picking"
```

### Task 7: Gating do `shipped` em `updateOrderStatus`

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/actions.ts` (dentro de `updateOrderStatus`, após o check de `VALID_TRANSITIONS`)

**Interfaces:**
- Consumes: `hasCompletedPicking` (Task 5), `session.user.role`.

- [ ] **Step 1: Escrever teste** em `orders/__tests__` (ou no arquivo de teste de orders existente): `updateOrderStatus` para `shipped` falha com "Conclua a separação antes de despachar" quando não há picking `completed`; passa quando há; `super_admin` passa mesmo sem picking.

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun --cwd apps/web test orders`
Expected: FAIL.

- [ ] **Step 3: Implementar o gate.** Dentro de `updateOrderStatus`, depois da validação de transição e antes do `tx.update`:

```ts
if (
	toStatus === "shipped" &&
	session.user.role !== "super_admin" &&
	!(await hasCompletedPicking(orderId))
) {
	throw new Error("Conclua a separação antes de despachar o pedido");
}
```

Importar `hasCompletedPicking` de `../separacao/data`.

- [ ] **Step 4: Rodar e ver passar**

Run: `bun --cwd apps/web test orders`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/orders/actions.ts apps/web/src/app/dashboard/orders/__tests__
git commit -m "feat: gating de separação antes do envio"
```

---

## FASE 3 — Fila (`/dashboard/separacao`)

### Task 8: Item de navegação + badge

**Files:**
- Modify: `apps/web/src/app/dashboard/_components/nav-config.ts`

- [ ] **Step 1:** No grupo "Operação" (`grep -n "Operação\|Pedidos" nav-config.ts`), após o item Pedidos, adicionar:

```ts
{ label: "Separação", href: "/dashboard/separacao", icon: PackageCheck, capability: "orders.pick" },
```

Importar `PackageCheck` de `lucide-react`. (Badge de contagem é opcional — adiar para um follow-up se exigir os 4 pontos de mudança de `nav-badge.tsx`; documentar a omissão.)

- [ ] **Step 2:** check-types + commit

Run: `bun check-types`
```bash
git add apps/web/src/app/dashboard/_components/nav-config.ts
git commit -m "feat: nav item de separação"
```

### Task 9: Página da fila + componentes

**Files:**
- Create: `apps/web/src/app/dashboard/separacao/page.tsx`
- Create: `apps/web/src/app/dashboard/separacao/_components/picking-queue.tsx` (client, `useInfiniteList`)
- Create: `apps/web/src/app/dashboard/separacao/_components/picking-order-card.tsx`
- Create: `apps/web/src/app/dashboard/separacao/_components/resume-banner.tsx`

**Interfaces:**
- Consumes: `fetchPickingQueuePageAction`, `getActivePickingForUser` (via wrapper), `requireCapabilityOrRedirect("orders.pick")`, `getUserBranchScope`.

- [ ] **Step 1:** `page.tsx` (Server Component): `await requireCapabilityOrRedirect("orders.pick")`; carregar 1ª página da fila + banner de retomada + resumo (a separar/em andamento/exceções). Header h1 serif "Separação". Tabs split (padrão `order-list-filters.tsx`): *A separar* / *Em separação* | *Exceções*. **Sem `loading.tsx`** (ADR-0022).

- [ ] **Step 2:** componentes seguindo o **mockup aprovado** `.superpowers/brainstorm/253087-1782399692/content/picking-queue-v2.html` (fila **sem avatar** — número do pedido como título; cliente subtítulo; 📍 filial; idade do pagamento com destaque `warning` quando urgente; footer Itens · Unidades; CTA **Separar**/**Retomar**). `picking-queue.tsx` usa `useInfiniteList` + `<InfiniteSentinel>`; card é `<Link href={\`/dashboard/separacao/\${orderId}\`}>`. Banner de retomada em `bg-surface-deep ring-2 ring-info`.

- [ ] **Step 3: Smoke visual** (servidor já em `localhost:3006`): visitar `/dashboard/separacao` — fila renderiza, cards sem avatar, tabs funcionam, CTA leva à execução. `nextjs_call 3006 get_errors` se a tela quebrar.

- [ ] **Step 4: Gate + commit**

Run: `bun verify`
```bash
git add apps/web/src/app/dashboard/separacao/page.tsx apps/web/src/app/dashboard/separacao/_components
git commit -m "feat: fila de separação"
```

---

## FASE 4 — Execução (`/dashboard/separacao/[orderId]`)

### Task 10: Página de execução + scan client

**Files:**
- Create: `apps/web/src/app/dashboard/separacao/[orderId]/page.tsx`
- Create: `apps/web/src/app/dashboard/separacao/_components/picking-execution.tsx` (client)
- Create: `apps/web/src/app/dashboard/separacao/_components/scan-input.tsx` (client)

**Interfaces:**
- Consumes: `getPickingForOrder` (via wrapper read), `scanItem`, `reportMissing`, `completePicking`.

- [ ] **Step 1:** `page.tsx` (Server Component): `requireCapabilityOrRedirect("orders.pick")`; `getPickingForOrder(orderId)` — se não há sessão `in_progress`, chamar fluxo que aciona `startPicking` (botão "Iniciar separação") ou iniciar no carregamento a partir da fila. Passar `picking` + `items` para `picking-execution.tsx`.

- [ ] **Step 2:** `scan-input.tsx`: `<input>` com **foco automático** (`autoFocus` + refocus após cada scan), captura keyboard-wedge (`onKeyDown` Enter lê o valor, sem debounce — padrão de `stock/_components/branch-stock-infinite.tsx`, `grep -n "handleScannerKeyDown" apps/web/src`). Ao Enter: chama `scanItem({ pickingId, code })`, trata `ScanResult` (`accepted`/`already_complete`/`not_in_order`) com feedback visual (verde/mustard/vermelho) e limpa+refoca.

- [ ] **Step 3:** `picking-execution.tsx`: layout do **mockup aprovado** `picking-b-refined.html` (tela focada, 2 colunas — esquerda scan + card de item em foco + 3 estados de feedback; direita checklist + resumo + **Concluir** desabilitado até `isPickingComplete`). "Item não encontrado" → `reportMissing`. "Concluir separação" → `completePicking` → redireciona/volta à fila.

- [ ] **Step 4: Smoke visual** com leitor real ou simulação de keydown rápido+Enter em `localhost:3006`: iniciar separação de um pedido `paid`, bipar item (contador sobe), bipar código fora do pedido (vermelho), concluir libera; depois conferir que o pedido aparece liberado para `shipped` no detalhe.

- [ ] **Step 5: Gate + commit**

Run: `bun verify`
```bash
git add apps/web/src/app/dashboard/separacao/[orderId] apps/web/src/app/dashboard/separacao/_components/picking-execution.tsx apps/web/src/app/dashboard/separacao/_components/scan-input.tsx
git commit -m "feat: tela de execução da separação (scan)"
```

---

## FASE 5 — Timeline do pedido

### Task 11: Picking na timeline do detalhe do pedido

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/data.ts` (`getOrderDetail` — adicionar 8ª query)
- Modify: `apps/web/src/app/dashboard/orders/[id]/_components/order-history-feed.tsx` (`normalizePickings`)

**Interfaces:**
- Consumes: `orderPicking`/`orderPickingItem` do schema.

- [ ] **Step 1:** Em `getOrderDetail`, adicionar ao `Promise.all` a query de `orderPicking` (por `orderId`, com `items`) e incluir no tipo `OrderDetail`. Usar `db.query`/`db.select` (devolve `Date`).

- [ ] **Step 2:** Em `order-history-feed.tsx`, adicionar `normalizePickings(pickings)` → `FeedItem[]` de `category: "status"`: "Separação iniciada por <pickerName>" (`startedAt`, tone `info`), "Separação concluída" (`completedAt`, tone `success`), "Falta reportada" (tone `destructive`, quando `exception`). Usar `iconKey`/`tone` serializáveis (`status-visual.tsx`). Mesclar no sort por `createdAt desc` existente.

- [ ] **Step 3: Smoke visual** em `/dashboard/orders/[id]` de um pedido com separação: a timeline mostra os eventos de picking; o detalhe **não quebra** para pedidos sem picking.

- [ ] **Step 4: Gate + commit**

Run: `bun verify`
```bash
git add apps/web/src/app/dashboard/orders/data.ts apps/web/src/app/dashboard/orders/[id]/_components/order-history-feed.tsx
git commit -m "feat: separação na timeline do pedido"
```

---

## FASE 6 — Coordenação cross-repo

### Task 12: Ownership das tabelas de picking no contrato

**Files:**
- Modify: `docs/integration/admin-ecommerce.md`

- [ ] **Step 1:** Na tabela de ownership, adicionar `order_picking`, `order_picking_item`, `order_picking_scan` como **Dashboard/Dashboard · e-commerce nunca lê/escreve** (mesma linha de `order_note`/`order_event`). Anotar que chegam ao ecommerce via sync (ADR-0009) mas não exigem mudança de código no checkout.

- [ ] **Step 2: Commit**

```bash
git add docs/integration/admin-ecommerce.md
git commit -m "docs: ownership das tabelas de picking (admin-ecommerce)"
```

---

## Self-Review (preenchido)

**Spec coverage:** modelo de dados → Task 1; capability → Task 2; lógica/lookup/contagem/conclusão → Tasks 3+6; gating → Task 7; fila → Tasks 8-9; execução/scan/feedback/reportar-falta → Task 10; timeline → Task 11; cross-repo → Task 12; estoque (não-movimenta) → garantido por omissão (nenhuma action de picking toca stock). Edge cases (snapshot nulo, código fora, concorrência) → Tasks 3/6/1 (uniqueIndex).

**Placeholders:** schema e lógica pura têm código completo; UI (Tasks 9-10) referencia os mockups aprovados + componentes canônicos por path (padrão de codebase existente, não é placeholder). Testes de action (Task 6) descritos por comportamento com fallback explícito para não testar o Drizzle.

**Type consistency:** `OrderPickingStatus` valores idênticos em schema e actions; `ScanResult` definido na Task 4 e consumido nas Tasks 6/10; `PickItem`/`matchPickItem`/`isPickingComplete` definidos na Task 3 e usados na Task 6; `hasCompletedPicking` definido na Task 5 e usado na Task 7.

## Fora de escopo (do spec)

- Alinhar `order-card.tsx` (remover avatar na listagem de Pedidos).
- Reembolso/cancelamento parcial automático no short-pick.
- Scanner por câmera.
- Badge de contagem na sidebar (omitido na Task 8 — adicionar depois se desejado).
