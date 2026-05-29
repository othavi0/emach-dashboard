# Redesenho da UI de `/dashboard/promotions` no padrão filiais

**Data:** 2026-05-29
**Status:** Aprovado para implementação

## Contexto e causa-raiz

O CRUD de promotions **já existe e está completo** (actions com create/update/delete/toggle/duplicate/list/get, schema Zod, form, páginas `new`/`edit`, grid, card, sheet, filtros). `bun check-types` passa e as tabelas `promotion`/`promotion_tool` existem no banco com dados.

O que dava a impressão de "não dá pra criar promoções" era um **bug de gating** em `promotions/page.tsx`:

```ts
const canMutate = role === "admin" || role === "manager"; // ❌ exclui super_admin
```

O único admin do sistema (`othavioquiliao@gmail.com`) é `super_admin`, então o botão "Nova promoção" nunca aparecia. O resto do app usa `can(session.user.role, "<cap>")`, que com os gates desligados (ADR-0012) retorna `true` para qualquer sessão ativa.

Decidiu-se aproveitar a oportunidade para **redesenhar a UI inteira espelhando o CRUD de filiais**, mantendo 100% das server actions e reaproveitando os componentes compartilhados.

## Decisões (brainstorming)

| Decisão | Escolha |
|---|---|
| Paginação | **Scroll infinito** cursor-based, igual filiais (refatorar `listPromotions`) |
| Edição | **Sheet inline** (`?edit=id`), igual filiais — remove a página `/[id]/edit` |
| KPIs no topo | **Não** — mantém header + filtros + grid enxutos |

## Arquitetura-alvo (referência: filiais)

Padrões compartilhados reaproveitados:
- `@/lib/infinite` (`InfiniteResult<T>`, `BATCH_SIZE`, `paginate`)
- `@/lib/cursor` (`encodeCursor`/`decodeCursor`/`decodeCursorAs`)
- `@/lib/use-infinite-list` (`useInfiniteList`)
- `@/components/infinite-sentinel` (`InfiniteSentinel`)
- `@/components/filters-bar` (`FiltersBar`) + `@/lib/use-filter-state` (`useFilterState`, `useDebouncedParam`)
- `@/components/entity/entity-edit-sheet` (`EntityEditSheet`)

## Mudanças

### 1. Fix de gating (`promotions/page.tsx`)

Trocar o check hardcoded por `can(session.user.role, "promotions.manage")`. Sozinho, já restaura o CRUD para super_admin.

### 2. Backend — paginação cursor (`promotions/actions.ts`)

Substituir `listPromotions(options): PromotionListItem[]` por:

```ts
export async function fetchPromotionsPage({
  filters, cursor,
}: { filters: ListPromotionsOptions; cursor: string | null }): Promise<InfiniteResult<PromotionListItem>>
```

- **Preserva** todos os filtros atuais: `search` (title/code ILIKE), `type`, `status` (active/scheduled/expired/inactive via SQL `now()`), `toolId` (subquery), `discountMin`/`discountMax`.
- **Preserva** o `with` relacional (promotionTools→tool→variants/images, createdByUser, updatedByUser) e o mapeamento + `computeStatus`.
- Mantém a query via `db.query.promotion.findMany` com `where` SQL + `limit(BATCH_SIZE + 1)` + keyset no `orderBy`.

**Keyset por sort** (tie-break sempre por `id` para estabilidade):

| Sort | orderBy | Cursor tuple |
|---|---|---|
| `createdDesc` (default) | `createdAt DESC, id DESC` | `(createdAt, id) <` → `NewestCursor` (existe) |
| `createdAsc` | `createdAt ASC, id ASC` | `(createdAt, id) >` → **novo** `PromoCreatedAscCursor` |
| `discountDesc` | `discountPct DESC, id DESC` | `(discountPct, id) <` → **novo** `PromoDiscountCursor` |
| `discountAsc` | `discountPct ASC, id ASC` | `(discountPct, id) >` → **novo** (reusa `PromoDiscountCursor` + flag) |
| `endsAtAsc` | `endsAt ASC NULLS LAST, id ASC` | ver abaixo → `ExpiringPromoCursor` (existe) |

**Ponto de maior cuidado — `endsAtAsc` com coluna nullable:** `ASC` no Postgres é `NULLS LAST`. O predicado keyset precisa ser condicional:
- Se o cursor tem `endsAt` não-nulo: `(endsAt > c.endsAt) OR (endsAt = c.endsAt AND id > c.id) OR (endsAt IS NULL)`.
- Se o cursor já está na região NULL: `(endsAt IS NULL AND id > c.id)`.

`discountPct` é `numeric` (chega como string via Drizzle) e **não é único** → o tie-break por `id` é obrigatório. Comparar como número no tuple SQL (`::numeric`).

**`@/lib/cursor.ts`** — adicionar (aditivo, não quebra o union existente):
```ts
export interface PromoCreatedAscCursor extends CursorBase { sort: "promoCreatedAsc"; createdAt: string }
export interface PromoDiscountCursor extends CursorBase { sort: "promoDiscountDesc" | "promoDiscountAsc"; discountPct: string }
```
(e somar ao `type Cursor`).

`getPromotion` e create/update/delete/toggle permanecem inalterados. `duplicatePromotion`: após criar, o caller passa a abrir `?edit=newId` (em vez de navegar para `/[id]/edit`).

### 3. Front

**`promotions/page.tsx`**
- `can(...)` para `canMutate` (fix).
- Buscar primeira página via `fetchPromotionsPage({ filters, cursor: null })`.
- Buscar `selectedPromotion` (`?view`) e `editPromotion` (`?edit`) via `getPromotion` em paralelo.
- Passar `initial`/`initialCursor`/`filters`/`canMutate`/sheets para `PromotionsGrid`.

**`promotion-filters.tsx`** — reescrito sobre `FiltersBar` + `useFilterState`/`useDebouncedParam`:
- Linha principal: busca (debounced), tipo, status, ordenar por.
- Avançados (toggle): ferramenta (combobox) + faixa de desconto min/max.
- `clearAll` via `useFilterState` com `trackedKeys`.

**`promotions-grid.tsx`** — `useInfiniteList` + `InfiniteSentinel`:
- `fetchPage: (cursor) => fetchPromotionsPage({ filters, cursor })`, `resetKey = JSON.stringify(filters)`.
- Empty state com ícone (padrão `BranchCardGrid`).
- Hospeda `PromotionSheet` (view) e `PromotionEditSheet` (edit).

**`promotion-card.tsx`** — mantém conteúdo; alinha chrome ao `BranchCard`:
- Container clicável → `?view=id`, hover/focus do padrão filial.
- Ações ghost (ícone) no canto quando `canMutate`: ✏️ Editar → `?edit=id` (e opcionalmente pausar/ativar).

**`promotion-form-fields.tsx` (novo)** — espelha `BranchFormFields`:
- Props: `values: PromotionFormValues`, `onPatch: (p: Partial<PromotionFormValues>) => void`, `errors`, `disabled`, `availableTools`, `mode`.
- Seções: Tipo (radio, só create) · Título · Descrição · Desconto (%) · Ativa (switch) · Datas · Código (se promocode) · Ferramentas (combobox).
- Sem estado próprio de submit — controlado pelo pai.

**`promotion-edit-sheet.tsx` (novo)** — espelha `BranchEditSheet`:
- `EntityEditSheet` + `PromotionFormFields`.
- Abre via `?edit=id`; `open = params.get("edit")` presente.
- `useState<PromotionFormValues>` inicializado de `getPromotion`, `useTransition`, `safeParse` com `promotionSchema`, `zodIssuesToFormIssues`, chama `updatePromotion`, fecha + `router.refresh()`.

**`promotion-sheet.tsx` (view)** — mantido; botões "Editar"/"Gerenciar" → `?edit=id` (sem navegar). "Duplicar" → `?edit=newId`.

**`new/page.tsx`** — `PromotionForm` passa a compor `PromotionFormFields` internamente (form de página mantém botões próprios). Página `/new` mantida.

**`[id]/edit/page.tsx`** — **removida**. Ajustar todos os links `/${id}/edit` (em `promotion-quick-actions.tsx`, `promotion-sheet.tsx`) para `?edit=id`.

### 4. Polimento `/impeccable`

Após a estrutura compilar e a rota rodar (`bun dev:web`), passar `/impeccable` em card/sheets/filtros para fechar o acabamento visual contra o das filiais.

## Verificação

- `bun check-types` limpo.
- Smoke em `bun dev:web`: criar (page `/new`), editar (sheet `?edit`), visualizar (`?view`), duplicar, pausar/ativar, excluir; scroll infinito com cada sort (atenção a `endsAtAsc` e empates de desconto); filtros + limpar.

## Fora de escopo

- Reativar gates role-based (ADR-0012) — segue desligado.
- Mudanças no schema do banco ou nas regras de conflito/stacking.
- Religar capabilities novas.
