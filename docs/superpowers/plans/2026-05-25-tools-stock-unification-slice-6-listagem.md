# Slice 6 — Listagem unificada `/tools` + redirects

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Adicionar toggle Catálogo / Repor agora + filtro de filial na listagem `/dashboard/tools`. Redirecionar rotas legacy.

## Escopo

**Dentro:**
- `ToolsFiltersInput` ganha `mode?: "catalog" | "repor"` e `branchId?: string`.
- `fetchToolsPage` aplica filtros adicionais via `WHERE`/`HAVING` no SQL raw existente.
- Page `/dashboard/tools` ganha toggle segmentado + select de filial.
- URL params: `?mode=repor`, `?branchId=<uuid>`.
- Redirects:
  - `/dashboard/stock` → 308 → `/dashboard/tools?mode=repor`
  - `/dashboard/tools/[id]/stock` → 308 → `/dashboard/tools/[id]?tab=estoque`

**Fora:**
- Cards diferenciados Catálogo vs Repor (mesmo card; mode só filtra)
- Status segmento (Crítico/Repor/OK)
- Filtro "Minhas filiais agregadas" pra non-super_admin (defer; usa default "Todas")

## Mapa de arquivos

| Arquivo | Status | O que muda |
|---|---|---|
| `apps/web/src/app/dashboard/tools/actions.ts` | Modificar | Extend `ToolsFiltersInput` + adapt SQL em `fetchToolsPage` |
| `apps/web/src/app/dashboard/tools/page.tsx` | Modificar | Aceita `mode` e `branchId` query params; passa pros filtros |
| `apps/web/src/app/dashboard/tools/_components/tool-filters.tsx` | Modificar | Adiciona toggle mode + select branch |
| `apps/web/src/app/dashboard/stock/page.tsx` | **Substituir** | Redirect server component pra `/dashboard/tools?mode=repor` |
| `apps/web/src/app/dashboard/tools/[id]/stock/page.tsx` | **Substituir** | Redirect pra `/dashboard/tools/[id]?tab=estoque` |

---

## Task 1: Extend `fetchToolsPage` com mode + branch

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/actions.ts`

### Steps

- [ ] **Step 1: Adicionar campos à interface**

```typescript
export type ToolsListMode = "catalog" | "repor";

export interface ToolsFiltersInput {
	branchId?: string;
	categoryId?: string;
	mode?: ToolsListMode;
	ncm?: string;
	search?: string;
	sort: ToolSort;
	status?: string;
	visible?: string;
}
```

- [ ] **Step 2: Adicionar filtros no SQL de `fetchToolsPage`**

A função usa SQL raw com cursor. Localize a parte que monta os `WHERE` (provavelmente strings concatenadas via `sql\`...\`` ou helpers). Adicione duas condições:

1. **`branchId` filter:** quando presente, restrige `branches_breakdown` no JSON aggregate e considera o estoque só dessa filial pro `reorderCount` e `totalStock`. Implementação: usar `WHERE sl.branch_id = $branchId` no subselect que computa o breakdown.
2. **`mode === "repor"` filter:** adiciona `HAVING SUM(CASE WHEN sl.quantity <= sl.reorder_point AND sl.reorder_point > 0 THEN 1 ELSE 0 END) > 0` — só inclui tools com pelo menos uma combinação (variant × branch) em alerta. Se `branchId` também presente, o alerta deve ser **da filial filtrada**.

**Importante:** preserve o cursor-based pagination existente. Mode + branch são filtros adicionais, não substituem.

Leia primeiro `fetchToolsPage` completo no arquivo pra entender o SQL atual. Se a complexidade do SQL raw for proibitiva, **registre como BLOCKED** com descrição do que tentou — não introduza N+1 ou rewrites totais sem aprovação.

- [ ] **Step 3:** `bun check-types` → 0 erros.

---

## Task 2: Page consome mode + branch query params

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/page.tsx`

### Steps

- [ ] **Step 1: Adicionar params no schema da page**

```typescript
interface ToolsPageParams {
	branchId?: string;
	categoryId?: string;
	mode?: string;
	ncm?: string;
	search?: string;
	status?: string;
	visible?: string;
	sort?: string;
}
```

- [ ] **Step 2: Mapear `mode` e `branchId` pros filters**

```typescript
const mode: ToolsListMode | undefined =
	params.mode === "repor" ? "repor" : params.mode === "catalog" ? "catalog" : undefined;

const filters: ToolsFiltersInput = {
	search,
	categoryId: params.categoryId,
	sort,
	visible: params.visible,
	status: params.status,
	ncm: params.ncm,
	mode,
	branchId: params.branchId,
};
```

- [ ] **Step 3: Buscar lista de filiais pra passar ao filtros component**

```typescript
import { branch } from "@emach/db/schema/inventory";
import { asc, eq } from "drizzle-orm";

// no Promise.all com fetchToolsPage:
db.select({ id: branch.id, name: branch.name })
	.from(branch)
	.where(eq(branch.status, "active"))
	.orderBy(asc(branch.name)),
```

Passar `branches` pro `<ToolFilters>` como prop nova.

---

## Task 3: Filtros UI — toggle mode + select branch

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-filters.tsx`

### Steps

- [ ] **Step 1: Aceitar novos props**

```typescript
interface ToolFiltersProps {
	branches: Array<{ id: string; name: string }>;
	categories: ...;  // mantém existente
}
```

- [ ] **Step 2: Adicionar toggle mode no topo**

Logo após o título dos filtros (ou no início):

```tsx
<div className="flex items-center gap-3">
	<div className="inline-flex rounded-md border border-border bg-muted/40 p-0.5">
		<Link
			className={cn(
				"rounded px-3 py-1 text-xs",
				currentMode !== "repor"
					? "bg-background font-medium text-foreground shadow-sm"
					: "text-muted-foreground"
			)}
			href={buildHref({ mode: undefined })}
		>
			Catálogo
		</Link>
		<Link
			className={cn(
				"rounded px-3 py-1 text-xs",
				currentMode === "repor"
					? "bg-destructive/15 font-medium text-destructive"
					: "text-muted-foreground"
			)}
			href={buildHref({ mode: "repor" })}
		>
			Repor agora
		</Link>
	</div>
</div>
```

`currentMode` lê de `useSearchParams`. `buildHref` constrói URL preservando outros params.

- [ ] **Step 3: Adicionar select de filial** na linha dos filtros existentes:

```tsx
<Select onValueChange={(v) => updateParam("branchId", v === "_all_" ? undefined : v)} value={currentBranchId ?? "_all_"}>
	<SelectTrigger className="w-[180px]">
		<SelectValue placeholder="Todas as filiais" />
	</SelectTrigger>
	<SelectContent>
		<SelectItem value="_all_">Todas as filiais</SelectItem>
		{branches.map((b) => (
			<SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
		))}
	</SelectContent>
</Select>
```

Reuse o helper de atualização de query param já existente em `tool-filters.tsx` (use o pattern atual — vide categoryId/status/ncm). Não introduza novo router pattern.

---

## Task 4: Redirects das rotas legacy

**Files:**
- Modify: `apps/web/src/app/dashboard/stock/page.tsx` — substituir completamente
- Modify: `apps/web/src/app/dashboard/tools/[id]/stock/page.tsx` — substituir completamente

### Conteúdo de `apps/web/src/app/dashboard/stock/page.tsx`

```tsx
import { redirect } from "next/navigation";

export default function StockRedirect() {
	redirect("/dashboard/tools?mode=repor");
}
```

### Conteúdo de `apps/web/src/app/dashboard/tools/[id]/stock/page.tsx`

```tsx
import { redirect } from "next/navigation";

interface PageProps {
	params: Promise<{ id: string }>;
}

export default async function ToolStockRedirect({ params }: PageProps) {
	const { id } = await params;
	redirect(`/dashboard/tools/${id}?tab=estoque`);
}
```

**Atenção:** ambas rotas continham componentes próprios; substituir tudo. Os arquivos children (`_components/` em `/stock/`) podem ficar — não serão importados.

---

## Task 5: Smoke

- [ ] `/dashboard/stock` redireciona pra `/dashboard/tools?mode=repor`.
- [ ] Em `/dashboard/tools?mode=repor`, apenas tools com algum alerta aparecem.
- [ ] Sem `?mode=repor`, todas as tools aparecem.
- [ ] Filtro de filial filtra cards e somas.
- [ ] `/dashboard/tools/[id]/stock` redireciona pra `/dashboard/tools/[id]?tab=estoque`.
- [ ] Badge sidebar "N a repor" continua linkando — agora pode aplicar `?mode=repor` no href.

### Bonus: atualizar sidebar pra linkar com `?mode=repor`

Em `apps/web/src/app/dashboard/_components/app-sidebar.tsx`, no render do badge `reporCount`, mudar o href do `Link` parent quando estiver no item `tools`:

Antes:
```tsx
<Link href={item.href}>...</Link>
```

Substituir somente para tools (manter pattern):
```tsx
<Link href={item.href === "/dashboard/tools" && reporCount > 0 ? "/dashboard/tools?mode=repor" : item.href}>
```

Cuidado: o `isActive` check pode quebrar com query string. Verificar `isActive(pathname, item)` — provavelmente compara só pathname, OK.

---

## Commit

```bash
git add apps/web/src/app/dashboard/
git commit -m "feat(tools): listagem unificada com toggle Catálogo/Repor + redirects"
```

## Riscos

1. **SQL raw em `fetchToolsPage`** é complexo. Se ficar > 30 min pra modificar, prefira BLOCKED e flag pra controller.
2. **Cursor com filtros novos** — o cursor codifica ordenação, mas filtros não afetam cursor (só linha resultado). Deve funcionar.
3. **`isActive` na sidebar** com query string — verificar se ainda match em `/tools` quando href é `/tools?mode=repor`.
