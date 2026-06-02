# Seleção em massa em listagens (mecanismo genérico) — Fase 1

**Data:** 2026-06-02
**Escopo Fase 1:** mecanismo reutilizável + ação "Exportar selecionados" em `/dashboard/orders` e `/dashboard/customers`.

## Contexto

Veio da auditoria `/impeccable` (P3): power-user processa itens um a um; falta ação
em lote. As listagens-raiz usam **card-grid** (`DESIGN.md` §4) com **scroll infinito**
(`useInfiniteList`). Os cards são **clicáveis** (clique = abrir detalhe), então a
seleção precisa coexistir com a navegação.

## Decisões (validadas com o usuário)

- **Ativação — modo seleção (modelo C):** um botão liga o modo; aí o card inteiro
  vira toggle (não navega), com ring coral no selecionado e checkbox. Zero ruído no
  grid em repouso. Resolve o conflito "clicar navega vs. clicar seleciona".
- **Selecionar todos = só os carregados** (IDs na tela). Sem seleção por query.
  Ações recebem `string[]` de IDs. Backend simples.
- **Genérico primeiro:** 4 peças reutilizáveis compostas por cada listagem (composição,
  não um super-componente).
- **Faseado:** Fase 1 = mecanismo + export (risco zero, prova o padrão). Fase 2 =
  mutações (atribuir filial, ativar/descontinuar, visibilidade) com validação por-item.
- **Ajuste de escopo:** Fase 1 em **pedidos + clientes** (ambas têm export); ferramentas
  entra na Fase 2 (sua ação útil é mutação, não export).

## As 4 peças genéricas

### 1. `useBulkSelection<T>` (`src/lib/use-bulk-selection.ts`)
Estado de seleção, espelhando o ciclo do `useInfiniteList`.
```ts
useBulkSelection<T>({ items, getId, resetKey }): {
  active: boolean;            // modo ligado
  enter(): void;             // liga o modo
  exit(): void;              // desliga + limpa (Cancelar)
  toggle(id): void;
  selectAllLoaded(): void;   // seleciona todos os items atuais
  clear(): void;             // esvazia seleção, mantém o modo
  isSelected(id): boolean;
  selectedIds: string[];
  count: number;
  allLoadedSelected: boolean; // p/ o checkbox "todos"
}
```
- `resetKey` muda (filtro/busca) → `clear()` (IDs órfãos somem; mantém o modo).
- Estado interno: `Set<string>` + `active`. Sem dependência do `useInfiniteList` —
  recebe `items`/`getId` por prop, então serve qualquer listagem.

### 2. `<SelectableItem active selected onToggle>` (`src/components/bulk/selectable-item.tsx`)
Envolve **qualquer** card (Link ou div) sem reescrevê-lo. É sempre o grid-item (um `div relative`).
- **Inativo:** passthrough — card navega normal.
- **Ativo:** `onClickCapture` → `e.preventDefault()` (cancela navegação do `<a>`) +
  `e.stopPropagation()` (cancela onClick de cards `div role=button`) → `onToggle()`.
  Adiciona ring coral (`ring-2 ring-primary` quando selecionado) + `<Checkbox>` absoluto
  (`top-2 left-2 z-10`, com leve scrim p/ legibilidade sobre o card). `role="button"` +
  `onKeyDown` (Space/Enter) p/ teclado.
- **Por que capture:** intercepta o evento antes de chegar ao `<Link>`/`<a>` interno;
  `preventDefault` garante que a navegação nativa não dispare.

### 3. `<BulkActionBar count actions onClear>` (`src/components/bulk/bulk-action-bar.tsx`)
Barra flutuante, surge quando `count > 0`. `sticky bottom-4 z-40`, centralizada no conteúdo.
- `actions: { label; icon?; variant?; run(ids: string[]): void }[]` — config por listagem.
- Mostra `{count} selecionados` + botões de ação + "Limpar". Botão destrutivo nunca coral.
- Fallback: se `sticky` for clipado por overflow ancestral, trocar p/ `fixed` (validar no smoke).

### 4. `<SelectionToolbar>` (`src/components/bulk/selection-toolbar.tsx`)
Controles do modo, acima do grid.
- Inativo: botão "Selecionar" (`outline`, ícone `CheckSquare`).
- Ativo: "Selecionar todos (N)" + "Cancelar".

## Composição numa listagem (ex: `OrdersInfinite`)
```
const sel = useBulkSelection({ items, getId: o => o.id, resetKey })
<SelectionToolbar .../>
<grid>
  {items.map(o => (
    <SelectableItem active={sel.active} selected={sel.isSelected(o.id)} onToggle={()=>sel.toggle(o.id)}>
      <OrderCard item={o} />
    </SelectableItem>
  ))}
</grid>
<InfiniteSentinel .../>
{sel.count > 0 && <BulkActionBar count={sel.count} onClear={sel.clear}
  actions={[{ label:"Exportar CSV", run: ids => downloadCsv(ids) }]} />}
```
~15 linhas por listagem. `CustomersInfinite` segue idêntico com `CustomerCard`.

## Ação Fase 1 — Exportar selecionados
- Estende os route handlers `orders/export/route.ts` e `customers/export/route.ts` p/
  aceitar `?ids=a,b,c`. Quando presente: `WHERE id IN (...)` (substitui os filtros),
  ignora paginação. Schema (`ordersListFiltersSchema` / `customersListFiltersSchema`)
  ganha `ids?: string[]` opcional (coerção de CSV).
- A ação no client é navegação p/ `…/export?ids=<csv>` (GET stream com
  `Content-Disposition: attachment` → download). Reusa toda a geração de CSV existente.
- **Limite:** GET com IDs na URL. Com seleção dos carregados (dezenas), cabe folgado.
  Se a seleção crescer muito (centenas), migrar p/ POST — fora do escopo da v1.

## Edge cases
- Trocar filtro/busca no modo seleção → seleção limpa (resetKey), modo permanece.
- Selecionar, rolar (carregar mais), os já selecionados continuam marcados; "Selecionar
  todos" reflete os atuais carregados.
- 0 selecionados → barra some; "Limpar" volta a 0 sem sair do modo.
- Card com ação interna (botão editar do `CustomerCard`): no modo ativo, o capture
  intercepta tudo → clicar em qualquer lugar do card faz toggle (esperado).

## Não-objetivos (Fase 1)
- Mutações em lote (Fase 2): atribuir filial, avançar status, ativar/descontinuar,
  visibilidade — cada uma com validação por-item e `{ aplicados, ignorados[] }`.
- Seleção por query ("todos os N do filtro"). Branch-scoping no export por IDs (mantém
  paridade com o export atual; revisar quando religar os gates do ADR-0012).
- Ferramentas (entra na Fase 2 com mutações).
- Atalhos de teclado (shift-click range) — Fase 2+.

## Verificação
- `bun check-types` + `ultracite`.
- Smoke em `localhost:3006`: entrar/sair do modo; toggle por card; ring + checkbox;
  navegação intacta fora do modo; barra surge/some; export baixa só os selecionados;
  trocar filtro limpa a seleção; checar que o `sticky` não é clipado (senão `fixed`).
- Confirmar que Clientes e Pedidos seguem navegáveis normalmente com o modo desligado.
