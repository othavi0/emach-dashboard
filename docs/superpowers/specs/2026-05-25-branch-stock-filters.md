# Branch Stock Filters — Spec

**Data:** 2026-05-25
**Rota:** `/dashboard/stock/branches`

## Problema

A página atual tem:
- Tabs horizontais que crescem sem limite com mais filiais
- Busca isolada (sem integração com outros filtros)
- Sort hardcoded em "newest" (irrelevante para gestão de estoque)
- Sem filtro de status de urgência
- Sem filtro de categoria
- Botão "Abrir rota da filial" redundante
- Header intermediário com nome da filial e contagem (redundante com chips)

## Design aprovado

### Layout (de cima para baixo)

```
PageHeader
─────────────────────────────────────────
[SP]  [Rio de Janeiro]  [BH]  [Curitiba]  ← chips scrolláveis (server Links)
─────────────────────────────────────────
[ 🔍 Buscar... ] [Todos|Crítico|Repor|OK] [Urgência▾] [Categoria▾]  ← filter bar (client)
─────────────────────────────────────────
Cards grid (BranchStockInfinite)
```

**Removidos:** botão "Abrir rota da filial", heading intermediário com nome + contagem.

---

## Arquivos afetados

| Arquivo | Status |
|---|---|
| `apps/web/src/app/dashboard/stock/branch-stock-data.ts` | Modificar |
| `apps/web/src/app/dashboard/stock/branches/page.tsx` | Modificar |
| `apps/web/src/app/dashboard/stock/_components/branch-stock-filters.tsx` | Criar |
| `apps/web/src/app/dashboard/stock/_components/branch-search-input.tsx` | Remover (absorvido em BranchStockFilters) |

---

## Superfície 1 — `branch-stock-data.ts`

### Tipos

```ts
export type BranchStockSort = "urgency" | "name" | "stockLow" | "stockHigh";
// "newest" removido — irrelevante para gestão de estoque

export type BranchStockStatus = "all" | "critical" | "reorder" | "ok";

export interface BranchStockFiltersInput {
  branchId: string;
  categoryId?: string;
  search?: string;
  sort: BranchStockSort;
  status?: BranchStockStatus;   // undefined = "all"
}
```

### WHERE predicates adicionais

**Filtro de status** (adicionar ao `whereParts`):

```sql
-- status = "critical"
COALESCE(sl.quantity, 0) <= sl.min_qty AND sl.min_qty > 0

-- status = "reorder"
COALESCE(sl.quantity, 0) > sl.min_qty
AND COALESCE(sl.quantity, 0) <= sl.reorder_point
AND sl.reorder_point > 0

-- status = "ok"
(
  COALESCE(sl.quantity, 0) > sl.reorder_point
  OR (COALESCE(sl.min_qty, 0) = 0 AND COALESCE(sl.reorder_point, 0) = 0)
)
```

**Filtro de categoria** (copiar padrão de `actions.ts`):

```sql
EXISTS (
  SELECT 1 FROM tool_category tc
  WHERE tc.tool_id = t.id AND tc.category_id = ${filters.categoryId}
)
```

### ORDER BY

```ts
// "urgency" (default): crítico → repor → ok; dentro de cada grupo, quantidade ASC
sql`ORDER BY
  CASE
    WHEN COALESCE(sl.quantity, 0) <= sl.min_qty AND sl.min_qty > 0 THEN 1
    WHEN COALESCE(sl.quantity, 0) > sl.min_qty
         AND COALESCE(sl.quantity, 0) <= sl.reorder_point
         AND sl.reorder_point > 0 THEN 2
    ELSE 3
  END ASC,
  COALESCE(sl.quantity, 0) ASC,
  tv.id ASC`

// "name"
sql`ORDER BY t.name ASC, tv.id ASC`

// "stockLow"
sql`ORDER BY COALESCE(sl.quantity, 0) ASC, tv.id ASC`

// "stockHigh"
sql`ORDER BY COALESCE(sl.quantity, 0) DESC, tv.id DESC`
```

### Cursor pagination para novos sorts

Adicionar `quantity` ao payload de cursor onde necessário:

```ts
// "stockLow" — cursor: (quantity ASC, variantId ASC)
cursor predicate: `(COALESCE(sl.quantity, 0), tv.id) > (${decoded.quantity}, ${decoded.id})`
encode: { v: 1, sort: "stockLow", quantity: last.quantity, id: last.variantId }

// "stockHigh" — cursor: (quantity DESC, variantId DESC)
cursor predicate: `(COALESCE(sl.quantity, 0), tv.id) < (${decoded.quantity}, ${decoded.id})`
encode: { v: 1, sort: "stockHigh", quantity: last.quantity, id: last.variantId }

// "urgency" — sem cursor (reset na paginação; edge case aceitável para branch stock)
// Cursor predicate: null → sempre retorna first page quando sort muda.
// Motivo: CASE expression em cursor predicate é inviável sem CTE materializada.

// "name" — já existe, manter igual
```

> **Nota:** O cursor de "urgency" não persiste posição entre páginas. Aceitável: a maioria das filiais tem < BATCH_SIZE SKUs, e urgência é tipicamente visualizada sem scroll infinito.

---

## Superfície 2 — `branch-stock-filters.tsx` (novo componente client)

```tsx
"use client";

// Props:
interface BranchStockFiltersProps {
  categories: Array<{ depth: number; id: string; name: string }>;
}

// URL params rastreados: "search", "status", "sort", "categoryId"
// basePath: "/dashboard/stock/branches"
// Usar useFilterState + useDebouncedParam (mesmo padrão de StockFilters)

// Layout:
// <FiltersBar hasActive={hasActive} onClear={clearAll}>
//   <Input /> — busca debounced
//   <SegmentedStatus /> — Todos / Crítico / Repor / OK
//   <Select /> — Sort (Urgência / Nome / Menor estoque / Maior estoque)
//   <Select /> — Categoria (hidden if categories.length === 0)
// </FiltersBar>

// Segmented control de status:
// Usar ButtonGroup ou renderizar 4 <Button size="sm" variant={active ? "default" : "ghost"}>
// Cores: Crítico → text-destructive borda ativa, Repor → text-warning, OK → text-success
```

**URL param → tipo interno:**

| URL param | Valor | `BranchStockStatus` |
|---|---|---|
| `status` ausente ou `"all"` | Todos | `undefined` |
| `status=critical` | Crítico | `"critical"` |
| `status=reorder` | Repor | `"reorder"` |
| `status=ok` | OK | `"ok"` |

**URL param → sort:**

| URL param `sort` | `BranchStockSort` | Label |
|---|---|---|
| ausente ou `"urgency"` | `"urgency"` | Urgência |
| `"name"` | `"name"` | Nome A–Z |
| `"stock-low"` | `"stockLow"` | Menor estoque |
| `"stock-high"` | `"stockHigh"` | Maior estoque |

---

## Superfície 3 — `branches/page.tsx`

### Chips de filial

Substituir `<Tabs>` / `<TabsList>` / `<TabsTrigger>` por chips renderizados como `<Link>`:

```tsx
// Chip scrollável — server component Link
<div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
  {branches.map((b) => (
    <Link
      key={b.id}
      href={branchHref(b.id, /* preservar params de filtro */)}
      className={cn(
        "flex-shrink-0 rounded-[7px] border px-3.5 py-1.5 text-sm font-medium transition-colors",
        b.id === selectedBranch.id
          ? "border-border bg-card text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      {b.name}
    </Link>
  ))}
</div>
```

`branchHref` deve preservar `search`, `status`, `sort`, `categoryId` ao trocar de filial.

### Fetch de categorias

```tsx
// Reutilizar mesmo padrão do stock/page.tsx
const categories = await db
  .select({ id: category.id, name: category.name, depth: category.depth })
  .from(category)
  .where(eq(category.isActive, true))
  .orderBy(asc(category.path));
```

### Filtros → `BranchStockFiltersInput`

```tsx
const STATUS_MAP: Record<string, BranchStockStatus> = {
  critical: "critical",
  reorder: "reorder",
  ok: "ok",
};

const SORT_MAP: Record<string, BranchStockSort> = {
  name: "name",
  "stock-low": "stockLow",
  "stock-high": "stockHigh",
};

const filters: BranchStockFiltersInput = {
  branchId: selectedBranch.id,
  search: sp.search?.trim() || undefined,
  sort: SORT_MAP[sp.sort ?? ""] ?? "urgency",
  status: STATUS_MAP[sp.status ?? ""] ?? undefined,
  categoryId: sp.categoryId || undefined,
};
```

### Remover

- Import e uso de `BranchSearchInput`
- Import e uso de `buttonVariants` (era usado no link "Abrir rota da filial")
- O `<div>` com heading do branch + "Abrir rota da filial"
- Imports de `Tabs`, `TabsList`, `TabsTrigger`

### `searchParams` expandido

```ts
interface BranchesStockPageProps {
  searchParams: Promise<{
    branch?: string;
    categoryId?: string;
    search?: string;
    sort?: string;
    status?: string;
  }>;
}
```

### `canMutate`

Corrigir de `role === "admin"` para usar capability:

```ts
// Antes (incorreto):
const canMutate = (session.user.role ?? "user") === "admin";

// Depois (usar can() já importado de @/lib/permissions):
const canMutate = can(session.user.role, "stock.adjust");
```

---

## O que não muda

- `BranchStockInfinite` — sem alteração (recebe `filters` e `canMutate`, já passa para o card)
- `BranchStockCard` — sem alteração (já redesenhado)
- `BranchStockThresholdInputs`, `StockAdjustButton`, `AdjustStockDialog` — sem alteração
- `adjustStock` e `updateStockThresholds` actions — sem alteração

## Critérios de aceitação

- [ ] Tabs substituídas por chips scrolláveis; troca de filial preserva filtros ativos
- [ ] Filter bar unificada: busca + status (segmented) + sort + categoria em um `FiltersBar`
- [ ] Segmented control de status filtra os cards no servidor
- [ ] Sort "Urgência" ordena crítico → repor → ok (default)
- [ ] Sort "Menor/Maior estoque" funcionam
- [ ] Filtro de categoria funciona (JOIN via `tool_category`)
- [ ] Botão "Abrir rota da filial" removido
- [ ] Heading intermediário removido
- [ ] `canMutate` usa `hasCapability(session.user, "stock.adjust")`
- [ ] `BranchSearchInput` removido (sem consumidores restantes)
- [ ] `bun check-types` zero erros
