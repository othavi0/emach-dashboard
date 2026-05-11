# Scroll infinito + sort "mais nova" default em todas as listagens

**Data:** 2026-05-11
**Escopo:** Adicionar paginação cursor-based via scroll infinito (IntersectionObserver + Server Action) e default sort = "mais nova" (`created_at DESC, id DESC`) em 8 listagens do dashboard.

---

## Contexto

Listagens atuais (`/dashboard/tools`, `/dashboard/stock`, `/dashboard/stock/branches`, `/dashboard/branches`, `/dashboard/orders`, `/dashboard/promotions`, `/dashboard/reviews`, `/dashboard/suppliers`) carregam **todos os registros** numa única request SSR. Funciona enquanto catálogos são pequenos (~50 ferramentas, ~10 promoções), mas:

- Tempo de render cresce linearmente com a tabela.
- Não há mecanismo para limitar payload ao usuário; um catálogo de 1k itens emitiria ~1k cards no DOM.
- Sort default varia entre listagens, sem coerência ("nome", "urgência", "criado por último").

Decisão: padronizar **default sort = mais nova primeiro** em todas as listagens flat, com **scroll infinito cursor-based** carregando 24 itens por batch. Stock Geral é a única exceção mantida (`urgência` default — sinal operacional supera ordenação cronológica).

Categorias (`/dashboard/categories`) ficam **fora** — é árvore hierárquica, não lista flat.

## Decisões da fase de brainstorming

| # | Pergunta | Resposta |
|---|----------|----------|
| 1 | Foco do plano | P1 apenas (scroll infinito + sort newest). Outras pendências em specs separados. |
| 2 | Stock Geral muda para "mais nova"? | **Não.** Mantém `urgência` default. "Mais nova" entra como opção no select. |
| 3 | Cursor vs offset | **Cursor-based.** Estável sob concorrência. |
| 4 | Batch size + trigger | **24 itens** + IntersectionObserver auto + fallback "Carregar mais" botão. |
| 5 | Fetch impl | **Server Action por listagem** + hook compartilhado `useInfiniteList`. |
| 6 | "Mais nova" em Stock por Filial | `tool.created_at` da ferramenta-pai (não da variante). |

## Listagens em escopo

| Página | Default sort | Sort key composto | Outras opções de sort |
|--------|--------------|-------------------|----------------------|
| `/dashboard/tools` | newest | `tool.created_at DESC, tool.id DESC` | Nome (atual default → vira opção) |
| `/dashboard/stock` | **urgência** (mantido) | `reorder_count DESC, total_stock ASC, tool.created_at DESC, tool.id DESC` | Mais nova, Nome, Maior estoque, Menor estoque |
| `/dashboard/stock/branches` | newest | `tool.created_at DESC, tool_variant.id DESC` | Nome (default atual → vira opção) |
| `/dashboard/branches` | newest | `branch.created_at DESC, branch.id DESC` | Nome |
| `/dashboard/orders` | newest | `order.created_at DESC, order.id DESC` | — (já era default) |
| `/dashboard/promotions` | newest | `promotion.created_at DESC, promotion.id DESC` | (manter ordens existentes como opções) |
| `/dashboard/reviews` | newest | `review.created_at DESC, review.id DESC` | (já indexado por status+created_at) |
| `/dashboard/suppliers` | newest | `supplier.created_at DESC, supplier.id DESC` | Nome |

## Arquitetura

### Cursor opaco

Cursor = `base64url(JSON)`. Payload por sort define os campos:

```ts
// apps/web/src/lib/cursor.ts

export interface CursorBase {
  v: 1;                     // versão do schema do cursor (futuro-proof)
  id: string;
}

export type Cursor =
  | (CursorBase & { sort: "newest"; createdAt: string })
  | (CursorBase & { sort: "name"; name: string })
  | (CursorBase & { sort: "stockHigh" | "stockLow"; totalStock: number })
  | (CursorBase & {
      sort: "urgency";
      reorderCount: number;
      totalStock: number;
      createdAt: string;
    });

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString("base64url");
}

export function decodeCursor(raw: string): Cursor {
  const parsed = JSON.parse(Buffer.from(raw, "base64url").toString());
  if (parsed.v !== 1) throw new Error("Cursor incompatível");
  return parsed as Cursor;
}
```

### Contrato genérico

```ts
// apps/web/src/lib/infinite.ts

export interface InfiniteResult<T> {
  items: T[];
  nextCursor: string | null;
}

export const BATCH_SIZE = 24;
```

### Padrão de query (newest sort, fetch+1)

```sql
SELECT ...
FROM tool t
WHERE
  ${whereClauseFromFilters}
  ${cursor ? sql`AND (t.created_at, t.id) < (${cursor.createdAt}::timestamp, ${cursor.id})` : sql``}
ORDER BY t.created_at DESC, t.id DESC
LIMIT ${BATCH_SIZE + 1}
```

Após executar:
- Se `rows.length === BATCH_SIZE + 1`: descartar o último, emitir `nextCursor = encodeCursor({ ..., id: lastSent.id, createdAt: lastSent.createdAt })`.
- Senão: `nextCursor = null` (fim da lista).

### Padrão de query (urgência sort, Stock Geral — multi-key direção mista)

Row-constructor comparison `(a, b) < (x, y)` em Postgres exige direções iguais. Para urgência (DESC, ASC, DESC, DESC), decompor em OR explícito:

```sql
WHERE (
  reorder_count < ${cursor.reorderCount}
) OR (
  reorder_count = ${cursor.reorderCount} AND total_stock > ${cursor.totalStock}
) OR (
  reorder_count = ${cursor.reorderCount}
  AND total_stock = ${cursor.totalStock}
  AND t.created_at < ${cursor.createdAt}::timestamp
) OR (
  reorder_count = ${cursor.reorderCount}
  AND total_stock = ${cursor.totalStock}
  AND t.created_at = ${cursor.createdAt}::timestamp
  AND t.id < ${cursor.id}
)
ORDER BY reorder_count DESC, total_stock ASC, t.created_at DESC, t.id DESC
```

### Hook compartilhado

```ts
// apps/web/src/lib/use-infinite-list.ts
"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

interface InfiniteResult<T> {
  items: T[];
  nextCursor: string | null;
}

interface UseInfiniteListProps<T> {
  initialItems: T[];
  initialCursor: string | null;
  fetchPage: (cursor: string) => Promise<InfiniteResult<T>>;
  resetKey?: string;
}

export function useInfiniteList<T>({
  initialItems,
  initialCursor,
  fetchPage,
  resetKey,
}: UseInfiniteListProps<T>) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const lastResetKey = useRef(resetKey);

  if (resetKey !== lastResetKey.current) {
    lastResetKey.current = resetKey;
    setItems(initialItems);
    setCursor(initialCursor);
    setError(null);
  }

  const loadMore = useCallback(() => {
    if (!cursor || pending) return;
    startTransition(async () => {
      try {
        const next = await fetchPage(cursor);
        setItems((prev) => [...prev, ...next.items]);
        setCursor(next.nextCursor);
      } catch {
        setError("Falha ao carregar mais. Tente novamente.");
      }
    });
  }, [cursor, pending, fetchPage]);

  return { items, hasMore: cursor !== null, loadMore, pending, error };
}
```

### Sentinel + fallback button

```tsx
// apps/web/src/components/infinite-sentinel.tsx
"use client";
import { Button } from "@emach/ui/components/button";
import { useEffect, useRef } from "react";

interface Props {
  hasMore: boolean;
  pending: boolean;
  error: string | null;
  onLoadMore: () => void;
}

export function InfiniteSentinel({ hasMore, pending, error, onLoadMore }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasMore || pending || error) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, pending, error, onLoadMore]);

  if (!hasMore) {
    return <p className="py-8 text-center text-muted-foreground text-xs">— fim da lista —</p>;
  }

  return (
    <div className="flex flex-col items-center gap-2 py-6" ref={ref}>
      {pending && <p className="text-muted-foreground text-xs">Carregando…</p>}
      {error && (
        <>
          <p className="text-destructive text-xs">{error}</p>
          <Button onClick={onLoadMore} size="sm" variant="outline">
            Tentar de novo
          </Button>
        </>
      )}
      <Button disabled={pending} onClick={onLoadMore} size="sm" variant="ghost">
        Carregar mais
      </Button>
    </div>
  );
}
```

### Wrapper client por feature (exemplo: tools)

```tsx
// apps/web/src/app/dashboard/tools/_components/tools-infinite.tsx
"use client";
import { useInfiniteList } from "@/lib/use-infinite-list";
import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { ToolCardGrid } from "@/app/dashboard/_components/tool-card-grid";
import type { ToolCardData } from "@/app/dashboard/_components/tool-card";
import { ToolCardActions } from "./tool-card-actions";
import { fetchToolsPage, type ToolsFiltersInput } from "../actions";

interface ToolsInfiniteProps {
  initial: ToolCardData[];
  initialCursor: string | null;
  filters: ToolsFiltersInput;
  canMutate: boolean;
}

export function ToolsInfinite({ initial, initialCursor, filters, canMutate }: ToolsInfiniteProps) {
  const resetKey = JSON.stringify(filters);
  const { items, hasMore, loadMore, pending, error } = useInfiniteList({
    initialItems: initial,
    initialCursor,
    fetchPage: (cursor) => fetchToolsPage({ filters, cursor }),
    resetKey,
  });

  return (
    <div aria-live="polite">
      <ToolCardGrid
        canMutate={canMutate}
        renderActions={(tool) => (
          <ToolCardActions toolId={tool.id} toolName={tool.name} />
        )}
        tools={items}
        variant="catalog"
      />
      <InfiniteSentinel
        error={error}
        hasMore={hasMore}
        onLoadMore={loadMore}
        pending={pending}
      />
    </div>
  );
}
```

### Page server (exemplo: tools)

```tsx
// apps/web/src/app/dashboard/tools/page.tsx (recorte)
const role = (await requireCurrentSession()).user.role ?? "user";
const canMutate = role === "admin";
const params = await searchParams;
const search = params.search ?? params.q;
const filters: ToolsFiltersInput = {
  search,
  categoryId: params.categoryId,
  status: params.status,
  visible: params.visible,
  ncm: params.ncm,
  sort: params.sort ?? "newest",
};

const first = await fetchToolsPage({ filters, cursor: null });
const isEmpty = first.items.length === 0;

return (
  <>
    <PageHeader ... />
    <ToolFilters categories={...} />
    {isEmpty ? (
      <Empty>...</Empty>
    ) : (
      <ToolsInfinite
        canMutate={canMutate}
        filters={filters}
        initial={first.items}
        initialCursor={first.nextCursor}
      />
    )}
  </>
);
```

### Server Action (exemplo: tools)

```ts
// apps/web/src/app/dashboard/tools/actions.ts
"use server";
import { db } from "@emach/db";
import { sql } from "drizzle-orm";

import { decodeCursor, encodeCursor, type Cursor } from "@/lib/cursor";
import { BATCH_SIZE, type InfiniteResult } from "@/lib/infinite";
import type { ToolCardData } from "@/app/dashboard/_components/tool-card";

export type ToolSort = "newest" | "name";

export interface ToolsFiltersInput {
  search?: string;
  categoryId?: string;
  status?: string;
  visible?: string;
  ncm?: string;
  sort: ToolSort;
}

interface FetchPageArgs {
  filters: ToolsFiltersInput;
  cursor: string | null;
}

export async function fetchToolsPage({
  filters,
  cursor,
}: FetchPageArgs): Promise<InfiniteResult<ToolCardData>> {
  const decoded = cursor ? decodeCursor(cursor) : null;
  // ... build WHERE from filters (same as today)
  // ... append cursor predicate based on filters.sort
  // ... ORDER BY + tiebreaker
  // ... LIMIT BATCH_SIZE + 1
  // ... map rows to ToolCardData[]
  // ... if rows.length > BATCH_SIZE: pop extra, build nextCursor from last sent
  return { items, nextCursor };
}
```

## Mudanças por listagem (checklist por feature)

Cada feature segue o mesmo padrão:

1. **`actions.ts`** ganha (ou substitui) `fetchXxxPage({ filters, cursor })` que retorna `InfiniteResult<XxxCardData>`. Filtros tipados via interface, `sort` incluído. Query passa a usar cursor predicate + LIMIT+1.
2. **`page.tsx`** chama `fetchXxxPage` com `cursor: null`, passa resultado para `<XxxInfinite>` client wrapper. Empty state baseado em `first.items.length === 0`.
3. **Filtros (`_components/xxx-filters.tsx`)** — select de sort ganha "Mais nova" como primeira option (default) onde aplicável. Stock Geral mantém "Urgência" primeiro.
4. **Wrapper client** (`xxx-infinite.tsx`) usa `useInfiniteList` + `InfiniteSentinel`. `resetKey = JSON.stringify(filters)`.

### Helpers compartilhados

- `apps/web/src/lib/cursor.ts` — `encodeCursor`, `decodeCursor`, tipos.
- `apps/web/src/lib/infinite.ts` — `InfiniteResult<T>`, `BATCH_SIZE = 24`.
- `apps/web/src/lib/use-infinite-list.ts` — hook client.
- `apps/web/src/components/infinite-sentinel.tsx` — sentinel + botão.

## Indexes Postgres necessários

Aplicar via novo script `packages/db/src/migrations/_indexes.sql` + runner `bun db:apply-indexes`:

```sql
CREATE INDEX IF NOT EXISTS tool_created_idx       ON tool(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS tool_variant_id_idx    ON tool_variant(id DESC);  -- já PK, mas DESC explícito ajuda
CREATE INDEX IF NOT EXISTS branch_created_idx     ON branch(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS promotion_created_idx  ON promotion(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS supplier_created_idx   ON supplier(created_at DESC, id DESC);

-- Stock Geral urgência sort não tem index dedicado: reorder_count e total_stock
-- são agregações computadas via subquery, não colunas — usar plan default
-- (Index Scan em tool_created_idx + Sort).
```

`order_status_created_idx` e `review_status_created_idx` já existem (verificados em `orders.ts:95` e `reviews.ts:62`).

## Filtros / searchParams

Cada listagem mantém os filtros existentes em searchParams. Acrescenta:

- `sort` — valor entre as opções da listagem. Server normaliza para default se ausente ou inválido.
- **Cursor NÃO** entra em searchParams. Vive em state do hook client (memória).

Mudança de filtro/sort → `searchParams` muda → Next 16 re-renderiza server component → `first` recomputado → wrapper client recebe novo `initial`/`initialCursor` → hook reseta via `resetKey`. (`resetKey` é a primeira linha de defesa; remount via Next router é a segunda.)

## Server-side resilience

- **Cursor inválido** (decode falha, versão errada, JSON corrupto): server action lança `Error("cursor inválido")`. Client captura no `try/catch` do hook → estado `error`. Usuário pode "Tentar de novo" — falha de novo se mantém o cursor. Mitigação: hook descarta cursor e reseta para `initialCursor` quando recebe erro consecutivo (fora do escopo — adicionar se observado).
- **Sort param desconhecido**: server normaliza para default da listagem.
- **Filtros inválidos**: server Zod-parseia; campos desconhecidos silenciados.
- **DB error**: action lança; client mostra erro com retry.

## Acessibilidade

- Wrapper client tem `aria-live="polite"` para anunciar novos itens carregados.
- Botão "Carregar mais" sempre visível (keyboard-only users navegam sem depender de IntersectionObserver).
- IntersectionObserver `rootMargin: "200px"` antecipa o load antes do user chegar no fim.
- Estado "Carregando…" anunciado via DOM (text content muda).
- Estado "— fim da lista —" como `<p>` semântica.

## Performance

- **Tempo de primeiro paint**: 24 itens vs N itens → first paint mais rápido em catálogos grandes; idêntico em catálogos pequenos (≤ 24).
- **Memória client**: cresce linearmente com batches carregados (24 × N cards). Sem virtualização — aceitável até ~10 batches (240 cards). Adiar virtualização até evidência empírica.
- **Indexes**: confirmar uso via `EXPLAIN ANALYZE` durante verification.
- **Server Action serialization**: ~10KB JSON por batch (24 × ~400 bytes per ToolCardData). Negligível.
- **Concurrent loadMore**: hook usa `pending` flag para guardar contra disparos paralelos (scroll rápido).

## Riscos

1. **Scroll restoration ao voltar**: client state é perdido. Usuário pode acabar voltando para "primeira página" após navegar a um detalhe. Aceito; `sessionStorage` persist fora de escopo.
2. **Insert/Delete concorrente entre batches**: cursor-based é resiliente — não pula nem repete linhas existentes; row recém-inserida só aparece se entrar antes do cursor (ordem newest = não aparece, está depois do cursor).
3. **Mudança de filtro mid-scroll**: aceito; reset perde scroll position. Comportamento padrão de qualquer filtragem em SSR.
4. **Stock Geral urgência sort com 4 colunas**: cursor maior, query mais complexa. Mitigação: extrai `buildUrgencyCursorPredicate` para módulo testável.
5. **Stock por Filial variants de mesma tool em batches diferentes**: aceito (risk #8 da seção 5). Agrupamento explícito de variantes fora de escopo.
6. **Cursor schema versioning**: cursor `v: 1`. Mudanças futuras precisam incrementar versão; cursors antigos invalidados graciosamente.

## Plano de verificação

1. `bun check-types` zero novos erros.
2. `bun check` zero novos erros.
3. `bun db:apply-indexes` aplica os 4 índices novos sem erro.
4. `bun dev:web` smoke em cada uma das 8 listagens:
   - Initial render mostra 24 itens (ou menos se total < 24).
   - Scroll até fim → carrega +24 (verificar Network).
   - Após carregar tudo: vê "— fim da lista —".
   - Filtro/sort change reseta scroll para topo, mostra primeiros 24 do critério novo.
   - Botão "Carregar mais" funciona como fallback.
   - Empty state ainda renderiza quando `items.length === 0`.
5. `EXPLAIN ANALYZE` nas queries base com cursor não-nulo. Confirmar `Index Scan using tool_created_idx`.
6. DevTools throttle "Slow 3G" em uma listagem grande — confirma que loading state aparece.

## Backlog — fora deste plano

- Virtualização de DOM (react-window/tanstack-virtual).
- Scroll restoration via sessionStorage.
- Pre-fetch de próximo batch antes de atingir sentinel.
- Cache client (TanStack Query).
- Real-time invalidation via websocket.
- Cursor em URL (deep-link para meio da lista).
- `cacheTag` por feature + `revalidateTag` em mutations.
- Bulk select + ações em massa.
- Toggle cards/tabela (mantido fora; reabrir se ops pedirem).

## Próximos passos

Após aprovação: invocar `superpowers:writing-plans` para gerar plano de implementação com tasks atômicas.
