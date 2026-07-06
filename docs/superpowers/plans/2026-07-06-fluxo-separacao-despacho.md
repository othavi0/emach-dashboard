# Fluxo de Separação e Despacho — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate de envio universal (com override auditado), sub-estado de fulfillment derivado da última sessão de picking, ownership/takeover de sessões e visibilidade da separação no detalhe/lista de pedidos.

**Architecture:** `order.status` intocado (contrato ecommerce). Sub-estado derivado da sessão de `order_picking` mais recente via helper único em `separacao/data.ts` + função pura em `_lib/picking-logic.ts`. Gate e override vivem em `updateOrderStatus`. UI: card novo no detalhe do pedido, painel pós-conclusão na tela de separação, badges na fila/lista.

**Tech Stack:** Next 16 / React 19 (React Compiler), Drizzle 0.45 push-only, Zod, Vitest, Better Auth (dashboard), shadcn sobre @base-ui.

**Spec:** `docs/superpowers/specs/2026-07-06-fluxo-separacao-despacho-design.md` (aprovado).

## Global Constraints

- PT-BR em toda label/mensagem de erro. Conventional Commits em PT, subject ≤50 chars.
- Proibido: `console.*` (usar `logger` de `@/lib/logger`), `: any`/`as any`/`@ts-ignore`, `key={index}`, `React.forwardRef`, `useMemo`/`useCallback` manuais.
- IDs: `crypto.randomUUID()` no caller. Timestamps: `timestamp(..., { withTimezone: true })`.
- Server actions: `"use server"` + `requireCapability*` no início (inclusive reads exportadas de `actions.ts`); retorno `ActionResult<T>`; `revalidatePath` após mutação; erros de banco via `getPgError` (nunca `e.message.includes`).
- `"use server"` só pode exportar async functions — tipos/consts vivem em `schema.ts`/`data.ts`/`_lib`. **`bun run build` é gate obrigatório após tocar arquivo `"use server"`.**
- Schema push-only: após editar `packages/db/src/schema/*.ts`, rodar `bun db:sync` (pede TTY — rodar interativo, não em subagent).
- Datas de exibição sempre via `src/lib/format/datetime.ts` (`formatRelative`, `formatTime`, …).
- Testes: `bun --cwd apps/web test <arquivo>` (vitest, node env). Antes de cada commit: `bun check-types`. Gate final: `bun verify`.
- Hook PostToolUse roda `bun fix` após Write/Edit — se um Edit subsequente falhar com `string not found`, re-Read o arquivo.

## File Structure

| Arquivo | Papel |
|---|---|
| `packages/db/src/schema/orders.ts` | +4 colunas auditoria em `order_picking`; +`ship_forced` no `order_event_type` |
| `apps/web/src/app/dashboard/separacao/_lib/picking-logic.ts` | +`FulfillmentState`, `deriveFulfillmentState`, `STALE_PICKING_MS`, `isPickingStale` (puro, testável) |
| `apps/web/src/app/dashboard/separacao/fulfillment-meta.ts` | NOVO — meta visual (label/ícone/badge) por sub-estado, client-safe |
| `apps/web/src/app/dashboard/separacao/data.ts` | +`getLatestPicking`, `isPickingCompleteForShip` (substitui `hasCompletedPicking`); queries de fila corrigidas p/ última sessão |
| `apps/web/src/app/dashboard/separacao/actions.ts` | Guards ownership/status; `cancelPicking` auditado; NOVA `takeoverPicking`; branch-scope em `getPickingForOrderAction`; `completePicking` retorna `finalStatus` |
| `apps/web/src/app/dashboard/orders/schema.ts` | +`forceShip`/`forceReason` no `updateOrderStatusSchema` |
| `apps/web/src/app/dashboard/orders/actions.ts` | Gate universal + `forceShip` em `updateOrderStatus`; `insertOrderEvent` aceita `ship_forced` |
| `apps/web/src/app/dashboard/orders/data.ts` | `OrderDetail.fulfillment`; `OrderListItem.fulfillmentState` |
| `apps/web/src/app/dashboard/orders/[id]/_components/picking-status-card.tsx` | NOVO — card "Separação" no detalhe |
| `apps/web/src/app/dashboard/orders/[id]/_components/force-ship-dialog.tsx` | NOVO — override super_admin |
| `apps/web/src/app/dashboard/orders/[id]/_components/order-action-column.tsx` | Integra card + trava envio + força envio |
| `apps/web/src/app/dashboard/separacao/[orderId]/page.tsx` | Decide execução / read-only / start-com-exceção |
| `apps/web/src/app/dashboard/separacao/_components/picking-readonly.tsx` | NOVO — visão não-dono + Assumir/Cancelar |
| `apps/web/src/app/dashboard/separacao/_components/picking-complete-panel.tsx` | NOVO — "Despachar agora" pós-conclusão |
| `apps/web/src/app/dashboard/separacao/_components/picking-execution.tsx` | Estado pós-conclusão (sem redirect imediato) |
| `apps/web/src/app/dashboard/separacao/_components/start-picking.tsx` | Contexto de exceção ao reabrir |
| `apps/web/src/app/dashboard/separacao/_components/picking-order-card.tsx` | Badge de sessão parada |
| `apps/web/src/components/auto-refresh.tsx` | NOVO — polling leve client |
| `apps/web/src/app/dashboard/orders/_components/order-card.tsx` | Badge de sub-estado na lista |
| `apps/web/src/app/dashboard/orders/[id]/_components/order-progress.tsx` | Sub-label no nó "Em preparação" |
| Testes | `orders/__tests__/ship-gating.test.ts` (reescrito), `separacao/__tests__/fulfillment-state.test.ts`, `separacao/__tests__/picking-guards.test.ts` (novos) |

---

### Task 1: Schema DB — auditoria de cancelamento + ship_forced

**Files:**
- Modify: `packages/db/src/schema/orders.ts:60-64` (enum) e `:399-434` (tabela `order_picking`)

**Interfaces:**
- Produces: colunas `orderPicking.canceledByUserId/canceledByName/canceledAt/cancelReason` (todas nullable); valor `"ship_forced"` em `orderEventTypeEnum`. Tasks 4/5/6 dependem.

- [ ] **Step 1: Adicionar `ship_forced` ao enum (append-only — nunca reordenar)**

```ts
export const orderEventTypeEnum = pgEnum("order_event_type", [
	"tracking_set",
	"branch_assigned",
	"shipping_reviewed",
	// Envio forçado por super_admin sem separação concluída (auditoria do override).
	// Append-only: Postgres ALTER TYPE só ADD VALUE no fim.
	"ship_forced",
]);
```

- [ ] **Step 2: Adicionar colunas de auditoria em `orderPicking`** (logo após `exceptionReason: text("exception_reason"),` em `orders.ts:418`):

```ts
		// Auditoria de cancelamento (dono, admin ou takeover). Nullable: sessões
		// não-canceladas não carregam nada aqui.
		canceledByUserId: text("canceled_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		canceledByName: text("canceled_by_name"),
		canceledAt: timestamp("canceled_at", { withTimezone: true }),
		cancelReason: text("cancel_reason"),
```

- [ ] **Step 3: Aplicar no banco (interativo — TTY):**

Run: `bun db:sync`
Expected: `ALTER TABLE order_picking ADD COLUMN ...` (4 colunas) + `ALTER TYPE order_event_type ADD VALUE 'ship_forced'`. Sem prompts destrutivos.

- [ ] **Step 4: `bun check-types`** — Expected: PASS (colunas novas são opcionais em insert).

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/orders.ts
git commit -m "feat: auditoria de cancelamento e ship_forced no schema"
```

---

### Task 2: Lógica pura — deriveFulfillmentState + stale (TDD)

**Files:**
- Modify: `apps/web/src/app/dashboard/separacao/_lib/picking-logic.ts` (append no fim)
- Create: `apps/web/src/app/dashboard/separacao/fulfillment-meta.ts`
- Test: `apps/web/src/app/dashboard/separacao/__tests__/fulfillment-state.test.ts`

**Interfaces:**
- Produces: `type FulfillmentState = "awaiting_picking" | "picking_in_progress" | "picking_exception" | "picked"`; `deriveFulfillmentState(latestStatus: OrderPickingStatus | null): FulfillmentState`; `STALE_PICKING_MS = 3_600_000`; `isPickingStale(args: { lastScannedAt: Date | null; startedAt: Date; now?: Date }): boolean`; `FULFILLMENT_STATE_META: Record<FulfillmentState, { badgeVariant: "secondary"|"info"|"warning"|"success"; iconKey: StatusIconKey; label: string }>`.

- [ ] **Step 1: Teste que falha** — criar `__tests__/fulfillment-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
	deriveFulfillmentState,
	isPickingStale,
	STALE_PICKING_MS,
} from "../_lib/picking-logic";

describe("deriveFulfillmentState", () => {
	it("null (nenhuma sessão) → awaiting_picking", () => {
		expect(deriveFulfillmentState(null)).toBe("awaiting_picking");
	});
	it("canceled → awaiting_picking (volta pra fila)", () => {
		expect(deriveFulfillmentState("canceled")).toBe("awaiting_picking");
	});
	it("in_progress → picking_in_progress", () => {
		expect(deriveFulfillmentState("in_progress")).toBe("picking_in_progress");
	});
	it("exception → picking_exception", () => {
		expect(deriveFulfillmentState("exception")).toBe("picking_exception");
	});
	it("completed → picked", () => {
		expect(deriveFulfillmentState("completed")).toBe("picked");
	});
});

describe("isPickingStale", () => {
	const now = new Date("2026-07-06T15:00:00Z");
	it("sem bipagem, startedAt há 2h → stale", () => {
		expect(
			isPickingStale({
				lastScannedAt: null,
				startedAt: new Date(now.getTime() - 2 * STALE_PICKING_MS),
				now,
			})
		).toBe(true);
	});
	it("última bipagem há 10min → não stale (mesmo com start antigo)", () => {
		expect(
			isPickingStale({
				lastScannedAt: new Date(now.getTime() - 10 * 60 * 1000),
				startedAt: new Date(now.getTime() - 5 * STALE_PICKING_MS),
				now,
			})
		).toBe(false);
	});
	it("exatamente no limiar → não stale (estrito >)", () => {
		expect(
			isPickingStale({
				lastScannedAt: new Date(now.getTime() - STALE_PICKING_MS),
				startedAt: new Date(0),
				now,
			})
		).toBe(false);
	});
});
```

- [ ] **Step 2:** Run: `bun --cwd apps/web test src/app/dashboard/separacao/__tests__/fulfillment-state.test.ts` — Expected: FAIL (`deriveFulfillmentState` não exportado).

- [ ] **Step 3: Implementar em `_lib/picking-logic.ts`** (append; adicionar `import type { OrderPickingStatus } from "@emach/db/schema/orders";` no topo se ausente):

```ts
// ─── Sub-estado de fulfillment (derivado da ÚLTIMA sessão de picking) ────────
// order.status fica intocado (contrato ecommerce); o dashboard deriva o estado
// operacional da separação da sessão mais recente. Spec 2026-07-06.

export type FulfillmentState =
	| "awaiting_picking"
	| "picking_in_progress"
	| "picking_exception"
	| "picked";

export function deriveFulfillmentState(
	latestStatus: OrderPickingStatus | null
): FulfillmentState {
	if (latestStatus === "in_progress") {
		return "picking_in_progress";
	}
	if (latestStatus === "exception") {
		return "picking_exception";
	}
	if (latestStatus === "completed") {
		return "picked";
	}
	// null (nenhuma sessão) ou canceled → volta pra fila de separação
	return "awaiting_picking";
}

/** Sessão sem bipagem há mais de 1h é destacada como parada (só alerta). */
export const STALE_PICKING_MS = 60 * 60 * 1000;

export function isPickingStale(args: {
	lastScannedAt: Date | null;
	now?: Date;
	startedAt: Date;
}): boolean {
	const reference = args.lastScannedAt ?? args.startedAt;
	const now = args.now ?? new Date();
	return now.getTime() - reference.getTime() > STALE_PICKING_MS;
}
```

- [ ] **Step 4: Criar `fulfillment-meta.ts`** (client-safe, sem `server-only` — segue pattern `status-meta.ts`):

```ts
import type { StatusIconKey } from "@/components/status-visual";
import type { FulfillmentState } from "./_lib/picking-logic";

// Fonte única visual do sub-estado de fulfillment (badge no detalhe, lista e fila).
export const FULFILLMENT_STATE_META: Record<
	FulfillmentState,
	{
		badgeVariant: "info" | "secondary" | "success" | "warning";
		iconKey: StatusIconKey;
		label: string;
	}
> = {
	awaiting_picking: {
		label: "Aguardando separação",
		iconKey: "clock",
		badgeVariant: "secondary",
	},
	picking_in_progress: {
		label: "Em separação",
		iconKey: "package",
		badgeVariant: "info",
	},
	picking_exception: {
		label: "Exceção na separação",
		iconKey: "ban",
		badgeVariant: "warning",
	},
	picked: { label: "Separado", iconKey: "check", badgeVariant: "success" },
};
```

- [ ] **Step 5:** Run teste de novo — Expected: PASS. Depois `bun check-types` — PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/separacao/_lib/picking-logic.ts apps/web/src/app/dashboard/separacao/fulfillment-meta.ts apps/web/src/app/dashboard/separacao/__tests__/fulfillment-state.test.ts
git commit -m "feat: sub-estado de fulfillment derivado (lógica pura)"
```

---

### Task 3: Data layer — getLatestPicking + queries última-sessão + branch-scope

**Files:**
- Modify: `apps/web/src/app/dashboard/separacao/data.ts` (substituir `hasCompletedPicking:96-108`; corrigir queries `:157-185`, `:215-248`, counts `:300-330`; ampliar `PickingQueueRow`)
- Modify: `apps/web/src/app/dashboard/separacao/actions.ts:549-552` (`getPickingForOrderAction`)
- Modify: `apps/web/src/app/dashboard/orders/actions.ts:28` (import) — só o import; o gate muda na Task 4

**Interfaces:**
- Consumes: `deriveFulfillmentState` (Task 2).
- Produces:
  - `interface LatestPickingInfo { completedAt: Date | null; exceptionReason: string | null; lastScannedAt: Date | null; pickedUnits: number; pickerName: string; pickerUserId: string | null; pickingId: string; startedAt: Date; status: OrderPickingStatus; totalUnits: number }`
  - `getLatestPicking(orderId: string): Promise<LatestPickingInfo | null>`
  - `isPickingCompleteForShip(orderId: string): Promise<boolean>` — **substitui** `hasCompletedPicking` (remover o export antigo; atualizar o import em `orders/actions.ts`).
  - `PickingQueueRow` ganha `exceptionReason?: string | null; lastScannedAt?: Date | null; pickingStartedAt?: Date | null`.

- [ ] **Step 1: Implementar `getLatestPicking` + `isPickingCompleteForShip`** no lugar de `hasCompletedPicking` (`data.ts:93-108`). ⚠️ `db.execute` devolve snake_case + timestamps string — alias `AS "camelCase"` e coerção com `toDate` (armadilhas de `packages/db/CLAUDE.md`):

```ts
export interface LatestPickingInfo {
	completedAt: Date | null;
	exceptionReason: string | null;
	lastScannedAt: Date | null;
	pickedUnits: number;
	pickerName: string;
	pickerUserId: string | null;
	pickingId: string;
	startedAt: Date;
	status: OrderPickingStatus;
	totalUnits: number;
}

/**
 * Sessão de picking MAIS RECENTE do pedido — fonte única do sub-estado de
 * fulfillment (deriveFulfillmentState). Inclui progresso e última bipagem.
 */
export async function getLatestPicking(
	orderId: string
): Promise<LatestPickingInfo | null> {
	const result = await db.execute<{
		completed_at: string | null;
		exception_reason: string | null;
		last_scanned_at: string | null;
		picked_units: string;
		picker_name: string;
		picker_user_id: string | null;
		picking_id: string;
		started_at: string;
		status: OrderPickingStatus;
		total_units: string;
	}>(sql`
		SELECT
			op.id AS picking_id,
			op.status,
			op.picker_user_id,
			op.picker_name,
			op.started_at,
			op.completed_at,
			op.exception_reason,
			(SELECT COALESCE(SUM(pi.qty_picked), 0)::int
				FROM order_picking_item pi WHERE pi.picking_id = op.id) AS picked_units,
			(SELECT COALESCE(SUM(pi.qty_expected), 0)::int
				FROM order_picking_item pi WHERE pi.picking_id = op.id) AS total_units,
			(SELECT MAX(pi.last_scanned_at)
				FROM order_picking_item pi WHERE pi.picking_id = op.id) AS last_scanned_at
		FROM order_picking op
		WHERE op.order_id = ${orderId}
		ORDER BY op.started_at DESC
		LIMIT 1
	`);

	const row = result.rows[0];
	if (!row) {
		return null;
	}
	return {
		pickingId: row.picking_id,
		status: row.status,
		pickerUserId: row.picker_user_id,
		pickerName: row.picker_name,
		startedAt: toDate(row.started_at),
		completedAt: row.completed_at ? toDate(row.completed_at) : null,
		exceptionReason: row.exception_reason,
		pickedUnits: Number(row.picked_units),
		totalUnits: Number(row.total_units),
		lastScannedAt: row.last_scanned_at ? toDate(row.last_scanned_at) : null,
	};
}

/**
 * Gate de envio: true só se a sessão MAIS RECENTE está completed.
 * (Substitui hasCompletedPicking, que aceitava qualquer sessão histórica.)
 */
export async function isPickingCompleteForShip(
	orderId: string
): Promise<boolean> {
	const latest = await getLatestPicking(orderId);
	return latest?.status === "completed";
}
```

Ajustar import de tipo no topo: `OrderPickingStatus` vem de `@emach/db/schema/orders`.

- [ ] **Step 2: Corrigir tabs para semântica de última sessão.** Em `fetchPickingQueuePage`:
  - **`a_separar`** — trocar o `NOT EXISTS (... IN ('in_progress','exception','completed'))` por LATERAL de última sessão:

```sql
FROM "order" o
JOIN client c ON c.id = o.client_id
LEFT JOIN branch b ON b.id = o.branch_id
LEFT JOIN LATERAL (
	SELECT op.status FROM order_picking op
	WHERE op.order_id = o.id
	ORDER BY op.started_at DESC LIMIT 1
) lp ON true
WHERE o.status IN ('paid', 'preparing')
	AND (lp.status IS NULL OR lp.status = 'canceled')
```

  - **`em_separacao`** — manter o JOIN por `in_progress` (a unique parcial garante que é a última), acrescentando ao SELECT:

```sql
op.started_at AS picking_started_at,
(SELECT MAX(pi.last_scanned_at) FROM order_picking_item pi
	WHERE pi.picking_id = op.id) AS last_scanned_at,
```

  - **`excecoes`** — trocar `JOIN order_picking op ON ... status='exception'` + `EXISTS` por LATERAL exigindo que a **última** seja exception:

```sql
JOIN LATERAL (
	SELECT op.id, op.picker_name, op.status, op.exception_reason
	FROM order_picking op
	WHERE op.order_id = o.id
	ORDER BY op.started_at DESC LIMIT 1
) op ON op.status = 'exception'
WHERE o.status = 'preparing'
```

  (adicionar `op.exception_reason AS exception_reason` ao SELECT). Estender `QueueRaw` com `exception_reason: string | null; last_scanned_at: string | null; picking_started_at: string | null` (presentes como `NULL::…` nas tabs que não os têm — manter as 3 queries com o mesmo shape de colunas) e o mapper do `paginate` com coerções `toDate` condicionais. Estender `PickingQueueRow` com os 3 campos opcionais.

- [ ] **Step 3: Corrigir `fetchPickingQueueCounts`** com os mesmos predicados (LATERAL p/ `a_separar` e `excecoes`).

- [ ] **Step 4: Branch-scope em `getPickingForOrderAction`** (`separacao/actions.ts:549-552`):

```ts
export async function getPickingForOrderAction(orderId: string) {
	const session = await requireCapability("orders.pick");
	const scope = await getUserBranchScope(session);
	const orderRow = await getOrderBranchId(orderId);
	if (!(orderRow && orderInScope(scope, orderRow.branchId))) {
		return null;
	}
	return getPickingForOrder(orderId);
}
```

Imports: `orderInScope` de `@/lib/branch-scope`; `getOrderBranchId` já exportado de `./data`.

- [ ] **Step 5: Atualizar o import em `orders/actions.ts:28`** para `import { isPickingCompleteForShip } from "../separacao/data";` e o call-site `hasCompletedPicking(orderId)` → `isPickingCompleteForShip(orderId)` (a lógica do gate em si muda na Task 4; aqui só o rename compila). Rodar `rg -n "hasCompletedPicking" apps/web/src` — deve sobrar só o mock em `ship-gating.test.ts` (reescrito na Task 4).

- [ ] **Step 6:** `bun check-types` — Expected: PASS (o mock antigo de `hasCompletedPicking` em `ship-gating.test.ts` referencia o módulo por string e não quebra tipos; ele é reescrito na Task 4).

- [ ] **Step 7: Smoke SQL** (check-types não valida SQL em template string): `bun dev:web` já roda na 3006 — visitar `/dashboard/separacao` (3 tabs) e conferir contadores/cards sem erro 500. `nextjs_call 3006 get_errors` limpo.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/dashboard/separacao/data.ts apps/web/src/app/dashboard/separacao/actions.ts apps/web/src/app/dashboard/orders/actions.ts
git commit -m "feat: última sessão como fonte do estado de picking"
```

---

### Task 4: Gate de envio universal + forceShip auditado (TDD)

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/schema.ts:69-108` (Zod) e `apps/web/src/app/dashboard/orders/actions.ts` (`insertOrderEvent:130-147`, gate `:210-216`)
- Test: reescrever `apps/web/src/app/dashboard/orders/__tests__/ship-gating.test.ts`

**Interfaces:**
- Consumes: `getLatestPicking`/`isPickingCompleteForShip` (Task 3), `deriveFulfillmentState` (Task 2), enum `ship_forced` (Task 1).
- Produces: `updateOrderStatusSchema` aceita `forceShip?: boolean` e `forceReason?: string` (min 10); `updateOrderStatus` sem bypass de super_admin. Tasks 7/9 chamam `updateOrderStatus({ ..., forceShip, forceReason })`.

- [ ] **Step 1: Reescrever `ship-gating.test.ts`.** Manter a infra de mocks existente (hoisted + `makeMockTx`), trocando o mock de `../../separacao/data` para `getLatestPicking` e cobrindo: gate p/ super_admin, última-sessão, forceShip. Conteúdo integral novo do bloco de mocks/data + testes (o restante da infra — `makeMockTx`, mocks de permissions/branch-scope/next-cache/logger/data/pending-data/session — fica como está):

```ts
// substitui o vi.hoisted existente
const {
	mockTransaction,
	mockRequireCapabilityWithContext,
	mockGetLatestPicking,
} = vi.hoisted(() => ({
	mockTransaction: vi.fn(),
	mockRequireCapabilityWithContext: vi.fn(),
	mockGetLatestPicking: vi.fn(),
}));

// substitui o vi.mock("../../separacao/data") existente
vi.mock("../../separacao/data", () => ({
	getLatestPicking: mockGetLatestPicking,
	isPickingCompleteForShip: vi.fn(),
	getPickingForOrder: vi.fn(),
	fetchPickingQueue: vi.fn(),
	getOrderBranchId: vi.fn(),
}));
```

Helper de sessão + factory de latest no corpo do describe:

```ts
function latestWith(status: "in_progress" | "completed" | "exception" | "canceled") {
	return {
		pickingId: "pk_1",
		status,
		pickerUserId: "usr_9",
		pickerName: "João",
		startedAt: new Date(),
		completedAt: null,
		exceptionReason: status === "exception" ? "faltou item" : null,
		pickedUnits: 0,
		totalUnits: 8,
		lastScannedAt: null,
	};
}
```

Casos (todos com `toStatus: "shipped"`, `trackingCode: "BR123456789BR"`, locked row `{ status: "preparing", branchId: BRANCH_ID }`):

```ts
it("(1) super_admin SEM separação concluída → bloqueado (bypass removido)", async () => {
	mockRequireCapabilityWithContext.mockResolvedValue({
		user: { id: USER_ID, role: "super_admin" },
	});
	mockGetLatestPicking.mockResolvedValue(null);
	const result = await updateOrderStatus({ orderId: ORDER_ID, toStatus: "shipped", trackingCode: "BR123456789BR" });
	expect(result.ok).toBe(false);
	expect((result as { ok: false; error: string }).error).toMatch(SEPARA_RE);
});

it("(2) última sessão canceled (havia completed antiga) → bloqueado", async () => {
	mockRequireCapabilityWithContext.mockResolvedValue({ user: { id: USER_ID, role: "admin" } });
	mockGetLatestPicking.mockResolvedValue(latestWith("canceled"));
	const result = await updateOrderStatus({ orderId: ORDER_ID, toStatus: "shipped", trackingCode: "BR123456789BR" });
	expect(result.ok).toBe(false);
});

it("(3) última sessão completed → passa o gate", async () => {
	mockRequireCapabilityWithContext.mockResolvedValue({ user: { id: USER_ID, role: "user" } });
	mockGetLatestPicking.mockResolvedValue(latestWith("completed"));
	const result = await updateOrderStatus({ orderId: ORDER_ID, toStatus: "shipped", trackingCode: "BR123456789BR" });
	expect(result.ok).toBe(true);
});

it("(4) exception → bloqueado com mensagem própria", async () => {
	mockRequireCapabilityWithContext.mockResolvedValue({ user: { id: USER_ID, role: "admin" } });
	mockGetLatestPicking.mockResolvedValue(latestWith("exception"));
	const result = await updateOrderStatus({ orderId: ORDER_ID, toStatus: "shipped", trackingCode: "BR123456789BR" });
	expect(result.ok).toBe(false);
	expect((result as { ok: false; error: string }).error).toMatch(/exceç/i);
});

it("(5) forceShip por admin → recusado", async () => {
	mockRequireCapabilityWithContext.mockResolvedValue({ user: { id: USER_ID, role: "admin" } });
	mockGetLatestPicking.mockResolvedValue(null);
	const result = await updateOrderStatus({ orderId: ORDER_ID, toStatus: "shipped", trackingCode: "BR123456789BR", forceShip: true, forceReason: "cliente no balcão aguardando" });
	expect(result.ok).toBe(false);
});

it("(6) forceShip super_admin sem motivo → recusado pelo schema", async () => {
	const result = await updateOrderStatus({ orderId: ORDER_ID, toStatus: "shipped", trackingCode: "BR123456789BR", forceShip: true });
	expect(result.ok).toBe(false);
	expect((result as { ok: false; error: string }).error).toMatch(/motivo/i);
});

it("(7) forceShip super_admin com motivo, sem sessão ativa → passa", async () => {
	mockRequireCapabilityWithContext.mockResolvedValue({ user: { id: USER_ID, role: "super_admin" } });
	mockGetLatestPicking.mockResolvedValue(latestWith("canceled"));
	const result = await updateOrderStatus({ orderId: ORDER_ID, toStatus: "shipped", trackingCode: "BR123456789BR", forceShip: true, forceReason: "cliente no balcão aguardando" });
	expect(result.ok).toBe(true);
});

it("(8) forceShip com sessão in_progress → bloqueado (não força por cima)", async () => {
	mockRequireCapabilityWithContext.mockResolvedValue({ user: { id: USER_ID, role: "super_admin" } });
	mockGetLatestPicking.mockResolvedValue(latestWith("in_progress"));
	const result = await updateOrderStatus({ orderId: ORDER_ID, toStatus: "shipped", trackingCode: "BR123456789BR", forceShip: true, forceReason: "cliente no balcão aguardando" });
	expect(result.ok).toBe(false);
	expect((result as { ok: false; error: string }).error).toMatch(/andamento/i);
});
```

- [ ] **Step 2:** Run: `bun --cwd apps/web test src/app/dashboard/orders/__tests__/ship-gating.test.ts` — Expected: FAIL (bypass ainda existe; forceShip não existe).

- [ ] **Step 3: Zod (`orders/schema.ts`).** Em `updateOrderStatusSchema`, adicionar campos e refine:

```ts
		forceShip: z.boolean().optional(),
		forceReason: z.string().trim().min(10, "Motivo do envio forçado precisa de ao menos 10 caracteres").max(500).optional(),
```

e no `superRefine` existente:

```ts
		if (data.forceShip && !data.forceReason) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Motivo obrigatório ao forçar envio sem separação",
				path: ["forceReason"],
			});
		}
```

- [ ] **Step 4: Gate em `orders/actions.ts`.** Substituir o bloco `:210-216` por:

```ts
			if (toStatus === "shipped") {
				const latest = await getLatestPicking(orderId);
				const state = deriveFulfillmentState(latest?.status ?? null);
				if (parsed.data.forceShip) {
					if (session.user.role !== "super_admin") {
						throw new Error("Apenas super admin pode forçar envio sem separação");
					}
					if (state === "picking_in_progress") {
						throw new Error(
							`Separação em andamento por ${latest?.pickerName ?? "outro usuário"} — cancele ou assuma antes de forçar o envio`
						);
					}
					await insertOrderEvent(tx, {
						orderId,
						eventType: "ship_forced",
						metadata: { reason: parsed.data.forceReason },
						actorUserId: session.user.id,
					});
				} else if (state !== "picked") {
					throw new Error(SHIP_GATE_ERRORS[state]);
				}
			}
```

Constante módulo-level (fora da action; arquivo é `"use server"`, então **não exportar**):

```ts
const SHIP_GATE_ERRORS: Record<
	"awaiting_picking" | "picking_in_progress" | "picking_exception",
	string
> = {
	awaiting_picking: "Conclua a separação antes de despachar o pedido",
	picking_in_progress: "Separação em andamento — conclua antes de despachar",
	picking_exception: "Separação com exceção — resolva antes de despachar",
};
```

Imports: `getLatestPicking` de `../separacao/data` (**remover** o import de `isPickingCompleteForShip`, que fica sem uso neste arquivo após esta troca; o helper permanece exportado em `data.ts`); `deriveFulfillmentState` de `../separacao/_lib/picking-logic`. Ampliar o union de `insertOrderEvent` (`:134`) para `"tracking_set" | "branch_assigned" | "shipping_reviewed" | "ship_forced"`. Quando `forceShip` e `reason` vazio, gravar `orderStatusHistory.reason = forceReason` (trocar `reason: reason ?? null` por `reason: reason ?? parsed.data.forceReason ?? null`).

- [ ] **Step 5:** Run testes — Expected: PASS (8/8). `bun check-types` PASS.

- [ ] **Step 6:** `bun run build` (arquivo `"use server"` mudou) — Expected: build OK.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/orders/schema.ts apps/web/src/app/dashboard/orders/actions.ts apps/web/src/app/dashboard/orders/__tests__/ship-gating.test.ts
git commit -m "feat: gate de envio universal com forceShip auditado"
```

---

### Task 5: Guards de sessão — ownership, status e cancelamento auditado (TDD)

**Files:**
- Modify: `apps/web/src/app/dashboard/separacao/actions.ts` (`scanItem`, `reportMissing`, `completePicking`, `cancelPicking`)
- Test: `apps/web/src/app/dashboard/separacao/__tests__/picking-guards.test.ts`

**Interfaces:**
- Consumes: colunas de auditoria (Task 1).
- Produces: `cancelPicking(pickingId: string, reason?: string)`; `completePicking` retorna `ActionResult<{ finalStatus: "completed" | "exception" }>` (Task 9 consome). Regra: `scanItem`/`reportMissing`/`completePicking` exigem sessão `in_progress` + ator = `pickerUserId`; `cancelPicking` exige `in_progress` + (dono OU role admin/super_admin).

- [ ] **Step 1: Teste que falha** — `__tests__/picking-guards.test.ts`. Mockar `../../orders/actions` (evita reproduzir o lock):

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockTransaction, mockLockOrderAndAuthorize } = vi.hoisted(() => ({
	mockTransaction: vi.fn(),
	mockLockOrderAndAuthorize: vi.fn(),
}));

vi.mock("@emach/db", () => ({
	db: { transaction: mockTransaction },
	createDb: vi.fn(() => ({})),
}));
vi.mock("../../orders/actions", () => ({
	lockOrderAndAuthorize: mockLockOrderAndAuthorize,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/permissions", () => ({
	requireCapability: vi.fn().mockResolvedValue({ user: { id: "usr_1", role: "user" } }),
}));
vi.mock("@/lib/branch-scope", () => ({
	getUserBranchScope: vi.fn().mockResolvedValue({ kind: "all" }),
	orderInScope: vi.fn().mockReturnValue(true),
	isBlindScope: vi.fn().mockReturnValue(false),
}));
vi.mock("../data", () => ({
	fetchPickingQueuePage: vi.fn(),
	getActivePickingForUser: vi.fn(),
	getPickingForOrder: vi.fn(),
	getOrderBranchId: vi.fn(),
	getLatestPicking: vi.fn(),
	isPickingCompleteForShip: vi.fn(),
}));

import { cancelPicking, completePicking, reportMissing } from "../actions";

const PICKING_ID = "3f2b7c1a-9d4e-4f6a-8b2c-1a2b3c4d5e6f";
const OWNER = "usr_owner";

function makeTx(selectResults: unknown[][]) {
	let i = 0;
	const chain = (result: unknown[]) => {
		const c: Record<string, unknown> = {};
		c.from = vi.fn(() => c);
		c.where = vi.fn(() => c);
		c.for = vi.fn(() => c);
		c.limit = vi.fn(() => Promise.resolve(result));
		c.orderBy = vi.fn(() => c);
		return c;
	};
	const update = () => {
		const c: Record<string, unknown> = {};
		c.set = vi.fn(() => c);
		c.where = vi.fn(() => Promise.resolve({ rowCount: 1 }));
		return c;
	};
	return {
		select: vi.fn(() => chain(selectResults[i++] ?? [])),
		update: vi.fn(update),
		insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
	};
}

function sessionAs(id: string, role: "user" | "admin" | "super_admin") {
	return { status: "preparing", branchId: "br_1", session: { user: { id, role, name: "Ana" } } };
}

const PICKING_IN_PROGRESS = {
	id: PICKING_ID,
	orderId: "ord_1",
	status: "in_progress",
	pickerUserId: OWNER,
	pickerName: "João",
};

describe("guards de sessão de separação", () => {
	beforeEach(() => vi.clearAllMocks());

	it("completePicking por não-dono → erro de ownership", async () => {
		mockLockOrderAndAuthorize.mockResolvedValue(sessionAs("usr_other", "user"));
		mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
			cb(makeTx([[PICKING_IN_PROGRESS]]))
		);
		const result = await completePicking(PICKING_ID);
		expect(result.ok).toBe(false);
		expect((result as { ok: false; error: string }).error).toMatch(/iniciou/i);
	});

	it("reportMissing com sessão completed → erro de status", async () => {
		mockLockOrderAndAuthorize.mockResolvedValue(sessionAs(OWNER, "user"));
		mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
			cb(
				makeTx([
					[{ id: "pi_1", pickingId: PICKING_ID }],
					[{ ...PICKING_IN_PROGRESS, status: "completed" }],
				])
			)
		);
		const result = await reportMissing("pi_1", "faltou na prateleira");
		expect(result.ok).toBe(false);
		expect((result as { ok: false; error: string }).error).toMatch(/andamento/i);
	});

	it("cancelPicking de sessão já completed → erro de status", async () => {
		mockLockOrderAndAuthorize.mockResolvedValue(sessionAs(OWNER, "user"));
		mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
			cb(makeTx([[{ ...PICKING_IN_PROGRESS, status: "completed" }]]))
		);
		const result = await cancelPicking(PICKING_ID);
		expect(result.ok).toBe(false);
	});

	it("cancelPicking por não-dono role user → recusado; por admin → aceito", async () => {
		mockLockOrderAndAuthorize.mockResolvedValue(sessionAs("usr_other", "user"));
		mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
			cb(makeTx([[PICKING_IN_PROGRESS]]))
		);
		const denied = await cancelPicking(PICKING_ID);
		expect(denied.ok).toBe(false);

		mockLockOrderAndAuthorize.mockResolvedValue(sessionAs("usr_adm", "admin"));
		mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
			cb(makeTx([[PICKING_IN_PROGRESS]]))
		);
		const allowed = await cancelPicking(PICKING_ID, "picker ausente");
		expect(allowed.ok).toBe(true);
	});
});
```

- [ ] **Step 2:** Run — Expected: FAIL (guards não existem).

- [ ] **Step 3: Implementar.** Helper módulo-level em `separacao/actions.ts` (não exportar — arquivo `"use server"`):

```ts
type PickingRow = typeof orderPicking.$inferSelect;
type SessionUser = { id: string; name?: string | null; role: string };

function assertInProgress(picking: PickingRow): void {
	if (picking.status !== "in_progress") {
		throw new Error("Sessão de separação não está em andamento");
	}
}

function assertOwner(picking: PickingRow, user: SessionUser): void {
	if (picking.pickerUserId !== user.id) {
		throw new Error(
			`Apenas quem iniciou a separação (${picking.pickerName}) pode operá-la`
		);
	}
}

function canManageOthersSession(user: SessionUser): boolean {
	return user.role === "admin" || user.role === "super_admin";
}
```

Aplicar:
- `scanItem` (após o check `picking.status !== "in_progress"` existente em `:193`): `assertOwner(picking, locked.session.user);`
- `reportMissing` (após `lockOrderAndAuthorize`): `assertInProgress(picking); assertOwner(picking, locked.session.user);`
- `completePicking` (o check de status já existe em `:414`): adicionar `assertOwner(picking, locked.session.user);` e retornar o status final — assinatura `Promise<ActionResult<{ finalStatus: "completed" | "exception" }>>`, com `return { ok: true, data: { finalStatus } };` (mover `finalStatus` pra fora da transaction via variável, como `orderId`).
- `cancelPicking(pickingId: string, reason?: string)`:

```ts
			assertInProgress(picking);
			const { session } = locked;
			if (
				picking.pickerUserId !== session.user.id &&
				!canManageOthersSession(session.user)
			) {
				throw new Error(
					"Apenas quem iniciou a separação ou um admin pode cancelá-la"
				);
			}
			await tx
				.update(orderPicking)
				.set({
					status: "canceled",
					canceledByUserId: session.user.id,
					canceledByName: session.user.name ?? session.user.id,
					canceledAt: new Date(),
					cancelReason: reason ?? null,
				})
				.where(eq(orderPicking.id, pickingId));
```

- [ ] **Step 4:** Run testes (guards + fulfillment + ship-gating) — Expected: PASS. `bun check-types` PASS (o call-site de `completePicking` em `picking-execution.tsx` segue válido — `result.ok` continua existindo).

- [ ] **Step 5:** `bun run build` — Expected: OK.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/separacao/actions.ts apps/web/src/app/dashboard/separacao/__tests__/picking-guards.test.ts
git commit -m "feat: ownership e guards de sessão de separação"
```

---

### Task 6: takeoverPicking (TDD)

**Files:**
- Modify: `apps/web/src/app/dashboard/separacao/actions.ts` (extrair helper de scaffolding + nova action)
- Test: append em `separacao/__tests__/picking-guards.test.ts`

**Interfaces:**
- Consumes: guards (Task 5), colunas de auditoria (Task 1).
- Produces: `takeoverPicking(pickingId: string): Promise<ActionResult<{ pickingId: string }>>` — cancela a sessão ativa de outro user (auditado) e cria nova sessão do zero para o ator. Task 7/8 chamam.

- [ ] **Step 1: Testes** (append no describe):

```ts
	it("takeoverPicking por role user → recusado", async () => {
		mockLockOrderAndAuthorize.mockResolvedValue(sessionAs("usr_other", "user"));
		mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
			cb(makeTx([[PICKING_IN_PROGRESS]]))
		);
		const result = await takeoverPicking(PICKING_ID);
		expect(result.ok).toBe(false);
	});

	it("takeoverPicking da própria sessão → recusado (é só continuar)", async () => {
		mockLockOrderAndAuthorize.mockResolvedValue(sessionAs(OWNER, "admin"));
		mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
			cb(makeTx([[PICKING_IN_PROGRESS]]))
		);
		const result = await takeoverPicking(PICKING_ID);
		expect(result.ok).toBe(false);
	});

	it("takeoverPicking por admin em sessão alheia in_progress → ok", async () => {
		mockLockOrderAndAuthorize.mockResolvedValue(sessionAs("usr_adm", "admin"));
		mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
			cb(makeTx([[PICKING_IN_PROGRESS], []]))
		);
		const result = await takeoverPicking(PICKING_ID);
		expect(result.ok).toBe(true);
	});
```

(No 3º caso o segundo `select` é a carga de `orderItem` do scaffolding — array vazio é suficiente pro teste passar sem itens.)

- [ ] **Step 2:** Run — FAIL (`takeoverPicking` não existe).

- [ ] **Step 3: Extrair scaffolding de `startPicking`.** Mover o bloco de load de `orderItem` + inserts de `orderPickingItem` (`actions.ts:79-112`) para helper interno reutilizado pelas duas actions:

```ts
async function createPickingItems(
	tx: Tx,
	pickingId: string,
	orderId: string
): Promise<void> {
	const items = await tx
		.select({
			id: orderItem.id,
			variantId: orderItem.variantId,
			sku: orderItem.sku,
			name: orderItem.name,
			barcode: orderItem.barcode,
			voltage: orderItem.voltage,
			quantity: orderItem.quantity,
			variantBarcode: toolVariant.barcode,
		})
		.from(orderItem)
		.leftJoin(toolVariant, eq(orderItem.variantId, toolVariant.id))
		.where(eq(orderItem.orderId, orderId));

	for (const item of items) {
		await tx.insert(orderPickingItem).values({
			id: crypto.randomUUID(),
			pickingId,
			orderItemId: item.id,
			variantId: item.variantId,
			variantSnapshot: {
				sku: item.sku ?? null,
				name: item.name,
				barcode: item.barcode ?? item.variantBarcode ?? null,
				voltage: item.voltage ?? null,
			},
			qtyExpected: item.quantity,
			qtyPicked: 0,
			notFound: false,
		});
	}
}
```

- [ ] **Step 4: Implementar `takeoverPicking`:**

```ts
export async function takeoverPicking(
	pickingId: string
): Promise<ActionResult<{ pickingId: string }>> {
	try {
		let orderId: string | undefined;
		const newPickingId = await db.transaction(async (tx: Tx) => {
			const [picking] = await tx
				.select()
				.from(orderPicking)
				.where(eq(orderPicking.id, pickingId))
				.limit(1);
			if (!picking) {
				throw new Error("Sessão de separação não encontrada");
			}
			const locked = await lockOrderAndAuthorize(tx, "orders.pick", picking.orderId);
			if (!locked) {
				throw new Error("Pedido não encontrado");
			}
			const { session } = locked;
			assertInProgress(picking);
			if (!canManageOthersSession(session.user)) {
				throw new Error("Apenas admin ou super admin pode assumir uma separação");
			}
			if (picking.pickerUserId === session.user.id) {
				throw new Error("A sessão já é sua — continue a separação");
			}
			orderId = picking.orderId;
			const actorName = session.user.name ?? session.user.id;

			// Cancela a sessão do outro (auditado) e abre uma nova do zero — quem
			// assume re-confere fisicamente, então não herda qtyPicked.
			await tx
				.update(orderPicking)
				.set({
					status: "canceled",
					canceledByUserId: session.user.id,
					canceledByName: actorName,
					canceledAt: new Date(),
					cancelReason: `Assumida por ${actorName}`,
				})
				.where(eq(orderPicking.id, pickingId));

			const createdId = crypto.randomUUID();
			await tx.insert(orderPicking).values({
				id: createdId,
				orderId: picking.orderId,
				branchId: picking.branchId,
				status: "in_progress",
				pickerUserId: session.user.id,
				pickerName: actorName,
			});
			await createPickingItems(tx, createdId, picking.orderId);
			return createdId;
		});

		if (orderId) {
			revalidatePickingPaths(orderId);
		}
		return { ok: true, data: { pickingId: newPickingId } };
	} catch (error) {
		logger.error("takeoverPicking", error);
		if (isCapabilityError(error)) {
			return { ok: false, error: "Sem permissão para assumir separação." };
		}
		return {
			ok: false,
			error: error instanceof Error ? error.message : "Erro ao assumir separação",
		};
	}
}
```

- [ ] **Step 5:** Run testes — PASS. `bun check-types` + `bun run build` — PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/separacao/actions.ts apps/web/src/app/dashboard/separacao/__tests__/picking-guards.test.ts
git commit -m "feat: takeover auditado de sessão de separação"
```

---

### Task 7: Detalhe do pedido — card Separação + envio travado + forçar envio

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/data.ts` (OrderDetail + fulfillment)
- Create: `apps/web/src/app/dashboard/orders/[id]/_components/picking-status-card.tsx`
- Create: `apps/web/src/app/dashboard/orders/[id]/_components/force-ship-dialog.tsx`
- Modify: `apps/web/src/app/dashboard/orders/[id]/_components/order-action-column.tsx`, `order-progress.tsx`, `apps/web/src/app/dashboard/orders/[id]/page.tsx`

**Interfaces:**
- Consumes: `getLatestPicking`, `LatestPickingInfo` (Task 3), `deriveFulfillmentState`/`isPickingStale` (Task 2), `FULFILLMENT_STATE_META`, `cancelPicking`/`takeoverPicking` (Tasks 5/6), `updateOrderStatus` com `forceShip` (Task 4).
- Produces: `OrderDetail.fulfillment: OrderFulfillment | null` onde

```ts
export interface OrderFulfillment {
	exceptionReason: string | null;
	lastScannedAt: Date | null;
	pickedUnits: number;
	pickerName: string;
	pickerUserId: string | null;
	pickingId: string;
	startedAt: Date;
	completedAt: Date | null;
	state: FulfillmentState;
	totalUnits: number;
}
```

- [ ] **Step 1: `orders/data.ts`** — no `getOrderDetail`, após montar o detail, buscar `const latest = await getLatestPicking(orderId);` (import de `../separacao/data`) e mapear:

```ts
	const fulfillment: OrderFulfillment | null = latest
		? {
				pickingId: latest.pickingId,
				state: deriveFulfillmentState(latest.status),
				pickerUserId: latest.pickerUserId,
				pickerName: latest.pickerName,
				startedAt: latest.startedAt,
				completedAt: latest.completedAt,
				exceptionReason: latest.exceptionReason,
				pickedUnits: latest.pickedUnits,
				totalUnits: latest.totalUnits,
				lastScannedAt: latest.lastScannedAt,
			}
		: null;
```

`fulfillment: null` com `latest == null` representa `awaiting_picking` implícito — o card trata. Exportar `OrderFulfillment` de `data.ts` (server-only; UI importa só `import type`).

- [ ] **Step 2: `picking-status-card.tsx`** (client). Comportamento por estado (spec §7); recebe tudo por props — sem fetch próprio:

```tsx
"use client";

import { Badge } from "@emach/ui/components/badge";
import { Button, buttonVariants } from "@emach/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { ClockIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatRelative, formatTime } from "@/lib/format/datetime";
import { notify } from "@/lib/notify";
import { cancelPicking, takeoverPicking } from "../../../separacao/actions";
import type { FulfillmentState } from "../../../separacao/_lib/picking-logic";
import { isPickingStale } from "../../../separacao/_lib/picking-logic";
import { FULFILLMENT_STATE_META } from "../../../separacao/fulfillment-meta";
import type { OrderFulfillment } from "../../data";

interface PickingStatusCardProps {
	canManageSession: boolean; // admin/super_admin
	canPick: boolean;
	fulfillment: OrderFulfillment | null;
	orderId: string;
	orderStatus: string;
}

export function PickingStatusCard({
	canManageSession,
	canPick,
	fulfillment,
	orderId,
	orderStatus,
}: PickingStatusCardProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [confirmTakeover, setConfirmTakeover] = useState(false);

	// Só aparece no fluxo de fulfillment; pós-envio vira resumo (render abaixo).
	if (!["paid", "preparing", "shipped", "delivered"].includes(orderStatus)) {
		return null;
	}

	const state: FulfillmentState = fulfillment?.state ?? "awaiting_picking";
	const meta = FULFILLMENT_STATE_META[state];
	const isPostShip = orderStatus !== "paid" && orderStatus !== "preparing";
	const stale =
		state === "picking_in_progress" &&
		fulfillment != null &&
		isPickingStale({
			lastScannedAt: fulfillment.lastScannedAt,
			startedAt: fulfillment.startedAt,
		});
	const progressPct =
		fulfillment && fulfillment.totalUnits > 0
			? Math.round((fulfillment.pickedUnits / fulfillment.totalUnits) * 100)
			: 0;

	function handleCancel() {
		if (!fulfillment) {
			return;
		}
		startTransition(async () => {
			const result = await cancelPicking(fulfillment.pickingId, "Cancelada pelo painel do pedido");
			if (result.ok) {
				notify.success("Separação cancelada");
			} else {
				notify.error(result.error);
			}
			router.refresh();
		});
	}

	function handleTakeover() {
		if (!fulfillment) {
			return;
		}
		startTransition(async () => {
			const result = await takeoverPicking(fulfillment.pickingId);
			if (result.ok) {
				notify.success("Separação assumida");
				router.push(`/dashboard/separacao/${orderId}`);
			} else {
				notify.error(result.error);
				router.refresh();
			}
		});
	}

	return (
		<Card>
			<CardHeader className="flex-row items-center justify-between space-y-0">
				<CardTitle>Separação</CardTitle>
				<Badge variant={meta.badgeVariant}>{meta.label}</Badge>
			</CardHeader>
			<CardContent className="space-y-3">
				{isPostShip && fulfillment && (
					<p className="text-muted-foreground text-sm">
						Separado por {fulfillment.pickerName}
						{fulfillment.completedAt && ` · concluído às ${formatTime(fulfillment.completedAt)}`}
					</p>
				)}
				{isPostShip && !fulfillment && (
					<p className="text-muted-foreground text-sm">
						Sem sessão de separação registrada (envio forçado — ver histórico).
					</p>
				)}

				{!isPostShip && state === "awaiting_picking" && (
					<>
						<p className="text-muted-foreground text-sm">
							Nenhuma separação em andamento.
						</p>
						{canPick && orderStatus === "preparing" && (
							<Link
								className={buttonVariants({ size: "sm", variant: "outline" })}
								href={`/dashboard/separacao/${orderId}`}
							>
								Iniciar separação
							</Link>
						)}
						{orderStatus === "paid" && (
							<p className="text-muted-foreground text-xs">
								Atribua a filial responsável para liberar a separação.
							</p>
						)}
					</>
				)}

				{!isPostShip && state === "picking_in_progress" && fulfillment && (
					<>
						<p className="text-sm">
							{fulfillment.pickerName} · desde {formatTime(fulfillment.startedAt)}
						</p>
						<div className="h-2 overflow-hidden rounded-full bg-muted">
							<div className="h-full bg-primary" style={{ width: `${progressPct}%` }} />
						</div>
						<p className="text-muted-foreground text-xs">
							{fulfillment.pickedUnits} de {fulfillment.totalUnits} unidades
						</p>
						{stale && (
							<p className="flex items-center gap-1.5 font-medium text-warning text-xs">
								<ClockIcon aria-hidden className="size-3.5" />
								Parada há {formatRelative(fulfillment.lastScannedAt ?? fulfillment.startedAt)}
							</p>
						)}
						<div className="flex flex-wrap gap-2">
							<Link
								className={buttonVariants({ size: "sm", variant: "outline" })}
								href={`/dashboard/separacao/${orderId}`}
							>
								Abrir separação
							</Link>
							{canManageSession && (
								<>
									<Button disabled={isPending} onClick={() => setConfirmTakeover(true)} size="sm" variant="secondary">
										Assumir
									</Button>
									<Button
										className="text-destructive hover:bg-destructive/10 hover:text-destructive"
										disabled={isPending}
										onClick={handleCancel}
										size="sm"
										variant="ghost"
									>
										Cancelar sessão
									</Button>
								</>
							)}
						</div>
					</>
				)}

				{!isPostShip && state === "picking_exception" && fulfillment && (
					<>
						<p className="flex items-start gap-1.5 text-sm text-warning">
							<TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
							{fulfillment.exceptionReason ?? "Item não encontrado na separação"}
						</p>
						<p className="text-muted-foreground text-xs">
							Reponha o estoque e reabra a separação, ou encaminhe o reembolso
							no painel de exceções abaixo.
						</p>
						{canPick && (
							<Link
								className={buttonVariants({ size: "sm", variant: "outline" })}
								href={`/dashboard/separacao/${orderId}`}
							>
								Reabrir separação
							</Link>
						)}
					</>
				)}

				{!isPostShip && state === "picked" && fulfillment && (
					<p className="text-sm">
						{fulfillment.pickerName} · {formatTime(fulfillment.startedAt)}
						{fulfillment.completedAt && ` – ${formatTime(fulfillment.completedAt)}`} ·{" "}
						{fulfillment.totalUnits} unidades conferidas
					</p>
				)}
			</CardContent>

			{/* Confirmação de takeover (destrutivo p/ a sessão do outro) */}
			{confirmTakeover && (
				<CardContent className="border-border border-t pt-3">
					<p className="mb-2 text-muted-foreground text-xs">
						A sessão de {fulfillment?.pickerName} será cancelada e uma nova
						começa do zero no seu nome. Continuar?
					</p>
					<div className="flex gap-2">
						<Button disabled={isPending} onClick={handleTakeover} size="sm" variant="warning">
							{isPending ? "Assumindo…" : "Confirmar takeover"}
						</Button>
						<Button disabled={isPending} onClick={() => setConfirmTakeover(false)} size="sm" variant="ghost">
							Voltar
						</Button>
					</div>
				</CardContent>
			)}
		</Card>
	);
}
```

⚠️ Import de server action em client component é permitido (`"use server"` module) — `cancelPicking`/`takeoverPicking` vêm de `separacao/actions.ts`. **Não** importar nada de `separacao/data.ts` (server-only) exceto `import type`.

- [ ] **Step 3: `force-ship-dialog.tsx`** (client) — AlertDialog com textarea (padrão `DestructiveActionDialog`, min 10 chars):

```tsx
"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@emach/ui/components/alert-dialog";
import { Button } from "@emach/ui/components/button";
import { Textarea } from "@emach/ui/components/textarea";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { notify } from "@/lib/notify";
import { updateOrderStatus } from "../../actions";

interface ForceShipDialogProps {
	orderId: string;
	trackingCode: string;
}

export function ForceShipDialog({ orderId, trackingCode }: ForceShipDialogProps) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [reason, setReason] = useState("");
	const [isPending, startTransition] = useTransition();

	function handleConfirm(event: React.MouseEvent) {
		event.preventDefault();
		startTransition(async () => {
			const result = await updateOrderStatus({
				orderId,
				toStatus: "shipped",
				trackingCode: trackingCode || undefined,
				forceShip: true,
				forceReason: reason.trim(),
			});
			if (result.ok) {
				notify.success("Envio forçado registrado");
				setOpen(false);
				router.refresh();
			} else {
				notify.error(result.error);
			}
		});
	}

	return (
		<AlertDialog onOpenChange={setOpen} open={open}>
			<AlertDialogTrigger
				className="text-destructive text-xs underline-offset-4 hover:underline"
			>
				Forçar envio sem separação…
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Forçar envio sem separação</AlertDialogTitle>
					<AlertDialogDescription>
						O pedido será marcado como Enviado sem separação concluída. O motivo
						fica registrado no histórico do pedido. Requer código de rastreio
						preenchido acima.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<Textarea
					onChange={(e) => setReason(e.target.value)}
					placeholder="Motivo operacional (mín. 10 caracteres)"
					rows={3}
					value={reason}
				/>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={isPending}>Voltar</AlertDialogCancel>
					<AlertDialogAction
						className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						disabled={reason.trim().length < 10 || isPending}
						onClick={handleConfirm}
					>
						{isPending ? "Enviando…" : "Forçar envio"}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
```

- [ ] **Step 4: Integrar em `order-action-column.tsx`:**
  1. Props novas: `canManageSession: boolean; canPick: boolean; fulfillment: OrderFulfillment | null; isSuperAdmin: boolean;` (import type de `../../data`).
  2. Renderizar `<PickingStatusCard canManageSession={canManageSession} canPick={canPick} fulfillment={fulfillment} orderId={order.id} orderStatus={order.status} />` logo após `<OrderProgress …/>` (linha 429).
  3. Travar o envio: no cálculo `canDoPrimaryTransition` (linha 326), acrescentar o espelho do gate:

```ts
	const pickedForShip = fulfillment?.state === "picked";
	const shipBlocked = nextStatus === "shipped" && !pickedForShip;
	const canDoPrimaryTransition =
		(nextStatus === "canceled" ? canCancel : canUpdateStatus) && !shipBlocked;
```

  4. Abaixo do botão primário (dentro de `PrimaryActionContent` ou logo após, no bloco `order.status === "preparing"`), quando `shipBlocked`, exibir a razão + o override:

```tsx
	{order.status === "preparing" && shipBlocked && (
		<p className="text-muted-foreground text-xs">
			{FULFILLMENT_STATE_META[fulfillment?.state ?? "awaiting_picking"].label} —
			o envio libera quando a separação estiver concluída.
		</p>
	)}
	{order.status === "preparing" && shipBlocked && isSuperAdmin && (
		<ForceShipDialog orderId={order.id} trackingCode={trackingCode.trim()} />
	)}
```

  Ponto de render exato: adicionar duas props ao `PrimaryActionContent` — `shipBlockedLabel: string | null` (a frase acima, ou `null` quando não bloqueado) e `forceShipSlot: React.ReactNode` (o `<ForceShipDialog>` quando super_admin + bloqueado, senão `null`) — e renderizá-las imediatamente **após** o `<Button>` primário (linha 281). `FULFILLMENT_STATE_META` import de `../../../separacao/fulfillment-meta`.

- [ ] **Step 5: `orders/[id]/page.tsx`** — computar e passar as props novas ao `OrderActionColumn`:

```ts
	const [canPick, canManage] = await Promise.all([
		can(session, "orders.pick"),
		Promise.resolve(session.user.role === "admin" || session.user.role === "super_admin"),
	]);
```

(seguir o padrão que a page já usa pra `canCancel`/`canRefund` etc. — `can` de `@/lib/permissions`; `fulfillment={detail.fulfillment}`, `isSuperAdmin={session.user.role === "super_admin"}`.)

- [ ] **Step 6: `order-progress.tsx`** — sub-label no nó "Em preparação": adicionar prop opcional `fulfillmentLabel?: string | null` e renderizá-la em `text-[11px] text-muted-foreground` sob o label do step `preparing` quando `order.status === "preparing"`. Call-site: `<OrderProgress fulfillmentLabel={order.status === "preparing" && fulfillment ? FULFILLMENT_STATE_META[fulfillment.state].label : null} order={order} />`.

- [ ] **Step 7: Verificar.** `bun check-types` PASS; smoke no browser (porta 3006): pedido `preparing` sem sessão → card "Aguardando separação", botão Enviado desabilitado com explicação; super_admin vê "Forçar envio sem separação…"; forçar com motivo <10 chars bloqueia no dialog.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/dashboard/orders
git commit -m "feat: card de separação e envio travado no detalhe"
```

---

### Task 8: Página de separação — read-only p/ não-dono + reabrir com contexto

**Files:**
- Modify: `apps/web/src/app/dashboard/separacao/[orderId]/page.tsx`
- Create: `apps/web/src/app/dashboard/separacao/_components/picking-readonly.tsx`
- Modify: `apps/web/src/app/dashboard/separacao/_components/start-picking.tsx`

**Interfaces:**
- Consumes: `getPickingForOrder` (existente), `takeoverPicking`/`cancelPicking` (Tasks 5/6), `summarizePicking` (existente em `_lib/picking-logic.ts`).
- Produces: rota `separacao/[orderId]` com 3 modos: execução (dono), read-only (não-dono), start (sem sessão ativa — com contexto de exceção quando a última foi exception).

- [ ] **Step 1: `page.tsx`** — decidir o modo comparando dono:

```tsx
	const result = await getPickingForOrder(orderId);

	if (result?.picking.status === "in_progress") {
		const isOwner = result.picking.pickerUserId === session.user.id;
		if (isOwner) {
			return <PickingExecution items={result.items} picking={result.picking} />;
		}
		const canManage =
			session.user.role === "admin" || session.user.role === "super_admin";
		return (
			<PickingReadonly
				canManage={canManage}
				items={result.items}
				picking={result.picking}
			/>
		);
	}

	const exceptionContext =
		result?.picking.status === "exception"
			? { reason: result.picking.exceptionReason, pickerName: result.picking.pickerName }
			: null;
	return <StartPicking exceptionContext={exceptionContext} orderId={orderId} />;
```

(`session` já existe na page via `requireCapabilityOrRedirect`.)

- [ ] **Step 2: `picking-readonly.tsx`** (client):

```tsx
"use client";

import type { OrderPicking, OrderPickingItem } from "@emach/db/schema/orders";
import { Button, buttonVariants } from "@emach/ui/components/button";
import { ArrowLeftIcon, ClockIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatRelative, formatTime } from "@/lib/format/datetime";
import { notify } from "@/lib/notify";
import { isPickingStale, summarizePicking } from "../_lib/picking-logic";
import { cancelPicking, takeoverPicking } from "../actions";

interface PickingReadonlyProps {
	canManage: boolean;
	items: OrderPickingItem[];
	picking: OrderPicking;
}

export function PickingReadonly({ canManage, items, picking }: PickingReadonlyProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [confirming, setConfirming] = useState<"cancel" | "takeover" | null>(null);

	const summary = summarizePicking(
		items.map((it) => ({
			id: it.id,
			variantId: it.variantId,
			barcode: null,
			qtyExpected: it.qtyExpected,
			qtyPicked: it.qtyPicked,
			notFound: it.notFound,
		}))
	);
	const lastScan = items.reduce<Date | null>(
		(max, it) =>
			it.lastScannedAt && (!max || it.lastScannedAt > max) ? it.lastScannedAt : max,
		null
	);
	const stale = isPickingStale({ lastScannedAt: lastScan, startedAt: picking.startedAt });
	const pct = summary.totalUnits > 0 ? Math.round((summary.pickedUnits / summary.totalUnits) * 100) : 0;

	function run(action: "cancel" | "takeover") {
		startTransition(async () => {
			const result =
				action === "cancel"
					? await cancelPicking(picking.id, "Cancelada por admin (sessão parada)")
					: await takeoverPicking(picking.id);
			if (result.ok) {
				notify.success(action === "cancel" ? "Separação cancelada" : "Separação assumida");
				router.refresh();
			} else {
				notify.error(result.error);
				setConfirming(null);
			}
		});
	}

	return (
		<div className="rounded-xl border border-border bg-card p-5">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h1 className="font-medium font-serif text-2xl uppercase tracking-[0.015em]">
						Separação em andamento
					</h1>
					<p className="mt-1 text-[13px] text-muted-foreground">
						{picking.pickerName} está separando este pedido · desde{" "}
						{formatTime(picking.startedAt)}
					</p>
				</div>
				<Link
					className={buttonVariants({ size: "sm", variant: "outline" })}
					href="/dashboard/separacao"
				>
					<ArrowLeftIcon aria-hidden className="size-4" />
					Voltar à fila
				</Link>
			</div>

			<div className="mt-4 flex items-center gap-3">
				<div className="h-2.5 flex-1 overflow-hidden rounded-full bg-input">
					<div className="h-full bg-primary" style={{ width: `${pct}%` }} />
				</div>
				<span className="shrink-0 text-[13px] tabular-nums">
					{summary.pickedUnits} / {summary.totalUnits} un
				</span>
			</div>

			{stale && (
				<p className="mt-3 flex items-center gap-1.5 font-medium text-[13px] text-warning">
					<ClockIcon aria-hidden className="size-4" />
					Sem bipagem há {formatRelative(lastScan ?? picking.startedAt)}
				</p>
			)}

			{canManage && (
				<div className="mt-4 flex flex-wrap items-center gap-2 border-border border-t pt-4">
					{confirming === null && (
						<>
							<Button disabled={isPending} onClick={() => setConfirming("takeover")} size="sm" variant="secondary">
								Assumir separação
							</Button>
							<Button
								className="text-destructive hover:bg-destructive/10 hover:text-destructive"
								disabled={isPending}
								onClick={() => setConfirming("cancel")}
								size="sm"
								variant="ghost"
							>
								Cancelar sessão
							</Button>
						</>
					)}
					{confirming !== null && (
						<>
							<p className="w-full text-muted-foreground text-xs">
								{confirming === "takeover"
									? `A sessão de ${picking.pickerName} será cancelada e uma nova começa do zero no seu nome.`
									: `A sessão de ${picking.pickerName} será cancelada e o pedido volta à fila.`}
							</p>
							<Button disabled={isPending} onClick={() => run(confirming)} size="sm" variant="warning">
								{isPending ? "Aplicando…" : "Confirmar"}
							</Button>
							<Button disabled={isPending} onClick={() => setConfirming(null)} size="sm" variant="ghost">
								Voltar
							</Button>
						</>
					)}
				</div>
			)}
		</div>
	);
}
```

- [ ] **Step 3: `start-picking.tsx`** — prop nova `exceptionContext?: { pickerName: string; reason: string | null } | null`. Quando presente, renderizar acima do botão:

```tsx
	{exceptionContext && (
		<div className="rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm">
			<p className="font-medium text-warning">Separação anterior terminou com exceção</p>
			<p className="mt-1 text-muted-foreground">
				{exceptionContext.reason ?? "Item não encontrado"} — por {exceptionContext.pickerName}.
				Reabrir cria uma nova sessão do zero; para reembolsar, use o detalhe do pedido.
			</p>
		</div>
	)}
```

e o label do botão vira `exceptionContext ? "Reabrir separação" : "Iniciar separação"`.

- [ ] **Step 4:** `bun check-types` PASS. Smoke: com 2 users (ou trocando `pickerUserId` no banco), abrir sessão alheia → read-only com Assumir/Cancelar.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/separacao
git commit -m "feat: visão read-only e reabertura com contexto"
```

---

### Task 9: Pós-conclusão — painel "Despachar agora"

**Files:**
- Create: `apps/web/src/app/dashboard/separacao/_components/picking-complete-panel.tsx`
- Modify: `apps/web/src/app/dashboard/separacao/_components/picking-execution.tsx` (`handleComplete:379-388` + render)
- Modify: `apps/web/src/app/dashboard/separacao/[orderId]/page.tsx` (passar `canShip`)

**Interfaces:**
- Consumes: `completePicking` retornando `{ finalStatus }` (Task 5), `updateOrderStatus` (Task 4).
- Produces: fluxo — concluir sem pendência → painel de despacho na própria tela; concluir com exceção → redirect pra fila (comportamento atual).

- [ ] **Step 1: `picking-complete-panel.tsx`** (client):

```tsx
"use client";

import { Button, buttonVariants } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { CheckIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { notify } from "@/lib/notify";
import { updateOrderStatus } from "../../orders/actions";

interface PickingCompletePanelProps {
	canShip: boolean;
	orderId: string;
	pickedUnits: number;
	totalUnits: number;
}

export function PickingCompletePanel({
	canShip,
	orderId,
	pickedUnits,
	totalUnits,
}: PickingCompletePanelProps) {
	const router = useRouter();
	const [trackingCode, setTrackingCode] = useState("");
	const [isPending, startTransition] = useTransition();

	function handleShip() {
		startTransition(async () => {
			const result = await updateOrderStatus({
				orderId,
				toStatus: "shipped",
				trackingCode: trackingCode.trim(),
			});
			if (result.ok) {
				notify.success("Pedido despachado");
				router.push("/dashboard/separacao");
			} else {
				notify.error(result.error);
			}
		});
	}

	return (
		<div className="rounded-xl border border-success/40 bg-card p-6">
			<p className="flex items-center gap-2 font-medium text-lg text-success">
				<CheckIcon aria-hidden className="size-5" strokeWidth={2.6} />
				Separação concluída
			</p>
			<p className="mt-1 text-[13px] text-muted-foreground">
				{pickedUnits} de {totalUnits} unidades conferidas. O pedido está
				"Separado — pronto pra envio".
			</p>

			{canShip && (
				<div className="mt-4 rounded-lg border border-border bg-muted/40 p-4">
					<p className="font-medium text-sm">Despachar agora (opcional)</p>
					<div className="mt-2 flex gap-2">
						<Input
							onChange={(e) => setTrackingCode(e.target.value)}
							placeholder="Código de rastreio — ex: BR123456789"
							value={trackingCode}
						/>
						<Button disabled={isPending || !trackingCode.trim()} onClick={handleShip}>
							{isPending ? "Enviando…" : "Marcar como Enviado"}
						</Button>
					</div>
				</div>
			)}

			<div className="mt-4 flex items-center gap-3">
				<Link
					className={buttonVariants({ size: "sm", variant: "outline" })}
					href="/dashboard/separacao"
				>
					Voltar à fila
				</Link>
				<span className="text-muted-foreground text-xs">
					dá pra despachar depois pelo detalhe do pedido
				</span>
			</div>
		</div>
	);
}
```

- [ ] **Step 2: `picking-execution.tsx`.** Prop nova `canShip: boolean` no `PickingExecutionProps` (repassada ao hook não — só ao render). No hook `usePickingState`, adicionar `const [completedOk, setCompletedOk] = useState(false);` e trocar `handleComplete`:

```ts
	function handleComplete() {
		startCompleting(async () => {
			const result = await completePicking(picking.id);
			if (!result.ok) {
				notify.error(result.error);
				return;
			}
			if (result.data.finalStatus === "exception") {
				// Exceção: volta à fila (tab exceções mostra o pedido)
				router.push("/dashboard/separacao?tab=excecoes");
				return;
			}
			setCompletedOk(true);
		});
	}
```

Expor `completedOk` no return do hook. No componente, antes do render normal:

```tsx
	if (completedOk) {
		return (
			<PickingCompletePanel
				canShip={canShip}
				orderId={picking.orderId}
				pickedUnits={summary.pickedUnits}
				totalUnits={summary.totalUnits}
			/>
		);
	}
```

- [ ] **Step 3: `[orderId]/page.tsx`** — computar `const canShip = await can(session, "orders.update_status");` (import `can` de `@/lib/permissions`) e passar `canShip={canShip}` ao `<PickingExecution>`.

- [ ] **Step 4:** `bun check-types` + `bun run build` PASS. Smoke (3006): concluir uma separação → painel aparece; despachar com rastreio → pedido vira Enviado; concluir com item ausente → cai na tab exceções.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/separacao
git commit -m "feat: despacho opcional ao concluir separação"
```

---

### Task 10: Fila, lista e auto-refresh

**Files:**
- Create: `apps/web/src/components/auto-refresh.tsx`
- Modify: `apps/web/src/app/dashboard/separacao/_components/picking-order-card.tsx` (stale badge), `apps/web/src/app/dashboard/separacao/page.tsx` (+AutoRefresh), `apps/web/src/app/dashboard/orders/[id]/page.tsx` (+AutoRefresh)
- Modify: `apps/web/src/app/dashboard/orders/data.ts` (list: `fulfillmentState`), `apps/web/src/app/dashboard/orders/_components/order-card.tsx` (badge)

**Interfaces:**
- Consumes: `PickingQueueRow.lastScannedAt/pickingStartedAt/exceptionReason` (Task 3), `isPickingStale`/`FULFILLMENT_STATE_META` (Task 2).
- Produces: `OrderListItem.fulfillmentState?: FulfillmentState | null` (só preenchido quando `status === "preparing"`).

- [ ] **Step 1: `auto-refresh.tsx`:**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Polling leve: router.refresh() em intervalo, só com a aba visível.
 * Usado na fila de separação e no detalhe do pedido (spec 2026-07-06).
 * NÃO usar na execução de picking (o scan já revalida).
 */
export function AutoRefresh({ intervalMs = 45_000 }: { intervalMs?: number }) {
	const router = useRouter();

	useEffect(() => {
		const id = setInterval(() => {
			if (document.visibilityState === "visible") {
				router.refresh();
			}
		}, intervalMs);
		return () => clearInterval(id);
	}, [intervalMs, router]);

	return null;
}
```

Montar `<AutoRefresh />` no JSX de `separacao/page.tsx` e de `orders/[id]/page.tsx` (Server Components podem renderizar client components — sem prop de servidor).

- [ ] **Step 2: Stale badge no card da fila.** Em `picking-order-card.tsx`, tab `em_separacao`: junto do "por {pickerName}" (linha 108-113), quando parado:

```tsx
	{tab === "em_separacao" &&
		row.pickingStartedAt &&
		isPickingStale({
			lastScannedAt: row.lastScannedAt ?? null,
			startedAt: row.pickingStartedAt,
		}) && (
			<span className="inline-flex items-center rounded-md bg-warning/15 px-2 py-0.5 font-semibold text-[10px] text-warning">
				Parada há {formatRelative(row.lastScannedAt ?? row.pickingStartedAt)}
			</span>
		)}
```

(import `isPickingStale` de `../_lib/picking-logic`). Na tab `excecoes`, mostrar `row.exceptionReason` truncado (`max-w-full truncate text-[11px] text-warning`) quando presente, e o CTA vira "Resolver".

- [ ] **Step 3: Badge de sub-estado na lista de pedidos.** Em `orders/data.ts`, na query da lista (`fetchOrdersPage`), adicionar LATERAL de última sessão **apenas** informacional:

```sql
LEFT JOIN LATERAL (
	SELECT op.status FROM order_picking op
	WHERE op.order_id = o.id
	ORDER BY op.started_at DESC LIMIT 1
) lp ON o.status = 'preparing'
```

com `lp.status AS latest_picking_status` no SELECT; no mapper, `fulfillmentState: row.status === "preparing" ? deriveFulfillmentState(row.latest_picking_status ?? null) : null`. Adicionar o campo em `OrderListItem`. Em `order-card.tsx`, ao lado do `<OrderStatusBadge>` (linha ~39):

```tsx
	{item.fulfillmentState && item.fulfillmentState !== "awaiting_picking" && (
		<Badge variant={FULFILLMENT_STATE_META[item.fulfillmentState].badgeVariant}>
			{FULFILLMENT_STATE_META[item.fulfillmentState].label}
		</Badge>
	)}
```

- [ ] **Step 4:** `bun check-types` PASS; smoke (3006): lista de pedidos com badge "Em separação"/"Separado" nos preparing; fila atualiza sozinha (~45s).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/auto-refresh.tsx apps/web/src/app/dashboard/separacao apps/web/src/app/dashboard/orders
git commit -m "feat: badges de fulfillment e auto-refresh leve"
```

---

### Task 11: Gate integrado final

- [ ] **Step 1:** `bun verify` (check-types + check ultracite + test) — Expected: tudo verde. Warnings pré-existentes do padrão canônico (nested-ternary de header contextual etc.) não contam como regressão.
- [ ] **Step 2:** `bun run build` — Expected: OK (vários `"use server"` tocados).
- [ ] **Step 3: Smoke E2E no browser (porta 3006), fluxo completo:**
  1. Pedido `paid` → atribuir filial → iniciar separação → bipar tudo → concluir → painel "Despachar agora" → enviar com rastreio → status Enviado, histórico com tudo.
  2. Pedido `preparing` sem separação → detalhe: envio travado + card "Aguardando separação"; como super_admin, forçar envio com motivo → histórico mostra o evento.
  3. Exceção: reportar item ausente → finalizar com pendência → tab exceções → reabrir → nova sessão.
  4. Segundo usuário (ou sessão alheia): tela read-only + Assumir.
- [ ] **Step 4:** Invocar `superpowers:finishing-a-development-branch` (merge/PR conforme fluxo do repo).
