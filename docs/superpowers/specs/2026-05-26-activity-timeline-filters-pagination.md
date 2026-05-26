# Filtros + paginação real na timeline de atividade

> Item #4 do follow-up out-of-scope da PR #66 (unificação tools×stock).

**Goal:** Substituir o `limit=100` hardcoded da tab Atividade (`/tools/[id]?tab=atividade`) por paginação cursor-based real ("Carregar mais") + filtros de período, filial e motivo.

**Arquitetura:** Server component carrega initial page (BATCH_SIZE=20 com filtros default). Client component (`ActivityTabClient`) gerencia filtros via state local + `useInfiniteList`. Cursor base64 `(createdAt, id)` — desempate determinístico.

**Tech stack:** Next 16 RSC + React 19 + cursor pagination (`@/lib/cursor`) + `useInfiniteList` hook.

---

## Decisões trancadas

1. **Período:** presets `Hoje · 7d · 30d · 90d · Tudo`. Default: **`30d`** (evita carregar tabela inteira no primeiro paint).
2. **Motivo:** **multi-select chips** com 5 motivos toggleable. Default: **todos ativos**.
3. **Filial:** Select. Default: **"Todas as filiais"**.
4. **Layout:** linha única horizontal wrap (presets + Select + chips).
5. **Filtros = state local** (não URL params). Tabs já usam `?tab=` — adicionar mais params complicaria URL e re-render via navigation muda tab. State local é melhor pra tab interna.
6. **Cursor:** `(createdAt DESC, id DESC)`. Encoded base64 via `@/lib/cursor`.
7. **"Carregar mais":** botão explícito (não `InfiniteSentinel`) — operador controla ritmo no audit log.
8. **BATCH_SIZE:** reusar 20 do `BATCH_SIZE` global (`@/lib/infinite`).
9. **Empty state:** mensagem distinta de "sem registros total" vs "sem registros pros filtros atuais" + botão "Limpar filtros".
10. **Filtros reset via `useInfiniteList.resetKey`:** mudança de filter dispara fetch fresh; mantém o pattern existente.

---

## Mapa de arquivos

| Arquivo | Status | O que muda |
|---|---|---|
| `apps/web/src/app/dashboard/stock/actions.ts` | Modify | + `fetchToolActivityPage` (cursor) + `ToolActivityFilters` + `PeriodPreset` |
| `apps/web/src/app/dashboard/tools/[id]/_components/activity-tab.tsx` | Refactor | Server comp busca branches + initial page → passa pra client |
| `apps/web/src/app/dashboard/tools/[id]/_components/activity-tab-client.tsx` | **Criar** | Client comp: state de filtros + `useInfiniteList` + render |
| `apps/web/src/app/dashboard/tools/[id]/_components/activity-filters.tsx` | **Criar** | UI dos filtros (presets + Select + chips) |
| `apps/web/src/app/dashboard/tools/[id]/_components/activity-timeline.tsx` | **Criar** | Render puro da timeline (extraído do tab atual; reusable) |

---

## Detalhes técnicos

### Query + cursor

```typescript
export type PeriodPreset = "today" | "7d" | "30d" | "90d" | "all";

export interface ToolActivityFilters {
	branchId?: string;
	period: PeriodPreset;
	reasons?: string[]; // undefined or empty = all
	toolId: string;
}

function computePeriodCutoff(period: PeriodPreset): Date | null {
	if (period === "all") return null;
	const now = new Date();
	if (period === "today") {
		return new Date(now.getFullYear(), now.getMonth(), now.getDate());
	}
	const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
	return new Date(now.getTime() - days * 86_400_000);
}

interface ActivityCursor {
	createdAt: string;
	id: string;
}

export async function fetchToolActivityPage(
	filters: ToolActivityFilters,
	cursor: string | null
): Promise<InfiniteResult<ToolActivityRow>> {
	await requireCapability("stock.read");

	const limit = BATCH_SIZE;
	const conditions = [eq(toolVariant.toolId, filters.toolId)];

	if (filters.branchId) {
		conditions.push(eq(stockMovement.branchId, filters.branchId));
	}
	if (filters.reasons && filters.reasons.length > 0) {
		conditions.push(inArray(stockMovement.reason, filters.reasons));
	}

	const cutoff = computePeriodCutoff(filters.period);
	if (cutoff) {
		conditions.push(gte(stockMovement.createdAt, cutoff));
	}

	if (cursor) {
		const c = decodeCursor<ActivityCursor>(cursor);
		conditions.push(
			or(
				lt(stockMovement.createdAt, new Date(c.createdAt)),
				and(
					eq(stockMovement.createdAt, new Date(c.createdAt)),
					lt(stockMovement.id, c.id)
				)
			)!
		);
	}

	const rows = await db
		.select({ /* same as getToolActivity */ })
		.from(stockMovement)
		.innerJoin(toolVariant, eq(toolVariant.id, stockMovement.variantId))
		.leftJoin(branch, eq(stockMovement.branchId, branch.id))
		.leftJoin(user, eq(stockMovement.actorId, user.id))
		.where(and(...conditions))
		.orderBy(desc(stockMovement.createdAt), desc(stockMovement.id))
		.limit(limit + 1);

	const hasMore = rows.length > limit;
	const items = hasMore ? rows.slice(0, limit) : rows;
	const last = items.at(-1);
	const nextCursor =
		hasMore && last
			? encodeCursor<ActivityCursor>({
					createdAt: last.createdAt.toISOString(),
					id: last.id,
				})
			: null;

	return { items, nextCursor };
}
```

`getToolActivity` original fica como compat (não remover — pode ter consumidor futuro). Ou marcar como `@deprecated` e migrar.

### Client component

```tsx
"use client";

interface Props {
	branches: Array<{ id: string; name: string }>;
	initialCursor: string | null;
	initialItems: ToolActivityRow[];
	toolId: string;
}

export function ActivityTabClient({ branches, initialCursor, initialItems, toolId }: Props) {
	const [period, setPeriod] = useState<PeriodPreset>("30d");
	const [branchId, setBranchId] = useState<string | undefined>();
	const [reasons, setReasons] = useState<string[]>([
		"entrada_compra", "saida_venda", "ajuste_inventario", "perda", "outro",
	]);

	const filters = useMemo<ToolActivityFilters>(
		() => ({ toolId, branchId, period, reasons }),
		[toolId, branchId, period, reasons]
	);

	const resetKey = JSON.stringify(filters);

	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems,
		initialCursor,
		fetchPage: (cursor) => fetchToolActivityPage(filters, cursor),
		resetKey,
	});

	const allReasonsActive = reasons.length === 5;
	const isFiltered = period !== "30d" || !!branchId || !allReasonsActive;

	function toggleReason(reason: string) {
		setReasons((prev) =>
			prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason]
		);
	}

	function resetFilters() {
		setPeriod("30d");
		setBranchId(undefined);
		setReasons(["entrada_compra", "saida_venda", "ajuste_inventario", "perda", "outro"]);
	}

	return (
		<div className="flex flex-col gap-4">
			<ActivityFilters
				branches={branches}
				branchId={branchId}
				onBranchChange={setBranchId}
				onPeriodChange={setPeriod}
				onReasonToggle={toggleReason}
				period={period}
				reasons={reasons}
			/>

			{items.length === 0 ? (
				<div className="rounded-md border border-border py-12 text-center">
					<p className="text-muted-foreground text-sm">
						{isFiltered
							? "Sem movimentações pra esses filtros."
							: "Sem movimentações registradas."}
					</p>
					{isFiltered && (
						<Button onClick={resetFilters} size="sm" variant="ghost">
							Limpar filtros
						</Button>
					)}
				</div>
			) : (
				<>
					<ActivityTimeline rows={items} />
					{hasMore && (
						<Button
							className="self-center"
							disabled={pending}
							onClick={loadMore}
							variant="outline"
						>
							{pending ? <><Spinner /> Carregando…</> : "Carregar mais"}
						</Button>
					)}
					{error && <p className="text-destructive text-sm">{error}</p>}
				</>
			)}
		</div>
	);
}
```

### Filters UI

```tsx
"use client";

const PERIOD_OPTIONS: Array<{ value: PeriodPreset; label: string }> = [
	{ value: "today", label: "Hoje" },
	{ value: "7d", label: "7 dias" },
	{ value: "30d", label: "30 dias" },
	{ value: "90d", label: "90 dias" },
	{ value: "all", label: "Tudo" },
];

const REASON_OPTIONS: Array<{ value: string; label: string }> = [
	{ value: "entrada_compra", label: "Entrada" },
	{ value: "saida_venda", label: "Saída" },
	{ value: "ajuste_inventario", label: "Ajuste" },
	{ value: "perda", label: "Perda" },
	{ value: "outro", label: "Outro" },
];

export function ActivityFilters({ ... }: ActivityFiltersProps) {
	return (
		<div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/30 p-3">
			{/* Period presets */}
			<div className="inline-flex rounded-md border border-border bg-background p-0.5">
				{PERIOD_OPTIONS.map((p) => (
					<button
						className={cn(
							"rounded px-2 py-1 text-xs",
							period === p.value
								? "bg-primary text-primary-foreground"
								: "text-muted-foreground hover:bg-muted"
						)}
						key={p.value}
						onClick={() => onPeriodChange(p.value)}
						type="button"
					>
						{p.label}
					</button>
				))}
			</div>

			{/* Branch select */}
			<Select onValueChange={(v) => onBranchChange(v === "_all_" ? undefined : v)} value={branchId ?? "_all_"}>
				<SelectTrigger className="w-[160px]">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="_all_">Todas filiais</SelectItem>
					{branches.map((b) => (
						<SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
					))}
				</SelectContent>
			</Select>

			{/* Reason chips */}
			<div className="flex flex-wrap gap-1.5">
				{REASON_OPTIONS.map((r) => {
					const active = reasons.includes(r.value);
					return (
						<button
							className={cn(
								"rounded-full border px-2.5 py-0.5 text-xs transition",
								active
									? "border-primary bg-primary/10 text-primary"
									: "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
							)}
							key={r.value}
							onClick={() => onReasonToggle(r.value)}
							type="button"
						>
							{active && <CheckIcon className="mr-1 inline size-3" />}
							{r.label}
						</button>
					);
				})}
			</div>
		</div>
	);
}
```

### Timeline (extracted)

`ActivityTimeline` recebe `rows: ToolActivityRow[]` e renderiza o JSX atual de `activity-tab.tsx` (groupByDay + items). Move-se a função `groupByDay`, `reasonIcon`, `REASON_LABEL`, `formatTime`. Permite reuso futuro fora da tab.

### Server component refactor

```tsx
// activity-tab.tsx
import { fetchActiveBranches } from "@/lib/branches"; // ou util existente

interface ActivityTabProps {
	toolId: string;
}

export async function ActivityTab({ toolId }: ActivityTabProps) {
	const [first, branches] = await Promise.all([
		fetchToolActivityPage(
			{ toolId, period: "30d", reasons: ["entrada_compra", "saida_venda", "ajuste_inventario", "perda", "outro"] },
			null
		),
		fetchActiveBranches(),
	]);

	return (
		<ActivityTabClient
			branches={branches}
			initialCursor={first.nextCursor}
			initialItems={first.items}
			toolId={toolId}
		/>
	);
}
```

Verificar nome real do helper de branches ativas (`fetchActiveBranches` ou similar — já usado em outras rotas pós-Slice 6).

---

## Riscos & mitigações

1. **`getToolActivity` legacy:** decisão = manter (compat). Em ticket próprio, migrar consumidor (timeline-tab) e remover. Não bloqueia esta PR.
2. **Date cutoff em UTC vs local:** `new Date(now - days * 86_400_000)` opera em ms (UTC-agnostic). `today` usa `new Date(year, month, day)` — local. Pode dar off-by-one perto da meia-noite. Aceitar — dashboard interno, não cross-timezone crítico.
3. **Botão "Carregar mais" vs `InfiniteSentinel`:** sentinel pode causar carga "infinita" inadvertida em audit. Button explícito é mais defensivo. Trade-off: 1 click extra.
4. **`reasons.length === 0`** = "selecionar todos"? No client, default = todos ativos. Se operador deselecionar todos, `query.where inArray([])` → 0 results. Mostrar empty state apropriado.
5. **Tab content é `ReactNode`:** `<ActivityTab>` é async server component dentro de `EntityTabs` `content`. React 19 RSC suporta. Já funciona hoje na Slice 5.

---

## Test Plan

- [ ] `bun check-types` 0 erros.
- [ ] `/dashboard/tools/[id]?tab=atividade`:
  - [ ] Default load: período "30d" selecionado, todas filiais, todos motivos ativos.
  - [ ] Botão "Carregar mais" aparece quando há > 20 movimentos.
  - [ ] Click "Carregar mais" → adiciona próxima página, mantém scroll.
  - [ ] Click "Hoje" → reseta lista, mostra só hoje.
  - [ ] Select filial X → filtra, "Carregar mais" continua funcionando.
  - [ ] Deselecionar chip "Entrada" → filtra.
  - [ ] Deselecionar todos chips → empty state "sem movimentações pros filtros".
  - [ ] "Limpar filtros" → volta ao default.
- [ ] Cursor estabilidade: gerar 25+ movimentos rapidamente → "Carregar mais" não duplica nem pula.

---

## Próximos passos

Spec aprovada → plano com 6 tasks → implementação inline. PR único.
