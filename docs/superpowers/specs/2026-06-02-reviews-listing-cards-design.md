# Listagem de avaliações — cards + tabs sem "Todas"

> Spec de design. A listagem `/dashboard/reviews` migra da tabela (`ReviewQueueTable`)
> para um **grid de cards media-card** (DESIGN.md §4), mantendo as estrelas, e remove a
> tab "Todas" deixando "Pendentes" como primeira e padrão.

## Problema

A listagem de avaliações usa uma `<Table>` (`review-queue-table.tsx`), divergindo do padrão
de cards que o sistema adotou (filiais, estoque, ferramentas). O usuário quer a listagem no
padrão de cards do sistema, **preservando as estrelas** (nota) que são o sinal-chave da fila
de moderação. Além disso, a tab "Todas" abre a listagem num estado pouco útil — o trabalho de
moderação começa pelos **Pendentes**.

## Objetivo

1. Substituir a tabela por um **grid de cards** no arquétipo media-card.
2. Remover a tab "Todas"; "Pendentes" vira a primeira tab e o estado padrão.

Fora de escopo: migrar a listagem para scroll infinito (`useInfiniteList`) — hoje `listReviews`
traz tudo de uma vez; o grid herda esse fetch. Fica como follow-up.

## Decisões de design (validadas no visual companion)

| Decisão | Escolha |
|---|---|
| Layout | Grid de cards (estilo catálogo), não lista full-width |
| Tratamento da data/rodapé | **A2**: rodapé edge-to-edge com estrelas (esquerda) + data (direita) |
| Ação | Card inteiro clicável → detalhe; **sem** botão "Ver" |
| Tabs | Remove "Todas"; ordem Pendentes (padrão) → Aprovadas → Rejeitadas → Spam |

## Parte 1 — Tabs

| Arquivo | Mudança |
|---|---|
| `reviews/status-meta.ts` | Remove `{ key: "all", label: "Todas", status: null }` de `REVIEW_TABS`. Ordem final: `pending`, `approved`, `rejected`, `spam`. (O primeiro item passa a ser o default.) |
| `reviews/schema.ts` | `tab` enum remove `"all"`: `z.enum(["pending","approved","rejected","spam"]).default("pending")`. |
| `reviews/page.tsx` | `currentTab` continua `REVIEW_TABS.find(... ?? REVIEW_TABS[0])` — agora `REVIEW_TABS[0]` é `pending`. `hasFilters`: trocar `filters.tab !== "all"` por `filters.tab !== "pending"`. |
| `reviews/_components/reviews-filters.tsx` | `buildTabHref`: a tab que **omite** o `?tab=` passa a ser `"pending"` (era `"all"`) — `if (tabKey !== "pending")`. `currentTab` default: `filters.tab \|\| "pending"`. |
| `reviews/data.ts` | `getReviewsTabCounts` ainda calcula `counts.all` (não mais consumido). Manter é inofensivo; remoção opcional. |

**Atenção (boundary):** `buildTabHref` e o `currentTab` precisam concordar sobre qual tab é a
"default sem param" — senão a tab Pendentes não destaca como ativa quando a URL é `/dashboard/reviews`
sem querystring. Ambos passam a usar `"pending"`.

## Parte 2 — Card grid

### Novo `reviews/_components/review-card.tsx`
Server Component (sem `"use client"` — usa só `Link`, `Badge` via `ReviewStatusBadge`, `StarRating`).

- **Shell**: `<Link href={/dashboard/reviews/${review.id}}>` com as classes do shell media-card
  (`group flex flex-col overflow-hidden rounded-[10px] border border-border bg-card
  shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow]
  hover:border-border/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2
  focus-visible:ring-ring`). Card inteiro clicável, sem botão "Ver".
- **Imagem** (`relative overflow-hidden`): `imageUrl` → `<img>` `aspect-[16/9] w-full object-cover
  group-hover:brightness-110` com os dois `biome-ignore` (Supabase public URL + useImageSize),
  espelhando `tool-card.tsx`. Sem imagem → placeholder `aspect-[16/9] w-full bg-muted/40`.
- **Badge de status** absoluto `top-2 right-2`: reusa `<ReviewStatusBadge status={review.status} />`
  (com `shadow-sm backdrop-blur-sm` via wrapper, ou className — manter o padrão dos outros cards).
- **Corpo** (`flex flex-col gap-1 px-4 pt-3 pb-3`):
  - Produto: `line-clamp-2 font-semibold text-[14px] leading-[1.3] tracking-tight` (`review.toolName`).
  - Cliente: `text-xs text-muted-foreground` (`review.clientName`).
  - Comentário: `line-clamp-2 text-[13px] text-foreground/85 mt-0.5` (`review.bodyPreview`,
    já truncado em ~80 chars no `data.ts`).
- **Rodapé edge-to-edge** (`flex items-center justify-between border-border border-t px-4 py-2.5
  text-xs text-muted-foreground`): `<StarRating rating={review.rating} />` à esquerda, data à
  direita (`Intl.DateTimeFormat("pt-BR")` — extrair o `DATE_FORMATTER` top-level, como no table).

### `reviews/page.tsx`
Substitui `<ReviewQueueTable reviews={reviews} />` por um grid:
```tsx
<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
  {reviews.map((review) => (
    <ReviewCard key={review.id} review={review} />
  ))}
</div>
```
O bloco de `Empty` (sem resultados) permanece igual.

### Deleção
- **Deletar** `reviews/_components/review-queue-table.tsx` (substituído pelo grid). Confirmar via
  grep que o único consumidor é `page.tsx`.

### Doc
- `DESIGN.md` §4 ("Listing row actions") cita `reviews/_components/review-queue-table.tsx` como
  implementação canônica. Atualizar essa referência (a tabela canônica passa a ser
  `orders/_components/order-table.tsx` / `customers/_components/customer-table.tsx`, que
  permanecem) — remover a menção a reviews, que deixou de ser tabela.

## Verificação

- `bun check-types` e `bunx ultracite check <arquivos tocados>` limpos.
- **Smoke visual** (obrigatório):
  - `/dashboard/reviews` abre direto em **Pendentes** (sem "Todas"); tab Pendentes destacada.
  - Grid de cards com imagem + badge de status + comentário + rodapé (estrelas + data).
  - Card clicável navega para `/dashboard/reviews/[id]`.
  - Trocar de tab (Aprovadas/Rejeitadas/Spam) mantém os filtros (q/rating/datas) na URL.
  - Estado `Empty` (ex: filtro que zera resultados) e card sem imagem (placeholder).

## Referências
- `DESIGN.md` §4 — media-card, footer edge-to-edge.
- Canônico do arquétipo: `apps/web/src/app/dashboard/_components/tool-card.tsx` (recém-migrado).
- `ReviewStatusBadge` (`reviews/_components/review-status-badge.tsx`) e `StarRating`
  (`reviews/_components/star-rating.tsx`) — reusados sem alteração.
- Mockups: `.superpowers/brainstorm/235323-1780408669/content/` (`direcao`, `refino-a`, `final`).
