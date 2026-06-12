# Redesign da aba Estoque + drawer do perfil de ferramenta

**Goal:** Substituir a matriz da aba Estoque (`/dashboard/tools/[id]?tab=estoque`) por cards de filial agrupados por variante no padrão do design system, e trocar o drawer de ajuste (quebrado) por uma versão no padrão-ouro do `BranchStockEditSheet`.

**Architecture:** A aba passa a renderizar, por variante, um grid de cards de filial (stat-card) clicáveis. O clique abre o `BranchStockEditSheet` já existente — parametrizado para liderar pela filial em vez da ferramenta. Fonte única do drawer entre a aba de Filiais e a de Ferramentas.

**Tech Stack:** Next 16 / React 19 / Tailwind v4 / base-ui `Sheet`. Server Component (page) + Client Components (tab, card, drawer). Drizzle para dados de estoque.

---

## 1. Estado atual & problemas

**Aba (`estoque-tab.tsx`):** matriz `variantes × filiais` com células de quantidade, totais e legenda. Densa, mas fora do padrão de listagem do sistema (sem cards, sem stat-card, status só por borda inferior sutil).

**Drawer (`stock-cell-sheet.tsx`):** versão pobre do `BranchStockEditSheet`:
- `max-w-md` (estreito) vs `max-w-4xl` de duas colunas do padrão.
- **Bug P1:** `handleAdjust`/`handleLimits` não chamam `router.refresh()` → a tela não reflete o novo valor após salvar (o usuário vê o valor antigo).
- Sem "Disponível" nem "reservado em pedidos" (o padrão-ouro tem).
- Movimentos sem paginação lazy (limite fixo de 5).

## 2. Decisões de design (validadas no visual companion)

### 2.1 Aba — cards de filial agrupados por variante

- **Agrupamento por variante** (mesmo critério do estoque de filial: 1 registro por variante). Uma seção por variante; com 1 variante, vira uma listagem limpa de filiais.
- **Cabeçalho de seção:** pílula mono com `SKU · voltagem` + resumo `N un · M filiais`.
- **Card de filial = stat-card** (catálogo DESIGN.md §4): shell padrão (`rounded-[10px] border border-border bg-card shadow-…`), header com **avatar de iniciais da filial** (`getInitials`) + nome + cidade/UF + **badge de status de estoque** no topo-direito (Crítico/Repor/OK), footer edge-to-edge de 3 métricas **Qtd · Mín · Repor**. `Qtd` herda a cor do status (vermelho crítico, âmbar repor).
- **Card inteiro clicável** (`role="button"` + `onKeyDown` Enter/Space) → abre o drawer daquela `variante × filial`.
- **Grid responsivo:** `repeat(auto-fit, minmax(260px, 1fr))`.
- **Sem barra de filtros nem scroll infinito:** o conjunto (`variantes × filiais` de uma única ferramenta) é pequeno e já vem inteiro carregado. YAGNI — não replicar `BranchStockFilters`/`useInfiniteList` aqui.
- **Sem totais/legenda separados:** o resumo por variante vai no cabeçalho de seção; os badges são auto-explicativos.
- **Empty state:** mantém a mensagem atual ("Sem variantes ou filiais com estoque registrado.") quando não há dados.

> Nota: não reusar `BranchStatsCard` — seu badge é o lifecycle da filial (`active/inactive`), enquanto aqui o badge é o status de **estoque**. Card irmão dedicado, reusando só `getInitials` e as classes do shell.

### 2.2 Drawer — reuso do padrão-ouro com header liderado pela filial

Reusar **`BranchStockEditSheet`** (não o `stock-cell-sheet.tsx`). Parametrizar o header por contexto:

- Nova prop discriminada `lead: "tool" | "branch"` (default `"tool"` — preserva o call-site da aba de Filiais).
- **`lead="branch"` (contexto ferramenta):**
  - Avatar = **imagem da ferramenta** (filial não tem imagem); fallback = ícone de ferramenta (lucide) sobre `bg-muted`.
  - Título = **nome da filial** + badge de status.
  - Subtítulo = `ferramenta · SKU <sku> · voltagem`.
  - **Sem** o link "Editar ficha da ferramenta" (redundante: já estamos na página da ferramenta).
- **`lead="tool"` (contexto filial, atual):** comportamento inalterado (título = ferramenta, subtítulo com filial, link "Editar ficha").
- Corpo (métricas Atual/Mínimo/Reposição/Disponível + reservado, ajuste, limites, movimentos lazy) **idêntico** nos dois.

Como `BranchStockEditSheet` recebe `row: BranchStockRow` + `branchId` + `branchName`, a aba constrói um `BranchStockRow` por célula a partir de `tool` (imagem/nome) + `variant` (sku/voltagem) + cell (qty/min/reorder).

## 3. Componentes & arquivos

| Ação | Arquivo | Responsabilidade |
|---|---|---|
| Criar | `tools/[id]/_lib/stock-grouping.ts` | `groupStockByVariant(stockRows, variants)` → `{ variant, branches: ToolStockRow[] }[]`, ordenado (default primeiro). Pura, testável. |
| Criar | `tools/[id]/_components/tool-stock-branch-card.tsx` | Stat-card de filial com status de estoque (avatar iniciais + nome + cidade/UF + badge + footer Qtd/Mín/Repor). `onSelect(cell)`. |
| Reescrever | `tools/[id]/_components/estoque-tab.tsx` | Renderiza seções por variante + grid de `ToolStockBranchCard`. Estado `selected` → monta `BranchStockRow` e abre `BranchStockEditSheet lead="branch"`. Remove a matriz. |
| Editar | `stock/_components/branch-stock-edit-sheet.tsx` | Adiciona prop `lead` e ramifica só o header. Corpo inalterado. |
| Editar | `tools/[id]/page.tsx` | Passa `toolName` e `toolImageUrl` (primeira imagem) para `EstoqueTab`. |
| Editar | `tools/[id]/_lib/tool-detail-data.ts` | `ToolStockRow` ganha `branchCity`, `branchState` (join `branch`). |
| Deletar | `tools/[id]/_components/stock-cell-sheet.tsx` | Substituído pelo reuso do `BranchStockEditSheet`. |

## 4. Dados

- **`ToolStockRow`** (+ campos): `branchCity: string | null`, `branchState: string | null`. A query de `stockRows` em `tool-detail-data.ts` já junta `branch` para `branchName`; estender o `select` com `branch.city` e `branch.state`.
- **`BranchStockRow` construído na aba** por célula:
  - `imageUrl` = `toolImageUrl`, `toolName` = `toolName`, `toolId` = `toolId`
  - `sku` = `cell.variantSku`, `voltage` = `cell.variantVoltage`, `variantId` = `cell.variantId`
  - `quantity`/`minQty`/`reorderPoint` = da célula
- Nenhuma mudança de schema (push-only) — só `select` adicional.

## 5. Correções herdadas pelo reuso

- `router.refresh()` após ajuste e após limites (o `BranchStockEditSheet` já faz) → a matriz/cards refletem o novo valor.
- "Disponível" e "reservado em pedidos pagos/em preparo" passam a aparecer.
- Histórico de movimentos com scroll interno + lazy load (`fetchVariantBranchMovementsPage`).

## 6. Status de estoque (regra única)

Reusar a função de status do padrão-ouro (`resolveStatus` em `branch-stock-edit-sheet.tsx` / `stockStatus` em `branch-stock-card.tsx`): `critical` se `minQty>0 && qty<=minQty`; `reorder` se `reorderPoint>0 && qty>minQty && qty<=reorderPoint`; `none` se ambos 0; senão `ok`. O card e o drawer usam a mesma regra. Extrair para helper compartilhado (`stock/_components/stock-status.ts`) para não duplicar.

## 7. Edge cases

- **Filial sem registro de estoque para a variante:** a célula pode não existir no `stockRows`. Decisão: renderizar card só para combinações presentes em `stockRows` (mesma fonte da matriz atual). Não inventar cards de filiais sem registro.
- **Ferramenta sem imagem:** avatar do drawer cai para ícone de ferramenta.
- **`canMutate=false`:** drawer abre em modo leitura (o `BranchStockEditSheet` já trata: esconde colunas de ajuste/limites, mostra só métricas + movimentos).
- **Variante sem nenhuma filial com estoque:** seção da variante não aparece (sem cards).

## 8. Testes

- **`stock-grouping.test.ts`** (vitest, node): agrupa por variante, ordena com a default primeiro, devolve `[]` para entrada vazia, mantém todas as células de cada variante.
- **`stock-status.test.ts`**: tabela de casos (critical/reorder/ok/none) cobrindo limites 0.
- **Smoke visual** (servidor dev): Furadeira `b3be9615-…` e Disco de Corte `fb265dfa-…` — cards por variante, clique abre drawer liderado pela filial, salvar ajuste reflete na hora, console limpo.

## 9. Fora de escopo

- Filtros/busca na aba (YAGNI para conjunto pequeno).
- Ação "Adicionar item" no header contextual da aba (mantém o atual).
- Mudanças no fluxo da aba de Filiais (só ganha a prop `lead` com default que preserva o comportamento).
