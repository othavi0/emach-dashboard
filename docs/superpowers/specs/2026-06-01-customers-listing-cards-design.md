# Redesign da listagem de clientes — cards + filtros enxutos

> Data: 2026-06-01
> Escopo: `/dashboard/customers` (listagem). Primeira etapa de um redesign maior da seção de clientes.

## Contexto

A listagem atual usa uma **tabela** (`customer-table.tsx`) e uma **barra de filtros sobrecarregada** (8 controles: Buscar, Status, Tipo, Cadastro de, Cadastro até, LTV mín, LTV máx, Ordenar). O campo de busca fica espremido e a tabela destoa do padrão visual mais recente do dashboard — os cards de filial (`/dashboard/branches`).

Objetivo: trocar a tabela por **cards** no mesmo padrão das filiais e **enxugar os filtros** para a busca respirar.

## Decisões (validadas com o usuário via visual companion)

1. **Filtros mantidos:** Buscar · Status · Tipo (B2C/B2B) · Ordenar. **Removidos da UI:** LTV mín, LTV máx, Cadastro de, Cadastro até.
2. **Listagem em cards** seguindo o padrão `branch-card` (header + rodapé com grid de stats), em grid responsivo.
3. **Rodapé do card (3 stats):** Pedidos · Último pedido · Cliente desde (data de cadastro). **LTV sai** do card (métrica de negócio, não de triagem operacional).
4. **Linha de verificação** no card: badges Status + Tipo à esquerda; ✓ Email e ✓ Doc à direita (preserva a info da coluna "Verificado" da tabela, relevante p/ LGPD).
5. **Ações:** card inteiro clicável → detalhe `/dashboard/customers/[id]`. Um único botão **Editar** (ícone lápis quadrado com borda, estilo `branch-card`). Sem botão "Ver" (redundante com o clique no card).

## Arquitetura

Reaproveita os padrões já estabelecidos em `branches/`:
- `useInfiniteList` (paginação por cursor) — já usado em `customers-infinite.tsx`.
- `InfiniteSentinel` — sentinela de scroll infinito.
- `getInitials` de `@/lib/format/name` — avatar fallback.
- Tokens de tema (`bg-card`, `border-border`, `bg-muted`, badges por role) de `DESIGN.md`.

### Componentes

| Arquivo | Mudança |
|---|---|
| `_components/customer-filters.tsx` | **Editar.** Remover os 2 `Input` de LTV (+ os 2 `useDebouncedParam` `ltvMin`/`ltvMax`) e os 2 `DatePicker` de cadastro. Remover `ltvMin`, `ltvMax`, `createdFrom`, `createdTo` de `TRACKED`. Manter Buscar (`flex-1`), Status, Tipo, Ordenar. A busca cresce naturalmente com menos irmãos no `FiltersBar`. |
| `_components/customer-card.tsx` | **Novo.** Client component baseado em `branch-card.tsx`. Recebe `customer: CustomerListItem`. |
| `_components/customers-infinite.tsx` | **Editar.** Trocar `<CustomerTable>` por grid responsivo de `<CustomerCard>`. Mantém `useInfiniteList` + `InfiniteSentinel`. Grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3`. |
| `_components/customer-table.tsx` | **Deletar.** Substituído pelos cards. As configs `CLIENT_STATUS_CONFIG`, `CLIENT_TYPE_CONFIG`, `formatRelativeDate` migram para `customer-card.tsx`. |
| `page.tsx` | **Ajuste leve.** `hasFilters` pode parar de checar `ltvMin/ltvMax/createdFrom/createdTo` (opcional; não quebra se ficar). Resto inalterado. |

### O que NÃO muda

- **`schema.ts`** — mantém `ltvMin/ltvMax/createdFrom/createdTo` e o `superRefine`. São inofensivos sem UI que os emita; remover exigiria mexer em query + export sem ganho. Decisão consciente: minimizar blast radius.
- **`data.ts` (`listCustomers`)** e **`export/route.ts`** — a aplicação dos filtros de LTV/data permanece. Sem params na URL, os `if` simplesmente não disparam. CSV inalterado.
- **`SORT_OPTIONS`** — `ltvDesc` (ordenar por LTV maior) permanece. Ordenar por LTV é independente do filtro de faixa de LTV; o usuário não pediu para remover.
- Painel "Atenção em clientes", Atividade recente, Empty state, Exportar CSV — inalterados.

## Anatomia do `customer-card.tsx`

```
┌─────────────────────────────────────────────┐
│  [AF]  Ana Paula Ferreira              [✎]   │  ← avatar + nome + email + Editar
│        ana.ferreira@example.com              │
│  [Ativo] [B2C]          [✓ Email] [✓ Doc]    │  ← linha de verificação
├──────────────┬──────────────┬───────────────┤
│      2       │  há 12 dias  │   mai/2025     │  ← grid de 3 stats
│   PEDIDOS    │ ÚLTIMO PEDIDO│ CLIENTE DESDE  │
└──────────────┴──────────────┴───────────────┘
```

- **Container:** `rounded-[10px] border border-border bg-card`, clicável (`role="button"`, `tabIndex={0}`, `onClick`/`onKeyDown` Enter/Space → `router.push(\`/dashboard/customers/\${id}\`)`), hover de borda/shadow como `branch-card`. Cliente `status === "blocked"` → `opacity-70`.
- **Avatar:** `image` se houver (`next/image` ou `Avatar` do UI), senão `getInitials(name)` em bloco `size-12 rounded-[10px] bg-muted`.
- **Editar:** `<Link href="?edit=1">` com `buttonVariants({ size: "icon-sm", variant: "ghost" })` + `border border-border bg-muted`. `stopPropagation` no wrapper para não disparar o clique do card. `aria-label="Editar cliente {name}"`.
- **Badges Status:** Ativo→`success`, Inativo→`secondary`, Bloqueado→`destructive`. **Tipo:** B2C→`info`, B2B→`warning`. `clientType` null → sem badge de tipo.
- **Verificação:** `✓ Email` (`success` se `emailVerified`, senão `secondary` com `✗`). `✓ Doc` (`success` se `document`, senão `— Doc` `secondary`). Estado nunca depende só de cor (ícone + label + cor — AAA / color-blind).
- **Stats:**
  - Pedidos: `ordersCount` (`Intl.NumberFormat("pt-BR")`).
  - Último pedido: `lastOrderAt` formatado relativo (`formatRelativeDate`, migrado da tabela) com `Tooltip` na data absoluta; `—` se null.
  - Cliente desde: `createdAt` em formato curto mês/ano (`Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric" })` → "mai/2025").
  - Mesmo layout do `branch-card`: grid 3 colunas com `border-t`/`border-r`, número `font-bold text-[20px] tabular-nums`, label `text-[10px] uppercase tracking-wider text-muted-foreground`.

## Acessibilidade

- Card: `role="button"`, `tabIndex={0}`, foco visível (`focus-visible:ring-2 ring-ring`), navegação por teclado (Enter/Space).
- Badges de estado: ícone + label + cor (nunca só cor).
- Contraste AAA garantido pelos tokens do tema (`DESIGN.md`).
- `prefers-reduced-motion`: transições de hover respeitam (herdado dos tokens/utilitários existentes).

## Validação

`bun check-types` + subir o app na **porta 3002** (`bun dev:web --port 3002` — a 3001 está ocupada por outra branch) e visitar `/dashboard/customers`:
- Filtros enxutos, busca larga, sem LTV/data.
- Grid de cards 1→2→3→4 colunas conforme largura.
- Card clicável abre detalhe; botão Editar abre `?edit=1` sem navegar pro detalhe.
- Cliente bloqueado com opacidade reduzida.
- Scroll infinito carrega próxima página.

## Fora de escopo (próximas etapas do redesign)

- Página de detalhe do cliente (`[id]/page.tsx`) e suas tabs.
- Painel "Atenção em clientes" / Atividade recente.
- Tratamento de LTV alto no card (não há mais LTV no card; resolvido por remoção).
