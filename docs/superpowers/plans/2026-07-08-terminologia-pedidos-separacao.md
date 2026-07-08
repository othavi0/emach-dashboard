# Consolidação de terminologia Pedidos × Separação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar o spec `docs/superpowers/specs/2026-07-08-terminologia-pedidos-separacao-design.md`: abas de fluxo Pago · Em preparação · Enviados · Entregues em Pedidos, badge único por card (regra `displayState`) e um termo canônico por estado na página Separação.

**Architecture:** Só camada de UI/labels do dashboard (`apps/web`). Nenhuma mudança de schema, enum, transição de status ou query de dados — as fontes `ORDER_FLOW_TABS`/`FULFILLMENT_STATE_META` já centralizam labels; o grosso é editar esses mapas e 2 componentes de card. Deep-link legado `?tab=to_prepare` resolve por alias.

**Tech Stack:** Next 16 / React 19, vitest (`bun --cwd apps/web test`), biome/ultracite (`bun check`), turbo.

## Global Constraints

- ⛔ Banco Supabase é ÚNICO e COMPARTILHADO (dev = prod = ecommerce). NUNCA seed/truncate/drop/reset/db:push. Este plano não toca banco.
- CWD é a RAIZ do monorepo — nunca `cd apps/web`; usar paths absolutos e `bun --cwd apps/web test`.
- Read cada arquivo antes de Edit; se Edit falhar com `string not found`, re-Read (o hook PostToolUse roda `bun fix` e pode reformatar o arquivo).
- `bun check-types` sempre com cache limpo: `bun check-types --force` (turbo já serviu PASS velho).
- Proibido: `console.*`, `: any`, `@ts-ignore`, `key={index}`, `React.forwardRef`, `useMemo`/`useCallback` manuais.
- Strings PT com acentuação correta ("preparação", "separação", "exceção").
- Commits: Conventional Commits em PT, subject ≤50 chars, sem push.
- NÃO tocar: `packages/db/*`, `apps/web/src/app/design/*` (galeria estática), app ecommerce, `order-summary-card.tsx` ("Em preparação há" é copy do eixo status — permitida pelo glossário).

---

### Task 1: Abas de fluxo em `status-meta.ts` + alias legado

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/status-meta.ts`
- Modify: `apps/web/src/app/dashboard/orders/data.ts:262-263` (função `resolveTab`)
- Test: `apps/web/src/app/dashboard/orders/__tests__/status-meta.test.ts` (novo)

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `ORDER_FLOW_TABS` com 4 entradas (`paid`, `preparing`, `shipped`, `delivered`); `DEFAULT_ORDER_TAB = "paid"`; `canonicalOrderTabKey(tab?: string): string | undefined` (exportada); `ORDER_FUNNEL_TABS` deixa de existir. `ORDER_TABS = [...ORDER_FLOW_TABS, ...ORDER_EXCEPTION_TABS]`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/web/src/app/dashboard/orders/__tests__/status-meta.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
	canonicalOrderTabKey,
	DEFAULT_ORDER_TAB,
	ORDER_FLOW_TABS,
} from "../status-meta";

describe("ORDER_FLOW_TABS (spec 2026-07-08)", () => {
	it("tem um chip por status do funil, na ordem do fluxo", () => {
		expect(ORDER_FLOW_TABS.map((t) => t.key)).toEqual([
			"paid",
			"preparing",
			"shipped",
			"delivered",
		]);
		expect(ORDER_FLOW_TABS.map((t) => t.label)).toEqual([
			"Pago",
			"Em preparação",
			"Enviados",
			"Entregues",
		]);
	});

	it("cada aba de fluxo mapeia 1:1 pro próprio status", () => {
		for (const tab of ORDER_FLOW_TABS) {
			expect(tab.statuses).toEqual([tab.key]);
		}
	});

	it("default é a fila de entrada (Pago)", () => {
		expect(DEFAULT_ORDER_TAB).toBe("paid");
	});
});

describe("canonicalOrderTabKey", () => {
	it("resolve o deep-link legado to_prepare para paid", () => {
		expect(canonicalOrderTabKey("to_prepare")).toBe("paid");
	});

	it("passa chaves atuais adiante sem mexer", () => {
		expect(canonicalOrderTabKey("preparing")).toBe("preparing");
		expect(canonicalOrderTabKey("all")).toBe("all");
	});

	it("preserva undefined (sem ?tab na URL)", () => {
		expect(canonicalOrderTabKey(undefined)).toBeUndefined();
	});
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `bun --cwd apps/web test src/app/dashboard/orders/__tests__/status-meta.test.ts`
Expected: FAIL — `canonicalOrderTabKey` não existe; `DEFAULT_ORDER_TAB` é `"to_prepare"`.

- [ ] **Step 3: Reescrever as tabs em `status-meta.ts`**

Em `apps/web/src/app/dashboard/orders/status-meta.ts`, substituir o bloco das linhas 6–42 (constantes `DEFAULT_ORDER_TAB`, `ORDER_FLOW_TABS` e `ORDER_FUNNEL_TABS` inteiras) por:

```ts
// Tab default ao abrir /dashboard/orders (fila de entrada: pagos aguardando
// início da separação — startPicking transiciona paid→preparing sozinho).
export const DEFAULT_ORDER_TAB = "paid";

// Fluxo ativo do operador interno (grupo da esquerda na barra de tabs).
// Um chip por status do funil (spec 2026-07-08); a antiga aba agregada
// "A preparar" (paid+preparing) foi dividida em "Pago" e "Em preparação".
export const ORDER_FLOW_TABS = [
	{
		key: "paid",
		label: "Pago",
		statuses: ["paid"] as DbOrderStatus[],
	},
	{
		key: "preparing",
		label: "Em preparação",
		statuses: ["preparing"] as DbOrderStatus[],
	},
	{
		key: "shipped",
		label: "Enviados",
		statuses: ["shipped"] as DbOrderStatus[],
	},
	{
		key: "delivered",
		label: "Entregues",
		statuses: ["delivered"] as DbOrderStatus[],
	},
] as const;

// Chaves antigas que ainda podem chegar por deep-link/bookmark. "to_prepare"
// era a aba agregada pago+preparando; cai na fila de entrada.
const LEGACY_TAB_ALIASES: Record<string, string> = {
	to_prepare: "paid",
};

export function canonicalOrderTabKey(tab?: string): string | undefined {
	if (!tab) {
		return tab;
	}
	return LEGACY_TAB_ALIASES[tab] ?? tab;
}
```

E atualizar a montagem de `ORDER_TABS` (linhas 63–69), que referenciava `ORDER_FUNNEL_TABS`:

```ts
// Lista completa (sem "Todos") — consumida por data/export/KPIs.
export const ORDER_TABS = [...ORDER_FLOW_TABS, ...ORDER_EXCEPTION_TABS];
```

- [ ] **Step 4: Aplicar o alias em `resolveTab` (`data.ts`)**

Em `apps/web/src/app/dashboard/orders/data.ts`:

1. Na linha 39, adicionar `canonicalOrderTabKey` ao import:

```ts
import {
	ALL_ORDERS_TAB,
	canonicalOrderTabKey,
	ORDER_TABS,
} from "./status-meta";
```

2. Substituir a função `resolveTab` (linhas 262–264):

```ts
function resolveTab(tab?: string) {
	const key = canonicalOrderTabKey(tab);
	return ORDER_TABS.find((item) => item.key === key) ?? ALL_ORDERS_TAB;
}
```

- [ ] **Step 5: Rodar o teste e ver passar**

Run: `bun --cwd apps/web test src/app/dashboard/orders/__tests__/status-meta.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 6: Type-check e commit**

```bash
bun check-types --force
git add apps/web/src/app/dashboard/orders/status-meta.ts apps/web/src/app/dashboard/orders/data.ts apps/web/src/app/dashboard/orders/__tests__/status-meta.test.ts
git commit -m "feat: abas de fluxo por status em pedidos"
```

---

### Task 2: Badge único no card de pedido (`displayState`)

**Files:**
- Create: `apps/web/src/app/dashboard/orders/_lib/display-state.ts`
- Modify: `apps/web/src/app/dashboard/orders/_components/order-card.tsx:40-53`
- Test: `apps/web/src/app/dashboard/orders/__tests__/display-state.test.ts` (novo)

**Interfaces:**
- Consumes: `FulfillmentState` de `../../separacao/_lib/picking-logic` (type-only); `OrderStatus` de `../status-meta`.
- Produces: `orderBadgeSource(status: OrderStatus, fulfillmentState: FulfillmentState | null | undefined): "fulfillment" | "status"`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/web/src/app/dashboard/orders/__tests__/display-state.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { orderBadgeSource } from "../_lib/display-state";

describe("orderBadgeSource (badge único, spec 2026-07-08)", () => {
	it("em preparing com sub-estado, o badge é o da separação", () => {
		expect(orderBadgeSource("preparing", "awaiting_picking")).toBe(
			"fulfillment"
		);
		expect(orderBadgeSource("preparing", "picking_in_progress")).toBe(
			"fulfillment"
		);
		expect(orderBadgeSource("preparing", "picking_exception")).toBe(
			"fulfillment"
		);
		expect(orderBadgeSource("preparing", "picked")).toBe("fulfillment");
	});

	it("em preparing sem sub-estado calculado, cai no status", () => {
		expect(orderBadgeSource("preparing", null)).toBe("status");
		expect(orderBadgeSource("preparing", undefined)).toBe("status");
	});

	it("fora de preparing o status manda, mesmo com sub-estado presente", () => {
		expect(orderBadgeSource("paid", "awaiting_picking")).toBe("status");
		expect(orderBadgeSource("shipped", "picked")).toBe("status");
		expect(orderBadgeSource("delivered", null)).toBe("status");
	});
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `bun --cwd apps/web test src/app/dashboard/orders/__tests__/display-state.test.ts`
Expected: FAIL — módulo `../_lib/display-state` não existe.

- [ ] **Step 3: Criar o helper**

Criar `apps/web/src/app/dashboard/orders/_lib/display-state.ts`:

```ts
import type { FulfillmentState } from "../../separacao/_lib/picking-logic";
import type { OrderStatus } from "../status-meta";

// Badge único do card (spec 2026-07-08): dentro de `preparing` o sub-estado
// da separação é mais informativo que o status; fora dele, o status manda.
// Nunca dois badges de estado no mesmo card.
export function orderBadgeSource(
	status: OrderStatus,
	fulfillmentState: FulfillmentState | null | undefined
): "fulfillment" | "status" {
	return status === "preparing" && fulfillmentState ? "fulfillment" : "status";
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `bun --cwd apps/web test src/app/dashboard/orders/__tests__/display-state.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Trocar o badge duplo do card pelo único**

Em `apps/web/src/app/dashboard/orders/_components/order-card.tsx`, adicionar o import:

```ts
import { orderBadgeSource } from "../_lib/display-state";
```

E substituir o bloco de badges (linhas 40–53):

```tsx
				<div className="flex flex-shrink-0 flex-col items-end gap-1">
					{orderBadgeSource(item.status, item.fulfillmentState) ===
						"fulfillment" && item.fulfillmentState ? (
						<Badge
							variant={
								FULFILLMENT_STATE_META[item.fulfillmentState].badgeVariant
							}
						>
							{FULFILLMENT_STATE_META[item.fulfillmentState].label}
						</Badge>
					) : (
						<OrderStatusBadge status={item.status} />
					)}
					{item.shippingUnverified && <ShippingUnverifiedBadge compact />}
				</div>
```

Nota: a condição antiga `item.fulfillmentState !== "awaiting_picking"` some de propósito — `awaiting_picking` agora renderiza (badge "A separar", label ajustado na Task 3). Os imports de `Badge`, `FULFILLMENT_STATE_META`, `OrderStatusBadge` e `ShippingUnverifiedBadge` já existem no arquivo.

- [ ] **Step 6: Type-check, lint e commit**

```bash
bun check-types --force && bun check
git add apps/web/src/app/dashboard/orders/_lib/display-state.ts apps/web/src/app/dashboard/orders/_components/order-card.tsx apps/web/src/app/dashboard/orders/__tests__/display-state.test.ts
git commit -m "feat: badge único de estado no card de pedido"
```

---

### Task 3: Labels do eixo separação (`fulfillment-meta`) + copy de Pedidos

**Files:**
- Modify: `apps/web/src/app/dashboard/separacao/fulfillment-meta.ts:13-17`
- Modify: `apps/web/src/app/dashboard/orders/page.tsx:45,74,109`
- Modify: `apps/web/src/app/dashboard/orders/_components/order-list-filters.tsx:52-54`

**Interfaces:**
- Consumes: nada.
- Produces: `FULFILLMENT_STATE_META.awaiting_picking.label === "A separar"`. Consumidores (order-card, picking-status-card, order-action-column, order-progress sub-label) herdam sem mudança de código.

- [ ] **Step 1: Renomear "Aguardando separação" → "A separar"**

Em `apps/web/src/app/dashboard/separacao/fulfillment-meta.ts`, trocar:

```ts
	awaiting_picking: {
		label: "Aguardando separação",
		iconKey: "clock",
		badgeVariant: "secondary",
	},
```

por:

```ts
	awaiting_picking: {
		label: "A separar",
		iconKey: "clock",
		badgeVariant: "secondary",
	},
```

- [ ] **Step 2: Atualizar copy e comentários de Pedidos**

Em `apps/web/src/app/dashboard/orders/page.tsx`:

- Linha 45: `// Sem ?tab na URL → abre na fila acionável ("A preparar"), não em todos.` → `// Sem ?tab na URL → abre na fila de entrada ("Pago"), não em todos.`
- Linha 74: `// O tab default ("A preparar") não conta como filtro ativo — só desvios dele.` → `// O tab default ("Pago") não conta como filtro ativo — só desvios dele.`
- Linha 109: `"Nenhum pedido aguardando preparação. Use a aba “Todos” para ver o histórico completo."` → `"Nenhum pedido nesta etapa. Use a aba “Todos” para ver o histórico completo."`

Em `apps/web/src/app/dashboard/orders/_components/order-list-filters.tsx`, no comentário das linhas 53–54, trocar `("A preparar")` por `("Pago")`.

- [ ] **Step 3: Suíte + lint**

Run: `bun --cwd apps/web test && bun check`
Expected: PASS / sem erros novos. (Se algum teste existente assertar "Aguardando separação", atualizá-lo para "A separar" — em 2026-07-08 nenhum teste referencia o label.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/separacao/fulfillment-meta.ts apps/web/src/app/dashboard/orders/page.tsx apps/web/src/app/dashboard/orders/_components/order-list-filters.tsx
git commit -m "feat: label A separar e copy da fila de entrada"
```

---

### Task 4: Página Separação — KPI "Em separação" e badge "Separando" removido

**Files:**
- Modify: `apps/web/src/app/dashboard/separacao/page.tsx:63-65`
- Modify: `apps/web/src/app/dashboard/separacao/_components/picking-order-card.tsx:47-75`

**Interfaces:**
- Consumes: nada.
- Produces: nada consumido por outras tasks.

- [ ] **Step 1: KPI do header**

Em `apps/web/src/app/dashboard/separacao/page.tsx`, no bloco de KPIs do `PageHeader` (linhas 59–66), trocar o texto `Em andamento` por `Em separação` (o `div` com `counts.em_separacao`).

- [ ] **Step 2: Remover o badge "Separando"**

Em `apps/web/src/app/dashboard/separacao/_components/picking-order-card.tsx`, na função `StatusBadge`, substituir o branch `em_separacao` (linhas 55–61):

```tsx
	if (tab === "em_separacao") {
		// A aba já diz o estado — badge redundante removido (spec 2026-07-08).
		// O slot de alerta útil ("Parada há X") é renderizado abaixo do meta.
		return null;
	}
```

Os branches `excecoes` ("Exceção") e `a_separar` ("Urgente"/"A separar") ficam como estão.

- [ ] **Step 3: Type-check, lint e commit**

```bash
bun check-types --force && bun check
git add apps/web/src/app/dashboard/separacao/page.tsx apps/web/src/app/dashboard/separacao/_components/picking-order-card.tsx
git commit -m "feat: consolida Em separação na fila de picking"
```

---

### Task 5: Execução — título com número do pedido + copy do cancelamento

**Files:**
- Modify: `apps/web/src/app/dashboard/separacao/data.ts:50-59` (`getOrderBranchId`)
- Modify: `apps/web/src/app/dashboard/separacao/[orderId]/page.tsx:90-95`
- Modify: `apps/web/src/app/dashboard/separacao/_components/picking-execution.tsx` (props, título ~linha 553, dialog ~linhas 741-771)
- Modify: `apps/web/src/app/dashboard/separacao/_components/picking-readonly.tsx` (se contiver a mesma copy de cancelamento — verificar no Step 4)

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `getOrderBranchId` passa a retornar `{ branchId: string | null; number: string; status: OrderStatus } | null`; `PickingExecutionProps` ganha `orderNumber: string`.

- [ ] **Step 1: Expor o número do pedido em `getOrderBranchId`**

Em `apps/web/src/app/dashboard/separacao/data.ts`, substituir a função (linhas 50–59):

```ts
export async function getOrderBranchId(
	orderId: string
): Promise<{
	branchId: string | null;
	number: string;
	status: OrderStatus;
} | null> {
	const [row] = await db
		.select({
			branchId: order.branchId,
			number: order.number,
			status: order.status,
		})
		.from(order)
		.where(eq(order.id, orderId))
		.limit(1);
	return row ?? null;
}
```

- [ ] **Step 2: Passar `orderNumber` na página**

Em `apps/web/src/app/dashboard/separacao/[orderId]/page.tsx`, na instância de `PickingExecution` (linhas 90–95):

```tsx
		return (
			<PickingExecution
				canShip={canShip}
				items={result.items}
				orderNumber={orderRow.number}
				picking={result.picking}
			/>
		);
```

- [ ] **Step 3: Prop + título em `picking-execution.tsx`**

1. Ampliar a interface (linha 479):

```ts
interface PickingExecutionProps {
	canShip: boolean;
	items: OrderPickingItem[];
	orderNumber: string;
	picking: OrderPicking;
}
```

2. Adicionar `orderNumber` ao destructuring do componente (linha 485).

3. No `<h1>` do header (~linha 553), trocar:

```tsx
						<h1 className="font-medium font-serif text-2xl uppercase tracking-[0.015em]">
							Separação em andamento
						</h1>
```

por:

```tsx
						<h1 className="font-medium font-serif text-2xl uppercase tracking-[0.015em]">
							Separação do pedido {orderNumber}
						</h1>
```

- [ ] **Step 4: Copy do dialog de cancelamento**

No mesmo `picking-execution.tsx`, no `AlertDialog` de cancelar (~linhas 741–771), a descrição atual diz:

> A sessão de separação será descartada e as bipagens registradas serão perdidas. O pedido permanece em preparação e pode ser separado novamente. Esta ação não pode ser desfeita.

Trocar a frase do meio, resultado final:

> A sessão de separação será descartada e as bipagens registradas serão perdidas. O pedido volta para a fila A separar. Esta ação não pode ser desfeita.

Depois, varrer o resto do diretório pela mesma copy antiga:

Run: `rg -n "permanece em preparação" /home/othavio/Projects/emach/emach-dashboard/apps/web/src`
Expected: nenhuma ocorrência. Se aparecer em `picking-readonly.tsx` (que também chama `cancelPicking`), aplicar a mesma troca lá.

- [ ] **Step 5: Type-check, lint, testes e commit**

```bash
bun check-types --force && bun check && bun --cwd apps/web test
git add apps/web/src/app/dashboard/separacao/data.ts 'apps/web/src/app/dashboard/separacao/[orderId]/page.tsx' apps/web/src/app/dashboard/separacao/_components/picking-execution.tsx
git commit -m "feat: título com nº do pedido e copy de cancelar"
```

(Incluir `picking-readonly.tsx` no add se foi alterado no Step 4.)

---

### Task 6: Gate final — verify, varredura de termos e smoke visual

**Files:**
- Nenhum novo; verificação.

**Interfaces:**
- Consumes: tudo acima.
- Produces: evidência dos critérios de aceite do spec.

- [ ] **Step 1: Gate integrado**

```bash
bun check-types --force && bun check && bun --cwd apps/web test
```

Expected: os três verdes.

- [ ] **Step 2: Varredura dos termos mortos (critério 3 do spec)**

```bash
rg -n "Em andamento|Separando|Aguardando separação|A preparar" apps/web/src/app/dashboard/orders apps/web/src/app/dashboard/separacao
rg -n "to_prepare" apps/web/src/app/dashboard/orders
```

Expected: primeira busca sem hits (fora de arquivos `__tests__` que testem o alias); segunda só o `LEGACY_TAB_ALIASES` em `status-meta.ts` (e o teste). Qualquer outro hit = superfície esquecida → corrigir.

- [ ] **Step 3: Smoke visual (dev já roda na porta 3006)**

`bun check-types` não pega SQL inválido nem import de hook client em Server Component. Visitar no browser e conferir:

1. `http://localhost:3006/dashboard/orders` — abre na aba **Pago** com contagens; grupo esquerdo = Pago · Em preparação · Enviados · Entregues.
2. `?tab=preparing` — cards com **badge único** (A separar / Em separação / Separado), nunca dois badges de estado.
3. `?tab=to_prepare` — resolve para a aba Pago sem erro.
4. `http://localhost:3006/dashboard/separacao` — KPIs "A separar / Em separação / Exceções"; cards da aba Em separação **sem** badge "Separando" (só "Parada há X" quando aplicável).
5. Abrir uma execução de separação — título "Separação do pedido EM-XXXX"; abrir o dialog de cancelar e conferir a copy nova (fechar com "Voltar", **não** confirmar).

Se algo quebrar em runtime: `nextjs_call 3006 get_errors` (MCP next-devtools) para o stack trace.

- [ ] **Step 4: Screenshot lado a lado**

Capturar `/dashboard/orders?tab=preparing` e `/dashboard/separacao?tab=em_separacao` e comparar com o mockup aprovado (opção A) — badge único, termos canônicos. Reportar com as imagens.
