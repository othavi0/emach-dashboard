# Order — Eixo Único de Status (ADR-0005) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Colapsar os dois eixos de estado do pedido (`status` logístico + `paymentStatus` financeiro) num único enum `order_status`, conforme ADR-0005.

**Architecture:** O enum `order_status` ganha `payment_failed` e `returned` (9 estados). A coluna e o enum `payment_status` são removidos. `VALID_TRANSITIONS` passa a implementar a máquina linear do ADR. A devolução física ao estoque passa a disparar em `canceled` + `returned` (não mais `refunded` — `refunded` vira evento puramente financeiro). Elegibilidade de avaliação passa a usar `paid_at IS NOT NULL`.

**Tech Stack:** Next 16 / React 19, Drizzle 0.45 + Postgres (Supabase), Zod, Vitest, Biome/Ultracite.

---

## Decisões fechadas (do issue #40 + ADR-0005 + alinhamento com o usuário)

| Decisão | Valor |
|---|---|
| Máquina de estados | `pending_payment → paid \| payment_failed \| canceled`; `payment_failed → pending_payment \| canceled`; `paid → preparing \| refunded`; `preparing → shipped \| refunded`; `shipped → delivered \| refunded`; `delivered → returned`; `returned → refunded`; `canceled`/`refunded` terminais |
| Gatilho de devolução ao estoque (`applyStockReturns`) | dispara em `returned` e `canceled` (NÃO em `refunded`) |
| `capForStatus` | `canceled → orders.cancel`; `refunded → orders.refund`; restante (incl. `payment_failed`, `returned`) → `orders.update_status` |
| Elegibilidade de avaliação | `paid_at IS NOT NULL` (independente do status atual) |
| `STATUS_TIMESTAMP_MAP` | mantém `paid/shipped/delivered/canceled`; remove a entrada `refunded`; `payment_failed`/`returned` sem coluna de timestamp (não há coluna; fora do escopo adicionar) |

## Coordenação externa (callout, não é tarefa de código)

A coluna `order.payment_status` é compartilhada com o app e-commerce (DB compartilhada). Após o merge, o repo `emach-ecommerce` precisa parar de escrever `payment_status` e dirigir o pedido até `paid`/`payment_failed` via `status`. Não há `docs/integration/admin-ecommerce.md` no repo no momento (CLAUDE.md referencia, mas o arquivo não existe) — então **não há doc para editar**; basta registrar a mudança de contrato no corpo do PR.

## Nota sobre `bun check-types` intermediário

A Task 1 amplia o enum `OrderStatus` para 9 valores. Vários mapas `Record<OrderStatus, …>` (em `status-meta.ts`, `order-status-badge.tsx`) ficam incompletos até serem atualizados (Tasks 4–5), e remover `paymentStatusEnum` só acontece na Task 11. **Portanto `bun check-types` só passa 100% na Task 12.** Cada commit intermediário é uma fatia coerente por camada — isso é aceitável numa migração de enum fortemente acoplada. Não tente "consertar" type-check no meio.

---

## File Structure

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `packages/db/src/schema/orders.ts` | Schema Drizzle do pedido | Modify (enum +2 valores; remover `payment_status` col + enum) |
| `apps/web/src/app/dashboard/orders/schema.ts` | `VALID_TRANSITIONS`, `capForStatus`, Zod schemas, filtros | Modify |
| `apps/web/src/app/dashboard/orders/actions.ts` | Server actions de pedido | Modify |
| `apps/web/src/app/dashboard/orders/status-meta.ts` | Labels, tabs | Modify |
| `apps/web/src/app/dashboard/orders/_components/order-status-badge.tsx` | Badge de status | Modify |
| `apps/web/src/app/dashboard/orders/data.ts` | Queries SSR de pedido | Modify |
| `packages/db/src/queries/reviews.ts` | `canCreateReview` (compartilhada) | Modify |
| `apps/web/src/app/dashboard/orders/export/route.ts` | Export CSV | Modify |
| `apps/web/src/app/dashboard/orders/_components/stock-return-dialog.tsx` | Dialog de devolução ao estoque | Modify |
| `apps/web/src/app/dashboard/orders/_components/refund-dialog.tsx` | Dialog de reembolso (financeiro) | **Create** |
| `apps/web/src/app/dashboard/orders/_components/order-actions-panel.tsx` | Painel de ações do detalhe | Modify |
| `apps/web/src/app/dashboard/orders/_components/order-detail-info.tsx` | Card de detalhe do pedido | Modify |
| `apps/web/__tests__/order-transitions.test.ts` | Teste da máquina de estados | **Create** |
| `packages/db/src/migrations/<gerado>.sql` | Migration versionada | **Create** (via `db:generate`) |

---

### Task 1: Ampliar o enum `order_status` no schema Drizzle

**Files:**
- Modify: `packages/db/src/schema/orders.ts:22-30`

- [ ] **Step 1: Adicionar os dois valores novos ao enum**

Em `packages/db/src/schema/orders.ts`, substituir o bloco do enum `orderStatusEnum` por:

```ts
export const orderStatusEnum = pgEnum("order_status", [
	"pending_payment",
	"paid",
	"preparing",
	"shipped",
	"delivered",
	"canceled",
	"refunded",
	"payment_failed",
	"returned",
]);
export type OrderStatus = (typeof orderStatusEnum.enumValues)[number];
```

> Não tocar em `paymentStatusEnum` nem na coluna `payment_status` ainda — isso sai na Task 11, depois que todos os consumidores pararem de usá-la.

- [ ] **Step 2: Verificar que o pacote db ainda compila isoladamente**

Run: `bun --cwd packages/db check-types`
Expected: PASS (mudança puramente aditiva no pacote db).

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema/orders.ts
git commit -m "feat: adiciona payment_failed e returned ao order_status"
```

---

### Task 2: Teste da máquina de estados (RED)

**Files:**
- Create: `apps/web/__tests__/order-transitions.test.ts`

- [ ] **Step 1: Escrever o teste falho**

Criar `apps/web/__tests__/order-transitions.test.ts`:

```ts
import { orderStatusEnum } from "@emach/db/schema/orders";
import { describe, expect, it } from "vitest";
import {
	capForStatus,
	VALID_TRANSITIONS,
} from "../src/app/dashboard/orders/schema";

describe("VALID_TRANSITIONS", () => {
	it("cobre exatamente os 9 estados do order_status", () => {
		expect(Object.keys(VALID_TRANSITIONS).sort()).toEqual(
			[...orderStatusEnum.enumValues].sort()
		);
	});

	it("implementa a máquina de estados do ADR-0005", () => {
		expect(VALID_TRANSITIONS).toEqual({
			pending_payment: ["paid", "payment_failed", "canceled"],
			payment_failed: ["pending_payment", "canceled"],
			paid: ["preparing", "refunded"],
			preparing: ["shipped", "refunded"],
			shipped: ["delivered", "refunded"],
			delivered: ["returned"],
			returned: ["refunded"],
			canceled: [],
			refunded: [],
		});
	});

	it("toda transição alvo é um estado válido", () => {
		const valid = new Set<string>(orderStatusEnum.enumValues);
		for (const targets of Object.values(VALID_TRANSITIONS)) {
			for (const target of targets) {
				expect(valid.has(target)).toBe(true);
			}
		}
	});
});

describe("capForStatus", () => {
	it("canceled exige orders.cancel", () => {
		expect(capForStatus("canceled")).toBe("orders.cancel");
	});

	it("refunded exige orders.refund", () => {
		expect(capForStatus("refunded")).toBe("orders.refund");
	});

	it.each([
		"pending_payment",
		"paid",
		"preparing",
		"shipped",
		"delivered",
		"payment_failed",
		"returned",
	] as const)("%s exige orders.update_status", (status) => {
		expect(capForStatus(status)).toBe("orders.update_status");
	});
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `bun --cwd apps/web test order-transitions`
Expected: FAIL — `capForStatus` ainda não é exportado de `schema.ts`, e `VALID_TRANSITIONS` ainda tem a máquina antiga.

- [ ] **Step 3: Commit**

```bash
git add apps/web/__tests__/order-transitions.test.ts
git commit -m "test: cobre maquina de estados do order (RED)"
```

---

### Task 3: Reescrever `schema.ts` da feature orders (GREEN)

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/schema.ts`

- [ ] **Step 1: Reescrever o arquivo**

Substituir o conteúdo de `apps/web/src/app/dashboard/orders/schema.ts` por:

```ts
import type { OrderStatus } from "@emach/db/schema/orders";
import { orderStatusEnum } from "@emach/db/schema/orders";
import { z } from "zod";

const isoDate = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (YYYY-MM-DD)")
	.optional();

export const ordersListFiltersSchema = z
	.object({
		tab: z.string().optional(),
		q: z.string().trim().max(100).optional(),
		from: isoDate,
		to: isoDate,
		branchId: z.string().uuid().optional(),
		page: z.coerce.number().int().min(1).default(1),
		pageSize: z.coerce.number().int().min(1).max(100).default(20),
	})
	.superRefine((data, ctx) => {
		if (data.from && data.to && data.to < data.from) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Data 'até' deve ser >= 'de'",
				path: ["to"],
			});
		}
	});

export type OrdersListFiltersInput = z.input<typeof ordersListFiltersSchema>;
export type OrdersListFiltersParsed = z.infer<typeof ordersListFiltersSchema>;

export const ALL_ORDER_STATUSES = orderStatusEnum.enumValues;

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
	pending_payment: ["paid", "payment_failed", "canceled"],
	payment_failed: ["pending_payment", "canceled"],
	paid: ["preparing", "refunded"],
	preparing: ["shipped", "refunded"],
	shipped: ["delivered", "refunded"],
	delivered: ["returned"],
	returned: ["refunded"],
	canceled: [],
	refunded: [],
};

export { VALID_TRANSITIONS };

export type OrderStatusCapability =
	| "orders.cancel"
	| "orders.refund"
	| "orders.update_status";

export function capForStatus(toStatus: OrderStatus): OrderStatusCapability {
	if (toStatus === "canceled") {
		return "orders.cancel";
	}
	if (toStatus === "refunded") {
		return "orders.refund";
	}
	return "orders.update_status";
}

export const updateOrderStatusSchema = z
	.object({
		orderId: z.string().uuid(),
		toStatus: z.enum(orderStatusEnum.enumValues),
		reason: z.string().max(500).optional(),
		trackingCode: z.string().trim().min(1).max(200).optional(),
		branchId: z.string().uuid().optional(),
		returnItems: z
			.array(
				z.object({
					orderItemId: z.string().uuid(),
					branchId: z.string().uuid(),
				})
			)
			.optional(),
	})
	.superRefine((data, ctx) => {
		if (data.toStatus === "shipped" && !data.trackingCode) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Código de rastreio obrigatório ao marcar como enviado",
				path: ["trackingCode"],
			});
		}
	});

export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;

export const addOrderNoteSchema = z.object({
	orderId: z.string().uuid(),
	body: z.string().trim().min(1).max(2000),
});

export type AddOrderNoteInput = z.infer<typeof addOrderNoteSchema>;

export const assignBranchSchema = z.object({
	orderId: z.string().uuid(),
	branchId: z.string().uuid(),
});

export type AssignBranchInput = z.infer<typeof assignBranchSchema>;

export const updateTrackingCodeSchema = z.object({
	orderId: z.string().uuid(),
	trackingCode: z.string().trim().min(1).max(200),
});

export type UpdateTrackingCodeInput = z.infer<typeof updateTrackingCodeSchema>;
```

Mudanças em relação ao original: removido o import de `paymentStatusEnum`; removido o campo `paymentStatus` do filtro; removido `ALL_PAYMENT_STATUSES`; `VALID_TRANSITIONS` reescrito; `capForStatus` + `OrderStatusCapability` adicionados (movidos de `actions.ts` para poderem ser testados — `actions.ts` é `"use server"` e não pode exportar função síncrona); `updateOrderStatusSchema.toStatus` agora deriva de `orderStatusEnum.enumValues` (antes era um array hardcoded de 7 strings).

- [ ] **Step 2: Rodar o teste e confirmar que passa**

Run: `bun --cwd apps/web test order-transitions`
Expected: PASS — todos os casos verdes.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/orders/schema.ts
git commit -m "feat: reescreve maquina de estados do order (eixo unico)"
```

---

### Task 4: Atualizar `actions.ts`

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/actions.ts:24-67,191-197`

- [ ] **Step 1: Importar `capForStatus` de `./schema` e remover a definição local**

No bloco de import de `./schema` (linhas 24-34), adicionar `capForStatus`:

```ts
import {
	type AddOrderNoteInput,
	type AssignBranchInput,
	addOrderNoteSchema,
	assignBranchSchema,
	capForStatus,
	type UpdateOrderStatusInput,
	type UpdateTrackingCodeInput,
	updateOrderStatusSchema,
	updateTrackingCodeSchema,
	VALID_TRANSITIONS,
} from "./schema";
```

Remover por completo a função local `capForStatus` (linhas 57-67 do original):

```ts
// REMOVER este bloco inteiro:
function capForStatus(
	toStatus: OrderStatus
): "orders.update_status" | "orders.cancel" | "orders.refund" {
	if (toStatus === "canceled") {
		return "orders.cancel";
	}
	if (toStatus === "refunded") {
		return "orders.refund";
	}
	return "orders.update_status";
}
```

- [ ] **Step 2: Atualizar `STATUS_TIMESTAMP_MAP`**

Substituir o objeto `STATUS_TIMESTAMP_MAP` (linhas 49-55 do original) por:

```ts
const STATUS_TIMESTAMP_MAP: Partial<Record<OrderStatus, string>> = {
	paid: "paidAt",
	shipped: "shippedAt",
	delivered: "deliveredAt",
	canceled: "canceledAt",
};
```

Removida a entrada `refunded: "canceledAt"` — `refunded` é evento financeiro e a tabela `order` não tem coluna de timestamp própria para ele; o histórico em `order_status_history` registra o instante da transição.

- [ ] **Step 3: Atualizar o gatilho de devolução ao estoque**

Em `updateOrderStatus`, substituir a condição que chama `applyStockReturns` (linhas 191-197 do original):

```ts
if (
	(toStatus === "canceled" || toStatus === "returned") &&
	returnItems &&
	returnItems.length > 0
) {
	await applyStockReturns(tx, orderId, returnItems, session.user.id);
}
```

> Comentário a manter/ajustar no `reasonNote` dentro de `applyStockReturns` (linha ~125): trocar `"Devolução ao estoque — pedido cancelado/reembolsado"` por `"Devolução ao estoque — pedido cancelado/devolvido"`.

- [ ] **Step 4: Verificar tipos do arquivo**

Run: `bun --cwd apps/web check-types 2>&1 | grep -E "actions\.ts" || echo "sem erros em actions.ts"`
Expected: `sem erros em actions.ts` (erros em outros arquivos da feature ainda são esperados — ver nota no topo do plano).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/orders/actions.ts
git commit -m "feat: atualiza updateOrderStatus para eixo unico de status"
```

---

### Task 5: Atualizar `status-meta.ts` e `order-status-badge.tsx`

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/status-meta.ts`
- Modify: `apps/web/src/app/dashboard/orders/_components/order-status-badge.tsx`

- [ ] **Step 1: Atualizar `ORDER_TABS` e `ORDER_STATUS_LABELS`**

Em `status-meta.ts`, substituir o array `ORDER_TABS` e o objeto `ORDER_STATUS_LABELS` por:

```ts
export const ORDER_TABS = [
	{
		key: "all",
		label: "Todos",
		statuses: null,
	},
	{
		key: "pending_payment",
		label: "Aguardando pgto",
		statuses: ["pending_payment", "payment_failed"] as DbOrderStatus[],
	},
	{
		key: "paid",
		label: "Pagos",
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
	{
		key: "returned",
		label: "Devolvidos",
		statuses: ["returned"] as DbOrderStatus[],
	},
	{
		key: "canceled",
		label: "Cancelados",
		statuses: ["canceled", "refunded"] as DbOrderStatus[],
	},
] as const;

export const ORDER_STATUS_LABELS: Record<DbOrderStatus, string> = {
	pending_payment: "Aguardando pgto",
	payment_failed: "Pagamento falhou",
	paid: "Pago",
	preparing: "Em preparação",
	shipped: "Enviado",
	delivered: "Entregue",
	returned: "Devolvido",
	canceled: "Cancelado",
	refunded: "Reembolsado",
};
```

`payment_failed` entra na aba "Aguardando pgto" (pagamento pendente de resolução); `returned` ganha aba própria "Devolvidos" (operacionalmente ativo, aguardando reembolso).

- [ ] **Step 2: Atualizar `order-status-badge.tsx`**

Substituir o conteúdo de `_components/order-status-badge.tsx` por:

```tsx
import { Badge } from "@emach/ui/components/badge";
import {
	BanIcon,
	CheckCheckIcon,
	CheckIcon,
	ClockIcon,
	PackageIcon,
	RotateCcwIcon,
	TruckIcon,
	Undo2Icon,
	XCircleIcon,
} from "lucide-react";

import { ORDER_STATUS_LABELS, type OrderStatus } from "../status-meta";

const STATUS_VARIANTS: Record<
	OrderStatus,
	"destructive" | "info" | "success" | "warning"
> = {
	pending_payment: "warning",
	payment_failed: "destructive",
	paid: "success",
	preparing: "info",
	shipped: "info",
	delivered: "success",
	returned: "warning",
	canceled: "destructive",
	refunded: "destructive",
};

const STATUS_ICONS: Record<OrderStatus, typeof ClockIcon> = {
	pending_payment: ClockIcon,
	payment_failed: BanIcon,
	paid: CheckIcon,
	preparing: PackageIcon,
	shipped: TruckIcon,
	delivered: CheckCheckIcon,
	returned: Undo2Icon,
	canceled: XCircleIcon,
	refunded: RotateCcwIcon,
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
	const Icon = STATUS_ICONS[status];
	return (
		<Badge variant={STATUS_VARIANTS[status]}>
			<Icon aria-hidden="true" />
			{ORDER_STATUS_LABELS[status]}
		</Badge>
	);
}
```

`payment_failed` → `destructive` + `BanIcon`; `returned` → `warning` (aguarda reembolso, não encerrado) + `Undo2Icon`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/orders/status-meta.ts apps/web/src/app/dashboard/orders/_components/order-status-badge.tsx
git commit -m "feat: cobre 9 estados em labels, tabs e badge do order"
```

---

### Task 6: Atualizar `data.ts` (queries SSR)

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/data.ts` (interface `OrderDetail`; `getOrderReviewsOverview`; `getOrderDetail`)

- [ ] **Step 1: Remover `paymentStatus` da interface `OrderDetail`**

Na interface `OrderDetail`, remover a linha:

```ts
	paymentStatus: string;
```

- [ ] **Step 2: Atualizar `getOrderReviewsOverview`**

No `db.execute` de `getOrderReviewsOverview`, na CTE `order_meta`, trocar:

```sql
SELECT id, payment_status, paid_at,
	(paid_at + interval '90 days') AS review_deadline
FROM "order" WHERE id = ${orderId}
```

por:

```sql
SELECT id, paid_at,
	(paid_at + interval '90 days') AS review_deadline
FROM "order" WHERE id = ${orderId}
```

E na expressão `CASE` do `review_state`, trocar:

```sql
WHEN om.payment_status <> 'paid' OR om.paid_at IS NULL THEN 'order_not_paid'
```

por:

```sql
WHEN om.paid_at IS NULL THEN 'order_not_paid'
```

- [ ] **Step 3: Atualizar `getOrderDetail`**

No `db.execute` de `getOrderDetail`:
- No tipo genérico do `db.execute<{...}>`, remover a linha `payment_status: string;`.
- No `SELECT`, remover a linha `o.payment_status,`.
- No objeto de retorno, remover a linha `paymentStatus: row.payment_status,`.

- [ ] **Step 4: Verificar tipos do arquivo**

Run: `bun --cwd apps/web check-types 2>&1 | grep -E "orders/data\.ts" || echo "sem erros em data.ts"`
Expected: `sem erros em data.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/orders/data.ts
git commit -m "refactor: remove payment_status das queries de order"
```

---

### Task 7: Atualizar `reviews.ts` (query compartilhada)

**Files:**
- Modify: `packages/db/src/queries/reviews.ts:35-53`

- [ ] **Step 1: Remover `paymentStatus` do `select` e ajustar o guard**

No `canCreateReview`, trocar o `select` do pedido:

```ts
	const [ord] = await db
		.select({
			id: order.id,
			clientId: order.clientId,
			paidAt: order.paidAt,
		})
		.from(order)
		.where(eq(order.id, orderId))
		.limit(1);
```

E trocar o guard de pagamento:

```ts
	if (!ord.paidAt) {
		return { ok: false, reason: "not_paid" };
	}
```

(antes era `if (ord.paymentStatus !== "paid" || !ord.paidAt)`). O tipo `CanCreateReviewReason` permanece igual — `not_paid` continua válido.

- [ ] **Step 2: Verificar tipos do pacote db**

Run: `bun --cwd packages/db check-types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/queries/reviews.ts
git commit -m "refactor: canCreateReview usa paidAt em vez de payment_status"
```

> **Sync com ecommerce:** `packages/db/src/queries/*.ts` é owned-by-dashboard e copiado byte-a-byte para o repo `emach-ecommerce`. Registrar no PR que `reviews.ts` mudou.

---

### Task 8: Atualizar `export/route.ts`

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/export/route.ts`

- [ ] **Step 1: Remover `payment_status` da lista de colunas do CSV**

No array `COLUMNS`, remover a string `"payment_status",`.

- [ ] **Step 2: Remover o filtro `paymentStatus`**

Remover o bloco (linhas ~101-103):

```ts
if (filters.paymentStatus) {
	conditions.push(sql`o.payment_status = ${filters.paymentStatus}`);
}
```

- [ ] **Step 3: Remover `payment_status` da query e do mapeamento de linha**

No `db.execute<{...}>`:
- No tipo genérico, remover a linha `payment_status: string;`.
- No `SELECT`, remover a linha `o.payment_status,`.
- No `encodeRow([...])`, remover a entrada `r.payment_status,`.

- [ ] **Step 4: Verificar tipos do arquivo**

Run: `bun --cwd apps/web check-types 2>&1 | grep -E "export/route\.ts" || echo "sem erros em route.ts"`
Expected: `sem erros em route.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/orders/export/route.ts
git commit -m "refactor: remove payment_status do export CSV de orders"
```

---

### Task 9: `stock-return-dialog.tsx` (devolução) + `refund-dialog.tsx` (reembolso)

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/_components/stock-return-dialog.tsx`
- Create: `apps/web/src/app/dashboard/orders/_components/refund-dialog.tsx`

- [ ] **Step 1: Ajustar `stock-return-dialog.tsx` para `canceled | returned`**

No `StockReturnDialogProps`, trocar o tipo de `toStatus`:

```ts
	toStatus: Extract<OrderStatus, "canceled" | "returned">;
```

No `handleConfirm`, trocar o toast de sucesso:

```ts
				toast.success(
					toStatus === "canceled" ? "Pedido cancelado" : "Devolução registrada"
				);
```

(Resto do componente — seleção de itens, filial de retorno, motivo — permanece igual; ele já é exatamente o fluxo de devolução ao estoque.)

- [ ] **Step 2: Criar `refund-dialog.tsx`**

Criar `apps/web/src/app/dashboard/orders/_components/refund-dialog.tsx`:

```tsx
"use client";

import { Button } from "@emach/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@emach/ui/components/dialog";
import { Spinner } from "@emach/ui/components/spinner";
import { Textarea } from "@emach/ui/components/textarea";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateOrderStatus } from "../actions";

interface RefundDialogProps {
	orderId: string;
}

export function RefundDialog({ orderId }: RefundDialogProps) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [reason, setReason] = useState("");
	const [isPending, startTransition] = useTransition();

	function handleConfirm() {
		startTransition(async () => {
			const result = await updateOrderStatus({
				orderId,
				toStatus: "refunded",
				reason: reason.trim() || undefined,
			});
			if (!result.ok) {
				toast.error(result.error);
				return;
			}
			toast.success("Pedido reembolsado");
			setOpen(false);
			router.refresh();
		});
	}

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger render={<Button variant="outline" />}>
				Marcar como reembolsado
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Reembolsar pedido</DialogTitle>
					<DialogDescription>
						Encerramento financeiro do pedido. Não altera estoque — a devolução
						física é registrada à parte pelo estado "Devolvido".
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-1">
					<label
						className="text-muted-foreground text-xs"
						htmlFor="refund-reason"
					>
						Motivo interno
					</label>
					<Textarea
						id="refund-reason"
						onChange={(event) => setReason(event.target.value)}
						placeholder="Ex: estorno integral solicitado pelo cliente."
						value={reason}
					/>
				</div>

				<DialogFooter>
					<Button
						disabled={isPending}
						onClick={() => setOpen(false)}
						variant="ghost"
					>
						Cancelar
					</Button>
					<Button
						disabled={isPending}
						onClick={handleConfirm}
						variant="default"
					>
						{isPending ? (
							<>
								<Spinner /> Salvando…
							</>
						) : (
							"Confirmar reembolso"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
```

- [ ] **Step 3: Verificar tipos**

Run: `bun --cwd apps/web check-types 2>&1 | grep -E "stock-return-dialog|refund-dialog" || echo "sem erros nos dialogs"`
Expected: `sem erros nos dialogs`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/orders/_components/stock-return-dialog.tsx apps/web/src/app/dashboard/orders/_components/refund-dialog.tsx
git commit -m "feat: dialogs de devolucao (returned) e reembolso (refunded)"
```

---

### Task 10: Atualizar `order-actions-panel.tsx` e `order-detail-info.tsx`

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/_components/order-actions-panel.tsx`
- Modify: `apps/web/src/app/dashboard/orders/_components/order-detail-info.tsx`

- [ ] **Step 1: Importar `RefundDialog` no painel**

Em `order-actions-panel.tsx`, ao lado do import de `StockReturnDialog`, adicionar:

```ts
import { RefundDialog } from "./refund-dialog";
import { StockReturnDialog } from "./stock-return-dialog";
```

- [ ] **Step 2: Atualizar `PRIMARY_TRANSITION` e `canDoPrimaryTransition`**

Substituir o objeto `PRIMARY_TRANSITION`:

```ts
const PRIMARY_TRANSITION: Partial<Record<OrderStatus, OrderStatus>> = {
	pending_payment: "canceled",
	payment_failed: "canceled",
	paid: "preparing",
	preparing: "shipped",
	shipped: "delivered",
};
```

`delivered → returned` e `returned → refunded` ficam **fora** da ação primária: ambos exigem dialog dedicado (devolução com itens/filial; reembolso com motivo) e são tratados no card "Exceções".

Substituir a linha `canDoPrimaryTransition`:

```ts
	const canDoPrimaryTransition =
		nextStatus === "canceled" ? canCancel : canUpdateStatus;
```

(o único `nextStatus` possível agora além dos de update é `canceled`; `refunded` nunca é primário — a expressão atual já cobre.)

- [ ] **Step 3: Corrigir o texto de fallback de "Próxima ação"**

Logo após `const nextStatus = PRIMARY_TRANSITION[order.status];`, adicionar:

```ts
	const isTerminal =
		order.status === "canceled" || order.status === "refunded";
```

No JSX, no ramo `else` do `{nextStatus ? (...) : (...)}`, substituir o parágrafo por:

```tsx
					<p className="text-muted-foreground text-sm">
						{isTerminal
							? "Este pedido já está em estado final."
							: "Sem ação primária — use o painel de exceções abaixo."}
					</p>
```

- [ ] **Step 4: Reescrever o card "Exceções"**

Substituir o `<CardContent>` do card "Exceções" por:

```tsx
				<CardContent className="flex flex-wrap gap-2">
					{canCancel &&
						(order.status === "pending_payment" ||
							order.status === "payment_failed") && (
							<StockReturnDialog
								branches={branches}
								currentBranchId={order.branchId}
								items={order.items}
								orderId={order.id}
								toStatus="canceled"
								triggerLabel="Cancelar pedido"
							/>
						)}
					{canUpdateStatus && order.status === "delivered" && (
						<StockReturnDialog
							branches={branches}
							currentBranchId={order.branchId}
							items={order.items}
							orderId={order.id}
							toStatus="returned"
							triggerLabel="Registrar devolução"
						/>
					)}
					{canRefund &&
						(order.status === "paid" ||
							order.status === "preparing" ||
							order.status === "shipped" ||
							order.status === "returned") && <RefundDialog orderId={order.id} />}
				</CardContent>
```

E ajustar a `<CardDescription>` do card "Exceções" para:

```tsx
					<CardDescription>
						Cancelamento, devolução ao estoque e reembolso fora do fluxo
						principal.
					</CardDescription>
```

- [ ] **Step 5: Remover a linha de `paymentStatus` em `order-detail-info.tsx`**

No card "Pagamento" de `order-detail-info.tsx`, remover o bloco:

```tsx
						<p>
							<strong>Status:</strong> {order.paymentStatus}
						</p>
```

(Os campos `Método`, `Ref. gateway`, `Subtotal`, `Total` permanecem — `payment_method` e `payment_provider_ref` não são removidos.)

- [ ] **Step 6: Verificar tipos**

Run: `bun --cwd apps/web check-types 2>&1 | grep -E "order-actions-panel|order-detail-info" || echo "sem erros nos componentes"`
Expected: `sem erros nos componentes`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/orders/_components/order-actions-panel.tsx apps/web/src/app/dashboard/orders/_components/order-detail-info.tsx
git commit -m "feat: painel de acoes do order cobre devolucao e reembolso"
```

---

### Task 11: Remover a coluna/enum `payment_status` do schema e gerar a migration

**Files:**
- Modify: `packages/db/src/schema/orders.ts` (remover `paymentStatusEnum`, `PaymentStatus`, coluna `paymentStatus`)
- Create: `packages/db/src/migrations/<gerado>.sql` (+ atualização de `meta/`)

- [ ] **Step 1: Remover o enum e o tipo `payment_status`**

Em `packages/db/src/schema/orders.ts`, remover o bloco inteiro:

```ts
// REMOVER:
export const paymentStatusEnum = pgEnum("payment_status", [
	"pending",
	"authorized",
	"paid",
	"failed",
	"refunded",
]);
export type PaymentStatus = (typeof paymentStatusEnum.enumValues)[number];
```

- [ ] **Step 2: Remover a coluna `paymentStatus` da tabela `order`**

Na definição da tabela `order`, remover o bloco:

```ts
// REMOVER:
		paymentStatus: paymentStatusEnum("payment_status")
			.notNull()
			.default("pending"),
```

(Manter `paymentMethod` e `paymentProviderRef`.)

- [ ] **Step 3: Gerar a migration**

Run: `bun db:generate`
Expected: cria um arquivo `.sql` novo em `packages/db/src/migrations/`. Inspecionar o conteúdo — deve conter **apenas**:

```sql
ALTER TYPE "public"."order_status" ADD VALUE 'payment_failed';
ALTER TYPE "public"."order_status" ADD VALUE 'returned';
ALTER TABLE "order" DROP COLUMN "payment_status";
DROP TYPE "public"."payment_status";
```

⚠️ Se o SQL gerado contiver mudanças **não relacionadas** a `order_status`/`payment_status` (drift de snapshot por uso anterior de `db:push`), **parar e reportar** — não aplicar uma migration com diffs alheios. Nesse caso, o caminho é editar o SQL gerado para conter só os 4 statements acima.

- [ ] **Step 4: Aplicar no banco de dev**

Run: `bun db:migrate`
Expected: migration aplicada sem erro.

Em seguida, reaplicar triggers (convenção do repo após qualquer migrate):

Run: `bun --cwd packages/db db:apply-triggers`
Expected: PASS (idempotente).

> Se `bun db:migrate` falhar por divergência de histórico de migrations no banco de dev, usar `bun db:push` para sincronizar o banco de dev (caminho de dev documentado em `packages/db/CLAUDE.md`) — o arquivo de migration versionado gerado no Step 3 continua sendo o artefato a commitar para staging/prod.

- [ ] **Step 5: Verificar tipos do pacote db**

Run: `bun --cwd packages/db check-types`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema/orders.ts packages/db/src/migrations/
git commit -m "feat: remove coluna e enum payment_status (eixo unico)"
```

---

### Task 12: Verificação final

**Files:** nenhum (apenas verificação).

- [ ] **Step 1: Type-check do monorepo inteiro**

Run: `bun check-types`
Expected: PASS em todos os workspaces. Não deve sobrar nenhuma referência a `paymentStatus`/`payment_status`.

- [ ] **Step 2: Lint/format**

Run: `bun check`
Expected: PASS (sem erros de Biome/Ultracite).

- [ ] **Step 3: Rodar a suíte de testes**

Run: `bun --cwd apps/web test`
Expected: PASS — incluindo `order-transitions.test.ts` e `permissions.test.ts`.

- [ ] **Step 4: Confirmar que não restou nenhuma referência órfã**

Run: `grep -rn "paymentStatus\|payment_status\|paymentStatusEnum\|PaymentStatus\|ALL_PAYMENT_STATUSES" --include="*.ts" --include="*.tsx" apps packages`
Expected: nenhum resultado (exit code 1).

- [ ] **Step 5: Smoke run-time**

Run: `bun dev:web` (em background) e visitar:
- `/dashboard/orders` — lista carrega; abas incluem "Devolvidos".
- `/dashboard/orders/<id>` de um pedido — detalhe carrega; card "Pagamento" sem a linha "Status"; painel de ações coerente com o estado.
- `/dashboard/orders/export` (com filtros) — CSV baixa sem a coluna `payment_status`.

Para stack trace de erro SSR: `nextjs_call <port> get_errors` (MCP `next-devtools`).
Expected: nenhuma das rotas lança erro de SQL/coluna inexistente.

- [ ] **Step 6: Commit final (se houve ajuste de lint/format)**

```bash
git add -A
git commit -m "chore: ajustes de lint pos-migracao de status do order"
```

---

## Self-Review

**Spec coverage (acceptance criteria do issue #40):**
- ✅ Enum `order_status` inclui `payment_failed` e `returned` — Task 1.
- ✅ Coluna e enum `payment_status` removidos — Task 11.
- ✅ `VALID_TRANSITIONS` reescrito conforme a máquina — Task 3 (validado por teste na Task 2).
- ✅ `updateOrderStatus`, `capForStatus`, `STATUS_TIMESTAMP_MAP` atualizados — Tasks 3 (`capForStatus`) e 4 (`updateOrderStatus`, `STATUS_TIMESTAMP_MAP`).
- ✅ Filtro `paymentStatus` removido de `ordersListFiltersSchema` e da UI — Task 3 (schema) e Task 8 (export, único consumidor; nenhum componente de filtro de lista referenciava `paymentStatus`, confirmado por grep).
- ✅ Badges (`status-meta.ts` + `order-status-badge.tsx`) cobrem os 9 estados — Task 5.
- ✅ `bun check-types` e `bun check` passam — Task 12.
- ✅ Migration Drizzle — Task 11.

**Consistência de tipos:** `OrderStatus` (9 valores) usado de forma exaustiva em `VALID_TRANSITIONS`, `ORDER_STATUS_LABELS`, `STATUS_VARIANTS`, `STATUS_ICONS`; `OrderStatusCapability` definido na Task 3 e consumido na Task 4; `capForStatus` movido para `schema.ts` (Task 3) e importado em `actions.ts` (Task 4) e no teste (Task 2).

**Itens fora do escopo do issue mas necessários para a máquina ser operável** (incluídos): `order-actions-panel.tsx`, `stock-return-dialog.tsx`, novo `refund-dialog.tsx`, `order-detail-info.tsx`, `data.ts` e `reviews.ts` — todos referenciavam `paymentStatus` ou ficariam com estados sem ação. O issue lista `data.ts` e os badges explicitamente; os componentes de UI são consequência direta.
