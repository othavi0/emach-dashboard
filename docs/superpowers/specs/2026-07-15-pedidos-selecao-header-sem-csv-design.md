# Pedidos — seleção no header e remoção do export CSV

- **Data:** 2026-07-15
- **Status:** aprovado (brainstorming com user)
- **Escopo:** `/dashboard/orders` (+ componente compartilhado `BulkActionBar`, que afeta Clientes e Avaliações)

## Problema

A tela de Pedidos acumulou controles redundantes:

1. **"Exportar CSV" em 2 lugares** — no header da página (`ExportCsvLink`, export filtrado) e na barra flutuante de seleção em massa (`BulkActionBar`, export por IDs). A funcionalidade de export CSV de pedidos não é mais desejada.
2. **Dois controles de "sair/limpar" durante a seleção** — "Cancelar" no `SelectionToolbar` (acima do grid) e "Limpar" na `BulkActionBar` (barra inferior). Fazem quase a mesma coisa em lugares diferentes.
3. O `SelectionToolbar` fica solto acima do grid, enquanto o slot de ação do header da página é ocupado pelo export que será removido.

## Decisões (fechadas com o user)

| Decisão | Escolha |
| --- | --- |
| Escopo da remoção do CSV | **Só Pedidos, por completo** (UI + rota + capability). Clientes mantém o export dela — decisão separada. |
| Barra inferior | **Enxugar**: só `N selecionados · [ações]`. Sai "Exportar CSV" e sai "Limpar". |
| Consistência do "Limpar" | Remoção feita **no componente compartilhado** — Pedidos, Clientes e Avaliações ficam consistentes. |
| Posição do controle de seleção | `SelectionToolbar` vai pro **slot de ação do `PageHeader`** (lugar do export removido). |

## Design

### 1. Remoção do export CSV de Pedidos

- **Deletar** `apps/web/src/app/dashboard/orders/export/route.ts` (diretório `export/` inteiro — os helpers de CSV são locais à rota).
- **Deletar** `apps/web/src/app/dashboard/orders/_components/export-csv-link.tsx`.
- `orders-infinite.tsx`: remover a ação `"Exportar CSV"` da `BulkActionBar`.
- `page.tsx`: remover `canExport` / `await can(session, "orders.export")` e o import de `can` se ficar sem uso.
- `capabilities.ts`: remover a entrada `"orders.export"` do catálogo.
  - **Seguro sem migração:** overrides persistidos em `user_capability_override` com chave órfã são ignorados por `isCapability` em `getUserCapabilities` (`permissions.ts:71`). A UI de permissões deriva do catálogo, então a linha some sozinha do grid.
- Helpers de `_lib/orders-where.ts` que ficarem órfãos após a remoção (candidato: `normalizeDateParam`) saem junto — verificar consumidores restantes na implementação. `buildOrdersListConditions`/`resolveTab` continuam (usados por `data.ts`).

### 2. Seleção no header — client view com slots

O estado de seleção (`useBulkSelection`) depende de `items` do `useInfiniteList`, que hoje vive em `OrdersInfinite`, fundo na árvore — e o `PageHeader` é renderizado pelo server `page.tsx`. Abordagem escolhida (entre client-view-com-slots, portal e context bridge): **client view com slots**.

- `page.tsx` (server) continua dono de fetch, parsing de filtros e guards; passa a renderizar um único `<OrdersView>` (client) no lugar do bloco `PageHeader + OrderFiltersPanel + ProductFilterSummary + Empty|OrdersInfinite`.
- `OrdersView` (evolução de `orders-infinite.tsx`) possui `useInfiniteList` + `useBulkSelection` e renderiza:
  - `<PageHeader title="Pedidos" description={…} action={<SelectionToolbar …/>} />` — `PageHeader` é JSX puro (sem dado server-only), então renderizar dentro de client component mantém SSR normal, sem flash;
  - `filtersSlot` e `summarySlot` (`ReactNode` vindos do server — `OrderFiltersPanel`, `ProductFilterSummary`) entre o header e o grid;
  - grid (`OrderCardGrid`), `InfiniteSentinel` e `BulkActionBar`.
- `LateOrdersToast` permanece no `page.tsx`.
- **Empty state muda pra dentro do `OrdersView`**, dirigido por `items.length === 0` (client), com `hasFilters` vindo por prop do server. Efeito colateral desejado: quando um bulk esvazia a aba (todos enviados pra separação), o Empty aparece na hora — hoje a lista fica vazia sem feedback até um refresh.
- `SelectionToolbar` **não muda de API nem de comportamento**: inativo → botão "Selecionar"; ativo → "Selecionar todos (N)/Desmarcar todos" + "Cancelar". Só muda de posição (slot de ação do header) — e apenas em Pedidos; Clientes e Avaliações mantêm o toolbar acima do grid.

### 3. Barra inferior enxuta (componente compartilhado)

- `components/bulk/bulk-action-bar.tsx`: remover o botão "Limpar" e a prop `onClear`.
- Layout final: `N selecionado(s) · [ações da tela]`.
- Consumidores atualizados (só remoção da prop):
  - **Pedidos:** única ação "Enviar para separação (N)" (condicional a haver pagos selecionados, como hoje). Com nenhum pago selecionado, a barra mostra só a contagem — sair/desmarcar fica no header.
  - **Clientes:** mantém a ação "Exportar CSV" dela (rota `/customers/export` intocada).
  - **Avaliações:** mantém Aprovar/Rejeitar/Spam.
- Racional: "Desmarcar todos" e "Cancelar" do `SelectionToolbar` já cobrem o caso do "Limpar" — a duplicação só confunde.

## Fora de escopo

- Export CSV de Clientes (`customers.export`, rota e botão) — fica como está.
- Mover o `SelectionToolbar` pro header em Clientes/Avaliações.
- Qualquer mudança nas tabs de etapa/atraso de Pedidos.

## Verificação

1. `bun verify` (check-types + ultracite + testes).
2. Smoke visual na porta de dev, 3 telas:
   - **Pedidos:** header com "Selecionar" no lugar do export; fluxo completo — entrar em seleção, "Selecionar todos", barra inferior só com contagem + "Enviar para separação (N)", executar o bulk e ver o refresh; nenhum "Exportar CSV" em lugar algum; `/dashboard/orders/export` retorna 404.
   - **Clientes:** seleção + barra inferior sem "Limpar", com "Exportar CSV" funcionando.
   - **Avaliações:** seleção + barra inferior sem "Limpar", com as 3 ações de moderação.
3. Screenshots lado a lado (antes já capturado em brainstorming).
