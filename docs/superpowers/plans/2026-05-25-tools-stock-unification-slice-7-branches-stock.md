# Slice 7 — `/branches/[id]/stock` modernizada (KPIs + link cruzado)

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Alinhar `/dashboard/branches/[id]/stock` com a linguagem visual nova: adicionar KPIs no topo (total · críticas · repor · OK) e card linka pra `/dashboard/tools/[id]?tab=estoque`.

## Escopo

**Dentro:**
- Função `getBranchStockKpis(branchId)` em `apps/web/src/app/dashboard/stock/branch-stock-data.ts` (mesma origem do `fetchBranchStockPage`).
- KPIs row no topo da page usando `EntityKpisRow` (já reutilizado em outras páginas).
- `BranchStockCard` ganha link pra `/dashboard/tools/[toolId]?tab=estoque` na imagem/nome — sem mudar o sheet de edit.

**Fora desta slice:**
- Botão "+ Adicionar ferramenta ao estoque desta filial" — feature nova, vira ticket próprio.
- Refactorar motivos do `BranchStockEditSheet` pra toggle de 4 botões — mantém a UX atual (select); polish futuro.

## Mapa de arquivos

| Arquivo | Status | O que muda |
|---|---|---|
| `apps/web/src/app/dashboard/stock/branch-stock-data.ts` | Modificar | Add `getBranchStockKpis(branchId)` |
| `apps/web/src/app/dashboard/branches/[id]/stock/page.tsx` | Modificar | Fetch + render `<EntityKpisRow>` no topo |
| `apps/web/src/app/dashboard/stock/_components/branch-stock-card.tsx` | Modificar | Wrap imagem/nome em `<Link href="/dashboard/tools/[toolId]?tab=estoque">` (sem quebrar o click no sheet) |

---

## Task 1: Query KPIs

**Files:**
- Modify: `apps/web/src/app/dashboard/stock/branch-stock-data.ts`

```typescript
export interface BranchStockKpis {
	totalItems: number;
	criticalCount: number;
	reorderCount: number;
	okCount: number;
}

export async function getBranchStockKpis(
	branchId: string
): Promise<BranchStockKpis> {
	const rows = await db
		.select({
			quantity: stockLevel.quantity,
			minQty: stockLevel.minQty,
			reorderPoint: stockLevel.reorderPoint,
		})
		.from(stockLevel)
		.where(eq(stockLevel.branchId, branchId));

	let totalItems = 0;
	let criticalCount = 0;
	let reorderCount = 0;
	let okCount = 0;

	for (const r of rows) {
		totalItems += r.quantity;
		if (r.reorderPoint > 0 && r.quantity <= r.reorderPoint) {
			if (r.minQty > 0 && r.quantity <= r.minQty) criticalCount++;
			else reorderCount++;
		} else if (r.reorderPoint > 0) {
			okCount++;
		}
	}

	return { totalItems, criticalCount, reorderCount, okCount };
}
```

**Importante:** `db`, `stockLevel`, `eq` já são importados no arquivo (verifique). Se `db` faltar, importar de `@emach/db`.

---

## Task 2: Page renderiza KPIs

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/[id]/stock/page.tsx`

### Steps

- [ ] **Step 1:** Import KPIs row component + a query nova:

```typescript
import { Ban, CheckCircle2, Clock, Package } from "lucide-react";

import { EntityKpisRow } from "@/components/entity/entity-kpis-row";
import {
	type BranchStockFiltersInput,
	type BranchStockSort,
	type BranchStockStatus,
	fetchBranchStockPage,
	getBranchStockKpis,
} from "@/app/dashboard/stock/branch-stock-data";
```

- [ ] **Step 2:** Adicionar `getBranchStockKpis` no `Promise.all` (paralelo com `getBranchDetail` e a query de categories):

```typescript
const [detail, categories, kpis] = await Promise.all([
	getBranchDetail(id),
	db.select({ ... }).from(category)...,
	getBranchStockKpis(id),
]);
```

- [ ] **Step 3:** Renderizar logo após `<PageHeader>`:

```tsx
<EntityKpisRow
	items={[
		{ label: "Itens em estoque", value: kpis.totalItems, icon: Package },
		{
			label: "Críticas",
			value: kpis.criticalCount,
			tone: kpis.criticalCount > 0 ? "danger" : "default",
			icon: Ban,
		},
		{
			label: "A repor",
			value: kpis.reorderCount,
			tone: kpis.reorderCount > 0 ? "warning" : "default",
			icon: Clock,
		},
		{ label: "OK", value: kpis.okCount, icon: CheckCircle2 },
	]}
/>
```

---

## Task 3: Card linka pra detalhe da ferramenta

**Files:**
- Modify: `apps/web/src/app/dashboard/stock/_components/branch-stock-card.tsx`

### Contexto

O card atual abre o sheet de edit ao clicar. Adicione um link discreto na **imagem** (ou no nome) que **stopPropagation** o click pro sheet e leva pra `/dashboard/tools/[toolId]?tab=estoque`.

Padrão simples: envolver o nome da ferramenta num `<Link>` com `onClick={(e) => e.stopPropagation()}` (mesmo pattern usado em `user-card.tsx` da Slice approval flow).

### Steps

- [ ] **Step 1:** Localizar onde o card renderiza o nome da tool. Provavelmente algo como:

```tsx
<p className="...">{row.toolName}</p>
```

Substituir por:

```tsx
<Link
	className="hover:underline"
	href={`/dashboard/tools/${row.toolId}?tab=estoque`}
	onClick={(e) => e.stopPropagation()}
>
	{row.toolName}
</Link>
```

- [ ] **Step 2:** Verificar que `row.toolId` existe no shape. Provavelmente está no `BranchStockRow` retornado por `fetchBranchStockPage` — checar `branch-stock-data.ts`. Se não estiver no select, adicionar.

- [ ] **Step 3:** `import Link from "next/link"` se não estiver presente.

---

## Task 4: Smoke

- [ ] `/dashboard/branches/[id]/stock` mostra KPIs no topo (4 cards).
- [ ] Click no nome da ferramenta navega pra `/dashboard/tools/[id]?tab=estoque`.
- [ ] Click no resto do card abre o sheet (comportamento atual preservado).
- [ ] KPIs somam corretamente (sanity check com ≥1 critical visível).

---

## Commit

```bash
git add apps/web/src/app/dashboard/
git commit -m "feat(branches): KPIs no estoque por filial + link cruzado pra tool"
git push
```
