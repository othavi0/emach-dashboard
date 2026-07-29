# Cards fantasma na aba Estoque da ferramenta

**Data:** 2026-07-29 · **Status:** aprovado (visual companion, opção A) · **Origem:** investigação "ferramenta nova não aparece vinculada a nenhuma filial"

## Problema

`stock_level` (vínculo variante×filial) nasce lazy — só na primeira movimentação (`applyMovement` em `stock/actions.ts` faz insert `onConflictDoNothing`). `createTool` não cria linha nenhuma, por design. Consequência: a aba Estoque do detalhe da ferramenta (`estoque-tab.tsx`) renderiza apenas a partir de `stock_level` existente, então:

- Ferramenta recém-criada → aba vazia com texto morto ("Sem variantes ou filiais com estoque registrado") e **nenhum caminho para a primeira entrada** — exatamente onde o usuário vai instintivamente para dar entrada.
- Ferramenta com estoque parcial → filiais ainda não vinculadas são invisíveis; entrada nelas só via `/dashboard/stock` ou estoque da filial.

## Decisão

Renderizar, por variante, **cards fantasma** para cada filial ativa do escopo do usuário que ainda não tem linha `stock_level` com aquela variante. Clique no fantasma abre a `BranchStockEditSheet` existente em modo **Entrada**, com `variantId` + `branchId` do card (linha sintética `quantity/minQty/reorderPoint = 0`). O `recordStockEntry` existente cria o vínculo — nenhuma mudança de servidor no fluxo de escrita.

O empty state deixa de existir quando há filiais no escopo: ferramenta nova mostra todos os fantasmas. Fallback do texto atual permanece só quando não há variantes ou nenhuma filial visível (fail-closed de branch-scope).

## Visual (aprovado)

Receita canônica do "tile de adicionar" já existente no sistema (`tool-image-gallery.tsx:354`, `image-upload-tile.tsx:86`):

- `border border-border border-dashed bg-muted/30`, `rounded-[10px]` — mesma moldura do card real.
- Anatomia espelhando `ToolStockBranchCard`: avatar quadrado com iniciais (fundo transparente, borda dashed), nome da filial, subtexto "Sem estoque nesta filial".
- Rodapé "+ Registrar entrada" em `text-muted-foreground`; hover acende (`hover:border-foreground/40`, texto → foreground). **Sem coral** (regra: máx. 1 CTA coral por surface).
- Acessível: `role="button"`, `tabIndex`, Enter/Espaço — igual ao card real.
- Após a primeira entrada, o refresh do detalhe converte o fantasma em card sólido.

## Escopo técnico

1. **`tool-detail-data.ts` (`getToolDetail`)** — buscar também as filiais `status='active'` visíveis ao usuário (respeitando `getUserBranchScope`; super_admin = todas). Devolver `branches: {id, name, city, state}[]` no detail. Poucas filiais → custo desprezível.
2. **`page.tsx` (tools/[id])** — computar `canAdjustStock = can(session, "stock.adjust")` e passar à `EstoqueTab` junto com `branches`. Fantasmas só aparecem com essa capability (o servidor continua autoritativo).
3. **`estoque-tab.tsx`** — por variante, derivar filiais sem linha em `stockRows`; renderizar fantasmas após os cards reais. Clique monta `ToolStockRow` sintética (qty 0) e reusa o `setSelected` atual; a sheet abre no modo `entrada` (comportamento default do reset dela).
4. **Componente novo `tool-stock-ghost-card.tsx`** ao lado do `tool-stock-branch-card.tsx` (não estender o card real — estados demais divergem).
5. **`stock-grouping.ts`** — hoje agrupa só variantes presentes em `stockRows`; passar a agrupar por **todas** as variantes da ferramenta (variante 100% sem estoque também mostra seus fantasmas).

## Não-objetivos

- Ação "Registrar entrada" no header (opção B, descartada).
- Mudanças em `/dashboard/stock`, na sheet ou nas actions de estoque.
- Criação eager de `stock_level` na criação da ferramenta (modelo lazy mantido).

## Riscos / atenções (resolvidos na implementação)

- **Refresh pós-entrada:** confirmado — a sheet chama `router.refresh()` no sucesso e o fantasma vira card sólido (verificado com dado real). Adicionalmente, `revalidateStockPaths` revalidava `/dashboard/tools/{id}/stock`, que é só um redirect stub para `?tab=estoque` — corrigido para revalidar `/dashboard/tools/{id}` (a rota que carrega `stockRows`), cobrindo entradas feitas de fora da aba.
- **Branch-scope:** admin filial-scoped vê fantasma apenas das próprias filiais (consistente com o resto de Inventory).
- **Capability da sheet na aba (decisão consciente, além do escopo original):** a tab passava `tools.update` como `canMutate` da `BranchStockEditSheet`; trocado para `stock.adjust` **também para os cards reais**, alinhando com a tab de estoque da filial (`branches/[id]/_lib/tab-actions.ts`), que já usa `stock.adjust`. Efeito: quem tem `tools.update` sem `stock.adjust` deixa de ver os forms de movimentação nesta aba (o servidor já negava a mutação; a UI agora reflete a autorização real).

## Verificação (3 provas)

1. **Funcional:** teste unit do novo agrupamento (variante sem estoque gera fantasmas; filial vinculada não duplica).
2. **Perceptual:** screenshot da aba lado a lado com a galeria de imagens (tile de upload) — mesma linguagem de dashed/hover.
3. **Dados reais:** na "Ferramenta de teste" (`b9bbf9b0`, 2 variantes, 0 stock_rows), dar uma entrada via fantasma e ver o card sólido aparecer; reverter a movimentação criada ao final (banco único dev=prod).
