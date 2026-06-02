# Redesign do card de ferramentas — alinhar ao media-card

> Spec de design. Listagem `/dashboard/tools` migra o card de catálogo para o arquétipo
> **media-card** do `DESIGN.md` §4, igualando-se ao `branch-stock-card` (estoque de filial)
> e ao `branch-card` (listagem de filiais).

## Problema

O card da listagem de ferramentas (`apps/web/src/app/dashboard/_components/tool-card.tsx`) é
uma implementação **anterior** ao catálogo de cards consolidado em 2026-06-01. Tem a metade
superior correta (imagem 16:9 + badge de status), mas diverge do padrão do sistema em dois
pontos centrais:

1. **Footer legacy** — uma linha de texto (`Estoque: N`) + `<hr>` + três botões de ação
   inline, em vez da **faixa de métricas edge-to-edge** que `branch-stock-card` e `branch-card`
   usam.
2. **Ações inline no card** (gerenciar estoque / editar / excluir) — o `DESIGN.md` §4 já
   estabelece que *"cards de listagem não têm ação de editar inline. Editar é sempre via
   detalhe da entidade"*. As três ações já existem no header do detalhe (`ToolDetailActions`).

Além disso o card carrega ruído que o padrão não tem: bolinha "visível no site", chips de
variante soltos e fornecedor no meta.

## Objetivo

Reescrever `tool-card.tsx` no arquétipo media-card, idêntico em estrutura ao
`branch-stock-card`, e remover o código que deixa de ser usado.

Fora de escopo: mudanças na query (`fetchToolsPage`), nos filtros da listagem, ou no detalhe
da ferramenta. Os dados necessários já são retornados.

## Decisões de design (validadas no visual companion)

| Decisão | Escolha |
|---|---|
| Direção geral | **media-card** + footer de métricas edge-to-edge; sem ações inline |
| Métricas do footer (3 colunas) | **Estoque / Variantes / Filiais** |
| Elementos secundários | manter **só a categoria** (badge sobre a imagem); visibilidade e fornecedor saem do card |

## Especificação do componente

`apps/web/src/app/dashboard/_components/tool-card.tsx` — reescrita completa.

### Shell
- Card inteiro é um **`<Link href={/dashboard/tools/${tool.id}}>`** (não mais `<div role="button">`
  + `useRouter` + handlers de teclado). Como não há mais ações internas que exijam
  `stopPropagation`, o `<Link>` direto é o padrão do `DESIGN.md` §4 ("`<Link>` direto quando não
  há ações secundárias").
- Classes do shell comum (mantém as atuais): `group flex flex-col overflow-hidden
  rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)]
  transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`.
- Status `draft` / `discontinued` aplicam `opacity-70` no shell (espelha `branch-card` com
  filial inativa).

### Imagem (topo)
- `aspect-[16/9] w-full object-cover` com `group-hover:brightness-110`; placeholder
  `bg-muted/40` quando `imageUrl` é nulo. (mantém o atual, incluindo os dois `biome-ignore`
  de `<img>` Supabase.)
- **Badge de status** (absoluto `top-2 right-2`), lógica preservada:
  - `active && totalStock === 0` → `<Badge variant="destructive">Esgotado</Badge>`.
  - senão → `<Badge variant={STATUS_BADGE_VARIANT[status]}>{TOOL_STATUS_LABELS[status]}</Badge>`
    (`active`→success, `draft`→secondary, `discontinued`→outline).
  - Remove o ramo `showReorderHeader` (era exclusivo da variant `stock-overview`).
- **Badge de categoria** (absoluto `bottom-2 left-2`): `<Badge variant="secondary">` com
  `tool.primaryCategoryName`, renderizado só quando presente. (mantém o atual.)

### Corpo
- `px-4 pt-3 pb-3`.
- Nome: `line-clamp-2 font-semibold text-[14px] leading-[1.3] tracking-tight`.
- Meta (1 linha, `line-clamp-1 text-muted-foreground text-xs`): `SKU ${sku} · ${voltagens}`,
  onde `voltagens = variantSummaries.join("/")` (ex: `127V/220V/Bivolt`). Quando não há SKU nem
  variantes, cai para `—`. **Removidos** do meta: `supplierName`.
- **Removidos do corpo**: bloco de chips de variante, indicador "visível no site" (bolinha).

### Footer (faixa de métricas edge-to-edge)
- `grid grid-cols-3 border-border border-t` — cada célula `flex flex-col items-center py-2.5`
  com `border-border border-r` (última sem). Idêntico ao `branch-stock-card`.
- Valor: `font-bold text-[18px] tabular-nums`; label: `text-[9px] uppercase tracking-wider
  text-muted-foreground`.
- Colunas:
  1. **Estoque** = `totalStock`. Cor: `text-destructive` quando `totalStock === 0`, senão
     `text-primary` (coral).
  2. **Variantes** = `variantCount`. `text-foreground`.
  3. **Filiais** = `branches.length`. `text-foreground`.

## Mudanças de escopo (limpeza)

| Arquivo | Mudança |
|---|---|
| `apps/web/src/app/dashboard/_components/tool-card.tsx` | Reescrita (acima). Remove a prop `variant` e o type `ToolCardVariant`, a variant `stock-overview` (dead code), as props `actions` / `canMutate`, e o `useRouter`. |
| `apps/web/src/app/dashboard/_components/tool-card-grid.tsx` | Remove `renderActions`, `canMutate`, `variant` da interface e do JSX. Passa a receber só `tools`. |
| `apps/web/src/app/dashboard/tools/_components/tools-infinite.tsx` | Remove import e uso de `ToolCardActions`, e as props `canMutate` / `variant` / `renderActions` passadas ao grid. |
| `apps/web/src/app/dashboard/tools/_components/tool-card-actions.tsx` | **Deletar** — órfão após a remoção. As 3 ações (estoque/editar/excluir) já existem em `ToolDetailActions`. |
| `apps/web/src/app/dashboard/tools/actions.ts` | Opcional: o tipo `ToolCardData` pode enxugar campos que o card não usa mais (`reorderCount`, `supplierName`, `voltage`, `visibleOnSite`). Só remover se nenhum outro consumidor depender — `visibleOnSite`/filtros usam dados server-side, não o `ToolCardData`. Manter a query intacta; remover campos do tipo + do `map` é cosmético e pode ficar para um segundo passo se gerar ruído de tipos. |

`canMutate` deixa de ser propagado da `page.tsx` da listagem para o grid — verificar a borda
em `tools/page.tsx` e remover o que ficar sem uso.

## Verificação

- `bun check-types` e `bun check` (ultracite) limpos.
- **Smoke visual** (obrigatório — `check-types` não pega RSC/client boundary nem layout):
  `bun -F web dev` e visitar `/dashboard/tools`:
  - Grid de 3–4 colunas mantido; cards no padrão media-card.
  - Card inteiro clicável navega pro detalhe.
  - Estado **Esgotado** (estoque 0, vermelho) e **Rascunho/Descontinuada** (esmaecido) corretos.
  - Scroll infinito (`InfiniteSentinel`) segue funcionando.
- Conferir que excluir/editar/ajustar estoque continuam acessíveis via detalhe da ferramenta.

## Referências
- `DESIGN.md` §4 — catálogo de cards (media-card), footer edge-to-edge.
- Canônico do arquétipo: `apps/web/src/app/dashboard/stock/_components/branch-stock-card.tsx`.
- Mockups: `.superpowers/brainstorm/104983-1780403241/content/` (`direcao`, `footer`,
  `secundarios`, `final`).
