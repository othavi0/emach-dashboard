# Refatorar listagem de Pedidos para grid de cards

**Data:** 2026-06-02
**Escopo:** `apps/web/src/app/dashboard/orders`

## Problema

A listagem de `/dashboard/orders` usa uma `Table` de linhas (`order-table.tsx`),
destoando do padrão visual do sistema. As demais listagens (Tools, Customers,
Filiais) usam grid de cards do catálogo de arquétipos (`DESIGN.md` §4). Queremos
trazer Pedidos para esse padrão, com a "vibe" do Tools (footer de métricas
edge-to-edge), sem descaracterizar a natureza operacional de um pedido.

## Decisão de design

Arquétipo escolhido: **Stat-card** (não media-card). Pedido é um registro
operacional, não um produto — forçar fotos de produto (que se repetem entre
pedidos) lembraria catálogo. O stat-card captura a vibe Tools pelo **shell
comum** + **footer de 3 métricas**, mantendo densidade e legibilidade.

Decisões confirmadas com o usuário (brainstorming visual):

- **Manter** o topo (par `PendingPanel` + `ActivityFeed`), as tabs de status e
  os filtros (busca/data/filial). **Só a tabela** vira grid.
- **Avatar:** iniciais do cliente (`getInitials`), espelhando o card de Clientes.
- **Footer (3 col):** Itens · **Total** (coral) · Data (relativa).
- **Meta line:** 📍 nome da filial.
- **Sem dimming** por status (pedidos cancelados/reembolsados continuam plenos).

## Anatomia do card (`OrderCard`)

Shell comum do catálogo (`DESIGN.md` §4) — card inteiro é um `<Link>` para
`/dashboard/orders/{id}` (sem ação secundária inline → Link puro, **Server
Component**, igual `tool-card.tsx`). Espelha o `OrderCard` já existente em
`branches/[id]/_components/orders-tab.tsx`, porém com footer de 3 métricas.

```
┌────────────────────────────────────────┐
│ [JC]  EM-2026-0005          [🚚 Enviado]│   row: avatar quadrado 46px (iniciais)
│       Juliana Costa                     │        + nº (mono) + cliente
│       📍 São Paulo                       │        + meta (pin + filial)
│                                         │        + OrderStatusBadge (top-right)
├──────────┬───────────────┬─────────────┤
│    4     │   R$ 2.718    │   há 23d     │   footer grid-cols-3 border-t
│  ITENS   │    TOTAL      │    DATA      │   Total em text-primary (coral)
└──────────┴───────────────┴─────────────┘
```

Classes-chave (reuso literal do shell §4):
`group flex flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`

- Avatar: `size-[46px] rounded-[10px] border border-border bg-muted` com iniciais
  centradas (`getInitials(clientName)`).
- Footer de métricas: `grid grid-cols-3 border-t`; cada célula
  `flex flex-col items-center py-2.5` com `border-r` (última sem); valor
  `font-bold text-[18px] tabular-nums`, label `text-[9px] uppercase tracking-wider text-muted-foreground`.
  Total usa `text-primary`.
- Reusa `OrderStatusBadge` existente (ícone lucide + label + variant por status).

## Componentes

| Arquivo | Ação | Detalhe |
|---|---|---|
| `_components/order-card.tsx` | **criar** | Server Component. Recebe `item: OrderListItem`. Formatadores (`Intl` BRL, relativo) como consts top-level. |
| `_components/order-card-grid.tsx` | **criar** | Espelha `tool-card-grid.tsx`: `grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`, `key={item.id}`. |
| `_components/orders-infinite.tsx` | **editar** | Troca `<OrderTable>` por `<OrderCardGrid items={items} />`. Remove props de paginação não usadas (`tableFilters`, `page`, `totalPages`). |
| `page.tsx` | **editar** | Ajusta a chamada de `<OrdersInfinite>` (remove `tableFilters`). |
| `_components/order-table.tsx` | **remover** | Único consumidor era `orders-infinite`. Confirmar via grep antes de deletar. |

## Dados

**Sem mudança no backend.** `OrderListItem` (`data.ts`) já expõe `id, number,
status, clientName, branchName, itemsCount, totalAmount, createdAt` — exatamente
o que o card consome. `fetchOrdersPage` e o cursor keyset permanecem.

## Não-objetivos (YAGNI)

- Thumbnails de produto / media-card (rejeitado: repetição + custo de query).
- Mudar painel de pendências, tabs, filtros ou paginação.
- Dimming por status, ações inline no card (editar é via detalhe).

## Verificação

- `bun check-types` + `bun check` (ultracite).
- Smoke visual em `localhost:3006/dashboard/orders`: grid renderiza, hover, todos
  os status com badge correto, scroll infinito carrega página 2, card clica para
  o detalhe. (`check-types` não pega RSC/SQL — smoke é obrigatório.)
