# Listagens em cards — Tools, Estoque Geral, Estoque por Filial

**Data:** 2026-05-11
**Escopo:** UI refactor das listagens `/dashboard/tools`, `/dashboard/stock`, `/dashboard/stock/branches` substituindo tabelas por grids de cards inspirados em `/dashboard/promotions`.

---

## Contexto

Hoje as três páginas usam `<Table>` (shadcn) com thumb 10×10 + colunas. Promoções já usa um grid de cards (`promotion-card.tsx`) com hierarquia visual rica: badges no topo, título serif, métrica destacada em terracotta, divider, lista de itens relacionados, quick actions no rodapé.

Ferramentas têm **imagem** como atributo primário (catálogo visual) e dados numéricos secundários (estoque, variantes, filiais). Tabela atual subutiliza a imagem (10×10px) e dispersa hierarquia entre 7+ colunas. Migrar para cards aproveita a imagem e cria consistência com o resto do dashboard (que já tem promotions em cards).

## Decisões da fase de brainstorming

| # | Pergunta | Resposta |
|---|----------|----------|
| 1 | Cards substituem tabelas ou são toggle? | **Substituir.** Sem toggle, sem dupla manutenção. |
| 2 | Densidade do card de Tools | **Rich.** Image + 2 badges + nome + meta + variantes chips + divider + estoque grande + breakdown de filiais + ações. |
| 3 | Granularidade de Estoque por Filial | **1 card por variante.** Paridade com tabela atual; min/reorder/qty próprios por variante. |
| 4 | Estoque Geral usa o mesmo card de Tools? | **Sim, mesmo card.** Diferença é apenas o sort default: `urgência` (reorder primeiro, depois menor estoque). |
| 5 | Grid columns | **4 colunas fixas** desktop (`xl:grid-cols-4`); responsivo 1/2/3 abaixo. |

## Arquitetura de componentes

Novo componente compartilhado em `apps/web/src/app/dashboard/_components/`:

- `ToolCard` — card "rich" reutilizável. Props: `tool: ToolCardData`, `variant: "catalog" | "stock-overview"`, `canMutate: boolean`, `actions?: ReactNode`.
- `ToolCardGrid` — wrapper `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4`.

Próprios das features:

- `apps/web/src/app/dashboard/tools/_components/tool-card-actions.tsx` — quick actions (stock + edit + delete) injetadas via prop `actions`.
- `apps/web/src/app/dashboard/stock/_components/stock-card-actions.tsx` — apenas link "Gerenciar estoque por filial".
- `apps/web/src/app/dashboard/stock/_components/branch-stock-card.tsx` — card de variante para `/stock/branches`.
- `apps/web/src/app/dashboard/stock/_components/branch-stock-card-grid.tsx` — grid wrapper.

**Deletados:**

- `apps/web/src/app/dashboard/tools/_components/tools-table.tsx`
- `apps/web/src/app/dashboard/stock/_components/stock-table.tsx`
- `apps/web/src/app/dashboard/stock/_components/branch-stock-table.tsx`

## Tipo `ToolCardData`

```ts
export interface ToolCardData {
  id: string;
  name: string;
  slug: string | null;
  imageUrl: string | null;
  sku: string | null;             // SKU da variante default
  voltage: string | null;          // voltage da variante default
  variantCount: number;
  variantSummaries: string[];      // ex: ["127V","220V","Bivolt"] — max 4 visíveis no card
  primaryCategoryName: string | null;
  supplierName: string | null;
  status: ToolStatusValue;         // active|draft|discontinued|out_of_stock
  visibleOnSite: boolean;
  totalStock: number;
  reorderCount: number;            // qtos stockLevel atendem reorder_point > 0 AND qty <= reorder_point
  branches: Array<{
    branchId: string;
    branchName: string;
    quantity: number;
  }>;                              // top 3 filiais por qty; "+N filiais" se total > 3
}
```

## Anatomia visual do `ToolCard`

```
┌────────────────────────────────────┐
│ [Image 16:9 — next/image]          │
├────────────────────────────────────┤
│ [cat chip muted]   [status badge]  │   header row
│                                    │
│ Nome — Serif 500 17px line-clamp-2 │
│ SKU FUR-700 · 220V · Bosch         │   meta xs olive
│                                    │
│ VARIANTES (label-small, opcional)  │
│ [127V] [220V] [Bivolt] [+N]        │
│ ───────────────────────────────    │
│ ESTOQUE · 3 filiais                │
│ 42  ← terracotta 28px tabular      │   [📦] [✏️] [🗑]
│ SP 18 · RJ 12 · MG 12              │
└────────────────────────────────────┘
```

**Regras visuais (DESIGN.md):**

- Wrapper: `rounded-[10px] border border-border bg-card p-4 shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-colors hover:border-border/80`.
- Imagem: `next/image`, aspect-ratio 16:9, `object-cover`, `rounded-[8px]`. Fallback: `border-dashed` mantendo aspect 16:9 (não quebra grid).
- Badges header: esquerda = categoria primária (variant `outline` ou `muted` se padrão shadcn); direita = status (catalog) OU reorder warning (stock-overview quando `reorderCount > 0`, fallback status).
- Nome: `<Link href="/dashboard/tools/{id}">` com `font-medium font-serif text-[17px] leading-[1.3] line-clamp-2 hover:underline`.
- Meta: `text-xs text-muted-foreground` — uma linha SKU·voltage·supplier, segunda linha categoria se necessário (omitir se redundante com chip).
- Variantes: `<span class="badge muted">` por voltage chip, `max-w-full truncate`. Omitir bloco quando `variantCount === 1`.
- Divider: `border-t border-border`.
- Estoque: label uppercase `text-[10px] tracking-wider text-muted-foreground` + número `text-[28px] font-medium text-primary tabular-nums leading-none`. Cor `text-destructive` quando `totalStock <= reorderPoint` agregado.
- Breakdown: top 3 filiais ordenadas por qty desc, `text-xs text-muted-foreground`, formato `"SP 18 · RJ 12 · MG 12"`. Se houver >3 filiais, sufixo `· +N filiais`.
- Actions: alinhadas baseline ao número via flex space-between. Só renderiza se `canMutate`. Cada botão `size="icon-sm" variant="secondary"` (paridade com tabela atual).
- Sem `cursor-pointer` no root — clique vai via Link do nome. Ações independentes não competem.

## `BranchStockCard`

Dados próprios (variantId-level):

```ts
export interface BranchStockCardData {
  variantId: string;
  toolId: string;
  toolName: string;
  sku: string;
  voltage: string | null;
  imageUrl: string | null;
  quantity: number;
  minQty: number;
  reorderPoint: number;
}
```

Layout:

```
┌────────────────────────────────────┐
│ [Image 16:9]                       │
├────────────────────────────────────┤
│ [tool name chip → /tools/{id}]     │
│                       [Repor/Crítico]
│                                    │
│ SKU FUR-700-220 · 220V (Serif 15px)│
│ ───────────────────────────────    │
│ QTD NESTA FILIAL    MIN · REPOR    │
│ 8  (terracotta 26px) [5] [12]      │
│                                    │
│ [👁 Ver]              [Ajustar]    │
└────────────────────────────────────┘
```

**Regras:**

- Chip header = link para `/dashboard/tools/{toolId}`. Tool name vira contexto, não a entidade primária do card.
- Status badge: `destructive` "Crítico" se `quantity <= minQty && minQty > 0`; `warning` "Repor" se `quantity > minQty && quantity <= reorderPoint && reorderPoint > 0`; senão omitir.
- Linha "nome" do card é o SKU+voltage (a variante É a entidade do card).
- Inputs min/reorder: reusar `BranchStockThresholdInputs` existente.
- Botão Ajustar: reusar `StockAdjustButton` existente (abre dialog).
- Read-only (`canMutate === false`): sem inputs, sem Ajustar. Apenas Ver + Qtd.

## Mudanças por página

### `/dashboard/tools/page.tsx`

- Substitui `<ToolsTable>` por `<ToolCardGrid tools={tools} canMutate={canMutate} variant="catalog" />`.
- `fetchTools` ganha `branches_breakdown` (JSON aggregation, mesmo padrão da query de Stock Geral) + `reorder_count`.
- Interface `ToolRow` ganha `branches: BranchSummary[]` e `reorderCount: number`.
- Filtros (`ToolFilters`) inalterados.

### `/dashboard/stock/page.tsx`

- Substitui `<StockTable>` por `<ToolCardGrid tools={rows} variant="stock-overview" canMutate={canMutate} />` (prop `tools` é o nome canônico; a página passa as `rows` mapeadas para `ToolCardData`).
- Default sort muda quando `params.ordem` ausente: `ORDER BY reorder_count DESC, total_stock ASC, t.name ASC` (urgência primeiro).
- `StockFilters` ganha nova option "Urgência" no select Ordenar (default). Mantém Nome, Maior estoque, Menor estoque.
- Schema do searchParam `ordem` aceita `"urgencia" | "nome" | "maior" | "menor"`.
- Empty state inalterado.

### `/dashboard/stock/branches/page.tsx`

- Substitui `<BranchStockTable>` por `<BranchStockCardGrid rows={rows} branchId={selectedBranch.id} branchName={selectedBranch.name} canMutate={canMutate} />`.
- Tabs de filial, `BranchSearchInput`, header "X ferramentas listada(s) nesta filial" inalterados.

## Não-mudanças

- Server actions (`tools/actions.ts`, `stock/actions.ts`, `stock/branches/.../actions.ts`).
- Schemas Zod, capabilities, `requireCurrentSession`, `requireCapability`.
- `DeleteToolDialog`, `BranchStockThresholdInputs`, `StockAdjustButton` — reusados dentro dos cards.
- `<Empty>` states e helpers de empty.
- Filtros (`ToolFilters`, `StockFilters`, `BranchSearchInput`).

## Riscos identificados

1. **Chips de variantes com label longo** ("Bivolt") podem quebrar layout em viewports apertados. Mitigação: `max-w-full truncate` + `+N` quando exceder 4.
2. **Cards sem imagem em catálogos grandes** podem virar "muralha cinza". Mitigação: placeholder dashed mantém aspect; é visualmente honesto sobre dado ausente e estimula upload.
3. **Densidade vertical**: ~340px por linha × 13 linhas para 50 ferramentas = ~4400px scroll. Aceitável (paridade com /promotions). Paginação fora de escopo.
4. **Sort por urgência altera comportamento atual** de Stock Geral. Default explícito documentado no filtro como "Urgência" — usuário pode trocar para "Nome" se preferir o legado.
5. **SQL adicional em `fetchTools`** (branches_breakdown). Mesma agregação que já roda em Stock Geral; sem N+1. Não há regressão de perf.

## Acessibilidade

- Nome do card é `<Link>`, não card-as-button → preserva semântica nativa de navegação.
- Inputs inline mantêm `aria-label` existente.
- Botões de ação mantêm `aria-label` específicos ("Editar ferramenta X", "Ajustar estoque de Y").
- Status badges incluem texto, não só cor.
- Grid responsivo testar com keyboard tab order (esperado: linha por linha, esquerda → direita).

## Plano de verificação

1. `bun check-types` no workspace `apps/web`.
2. `bun fix` no escopo modificado.
3. `bun dev:web` smoke — abrir e validar:
   - `/dashboard/tools` — grid 4col em 1280px, thumbs renderizam, link do nome leva ao detalhe, edit/delete funcionam.
   - `/dashboard/stock` — sort default "Urgência" puxa cards com `reorderCount > 0` para topo; toggle de ordem funciona.
   - `/dashboard/stock/branches` — selecionar filial troca cards, ajuste de threshold inline persiste, AdjustDialog abre e ajusta.
4. `mcp__next-devtools__nextjs_call <port> get_errors` se SSR error aparecer.
5. Visual check contra `/dashboard/promotions` — paridade de cadência (radius, shadow, gap, serif).

## Backlog — fora de escopo desta entrega

| Tema | O que é | Por que adiar |
|------|---------|---------------|
| **Paginação / virtualização** | Quando o catálogo passar de ~100 ferramentas. | Catálogo atual cabe sem paginação; complexidade de URL state + scroll restoration alta para benefício baixo agora. |
| **Toggle cards ↔ tabela** | `?view=cards \| table` em searchParams, persistido em cookie. | Aumentaria superfície de manutenção; ninguém pediu hoje. Reabrir se vier feedback de ops após uso real. |
| **Bulk actions** | Multi-select + ações em massa (mudar status, atribuir promoção, ajustar estoque). | Não há multi-select hoje em nenhuma página; precisa fluxo de UX próprio. |
| **Drag-reorder** | Ordenar cards manualmente (relevante só se houver `sort_order` por ferramenta). | Sem coluna `sort_order` em `tool`; demandaria migration. |
| **Filtros visuais adicionais** | Chips de filtro ativo no topo (estilo "filter-summary"). | Filtros atuais funcionam; refator separado. |
| **Loading skeleton** | Skeleton de cards durante SSR streaming. | Páginas são `force-dynamic`; Suspense boundary é tarefa de outra rodada. |
| **Hover preview** | Card expande detalhes ao hover (variantes completas, breakdown total de filiais). | Padrão UX divergente; melhor primeiro validar densidade base. |
| **Densidade alternativa** | Toggle "compact mode" reduzindo padding para usuários que querem mais cards/linha. | Mesma razão do toggle cards/tabela — esperar feedback de uso real. |
| **Imagens com lightbox** | Clicar na thumb abre modal com galeria. | Galeria existe no detalhe (`tool-image-gallery.tsx`); duplicar no card é YAGNI. |
| **Indicador de promoção ativa** | Badge "Em promoção" quando a ferramenta participa de promoção ativa. | Requer JOIN extra na query; pesar perf vs valor. |
| **Ordenação por filial em Stock Geral** | Sort secundário "filiais com baixo estoque". | Caso de uso ainda não validado. |
| **Animação de entrada do grid** | Stagger fade-in nos cards. | Polish; adicionar quando design system tiver convention de motion. |

## Próximos passos

Após aprovação deste spec: invocar `superpowers:writing-plans` para gerar plano de implementação (tasks atômicas, ordem de execução, pontos de verificação).
