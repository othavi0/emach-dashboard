# Fluxo de separação em Pedidos — Implementation Plan

> **⚠️ Plano EXECUTADO (PR #305) — registro histórico, não reexecutar.** Ele foi
> escrito quando "Atrasados" era uma tab **exclusiva**. Na integração com a main
> (2026-07-14) o PR #306 já havia tornado Atrasados um **overlay**, então os
> trechos abaixo com `lateness: "exclude"` e "atraso vence / é exclusiva" estão
> **superados** — esse valor não existe mais no `OrderTabDef`. O modelo que
> valeu: etapa (`paid`/`preparing`/`picked`) e atraso são eixos ortogonais.
> Fonte de verdade atual: `apps/web/CLAUDE.md` § "Orders — filter-builder único".
> O Step 2 da Task 6 (saneamento one-off) **já rodou** — ver o aviso lá.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar o spec `docs/superpowers/specs/2026-07-11-fluxo-separacao-pedidos-design.md`: terminologia "Em separação"/"Separando", bulk pago→separação com skip report, régua de atraso por `preparing_at`, responsável no badge composto e tab "Separado" computada.

**Architecture:** Tudo em `apps/web` (labels, filter-builder único `orders-where.ts`, server action nova, cards). Zero mudança de schema/enum — a tab Separado e o responsável derivam de `order_picking` já existente. O saneamento one-off é um UPDATE manual autorizado, fora do código.

**Tech Stack:** Next 16 / React 19, drizzle (SQL cru via `db.execute`), vitest (`bun --cwd apps/web test`), biome/ultracite.

## Global Constraints

- ⛔ Banco Supabase é ÚNICO e COMPARTILHADO (dev = prod = ecommerce). NUNCA seed/truncate/drop/db:push. A única escrita fora do app é o UPDATE one-off da Task 6, que exige confirmação do user NA HORA.
- CWD é a RAIZ do monorepo — nunca `cd apps/web`; testes via `bun --cwd apps/web test <path>`.
- Read cada arquivo antes de Edit; se Edit falhar com `string not found`, re-Read (hook PostToolUse roda `bun fix` e reformata).
- `bun check-types --force` (turbo serve PASS velho) + `bun check` antes de cada commit.
- Proibido: `console.*`, `: any`, `@ts-ignore`, `key={index}`, `React.forwardRef`, `useMemo`/`useCallback` manuais.
- Enum `preparing` do banco fica INTOCADO (contrato ecommerce). Só labels de UI mudam.
- NÃO tocar: `packages/db/*`, `apps/web/src/app/design/*` (galeria estática), app ecommerce.
- Strings PT com acentuação correta ("separação", "exceção").
- Commits: Conventional Commits em PT, subject ≤50 chars, sem push, sem atribuição de AI.

---

### Task 1: Terminologia — "Em separação" (status) e "Separando" (sub-estado)

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/status-meta.ts:36,119` (+ comentários 26,41-42)
- Modify: `apps/web/src/app/dashboard/separacao/fulfillment-meta.ts:19`
- Modify: `apps/web/src/app/dashboard/separacao/page.tsx:68`
- Modify: `apps/web/src/app/dashboard/separacao/_components/picking-queue.tsx:23,67`
- Modify: `apps/web/src/app/dashboard/separacao/_components/picking-execution.tsx:574`
- Modify: `apps/web/src/app/dashboard/orders/[id]/_components/order-summary-card.tsx:32`
- Test: `apps/web/src/app/dashboard/orders/__tests__/status-meta.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `ORDER_STATUS_META.preparing.label === "Em separação"`; `FULFILLMENT_STATE_META.picking_in_progress.label === "Separando"`. Tasks 3/4 dependem desses labels.

- [ ] **Step 1: Atualizar o teste para os labels novos**

Em `status-meta.test.ts`, trocar a expectativa de labels (linhas 18-24):

```ts
		expect(ORDER_FLOW_TABS.map((t) => t.label)).toEqual([
			"Pago",
			"Em separação",
			"Atrasados",
			"Enviados",
			"Entregues",
		]);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun --cwd apps/web test src/app/dashboard/orders/__tests__/status-meta.test.ts`
Expected: FAIL — label ainda é "Em preparação".

- [ ] **Step 3: Trocar os labels**

Em `status-meta.ts`:
- linha 36: `label: "Em preparação",` → `label: "Em separação",`
- linha 119: `preparing: { label: "Em preparação", ... }` → `preparing: { label: "Em separação", iconKey: "package", tone: "info" },`
- comentário linha 26: `"Pago" e "Em preparação"` → `"Pago" e "Em separação"`
- comentários 41-42: `em preparação` → `em separação` / `"Em preparação"` → `"Em separação"`

Em `fulfillment-meta.ts` linha 19: `label: "Em separação",` → `label: "Separando",` (sub-estado da bipagem ativa — resolve a colisão com o macro-status).

Em `separacao/page.tsx` linha 68 (KPI do header): texto `Em separação` → `Separando`.

Em `picking-queue.tsx`:
- linha 23 (`TAB_EMPTY.em_separacao`): `"Nenhum pedido em separação no momento."` → `"Nenhum pedido sendo separado no momento."`
- linha 67 (label da tab, a key `em_separacao` da URL NÃO muda): `Em separação` → `Separando`

Em `picking-execution.tsx` linha 574: o texto `Em separação` (estado da sessão ativa na tela de bipagem) → `Separando`.

Em `order-summary-card.tsx` linha 32: `preparing: "Em preparação há",` → `preparing: "Em separação há",`

- [ ] **Step 4: Verificar que não sobrou "Em preparação" vivo**

Run: `rg -n "Em preparação|preparação" apps/web/src --no-heading | grep -v design/ | grep -v __tests__`
Expected: só comentários históricos (`order-progress.tsx:154`, `order-action-column.tsx:183` — atualizar os dois comentários para "Em separação" também) e a mensagem `actions.ts:261` ("Filial obrigatória para iniciar a preparação do pedido" → trocar para "Filial obrigatória para enviar o pedido para separação").

- [ ] **Step 5: Testes + commit**

Run: `bun --cwd apps/web test src/app/dashboard/orders` → PASS
Run: `bun check-types --force && bun check` → verdes

```bash
git add -A apps/web/src
git commit -m "feat: renomeia preparação para separação na UI"
```

---

### Task 2: Régua de atraso por `preparing_at`

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/_lib/lateness.ts`
- Modify: `apps/web/src/app/dashboard/orders/_lib/orders-where.ts:50-52` (const `fulfillmentAge`)
- Modify: `apps/web/src/app/dashboard/orders/data.ts` (counts SQL linha ~528-530; select da lista + `OrderListItem`)
- Modify: `apps/web/src/app/dashboard/orders/_lib/age-meta.ts`
- Modify: `apps/web/src/app/dashboard/orders/_components/order-card.tsx:30-35`
- Test: `apps/web/src/app/dashboard/orders/__tests__/lateness.test.ts` (novo)

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `latenessOf(args: { createdAt: Date; now: Date; paidAt: Date | null; preparingAt: Date | null; status: OrderStatus }): Lateness` (assinatura NOVA, objeto). `OrderListItem` ganha `preparingAt: Date | null`. `AgeSource` ganha `preparingAt` e `status`. Task 3 reusa o SQL de atraso; Task 5 assume `preparingAt` no item.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/web/src/app/dashboard/orders/__tests__/lateness.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { latenessOf } from "../_lib/lateness";

const NOW = new Date("2026-07-11T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 3_600_000);

describe("latenessOf (régua spec 2026-07-11)", () => {
	it("paid conta de paid_at (fallback created_at)", () => {
		expect(
			latenessOf({
				status: "paid",
				paidAt: daysAgo(4),
				preparingAt: null,
				createdAt: daysAgo(10),
				now: NOW,
			})
		).toBe("late");
		expect(
			latenessOf({
				status: "paid",
				paidAt: daysAgo(1),
				preparingAt: null,
				createdAt: daysAgo(10),
				now: NOW,
			})
		).toBe("none");
	});

	it("preparing conta de preparing_at — pago em junho mas separando desde ontem não é atrasado", () => {
		expect(
			latenessOf({
				status: "preparing",
				paidAt: daysAgo(20),
				preparingAt: daysAgo(1),
				createdAt: daysAgo(21),
				now: NOW,
			})
		).toBe("none");
	});

	it("preparing sem preparing_at cai para paid_at (legado)", () => {
		expect(
			latenessOf({
				status: "preparing",
				paidAt: daysAgo(20),
				preparingAt: null,
				createdAt: daysAgo(21),
				now: NOW,
			})
		).toBe("late");
	});

	it("48h = amber, 72h = late", () => {
		expect(
			latenessOf({
				status: "preparing",
				paidAt: null,
				preparingAt: daysAgo(2.5),
				createdAt: daysAgo(30),
				now: NOW,
			})
		).toBe("amber");
	});

	it("status fora do fluxo é none", () => {
		expect(
			latenessOf({
				status: "shipped",
				paidAt: daysAgo(30),
				preparingAt: daysAgo(30),
				createdAt: daysAgo(30),
				now: NOW,
			})
		).toBe("none");
	});
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun --cwd apps/web test src/app/dashboard/orders/__tests__/lateness.test.ts`
Expected: FAIL — assinatura atual é posicional e ignora `preparingAt`.

- [ ] **Step 3: Reescrever `latenessOf`**

Substituir a função em `_lib/lateness.ts` (mantém `LATE_AMBER_HOURS`/`LATE_TAB_HOURS`/`Lateness`):

```ts
// Regra spec 2026-07-11: cada etapa conta o próprio relógio — paid de
// paid_at; preparing de preparing_at (fallback paid_at p/ legado sem a
// coluna preenchida). Espelhada no SQL de orders-where.ts/data.ts.
export function latenessOf(args: {
	createdAt: Date;
	now: Date;
	paidAt: Date | null;
	preparingAt: Date | null;
	status: OrderStatus;
}): Lateness {
	if (!FULFILLMENT_STATUSES.has(args.status)) {
		return "none";
	}
	const base =
		args.status === "preparing"
			? (args.preparingAt ?? args.paidAt ?? args.createdAt)
			: (args.paidAt ?? args.createdAt);
	const ageHours = (args.now.getTime() - base.getTime()) / 3_600_000;
	if (ageHours >= LATE_TAB_HOURS) {
		return "late";
	}
	if (ageHours >= LATE_AMBER_HOURS) {
		return "amber";
	}
	return "none";
}
```

- [ ] **Step 4: Espelhar no SQL (fonte única de WHERE + counts)**

Em `_lib/orders-where.ts`, substituir a linha 51:

```ts
// Relógio de atraso por etapa (spec 2026-07-11): preparing conta da entrada
// na separação; paid do pagamento — espelha latenessOf().
const fulfillmentAge = sql`CASE WHEN o.status = 'preparing'
	THEN COALESCE(o.preparing_at, o.paid_at, o.created_at)
	ELSE COALESCE(o.paid_at, o.created_at) END`;
```

Em `data.ts`, no SQL de `computeOrdersTabCounts` (linha ~529), trocar a expressão `is_late`:

```sql
(status IN ('paid','preparing')
 AND (CASE WHEN status = 'preparing'
	THEN COALESCE(preparing_at, paid_at, created_at)
	ELSE COALESCE(paid_at, created_at) END)
	<= now() - make_interval(hours => ${LATE_TAB_HOURS})
) AS is_late,
```

⚠️ NÃO mexer no `fulfillment_age` do SELECT da lista nem no cursor `paidAtAsc` — a paginação FIFO continua por `COALESCE(paid_at, created_at)`.

- [ ] **Step 5: Expor `preparingAt` na lista e atualizar consumidores**

Em `data.ts`:
- `OrderListItem` ganha `preparingAt: Date | null;` (ordem alfabética, após `paidAt`).
- No type do `db.execute` da lista: `preparing_at: Date | null;`; no SELECT, acrescentar `o.preparing_at` logo após `o.paid_at`.
- No `paginate` map: `preparingAt: row.preparing_at ? toDate(row.preparing_at) : null,`.

Em `_lib/age-meta.ts`, atualizar `AgeSource` e o switch:

```ts
import type { OrderStatus } from "@emach/db/schema/orders";

interface AgeSource {
	createdAt: Date;
	deliveredAt: Date | null;
	paidAt: Date | null;
	preparingAt: Date | null;
	shippedAt: Date | null;
	status: OrderStatus;
}
```

```ts
	switch (tabKey) {
		case "paid":
			return {
				label: "Pago há",
				value: normalizeRelative(formatRelative(item.paidAt ?? item.createdAt)),
			};
		case "preparing":
		case "picked":
			return {
				label: "Em separação há",
				value: normalizeRelative(
					formatRelative(item.preparingAt ?? item.paidAt ?? item.createdAt)
				),
			};
		case "late":
			// Tab mista: cada card mostra o relógio da própria etapa.
			return item.status === "preparing"
				? {
						label: "Em separação há",
						value: normalizeRelative(
							formatRelative(item.preparingAt ?? item.paidAt ?? item.createdAt)
						),
					}
				: {
						label: "Pago há",
						value: normalizeRelative(
							formatRelative(item.paidAt ?? item.createdAt)
						),
					};
```

(demais cases inalterados; o case `"picked"` antecipa a Task 3 e é inofensivo antes dela.)

Em `order-card.tsx` (linhas 30-35), atualizar a chamada:

```ts
	const lateness = latenessOf({
		status: item.status,
		paidAt: item.paidAt,
		preparingAt: item.preparingAt,
		createdAt: item.createdAt,
		now: new Date(),
	});
```

- [ ] **Step 6: Testes + commit**

Run: `bun --cwd apps/web test src/app/dashboard/orders` → PASS
Run: `bun check-types --force && bun check` → verdes

```bash
git add -A apps/web/src
git commit -m "feat: atraso de separação conta de preparing_at"
```

---

### Task 3: Tab "Separado" computada no filter-builder único

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/status-meta.ts` (OrderTabDef + ORDER_FLOW_TABS)
- Modify: `apps/web/src/app/dashboard/orders/_lib/orders-where.ts` (condição picking + counts)
- Modify: `apps/web/src/app/dashboard/orders/data.ts` (counts SQL com `is_picked`)
- Modify: `apps/web/src/app/dashboard/orders/_components/order-list-filters.tsx` (função `tabCount`)
- Test: `apps/web/src/app/dashboard/orders/__tests__/status-meta.test.ts`
- Test: `apps/web/src/app/dashboard/orders/__tests__/orders-where.test.ts` (novo)

**Interfaces:**
- Consumes: SQL `fulfillmentAge` da Task 2.
- Produces: `OrderTabDef.picking?: "picked" | "not_picked"`; tab `{ key: "picked", label: "Separado" }`; `OrderTabCounts.picked: number`; `foldTabCounts(rows: { count: number; is_late: boolean; is_picked: boolean; status: OrderStatus }[])` (assinatura NOVA). Task 6 verifica contagens no browser.

- [ ] **Step 1: Atualizar teste de tabs + criar teste de foldTabCounts**

Em `status-meta.test.ts`, substituir o describe `ORDER_FLOW_TABS` inteiro:

```ts
describe("ORDER_FLOW_TABS (spec 2026-07-11)", () => {
	it("tem um chip por etapa, na ordem do fluxo", () => {
		expect(ORDER_FLOW_TABS.map((t) => t.key)).toEqual([
			"paid",
			"preparing",
			"picked",
			"late",
			"shipped",
			"delivered",
		]);
		expect(ORDER_FLOW_TABS.map((t) => t.label)).toEqual([
			"Pago",
			"Em separação",
			"Separado",
			"Atrasados",
			"Enviados",
			"Entregues",
		]);
	});

	it("picked e preparing dividem o status preparing por sessão de picking", () => {
		const picked = ORDER_FLOW_TABS.find((t) => t.key === "picked");
		const preparing = ORDER_FLOW_TABS.find((t) => t.key === "preparing");
		expect(picked?.statuses).toEqual(["preparing"]);
		expect(picked?.picking).toBe("picked");
		expect(picked?.lateness).toBe("exclude");
		expect(preparing?.picking).toBe("not_picked");
	});

	it("aba computada 'late' cobre paid+preparing e é exclusiva", () => {
		const late = ORDER_FLOW_TABS.find((t) => t.key === "late");
		expect(late?.statuses).toEqual(["paid", "preparing"]);
		expect(late?.lateness).toBe("only");
		expect(ORDER_FLOW_TABS.find((t) => t.key === "paid")?.lateness).toBe(
			"exclude"
		);
	});

	it("default é a fila de entrada (Pago)", () => {
		expect(DEFAULT_ORDER_TAB).toBe("paid");
	});
});
```

Criar `apps/web/src/app/dashboard/orders/__tests__/orders-where.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { foldTabCounts } from "../_lib/orders-where";
import { ordersTabSort } from "../_lib/orders-where";

describe("foldTabCounts com bucket picked", () => {
	it("preparing não-atrasado com sessão completed vai pro bucket picked", () => {
		const counts = foldTabCounts([
			{ status: "preparing", is_late: false, is_picked: true, count: 2 },
			{ status: "preparing", is_late: false, is_picked: false, count: 4 },
			{ status: "paid", is_late: false, is_picked: false, count: 5 },
		]);
		expect(counts.picked).toBe(2);
		expect(counts.preparing).toBe(4);
		expect(counts.paid).toBe(5);
		expect(counts.all_count).toBe(11);
	});

	it("atraso vence: preparing atrasado E picked conta só em late", () => {
		const counts = foldTabCounts([
			{ status: "preparing", is_late: true, is_picked: true, count: 3 },
		]);
		expect(counts.late).toBe(3);
		expect(counts.picked).toBe(0);
		expect(counts.preparing).toBe(0);
	});

	it("is_picked em status fora de preparing é ignorado", () => {
		const counts = foldTabCounts([
			{ status: "shipped", is_late: false, is_picked: true, count: 1 },
		]);
		expect(counts.shipped).toBe(1);
		expect(counts.picked).toBe(0);
	});
});

describe("ordersTabSort", () => {
	it("picked pagina FIFO como as demais filas de expedição", () => {
		expect(ordersTabSort("picked")).toBe("paidAtAsc");
		expect(ordersTabSort("shipped")).toBe("newest");
	});
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun --cwd apps/web test src/app/dashboard/orders/__tests__/status-meta.test.ts src/app/dashboard/orders/__tests__/orders-where.test.ts`
Expected: FAIL — tab picked, campo `picking`, bucket `picked` e FIFO não existem.

- [ ] **Step 3: Tab e tipo em `status-meta.ts`**

Em `OrderTabDef`, acrescentar o campo:

```ts
export interface OrderTabDef {
	key: string;
	label: string;
	lateness?: TabLateness;
	/** Divide o status preparing pela última sessão de picking (tab Separado). */
	picking?: "picked" | "not_picked";
	statuses: readonly DbOrderStatus[] | null;
}
```

Em `ORDER_FLOW_TABS`, atualizar a entrada `preparing` e inserir `picked` logo após ela (antes de `late`):

```ts
	{
		key: "preparing",
		label: "Em separação",
		statuses: ["preparing"] as DbOrderStatus[],
		lateness: "exclude",
		picking: "not_picked",
	},
	{
		// Tab computada (spec 2026-07-11): preparing com a última sessão de
		// picking concluída — separado, aguardando código de envio.
		key: "picked",
		label: "Separado",
		statuses: ["preparing"] as DbOrderStatus[],
		lateness: "exclude",
		picking: "picked",
	},
```

- [ ] **Step 4: Condições e fold em `orders-where.ts`**

Adicionar após a const `lateCutoff`:

```ts
// Última sessão de picking do pedido (mesma semântica do LATERAL lp de
// data.ts: started_at DESC, id DESC). NULL (sem sessão) ≠ 'completed'.
const latestPickingStatus = sql`(
	SELECT op.status FROM order_picking op
	WHERE op.order_id = o.id
	ORDER BY op.started_at DESC, op.id DESC LIMIT 1
)`;
```

Em `buildOrdersListConditions`, após o bloco de `lateness`:

```ts
	if (tabDef.picking === "picked") {
		conditions.push(sql`${latestPickingStatus} = 'completed'`);
	}
	if (tabDef.picking === "not_picked") {
		conditions.push(sql`${latestPickingStatus} IS DISTINCT FROM 'completed'`);
	}
```

Em `FIFO_TABS`: `new Set(["paid", "preparing", "picked", "late"])`.

Em `OrderTabCounts`, acrescentar `picked: number;`; em `emptyTabCounts()`, acrescentar `picked: 0,` (após `preparing`).

Em `foldTabCounts`, nova assinatura e bucket (substituir a função):

```ts
// Pura: agrega linhas status×is_late×is_picked nos buckets de tab. `late`
// vence (exclusiva); dentro de preparing não-atrasado, is_picked separa a
// tab "Separado" da "Em separação".
export function foldTabCounts(
	rows: {
		count: number;
		is_late: boolean;
		is_picked: boolean;
		status: OrderStatus;
	}[]
): OrderTabCounts {
	const counts = emptyTabCounts();
	for (const row of rows) {
		counts.all_count += row.count;
		if (row.is_late && (row.status === "paid" || row.status === "preparing")) {
			counts.late += row.count;
			continue;
		}
		if (row.status === "preparing" && row.is_picked) {
			counts.picked += row.count;
			continue;
		}
		switch (row.status) {
			case "canceled":
			case "refunded":
				counts.canceled += row.count;
				break;
			case "pending_payment":
			case "payment_failed":
			case "paid":
			case "preparing":
			case "shipped":
			case "delivered":
			case "returned":
				counts[row.status] += row.count;
				break;
			default:
				break;
		}
	}
	return counts;
}
```

⚠️ Note o `+=` no switch (antes era `=`): com `is_picked` o GROUP BY pode gerar duas linhas pro mesmo status.

- [ ] **Step 5: Counts SQL em `data.ts` + `tabCount` no filtro**

No SQL de `computeOrdersTabCounts`, acrescentar a coluna `is_picked` (após `is_late`) e incluí-la no GROUP BY:

```sql
				(status = 'preparing' AND (
					SELECT op.status FROM order_picking op
					WHERE op.order_id = "order".id
					ORDER BY op.started_at DESC, op.id DESC LIMIT 1
				) = 'completed') AS is_picked,
				COUNT(*)::int AS count
			FROM "order"
			${branchFilter ? sql`WHERE ${branchFilter}` : sql``}
			GROUP BY 1, 2, 3
```

E o type do `db.execute` ganha `is_picked: boolean;`.

Em `order-list-filters.tsx`, na função `tabCount` (linhas ~95-106), acrescentar antes do `if (!statuses)`:

```ts
	if (key === "picked") {
		return counts.picked ?? 0;
	}
```

(a tab renderiza sozinha — `ORDER_FLOW_TABS.map(renderTab)` já a inclui.)

- [ ] **Step 6: Testes + commit**

Run: `bun --cwd apps/web test src/app/dashboard/orders` → PASS
Run: `bun check-types --force && bun check` → verdes

```bash
git add -A apps/web/src
git commit -m "feat: tab Separado computada em pedidos"
```

---

### Task 4: Responsável no badge composto

**Files:**
- Modify: `apps/web/src/app/dashboard/separacao/fulfillment-meta.ts` (helper novo)
- Modify: `apps/web/src/app/dashboard/orders/data.ts` (picker_name no LATERAL)
- Modify: `apps/web/src/app/dashboard/orders/_components/order-card.tsx:63-75`
- Modify: `apps/web/src/app/dashboard/separacao/_components/picking-order-card.tsx`
- Test: `apps/web/src/app/dashboard/separacao/__tests__/fulfillment-meta.test.ts` (novo; criar o diretório se não existir)

**Interfaces:**
- Consumes: labels da Task 1 ("Separando").
- Produces: `fulfillmentBadgeLabel(state: FulfillmentState, pickerName: string | null | undefined): string`; `OrderListItem.pickerName: string | null`.

- [ ] **Step 1: Teste do helper**

Criar `apps/web/src/app/dashboard/separacao/__tests__/fulfillment-meta.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { fulfillmentBadgeLabel } from "../fulfillment-meta";

describe("fulfillmentBadgeLabel (spec 2026-07-11, mockup B)", () => {
	it("compõe estado + nome nas sessões relevantes", () => {
		expect(fulfillmentBadgeLabel("picking_in_progress", "Othavio Quiliao")).toBe(
			"Separando · Othavio Quiliao"
		);
		expect(fulfillmentBadgeLabel("picked", "Othavio Quiliao")).toBe(
			"Separado · Othavio Quiliao"
		);
	});

	it("exceção usa a forma curta no composto", () => {
		expect(fulfillmentBadgeLabel("picking_exception", "Othavio Quiliao")).toBe(
			"Exceção · Othavio Quiliao"
		);
	});

	it("a separar nunca mostra nome", () => {
		expect(fulfillmentBadgeLabel("awaiting_picking", "Othavio Quiliao")).toBe(
			"A separar"
		);
	});

	it("sem pickerName cai no label simples", () => {
		expect(fulfillmentBadgeLabel("picked", null)).toBe("Separado");
	});
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun --cwd apps/web test src/app/dashboard/separacao`
Expected: FAIL — `fulfillmentBadgeLabel` não existe.

- [ ] **Step 3: Helper em `fulfillment-meta.ts`**

Acrescentar ao fim do arquivo:

```ts
/**
 * Label do badge de card (spec 2026-07-11, mockup B): estado + responsável
 * da última sessão. "A separar" nunca tem nome (ninguém pegou o pedido);
 * exceção usa a forma curta pra não estourar o badge.
 */
export function fulfillmentBadgeLabel(
	state: FulfillmentState,
	pickerName: string | null | undefined
): string {
	const short =
		state === "picking_exception"
			? "Exceção"
			: FULFILLMENT_STATE_META[state].label;
	if (state === "awaiting_picking" || !pickerName) {
		return short;
	}
	return `${short} · ${pickerName}`;
}
```

- [ ] **Step 4: `pickerName` na listagem de Pedidos**

Em `data.ts`:
- `OrderListItem` ganha `pickerName: string | null;` (após `paidAt`… manter ordem alfabética).
- Type do `db.execute` da lista: `latest_picking_picker: string | null;`.
- No LATERAL `lp` do SELECT, trocar por:

```sql
			LEFT JOIN LATERAL (
				SELECT op.status, op.picker_name FROM order_picking op
				WHERE op.order_id = o.id
				ORDER BY op.started_at DESC, op.id DESC LIMIT 1
			) lp ON o.status = 'preparing'
```

e no SELECT de colunas: `lp.status AS latest_picking_status, lp.picker_name AS latest_picking_picker`.
- No map do `paginate`: `pickerName: row.status === "preparing" ? (row.latest_picking_picker ?? null) : null,`.

- [ ] **Step 5: Badge composto nos dois cards**

Em `order-card.tsx`, no bloco do badge (linhas 63-75), trocar o conteúdo do `<Badge>`:

```tsx
					{orderBadgeSource(item.status, item.fulfillmentState) ===
						"fulfillment" && item.fulfillmentState ? (
						<Badge
							className={STATUS_BADGE_CAPS}
							variant={
								FULFILLMENT_STATE_META[item.fulfillmentState].badgeVariant
							}
						>
							{fulfillmentBadgeLabel(item.fulfillmentState, item.pickerName)}
						</Badge>
					) : (
						<OrderStatusBadge status={item.status} />
					)}
```

com o import `fulfillmentBadgeLabel` vindo de `../../separacao/fulfillment-meta`.

Em `picking-order-card.tsx`: Read o arquivo; no componente `StatusBadge` (linha ~47), onde o label do estado é renderizado, usar `fulfillmentBadgeLabel(<state>, row.pickerName ?? null)` no lugar do label simples; remover a linha redundante `por {row.pickerName}` (linhas ~113-117) que só aparecia na tab `em_separacao` — o nome agora vive no badge.

- [ ] **Step 6: Testes + commit**

Run: `bun --cwd apps/web test src/app/dashboard` → PASS
Run: `bun check-types --force && bun check` → verdes

```bash
git add -A apps/web/src
git commit -m "feat: responsável no badge de separação dos cards"
```

---

### Task 5: Bulk "Enviar para separação"

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/schema.ts` (schema novo)
- Create: `apps/web/src/app/dashboard/orders/_lib/bulk-eligibility.ts`
- Modify: `apps/web/src/app/dashboard/orders/actions.ts` (action nova)
- Modify: `apps/web/src/app/dashboard/orders/_components/orders-infinite.tsx`
- Test: `apps/web/src/app/dashboard/orders/__tests__/bulk-eligibility.test.ts` (novo)

**Interfaces:**
- Consumes: `lockOrderAndAuthorize(tx, cap, orderId)` e `buildOrderStatusUpdate` já existentes em `actions.ts`; `notify` de `@/lib/notify`.
- Produces: `bulkStartSeparation(input: { orderIds: string[] }): Promise<ActionResult<{ moved: number; skipped: { number: string; reason: string }[] }>>`; helper puro `bulkStartSeparationSkipReason`.

- [ ] **Step 1: Teste do helper puro**

Criar `apps/web/src/app/dashboard/orders/__tests__/bulk-eligibility.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
	BULK_SKIP_LABEL,
	bulkStartSeparationSkipReason,
} from "../_lib/bulk-eligibility";

describe("bulkStartSeparationSkipReason", () => {
	it("paid com filial é elegível", () => {
		expect(
			bulkStartSeparationSkipReason({ status: "paid", branchId: "b1" })
		).toBeNull();
	});

	it("status diferente de paid é pulado", () => {
		expect(
			bulkStartSeparationSkipReason({ status: "preparing", branchId: "b1" })
		).toBe("status_diferente");
		expect(
			bulkStartSeparationSkipReason({ status: "canceled", branchId: "b1" })
		).toBe("status_diferente");
	});

	it("paid sem filial é pulado (preparing exige branch)", () => {
		expect(
			bulkStartSeparationSkipReason({ status: "paid", branchId: null })
		).toBe("sem_filial");
	});

	it("labels de toast existem para todo reason", () => {
		expect(BULK_SKIP_LABEL.sem_filial).toBe("sem filial");
		expect(BULK_SKIP_LABEL.status_diferente).toBe("não está mais em Pago");
	});
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun --cwd apps/web test src/app/dashboard/orders/__tests__/bulk-eligibility.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Helper puro**

Criar `apps/web/src/app/dashboard/orders/_lib/bulk-eligibility.ts`:

```ts
// Elegibilidade do bulk pago→separação (spec 2026-07-11). Puro e fora do
// "use server" para ser testável (padrão ADR-0019).

export type BulkSkipReason = "sem_filial" | "status_diferente";

export function bulkStartSeparationSkipReason(locked: {
	branchId: string | null;
	status: string;
}): BulkSkipReason | null {
	if (locked.status !== "paid") {
		return "status_diferente";
	}
	if (!locked.branchId) {
		return "sem_filial";
	}
	return null;
}

export const BULK_SKIP_LABEL: Record<BulkSkipReason, string> = {
	sem_filial: "sem filial",
	status_diferente: "não está mais em Pago",
};
```

- [ ] **Step 4: Schema + server action**

Em `schema.ts`, acrescentar (após `updateOrderStatusSchema`):

```ts
export const bulkStartSeparationSchema = z.object({
	orderIds: z.array(z.string().uuid()).min(1).max(100),
});

export type BulkStartSeparationInput = z.infer<
	typeof bulkStartSeparationSchema
>;
```

Em `actions.ts`, acrescentar a action (junto de `updateOrderStatus`); importar `bulkStartSeparationSchema`/`BulkStartSeparationInput` do `./schema`, `inArray` de `drizzle-orm` e os helpers de `./_lib/bulk-eligibility`:

```ts
export interface BulkStartSeparationResult {
	moved: number;
	skipped: { number: string; reason: string }[];
}

/**
 * Bulk pago→separação (spec 2026-07-11). Cada pedido roda em transação
 * própria com lock + capability branch-scoped; inelegíveis são pulados e
 * reportados — um pedido problemático não derruba o lote.
 */
export async function bulkStartSeparation(
	input: BulkStartSeparationInput
): Promise<ActionResult<BulkStartSeparationResult>> {
	const parsed = bulkStartSeparationSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "Entrada inválida",
		};
	}

	try {
		// Fail-fast global: sem a capability nem adianta iterar.
		await requireCapability("orders.update_status");

		const numbers = await db
			.select({ id: order.id, number: order.number })
			.from(order)
			.where(inArray(order.id, parsed.data.orderIds));
		const numberById = new Map(numbers.map((r) => [r.id, r.number]));

		let moved = 0;
		const skipped: { number: string; reason: string }[] = [];

		for (const orderId of parsed.data.orderIds) {
			const label = numberById.get(orderId) ?? orderId.slice(0, 8);
			try {
				await db.transaction(async (tx) => {
					const locked = await lockOrderAndAuthorize(
						tx,
						"orders.update_status",
						orderId
					);
					if (!locked) {
						skipped.push({ number: label, reason: "não encontrado" });
						return;
					}
					const reason = bulkStartSeparationSkipReason(locked);
					if (reason) {
						skipped.push({ number: label, reason: BULK_SKIP_LABEL[reason] });
						return;
					}
					await tx
						.update(order)
						.set(buildOrderStatusUpdate("preparing", undefined, undefined))
						.where(eq(order.id, orderId));
					await tx.insert(orderStatusHistory).values({
						id: crypto.randomUUID(),
						orderId,
						fromStatus: "paid",
						toStatus: "preparing",
						actorType: "user",
						actorUserId: locked.session.user.id,
						reason: null,
					});
					moved += 1;
				});
			} catch (error) {
				if (isCapabilityError(error)) {
					skipped.push({ number: label, reason: "fora do seu escopo" });
				} else {
					throw error;
				}
			}
		}

		revalidatePath(ORDERS_PATH);
		revalidateTag(ORDERS_COUNTS_TAG, "max");
		return { ok: true, data: { moved, skipped } };
	} catch (error) {
		logger.error("bulkStartSeparation", error);
		if (isCapabilityError(error)) {
			return { ok: false, error: "Sem permissão para alterar pedidos." };
		}
		return {
			ok: false,
			error: error instanceof Error ? error.message : "Erro interno",
		};
	}
}
```

⚠️ `buildOrderStatusUpdate` e `lockOrderAndAuthorize` já existem no arquivo — não duplicar. Conferir se `order`/`orderStatusHistory`/`inArray` já estão importados.

- [ ] **Step 5: Ação na barra de seleção**

Em `orders-infinite.tsx`, substituir o componente por:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { BulkActionBar } from "@/components/bulk/bulk-action-bar";
import { SelectionToolbar } from "@/components/bulk/selection-toolbar";
import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { notify } from "@/lib/notify";
import { useBulkSelection } from "@/lib/use-bulk-selection";
import { useInfiniteList } from "@/lib/use-infinite-list";

import { bulkStartSeparation, fetchOrdersPage } from "../actions";
import type { OrderListItem, OrdersPageFiltersInput } from "../data";
import { OrderCardGrid } from "./order-card-grid";

interface OrdersInfiniteProps {
	filters: OrdersPageFiltersInput;
	highlightToolId?: string | null;
	initial: OrderListItem[];
	initialCursor: string | null;
	tabKey: string;
}

export function OrdersInfinite({
	initial,
	initialCursor,
	filters,
	highlightToolId,
	tabKey,
}: OrdersInfiniteProps) {
	const router = useRouter();
	// Bump força o useInfiniteList a re-sincronizar com o initial revalidado
	// após uma mutação em massa (router.refresh não reseta client state).
	const [refreshTick, setRefreshTick] = useState(0);
	const resetKey = `${JSON.stringify(filters)}:${refreshTick}`;
	const [bulkPending, startBulk] = useTransition();
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: initial,
		initialCursor,
		fetchPage: (cursor) => fetchOrdersPage({ filters, cursor }),
		resetKey,
	});
	const sel = useBulkSelection({
		items,
		getId: (o) => o.id,
		resetKey,
	});

	const paidById = new Map(items.map((o) => [o.id, o.status === "paid"]));
	const selectedPaidIds = sel.selectedIds.filter((id) => paidById.get(id));

	const runBulkSeparation = () => {
		startBulk(async () => {
			const result = await bulkStartSeparation({ orderIds: selectedPaidIds });
			if (!result.ok) {
				notify.error(result.error);
				return;
			}
			const { moved, skipped } = result.data;
			if (skipped.length > 0) {
				notify.warning(
					`${moved} enviado${moved === 1 ? "" : "s"} para separação · ${skipped.length} pulado${skipped.length === 1 ? "" : "s"}: ${skipped
						.map((s) => `${s.number} (${s.reason})`)
						.join(", ")}`
				);
			} else {
				notify.success(
					`${moved} pedido${moved === 1 ? "" : "s"} enviado${moved === 1 ? "" : "s"} para separação`
				);
			}
			sel.exit();
			setRefreshTick((t) => t + 1);
			router.refresh();
		});
	};

	return (
		<div aria-live="polite">
			<div className="mb-3 flex justify-end">
				<SelectionToolbar
					active={sel.active}
					allLoadedSelected={sel.allLoadedSelected}
					loadedCount={items.length}
					onCancel={sel.exit}
					onEnter={sel.enter}
					onToggleAll={sel.allLoadedSelected ? sel.clear : sel.selectAllLoaded}
				/>
			</div>
			<OrderCardGrid
				highlightToolId={highlightToolId}
				items={items}
				selection={{
					active: sel.active,
					isSelected: sel.isSelected,
					onToggle: sel.toggle,
				}}
				tabKey={tabKey}
			/>
			<InfiniteSentinel
				error={error}
				hasMore={hasMore}
				onLoadMore={loadMore}
				pending={pending}
			/>
			{sel.count > 0 && (
				<BulkActionBar
					actions={[
						...(selectedPaidIds.length > 0
							? [
									{
										label: bulkPending
											? "Enviando…"
											: `Enviar para separação (${selectedPaidIds.length})`,
										run: runBulkSeparation,
									},
								]
							: []),
						{
							label: "Exportar CSV",
							run: (ids: string[]) => {
								window.location.href = `/dashboard/orders/export?ids=${ids.join(",")}`;
							},
						},
					]}
					onClear={sel.clear}
					selectedIds={sel.selectedIds}
				/>
			)}
		</div>
	);
}
```

(Se `useBulkSelection` não expuser `exit`, Read `@/lib/use-bulk-selection` e usar o método equivalente já usado no `onCancel`.)

- [ ] **Step 6: Testes + build + commit**

Run: `bun --cwd apps/web test src/app/dashboard/orders` → PASS
Run: `bun check-types --force && bun check` → verdes
Run: `bun run build` → PASS (mexemos em `actions.ts` `"use server"` — gate obrigatório)

```bash
git add -A apps/web/src
git commit -m "feat: envio em massa de pagos para separação"
```

---

### Task 6: Saneamento one-off + smoke + docs

**Files:**
- Modify: `apps/web/CLAUDE.md` (seção "Orders — filter-builder único")
- Banco: UPDATE one-off (manual, autorizado)

**Interfaces:**
- Consumes: tudo das tasks 1-5 integrado.
- Produces: verificação final; nada consumido adiante.

- [ ] **Step 1: Gate integrado**

Run: `bun verify` (check-types + check + test) → verde. Se a Task 5 não rodou `bun run build`, rodar aqui.

- [x] **Step 2: Saneamento one-off — JÁ EXECUTADO em 2026-07-11 (autorizado pelo user). NÃO reexecutar.**

Registro histórico: backfill de `preparing_at` nos 6 pedidos que já estavam em
separação antes da coluna passar a ser preenchida na transição. `paid_at` não
foi tocado.

⚠️ O banco é **único e compartilhado (dev = prod = ecommerce)**. O predicado
original era `WHERE status = 'preparing'` — sem alvo explícito, ele reescreve
**todo** pedido que estiver em separação no momento da execução, incluindo os
que entraram depois. Se um backfill parecido for necessário de novo, ele tem que
falhar fechado: listar os IDs primeiro e enumerá-los no `UPDATE`, com
confirmação explícita do user na sessão.

```sql
-- 1. Listar e CONFERIR o alvo (read-only):
SELECT id, number, preparing_at FROM "order"
 WHERE status = 'preparing' AND preparing_at IS NULL;

-- 2. Só então escrever, com os IDs conferidos no predicado:
UPDATE "order" SET preparing_at = now()
 WHERE id IN ('<uuid-1>', '…')  -- exatamente os N da consulta acima
   AND preparing_at IS NULL;    -- idempotente: nunca reescreve quem já tem
```

- [ ] **Step 3: Smoke no browser (dev `:3007`)**

1. `/dashboard/orders` — barra: Todos · Pago · Em separação · Separado · Atrasados · Enviados · Entregues. Contagens esperadas pós-saneamento: Em separação 4 (1 a separar + 3 separando), Separado 2, Atrasados 3 (só os `EM-TEST-*` pagos).
2. Cards de Em separação/Separado: badge composto "SEPARANDO · OTHAVIO QUILIAO"/"SEPARADO · OTHAVIO QUILIAO"; rodapé "Em separação há" com dias zerados.
3. Tab Pago: Selecionar → marcar 2 `EM-TEST-*` → "Enviar para separação (2)" → toast de sucesso; pedidos aparecem em Em separação como "A SEPARAR" (sem nome) e na fila `/dashboard/separacao` tab "A separar".
4. `/dashboard/separacao` — tabs A separar · Separando · Exceções; card da tab Separando com badge composto e sem o "por Fulano" duplicado.
5. Detalhe de um pedido em separação: summary "Em separação há"; histórico mostra a transição do bulk.
6. Reverter o teste 3 se desejado (individual, via detalhe: não há bulk reverso — ok deixar; são fixtures de teste).

- [ ] **Step 4: Atualizar mistakes-log**

Em `apps/web/CLAUDE.md`, seção "Orders — filter-builder único", acrescentar ao fim do parágrafo:

```
Tabs `picked`/`preparing` dividem o status preparing pela ÚLTIMA sessão de picking (`picking: "picked" | "not_picked"` no OrderTabDef — subquery `latestPickingStatus`); o relógio de atraso é POR ETAPA (`preparing` conta de `preparing_at`, spec 2026-07-11) — mexeu na régua, mexa em `_lib/lateness.ts` + `fulfillmentAge` + counts `is_late`/`is_picked` juntos.
```

- [ ] **Step 5: Commit final**

```bash
git add apps/web/CLAUDE.md docs/superpowers/plans/2026-07-11-fluxo-separacao-pedidos.md
git commit -m "docs: registra tab picked e régua por etapa"
```
