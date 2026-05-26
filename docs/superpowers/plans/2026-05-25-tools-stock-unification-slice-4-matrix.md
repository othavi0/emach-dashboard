# Tools × Stock Unification — Slice 4: tab Estoque com matriz + sheet de ajuste

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Substituir a tabela legacy da tab "Estoque" por uma **matriz variante × filial** com células coloridas por status. Click numa célula abre um sheet lateral com (a) quantidade atual + status, (b) input de nova quantidade absoluta, (c) motivo como toggle de 4 botões, (d) nota opcional, (e) limites min/repor editáveis, (f) últimos 5 movimentos. Salva via actions existentes.

**Architecture:** Tudo client-side em cima de actions já existentes (`adjustStock`, `updateStockThresholds`, `getStockMovementsByVariantBranch`). Sem schema novo. Sem actions novas.

**Spec:** `docs/superpowers/specs/2026-05-25-tools-stock-unification-design.md` § Tab Estoque.

## Escopo

**Dentro:**
- Matriz variante × filial em `<table>` shadcn.
- Cor da célula por status (crítico = destructive bg + border; repor = warning bg + border; OK = neutro; sem stock_level = placeholder).
- Mín/Repor inline em texto pequeno na célula.
- Linha de totais por variante (coluna direita) + linha de totais por filial (rodapé).
- Click em qualquer célula abre `StockCellSheet` (novo componente).
- Sheet usa `adjustStock` e `updateStockThresholds` existentes.
- Movimentações dentro do sheet via `getStockMovementsByVariantBranch` (existente, retorna até N).

**Fora desta slice:**
- Botão "Transferir entre filiais" no topo: renderiza **disabled com tooltip "em breve"** (schema não suporta — vira ADR separada).
- "↓ Exportar CSV": fora de escopo.
- Filtro de filial / segmento de status no topo: a matriz é tipicamente pequena (≤5 variantes × ≤8 filiais por tool), defer.
- KPIs no topo: defer.

## Mapa de arquivos

| Arquivo | Status | O que muda |
|---|---|---|
| `apps/web/src/app/dashboard/tools/[id]/_components/estoque-tab.tsx` | **Criar** | Matriz variante × filial (client component) |
| `apps/web/src/app/dashboard/tools/[id]/_components/stock-cell-sheet.tsx` | **Criar** | Sheet lateral com ajuste + limites + movimentos |
| `apps/web/src/app/dashboard/tools/[id]/_components/estoque-tab-legacy.tsx` | **Deletar** | Substituído pela matriz |
| `apps/web/src/app/dashboard/tools/[id]/page.tsx` | **Modificar** | Importa novo `EstoqueTab` em vez de `EstoqueLegacyTab` |

---

## Task 1: Criar `estoque-tab.tsx` (matriz)

**Files:**
- Create: `apps/web/src/app/dashboard/tools/[id]/_components/estoque-tab.tsx`

### Contexto

A matriz lê `stockRows: ToolStockRow[]` já vindo de `getToolDetail`. Agrupamos por `(variantId, branchId)` pra construir as células. Linhas = variantes únicas (na ordem original do `detail.variants`). Colunas = filiais únicas (na ordem alfabética que o backend já entrega).

Estado: `selectedCell: { variantId, branchId } | null` controla abertura do sheet. Sheet sempre renderizado mas com `open={!!selectedCell}`.

### Conteúdo completo

```tsx
"use client";

import { Button } from "@emach/ui/components/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@emach/ui/components/tooltip";
import { ArrowLeftRight } from "lucide-react";
import { useMemo, useState } from "react";

import type {
	ToolDetailVariant,
	ToolStockRow,
} from "../_lib/tool-detail-data";
import { StockCellSheet } from "./stock-cell-sheet";

interface EstoqueTabProps {
	canMutate: boolean;
	stockRows: ToolStockRow[];
	toolId: string;
	variants: ToolDetailVariant[];
}

interface SelectedCell {
	branchId: string;
	branchName: string;
	variantId: string;
	variantSku: string;
	variantVoltage: string | null;
}

interface CellData {
	minQty: number;
	quantity: number;
	reorderPoint: number;
}

function cellStatus(c: CellData | undefined): "critical" | "reorder" | "ok" | "none" {
	if (!c) return "none";
	if (c.reorderPoint <= 0) return "none";
	if (c.minQty > 0 && c.quantity <= c.minQty) return "critical";
	if (c.quantity <= c.reorderPoint) return "reorder";
	return "ok";
}

function cellClass(status: ReturnType<typeof cellStatus>): string {
	switch (status) {
		case "critical":
			return "bg-destructive/15 border-b-2 border-destructive";
		case "reorder":
			return "bg-warning/15 border-b-2 border-warning";
		default:
			return "";
	}
}

export function EstoqueTab({
	stockRows,
	variants,
	toolId,
	canMutate,
}: EstoqueTabProps) {
	const [selected, setSelected] = useState<SelectedCell | null>(null);

	const branches = useMemo(() => {
		const seen = new Map<string, string>();
		for (const r of stockRows) {
			if (!seen.has(r.branchId)) seen.set(r.branchId, r.branchName);
		}
		return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
	}, [stockRows]);

	const cellMap = useMemo(() => {
		const m = new Map<string, CellData>();
		for (const r of stockRows) {
			m.set(`${r.variantId}:${r.branchId}`, {
				quantity: r.quantity,
				minQty: r.minQty,
				reorderPoint: r.reorderPoint,
			});
		}
		return m;
	}, [stockRows]);

	const variantTotals = useMemo(() => {
		const totals = new Map<string, number>();
		for (const v of variants) {
			let sum = 0;
			for (const b of branches) {
				sum += cellMap.get(`${v.id}:${b.id}`)?.quantity ?? 0;
			}
			totals.set(v.id, sum);
		}
		return totals;
	}, [variants, branches, cellMap]);

	const branchTotals = useMemo(() => {
		const totals = new Map<string, number>();
		for (const b of branches) {
			let sum = 0;
			for (const v of variants) {
				sum += cellMap.get(`${v.id}:${b.id}`)?.quantity ?? 0;
			}
			totals.set(b.id, sum);
		}
		return totals;
	}, [variants, branches, cellMap]);

	const grandTotal = useMemo(() => {
		let sum = 0;
		for (const v of variantTotals.values()) sum += v;
		return sum;
	}, [variantTotals]);

	if (variants.length === 0 || branches.length === 0) {
		return (
			<p className="py-12 text-center text-muted-foreground text-sm">
				Sem variantes ou filiais com estoque registrado.
			</p>
		);
	}

	return (
		<TooltipProvider delay={300}>
			<div className="flex flex-col gap-4">
				<div className="flex items-center justify-end">
					<Tooltip>
						<TooltipTrigger
							render={
								<Button disabled size="sm" variant="outline">
									<ArrowLeftRight className="mr-1.5 size-3.5" />
									Transferir entre filiais
								</Button>
							}
						/>
						<TooltipContent>
							Em breve — requer mudança de schema (ADR separada).
						</TooltipContent>
					</Tooltip>
				</div>

				<div className="overflow-x-auto rounded-md border border-border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-[180px]">Variante</TableHead>
								{branches.map((b) => (
									<TableHead className="text-center" key={b.id}>
										{b.name}
									</TableHead>
								))}
								<TableHead className="bg-muted/40 text-right">Total</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{variants.map((v) => (
								<TableRow key={v.id}>
									<TableCell>
										<div className="font-mono text-xs">{v.sku}</div>
										<div className="text-muted-foreground text-[10px]">
											{v.voltage ?? "—"} {v.isDefault && "· padrão"}
										</div>
									</TableCell>
									{branches.map((b) => {
										const data = cellMap.get(`${v.id}:${b.id}`);
										const status = cellStatus(data);
										return (
											<TableCell
												className={`cursor-pointer p-0 text-center ${cellClass(status)}`}
												key={b.id}
												onClick={() =>
													canMutate &&
													setSelected({
														variantId: v.id,
														variantSku: v.sku,
														variantVoltage: v.voltage,
														branchId: b.id,
														branchName: b.name,
													})
												}
											>
												<div className="py-3">
													<div className="font-semibold text-lg tabular-nums">
														{data ? data.quantity : "—"}
													</div>
													<div className="text-[10px] text-muted-foreground">
														{data && data.reorderPoint > 0
															? `mín ${data.minQty} · rep ${data.reorderPoint}`
															: "sem limites"}
													</div>
												</div>
											</TableCell>
										);
									})}
									<TableCell className="bg-muted/40 text-right font-semibold tabular-nums">
										{variantTotals.get(v.id) ?? 0}
									</TableCell>
								</TableRow>
							))}
							<TableRow className="bg-muted/40">
								<TableCell className="text-muted-foreground text-xs uppercase">
									Total
								</TableCell>
								{branches.map((b) => (
									<TableCell
										className="text-center font-semibold tabular-nums"
										key={b.id}
									>
										{branchTotals.get(b.id) ?? 0}
									</TableCell>
								))}
								<TableCell className="bg-muted text-right font-semibold tabular-nums">
									{grandTotal}
								</TableCell>
							</TableRow>
						</TableBody>
					</Table>
				</div>

				<div className="flex flex-wrap gap-3 text-muted-foreground text-xs">
					<span>
						<span className="mr-1 inline-block size-2.5 rounded-sm bg-destructive/15 align-middle ring-1 ring-destructive" />
						Crítico (≤ mín)
					</span>
					<span>
						<span className="mr-1 inline-block size-2.5 rounded-sm bg-warning/15 align-middle ring-1 ring-warning" />
						Repor (≤ ponto)
					</span>
					<span>
						<span className="mr-1 inline-block size-2.5 rounded-sm border border-border align-middle" />
						OK
					</span>
				</div>

				{selected && (
					<StockCellSheet
						branchId={selected.branchId}
						branchName={selected.branchName}
						canMutate={canMutate}
						initial={cellMap.get(`${selected.variantId}:${selected.branchId}`)}
						onClose={() => setSelected(null)}
						toolId={toolId}
						variantId={selected.variantId}
						variantSku={selected.variantSku}
						variantVoltage={selected.variantVoltage}
					/>
				)}
			</div>
		</TooltipProvider>
	);
}
```

---

## Task 2: Criar `stock-cell-sheet.tsx`

**Files:**
- Create: `apps/web/src/app/dashboard/tools/[id]/_components/stock-cell-sheet.tsx`

### Contexto

Reusa actions existentes:
- `adjustStock({ variantId, branchId, newQty, reason, reasonNote })` em `apps/web/src/app/dashboard/stock/actions.ts`
- `updateStockThresholds({ variantId, branchId, minQty, reorderPoint })` mesma rota
- `getStockMovementsByVariantBranch({ variantId, branchId, limit })` mesma rota — retorna últimos N movimentos

Os 4 motivos vêm de `STOCK_MOVEMENT_REASONS` em `apps/web/src/app/dashboard/stock/_components/stock-adjustment-schema.ts`. Mas a UX nova usa só 4 botões pegáveis: entrada_compra, ajuste_inventario, perda, outro (saida_venda só vem de pedidos, não digitamos manualmente).

### Conteúdo completo

```tsx
"use client";

import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@emach/ui/components/sheet";
import { Separator } from "@emach/ui/components/separator";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import {
	adjustStock,
	getStockMovementsByVariantBranch,
	updateStockThresholds,
} from "@/app/dashboard/stock/actions";

interface InitialData {
	minQty: number;
	quantity: number;
	reorderPoint: number;
}

interface StockCellSheetProps {
	branchId: string;
	branchName: string;
	canMutate: boolean;
	initial: InitialData | undefined;
	onClose: () => void;
	toolId: string;
	variantId: string;
	variantSku: string;
	variantVoltage: string | null;
}

type Reason = "entrada_compra" | "ajuste_inventario" | "perda" | "outro";

const REASON_LABEL: Record<Reason, string> = {
	entrada_compra: "Entrada compra",
	ajuste_inventario: "Ajuste inventário",
	perda: "Perda",
	outro: "Outro",
};

interface Movement {
	createdAt: Date;
	delta: number;
	reason: string;
	reasonNote: string | null;
}

export function StockCellSheet({
	variantId,
	variantSku,
	variantVoltage,
	branchId,
	branchName,
	initial,
	onClose,
	canMutate,
}: StockCellSheetProps) {
	const currentQty = initial?.quantity ?? 0;
	const [newQty, setNewQty] = useState(String(currentQty));
	const [reason, setReason] = useState<Reason>("entrada_compra");
	const [reasonNote, setReasonNote] = useState("");
	const [minQty, setMinQty] = useState(String(initial?.minQty ?? 0));
	const [reorderPoint, setReorderPoint] = useState(
		String(initial?.reorderPoint ?? 0)
	);
	const [movements, setMovements] = useState<Movement[]>([]);
	const [pendingAdjust, startAdjust] = useTransition();
	const [pendingLimits, startLimits] = useTransition();

	useEffect(() => {
		let cancelled = false;
		getStockMovementsByVariantBranch({ variantId, branchId, limit: 5 })
			.then((result) => {
				if (!cancelled && result.ok) {
					setMovements(
						result.data.map((m) => ({
							createdAt: new Date(m.createdAt),
							delta: m.delta,
							reason: m.reason,
							reasonNote: m.reasonNote,
						}))
					);
				}
			})
			.catch(() => undefined);
		return () => {
			cancelled = true;
		};
	}, [variantId, branchId]);

	const qtyChanged = String(currentQty) !== newQty;
	const limitsChanged =
		String(initial?.minQty ?? 0) !== minQty ||
		String(initial?.reorderPoint ?? 0) !== reorderPoint;

	function status(): "critical" | "reorder" | "ok" | "none" {
		if (!initial || initial.reorderPoint <= 0) return "none";
		if (initial.minQty > 0 && initial.quantity <= initial.minQty)
			return "critical";
		if (initial.quantity <= initial.reorderPoint) return "reorder";
		return "ok";
	}

	function handleAdjust() {
		startAdjust(async () => {
			const result = await adjustStock({
				variantId,
				branchId,
				newQty: Number(newQty),
				reason,
				reasonNote: reasonNote.trim() === "" ? undefined : reasonNote.trim(),
			});
			if (result.ok) {
				toast.success("Estoque ajustado");
				onClose();
			} else {
				toast.error(result.error);
			}
		});
	}

	function handleLimits() {
		startLimits(async () => {
			const result = await updateStockThresholds({
				variantId,
				branchId,
				minQty: Number(minQty),
				reorderPoint: Number(reorderPoint),
			});
			if (result.ok) {
				toast.success("Limites atualizados");
			} else {
				toast.error(result.error);
			}
		});
	}

	const st = status();
	const statusBadgeClass =
		st === "critical"
			? "bg-destructive/15 text-destructive"
			: st === "reorder"
				? "bg-warning/15 text-warning"
				: st === "ok"
					? "bg-success/15 text-success"
					: "bg-muted text-muted-foreground";
	const statusLabel =
		st === "critical"
			? "Crítico"
			: st === "reorder"
				? "Repor"
				: st === "ok"
					? "OK"
					: "Sem limites";

	return (
		<Sheet onOpenChange={(open) => !open && onClose()} open={true}>
			<SheetContent className="flex w-full flex-col gap-4 sm:max-w-md">
				<SheetHeader>
					<SheetTitle>Ajustar estoque</SheetTitle>
					<p className="text-muted-foreground text-xs">
						<span className="font-mono">{variantSku}</span>
						{variantVoltage ? ` · ${variantVoltage}` : ""} · {branchName}
					</p>
				</SheetHeader>

				<div className="rounded-md border border-border p-3">
					<div className="flex items-baseline justify-between">
						<span className="font-semibold text-2xl tabular-nums">
							{currentQty}
						</span>
						<span
							className={`rounded-md px-2 py-0.5 text-xs ${statusBadgeClass}`}
						>
							{statusLabel}
						</span>
					</div>
					<p className="text-muted-foreground text-[11px]">atual</p>
				</div>

				{canMutate && (
					<>
						<div className="flex flex-col gap-2">
							<Label className="text-xs uppercase">Nova quantidade</Label>
							<Input
								inputMode="numeric"
								onChange={(e) => setNewQty(e.target.value)}
								value={newQty}
							/>
						</div>

						<div className="flex flex-col gap-2">
							<Label className="text-xs uppercase">Motivo</Label>
							<div className="grid grid-cols-2 gap-2">
								{(Object.keys(REASON_LABEL) as Reason[]).map((r) => (
									<Button
										key={r}
										onClick={() => setReason(r)}
										size="sm"
										variant={reason === r ? "default" : "outline"}
									>
										{REASON_LABEL[r]}
									</Button>
								))}
							</div>
						</div>

						<div className="flex flex-col gap-2">
							<Label className="text-xs uppercase">Nota (opcional)</Label>
							<Input
								onChange={(e) => setReasonNote(e.target.value)}
								placeholder="NF #1234, fornecedor X…"
								value={reasonNote}
							/>
						</div>

						<Button
							disabled={!qtyChanged || pendingAdjust}
							onClick={handleAdjust}
						>
							{pendingAdjust ? "Salvando…" : "Salvar ajuste"}
						</Button>

						<Separator />

						<div>
							<Label className="text-xs uppercase">Limites de alerta</Label>
							<div className="mt-2 grid grid-cols-2 gap-2">
								<div>
									<Label className="text-[10px]">Mínimo</Label>
									<Input
										inputMode="numeric"
										onChange={(e) => setMinQty(e.target.value)}
										value={minQty}
									/>
								</div>
								<div>
									<Label className="text-[10px]">Ponto de repor</Label>
									<Input
										inputMode="numeric"
										onChange={(e) => setReorderPoint(e.target.value)}
										value={reorderPoint}
									/>
								</div>
							</div>
							<Button
								className="mt-2 w-full"
								disabled={!limitsChanged || pendingLimits}
								onClick={handleLimits}
								size="sm"
								variant="outline"
							>
								{pendingLimits ? "Salvando…" : "Salvar limites"}
							</Button>
						</div>
					</>
				)}

				<Separator />

				<div>
					<Label className="text-xs uppercase">Últimos movimentos</Label>
					{movements.length === 0 ? (
						<p className="mt-2 text-muted-foreground text-xs">
							Sem movimentos recentes.
						</p>
					) : (
						<ul className="mt-2 flex flex-col gap-1.5 text-xs">
							{movements.map((m, i) => (
								<li
									className="flex items-center justify-between border-border border-b py-1.5 last:border-b-0"
									key={i}
								>
									<span>
										<span
											className={
												m.delta < 0 ? "text-destructive" : "text-success"
											}
										>
											{m.delta > 0 ? `+${m.delta}` : m.delta}
										</span>
										{" · "}
										{m.reason.replace("_", " ")}
										{m.reasonNote && (
											<span className="text-muted-foreground">
												{" "}— {m.reasonNote}
											</span>
										)}
									</span>
									<span className="text-muted-foreground">
										{m.createdAt.toLocaleDateString("pt-BR")}
									</span>
								</li>
							))}
						</ul>
					)}
				</div>
			</SheetContent>
		</Sheet>
	);
}
```

**Atenção:** os shapes dos retornos de `adjustStock`, `updateStockThresholds` e `getStockMovementsByVariantBranch` precisam bater com `ActionResult` padrão (`{ ok: true, data } | { ok: false, error }`). Se as actions retornarem shape diferente, ajustar inline.

Em particular `getStockMovementsByVariantBranch` retorna `ActionResult<MovementRow[]>` provavelmente — verificar e mapear no `result.data`.

---

## Task 3: Wire em `page.tsx` + deletar legacy

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/[id]/page.tsx`
- Delete: `apps/web/src/app/dashboard/tools/[id]/_components/estoque-tab-legacy.tsx`

### Steps

- [ ] **Step 1:** Em `page.tsx`, trocar:

```tsx
import { EstoqueLegacyTab } from "./_components/estoque-tab-legacy";
```

por:

```tsx
import { EstoqueTab } from "./_components/estoque-tab";
```

- [ ] **Step 2:** Trocar o uso na tab "estoque":

```tsx
content: (
	<EstoqueTab
		canMutate={canMutate}
		stockRows={detail.stockRows}
		toolId={detail.tool.id}
		variants={detail.variants}
	/>
),
```

- [ ] **Step 3:** Deletar arquivo legacy:

```bash
rm apps/web/src/app/dashboard/tools/\[id\]/_components/estoque-tab-legacy.tsx
```

- [ ] **Step 4:** `bun check-types` → 0 erros.

- [ ] **Step 5:** Commit:

```bash
git add apps/web/src/app/dashboard/tools/\[id\]/
git commit -m "feat(tools): matriz variante×filial + sheet de ajuste na tab Estoque"
```

---

## Task 4: Smoke

- [ ] Abrir `/dashboard/tools/[id]?tab=estoque` como admin/super_admin/manager.
- [ ] Matriz renderiza com cores: vermelha pra crítico, âmbar pra repor, neutra OK.
- [ ] Totais por variante (coluna direita) e por filial (rodapé) somam corretamente.
- [ ] Click numa célula → sheet abre com qty atual + status badge + inputs.
- [ ] Trocar qty → click "Salvar ajuste" → toast "Estoque ajustado", sheet fecha, matriz reflete novo valor.
- [ ] Trocar mín/repor → click "Salvar limites" → toast "Limites atualizados".
- [ ] Lista "Últimos movimentos" carrega após abrir sheet.
- [ ] Botão "Transferir entre filiais" disabled com tooltip.
- [ ] Como user sem `stock.adjust`, inputs e botões não aparecem (canMutate=false) — apenas dados read-only e movimentos.

## Riscos / pontos abertos

1. **Action `getStockMovementsByVariantBranch`**: verificar shape de retorno. Pode ser `{ items, nextCursor }` em vez de array. Ajustar mapping no `useEffect`.
2. **Mobile**: a matriz pode ficar apertada em telas < 640px. `overflow-x-auto` no wrapper já protege.
3. **`stock.read` vs `stock.adjust`**: `canMutate` na page já vem de `tools.update` — mas para o sheet, idealmente seria `stock.adjust`. Pra esta slice mantemos `canMutate` (tools.update) — tools.update implica geralmente o role tem stock.adjust também. Refinar permission no detalhe se necessário em slice futura.
