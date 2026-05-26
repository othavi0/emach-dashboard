# Tools × Stock Unification — Slice 5: tab Atividade (timeline)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Substituir o `<PlaceholderTab>` da tab Atividade por uma timeline real de movimentações de estoque da ferramenta, agrupada por dia, com ícone colorido por motivo.

## Escopo

**Dentro:**
- Nova query `getToolActivity(toolId, limit)` — extensão de `getStockMovements` adicionando variantSku + variantVoltage no select.
- Componente `activity-tab.tsx` (server component): lista os últimos 100 movimentos, agrupados por dia (Hoje · Ontem · 20 mai…), cada item com ícone colorido + delta + filial + SKU + nota + actor + horário.
- Link pra `/dashboard/orders/[id]` quando `orderId` está presente — **deferido**, schema mostra `orderId` na tabela mas o action atual não seleciona; pula nesta slice (pra não estourar escopo).

**Fora desta slice:**
- KPIs no topo (Entradas 30d / Saídas / Pedidos / Perdas).
- Filtros (filial, variante, período, motivo).
- Paginação real ("Carregar mais") — limit fixo 100 nesta slice.
- Export CSV.

## Mapa de arquivos

| Arquivo | Status | O que muda |
|---|---|---|
| `apps/web/src/app/dashboard/stock/actions.ts` | **Modificar** | Adicionar `getToolActivity(toolId, limit)` + tipo `ToolActivityRow` |
| `apps/web/src/app/dashboard/tools/[id]/_components/activity-tab.tsx` | **Criar** | Server component: fetch + render timeline |
| `apps/web/src/app/dashboard/tools/[id]/page.tsx` | **Modificar** | Trocar `PlaceholderTab` por `ActivityTab` |

---

## Task 1: Query `getToolActivity`

**Files:**
- Modify: `apps/web/src/app/dashboard/stock/actions.ts`

### Steps

- [ ] **Step 1:** Adicionar no fim do arquivo (após `getStockMovementsByVariantBranch`):

```typescript
export interface ToolActivityRow {
	actorId: string | null;
	actorName: string | null;
	branchId: string | null;
	branchName: string | null;
	createdAt: Date;
	delta: number;
	id: string;
	newQty: number;
	previousQty: number;
	reason: string | null;
	reasonNote: string | null;
	variantSku: string;
	variantVoltage: string | null;
}

export async function getToolActivity(
	toolId: string,
	limit = 100
): Promise<ToolActivityRow[]> {
	return await db
		.select({
			id: stockMovement.id,
			createdAt: stockMovement.createdAt,
			branchId: stockMovement.branchId,
			branchName: branch.name,
			previousQty: stockMovement.previousQty,
			newQty: stockMovement.newQty,
			delta: stockMovement.delta,
			reason: stockMovement.reason,
			reasonNote: stockMovement.reasonNote,
			actorId: stockMovement.actorId,
			actorName: user.name,
			variantSku: toolVariant.sku,
			variantVoltage: toolVariant.voltage,
		})
		.from(stockMovement)
		.innerJoin(toolVariant, eq(toolVariant.id, stockMovement.variantId))
		.leftJoin(branch, eq(stockMovement.branchId, branch.id))
		.leftJoin(user, eq(stockMovement.actorId, user.id))
		.where(eq(toolVariant.toolId, toolId))
		.orderBy(desc(stockMovement.createdAt))
		.limit(limit);
}
```

`db`, `stockMovement`, `toolVariant`, `branch`, `user`, `eq`, `desc` já estão importados (verificável pelo `getStockMovements` existente). Se algum faltar, adicionar no import existente.

- [ ] **Step 2:** `bun check-types` → 0 erros.
- [ ] **Step 3:** Não commitar — junto com Task 2.

---

## Task 2: `activity-tab.tsx`

**Files:**
- Create: `apps/web/src/app/dashboard/tools/[id]/_components/activity-tab.tsx`
- Modify: `apps/web/src/app/dashboard/tools/[id]/page.tsx`

### Conteúdo de `activity-tab.tsx`

```tsx
import { ArrowDown, ArrowUp, Pencil, X } from "lucide-react";

import {
	getToolActivity,
	type ToolActivityRow,
} from "@/app/dashboard/stock/actions";

interface ActivityTabProps {
	toolId: string;
}

const REASON_LABEL: Record<string, string> = {
	entrada_compra: "entrada compra",
	saida_venda: "saída venda",
	ajuste_inventario: "ajuste inventário",
	perda: "perda",
	outro: "outro",
};

function reasonIcon(reason: string | null) {
	switch (reason) {
		case "entrada_compra":
			return { Icon: ArrowUp, color: "text-success", bg: "bg-success/15" };
		case "saida_venda":
			return { Icon: ArrowDown, color: "text-destructive", bg: "bg-destructive/15" };
		case "perda":
			return { Icon: X, color: "text-destructive", bg: "bg-destructive/15" };
		case "ajuste_inventario":
			return { Icon: Pencil, color: "text-warning", bg: "bg-warning/15" };
		default:
			return {
				Icon: Pencil,
				color: "text-muted-foreground",
				bg: "bg-muted",
			};
	}
}

function groupByDay(
	rows: ToolActivityRow[]
): Array<{ label: string; items: ToolActivityRow[] }> {
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const yesterday = new Date(today);
	yesterday.setDate(today.getDate() - 1);

	const groups = new Map<string, ToolActivityRow[]>();
	const order: string[] = [];

	for (const r of rows) {
		const d = new Date(r.createdAt);
		const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
		let label: string;
		if (d >= today) label = "Hoje";
		else if (d >= yesterday) label = "Ontem";
		else
			label = d.toLocaleDateString("pt-BR", {
				day: "2-digit",
				month: "short",
				year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
			});

		const groupKey = label;
		if (!groups.has(groupKey)) {
			groups.set(groupKey, []);
			order.push(groupKey);
		}
		groups.get(groupKey)?.push(r);
	}

	return order.map((label) => ({ label, items: groups.get(label) ?? [] }));
}

function formatTime(date: Date): string {
	return new Date(date).toLocaleTimeString("pt-BR", {
		hour: "2-digit",
		minute: "2-digit",
	});
}

export async function ActivityTab({ toolId }: ActivityTabProps) {
	const rows = await getToolActivity(toolId, 100);

	if (rows.length === 0) {
		return (
			<p className="py-12 text-center text-muted-foreground text-sm">
				Sem movimentações registradas.
			</p>
		);
	}

	const groups = groupByDay(rows);

	return (
		<div className="rounded-md border border-border">
			{groups.map((g) => (
				<div key={g.label}>
					<div className="border-border border-b bg-muted/40 px-4 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
						{g.label}
					</div>
					<ul className="divide-y divide-border">
						{g.items.map((r) => {
							const { Icon, color, bg } = reasonIcon(r.reason);
							const reasonLabel = REASON_LABEL[r.reason ?? ""] ?? r.reason ?? "—";
							return (
								<li
									className="flex items-start gap-3 px-4 py-3 text-sm"
									key={r.id}
								>
									<span
										className={`mt-0.5 inline-flex size-7 flex-shrink-0 items-center justify-center rounded-full ${bg}`}
									>
										<Icon className={`size-3.5 ${color}`} />
									</span>
									<div className="flex min-w-0 flex-1 flex-col">
										<div>
											<span className={color}>
												{r.delta > 0 ? `+${r.delta}` : r.delta}
											</span>
											<span className="ml-1">· {reasonLabel}</span>
											<span className="text-muted-foreground"> · </span>
											<span className="font-medium">
												{r.branchName ?? "—"}
											</span>
											<span className="text-muted-foreground"> · </span>
											<span className="font-mono text-xs">{r.variantSku}</span>
											{r.variantVoltage && (
												<span className="text-muted-foreground text-xs">
													{" "}
													({r.variantVoltage})
												</span>
											)}
										</div>
										{(r.reasonNote || r.actorName) && (
											<div className="text-muted-foreground text-xs">
												{r.reasonNote && <>"{r.reasonNote}" · </>}
												{r.actorName ? `por ${r.actorName}` : "Sistema"}
											</div>
										)}
									</div>
									<span className="flex-shrink-0 text-muted-foreground text-xs">
										{formatTime(r.createdAt)}
									</span>
								</li>
							);
						})}
					</ul>
				</div>
			))}
		</div>
	);
}
```

### Steps

- [ ] **Step 1:** Criar o arquivo acima.

- [ ] **Step 2:** Em `page.tsx`, remover o import de `PlaceholderTab` (se não for usado mais) e adicionar:

```tsx
import { ActivityTab } from "./_components/activity-tab";
```

- [ ] **Step 3:** Substituir o conteúdo da tab "atividade" de:

```tsx
content: (
	<PlaceholderTab description="Movimentações + pedidos chegam na próxima entrega." />
),
```

por:

```tsx
content: <ActivityTab toolId={detail.tool.id} />,
```

**Atenção:** `<ActivityTab>` é async (server component). EntityTabs aceita `content: ReactNode` — passar JSX assíncrono em ReactNode funciona via React 19 Server Components support. Se o tipo bater erro, envolver em `<Suspense>` ou aceitar como narrow.

- [ ] **Step 4:** `PlaceholderTab` ainda é usada? Não — vamos manter o import e o arquivo (pode servir pra futuras tabs). Não deletar.

- [ ] **Step 5:** `bun check-types` → 0 erros.

- [ ] **Step 6:** Commit:

```bash
git add apps/web/src/app/dashboard/stock/actions.ts apps/web/src/app/dashboard/tools/\[id\]/
git commit -m "feat(tools): timeline de atividade na tab Atividade"
```

---

## Task 3: Smoke

- [ ] Abrir `/dashboard/tools/[id]?tab=atividade`.
- [ ] Timeline renderiza agrupada por dia (Hoje / Ontem / data).
- [ ] Cada item: ícone colorido (verde +, vermelho ⨉ ou ↓, âmbar ✎) + delta + motivo + filial + SKU (voltagem) + nota + actor + horário.
- [ ] Empty state quando ferramenta nova sem movimentações.

## Riscos

1. **`<ActivityTab>` async dentro de `content: ReactNode` do `EntityTabs`:** se TS reclamar, envolver em `<Suspense fallback={<p>Carregando…</p>}>`. RSC suporta async children naturalmente em React 19, então provavelmente OK.
2. **Sem paginação:** limit 100 hard. Pra tools com muito histórico, o usuário vê só os 100 mais recentes. Aceitável pra esta slice; "Carregar mais" + cursor real fica pra follow-up.
3. **Tab perde refresh quando estoque ajustado:** `adjustStock` revalida `/dashboard/tools/[id]`, então a tab Atividade vai reler. OK.
