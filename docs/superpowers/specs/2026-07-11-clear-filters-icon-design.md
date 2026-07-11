# Limpar filtros como ícone

Data: 2026-07-11 · Status: aprovado (brainstorm com visual companion, opção B)

## Problema

O botão "Limpar filtros" do `FiltersBar` compartilhado (`apps/web/src/components/filters-bar.tsx`) é um botão de texto **sempre renderizado** no fim da linha de filtros — apenas `disabled` quando não há filtro ativo. Ele reserva espaço horizontal em todas as listagens mesmo quando não serve pra nada. Movimentações ainda tem um segundo padrão divergente: um chip pill "✕ Limpar filtros" custom no `LedgerFiltersBar`.

## Decisão

Um único padrão de limpar filtros no sistema: **botão ícone que só existe quando há filtro ativo**.

### 1. `ClearFiltersButton` (novo, compartilhado)

`apps/web/src/components/clear-filters-button.tsx`:

- Ícone `FilterX` (lucide) em `Button` `variant="ghost"` `size="icon"` com `border border-border bg-muted` (idioma de botão-ícone do dashboard, mesmo dos atalhos de navegação) — `size-9`, alinhado à altura dos inputs/selects.
- `aria-label="Limpar filtros"` + tooltip "Limpar filtros" no hover.
- Prop única: `onClear` (+ `className` passthrough).
- Entrada com fade suave quando o primeiro filtro é aplicado: `animate-in fade-in` (tw-animate-css, já presente em `@emach/ui`).

### 2. `FiltersBar`

O `<Button>` de texto sai. No lugar: `{hasActive && <ClearFiltersButton onClear={onClear} className="md:self-end" />}`. Sem filtro ativo, **nada** é renderizado — o espaço deixa de ser reservado.

A API (`children`, `hasActive`, `onClear`) não muda → os 11 consumidores herdam sem edição: orders, tools, customers, users, suppliers, branches, stock (branch-stock), stock/movements, reviews, promotions e ledger.

### 3. `LedgerFiltersBar` (Movimentações)

O chip pill custom (linhas ~172–181 de `ledger-filters.tsx`) é substituído pelo mesmo `ClearFiltersButton`, mantendo a posição `ml-auto` na linha de chips de motivo.

## Fora do escopo

- Links "Limpar filtros" em **empty states** (orders, tools, customers, reviews, stock-tab e activity-tabs de branches/tools): são o CTA da tela vazia; texto é o correto ali.
- "Limpar ferramenta" em promotions: clear de campo individual, papel diferente.

## Erros e edge cases

Nenhum caminho novo: `hasActive` e `onClear`/`clearAll` já existem (`useFilterState`). Comportamento de teclado/leitor de tela preservado via `aria-label` + `type="button"`.

## Verificação

- `bun verify` (check-types + ultracite + testes).
- Smoke visual no browser: orders sem filtro (linha limpa, sem espaço reservado) e com filtro (ícone aparece e limpa ao clicar); movements (chip substituído); mais uma listagem de amostra (ex.: tools) — screenshot lado a lado com o padrão.
