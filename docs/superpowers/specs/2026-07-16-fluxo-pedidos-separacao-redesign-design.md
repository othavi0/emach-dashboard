# Redesign do fluxo Pedidos → Separação

**Data:** 2026-07-16 · **Status:** aprovado em brainstorming (mapa + mockups no companheiro visual + grilling)
**Antecessores:** specs 2026-06-25 (picking), 2026-07-11 (fluxo separação), 2026-07-15 (picking-list PDF); issues #319–#326.

## Contexto e problema

O fluxo atual espalha decisões da separação por lugares errados:

1. Na listagem de Pedidos, "Enviar para separação" e "Atribuir filial" são dois botões/duas ações — mas enviar **exige** filial (skip `sem_filial`), então a atribuição é na prática um pré-passo obrigatório escondido.
2. O PDF da lista de separação abre sozinho na tela de Pedidos após o envio — mas o papel serve a quem **separa** (galpão), não a quem envia (escritório).
3. Na fila de Separação, "Imprimir lista" não registra nada: o papel diz "esses são meus" mas o sistema não sabe. O dono só nasce quando o operador entra pedido por pedido e clica "Iniciar separação" — um passo redundante, já que clicar "Separar" no card **é** a intenção de iniciar.
4. O header da fila tem 3 contadores grandes redundantes com os badges das tabs, e um banner "você tem uma separação em andamento" que perde sentido quando o operador assume vários pedidos de uma vez.
5. A tela de conclusão da separação oferece "Despachar agora" com input de rastreio — mas o rastreio só existe quando a transportadora chega; não é papel do separador.

## Princípio de design (novo, permanente)

**UI dimensionada pro fluxo diário do trabalhador; edge case raro não ganha controle permanente.** Caso raro com caminho alternativo fica sem UI dedicada. (Origem: decisão de remover o "Salvar" avulso do detalhe do pedido — "não se prender a edge case que causa poluição visual e confusão pro trabalhador do dia a dia".)

## Decisões

| # | Decisão | Porquê |
|---|---|---|
| D1 | **Um botão só na listagem de Pedidos:** "Enviar para separação (N)" abre dialog com Select de filial (uma filial pro lote; pedidos que já têm filial mantêm a sua; pré-seleção quando o escopo do ator tem 1 filial). | A filial é condição do envio — decidir junto. Variante "por pedido" e "automática por CEP" rejeitadas (peso/opacidade). |
| D2 | **"Atribuir filial" avulso sai da seleção de pedidos pagos;** permanece somente no contexto de triagem (pedidos sem filial, #320). | Merge cobre o caso comum; triagem é outro trabalho. |
| D3 | **Zero PDF na tela de Pedidos:** sem auto-open, sem botão no toast. Toast só de sucesso/skips. | O papel nasce onde o trabalho físico começa (galpão). Confirmado no grilling. |
| D4 | **Detalhe do pedido pago:** remover o botão "Salvar" avulso da filial; renomear o primário "Marcar como Em separação" → **"Enviar para separação"** (aplica filial + envia num clique, comportamento que já existe). | Princípio no-edge-case-UI; unificar verbo com a listagem (consolidação #301). |
| D5 | **Header da fila de Separação:** remover os 3 contadores e o "Imprimir lista" de aba inteira; fica só o botão **"Selecionar"** (comportamento atual do modo seleção). Oculto nas tabs Exceções/Produtividade. | Contadores duplicam os badges das tabs; impressão sem seleção imprime a aba inteira sem intenção. |
| D6 | **Tabs intactas** (A separar · Separando · Exceções · Produtividade). | Estrutura validada; o problema nunca foi as tabs. |
| D7 | **Bulk na tab A separar — dois botões:** `Separar e imprimir (N)` (primário coral: cria as sessões de picking no nome do ator **e** abre o PDF) e `Imprimir lista (N)` (outline: só o PDF, sem claim). | O caso comum é "quem imprime separa" (1 clique). A válvula sem claim cobre o admin que imprime pra entregar papel a outra pessoa — cenário confirmado como real. |
| D8 | **Bulk na tab Separando:** `Imprimir lista (N)` — reimpressão pura, nunca muda dono. | Reimprimir papel perdido não é reatribuição. |
| D9 | **Card "Separar" (tab A separar) já inicia:** clique dispara `startPicking` e navega pra bipagem. Cards das outras tabs continuam links (Retomar/Resolver). A página de detalhe com "Iniciar separação" permanece só como fallback (deep-link, reabertura pós-exceção/cancelamento). | Clicar "Separar" É a intenção de iniciar; a tela intermediária era um clique morto. |
| D10 | **Banner "separação em andamento" removido.** Cards da tab Separando mostram dono: badge **"Separando · Você"** (tom primary) nos do ator, "Separando · {nome}" (tom warning) nos dos colegas. | Com N sessões simultâneas por operador, o banner singular perde o sentido; a tab Separando é a "minha lista". |
| D11 | **Conclusão da separação sem despacho:** remover o bloco "Despachar agora (opcional)" (input de rastreio + "Marcar como Enviado") do `PickingCompletePanel`; adicionar link **"Ver pedido"** pro detalhe do pedido, mantendo "Voltar à fila". | Rastreio só existe quando a transportadora chega; andamento do pedido vive no detalhe do pedido. |
| D12 | **Guard-rails do claim em lote:** teto de **20** pedidos por `Separar e imprimir`; corrida resolvida por skip por pedido ("já é de Fulano" — índice único `order_picking_one_active` + lock já existentes) com toast agregado; misclick reversível pelo `cancelPicking` existente; takeover de admin permanece. | Evita açambarcamento da fila; reusa a mecânica de skip do `bulkStartSeparation`. |
| D13 | **Produtividade passa a medir do 1º bipe:** duração da sessão = `MIN(order_picking_scan.scanned_at)` → `completed_at`, com fallback `started_at` quando não há bipe. | Com claim em lote, `started_at` vira "hora da impressão" e inflaria a duração por pedido (#324). |

## Mudanças por superfície

### Pedidos — listagem (`apps/web/src/app/dashboard/orders/`)

- `_components/orders-view.tsx`: BulkActionBar da tab Pagos perde "Atribuir filial (N)"; "Enviar para separação (N)" passa a abrir o novo dialog. Remover `window.open(picking-list…)` e o botão "Imprimir lista" do toast em `runBulkSeparation`.
- `_components/branch-picker-dialog.tsx`: evolui (ou ganha irmão) pra **SendToSeparationDialog** — mesmo esqueleto (Select de filial, sentinela `__none__`, teto de lote), com descrição "X já têm filial (mantida); os Y sem filial vão para a escolhida" e submit "Enviar N pedidos". Pré-seleção quando `branches.length === 1`. Quando **todos** os selecionados já têm filial, o Select não aparece — o dialog vira confirmação simples do envio.
- `actions.ts`: `bulkStartSeparation` aceita `branchId?` — aplicado **somente** aos pedidos com `branchId IS NULL` (nunca sobrescreve), dentro da mesma transação por pedido (lock + capability contra a filial destino, padrão SECURITY-02 do `assignBranch`). Skip `sem_filial` só permanece possível quando o dialog for submetido sem filial e houver pedido sem filial.
- Triagem (filtro "sem filial" + atribuição em lote, #320) **não muda**.

### Pedidos — detalhe (`orders/[id]/_components/order-action-column.tsx`)

- Remover o par Select+"Salvar" avulso (chamada `assignBranch` que só grava filial).
- O Select de filial permanece, alimentando apenas o botão primário renomeado **"Enviar para separação"** (`updateOrderStatus` com `branchId` — comportamento atual).
- A action `assignBranch` continua existindo (triagem em lote e outros callers); só o botão avulso do detalhe morre.

### Separação — fila (`apps/web/src/app/dashboard/separacao/`)

- `page.tsx`: header sem os 3 contadores e sem o `<a>` de impressão; slot `action` vira o botão "Selecionar" (exige lift do estado de seleção — provider client em volta de header+fila, ou header renderizado pelo componente client; decisão fica pro plano de implementação).
- `_components/picking-queue.tsx`: ações do BulkActionBar por tab — `a_separar`: `Separar e imprimir (N)` + `Imprimir lista (N)`; `em_separacao`: `Imprimir lista (N)`. Fluxo do primário: nova action → sucesso → `window.open(picking-list?ids=<movedIds>)` + toast com skips (padrão do orders-view atual).
- `actions.ts`: nova action **`bulkStartPicking({ orderIds })`** (zod `max(20)`) — por pedido, em transação própria: `lockOrderAndAuthorize('orders.pick')`, cria a sessão `in_progress` com `pickerUserId` do ator (reusa a lógica do `startPicking`, incluindo transição `paid→preparing` + history), captura 23505 de `order_picking_one_active` como skip "já em separação por {nome}". Skips adicionais espelhando as validações do `startPicking`: `sem_filial` (pedido sem `branchId` na fila) e `status_diferente`. Retorna `{ moved, movedIds, skipped }`.
- `_components/picking-order-card.tsx`: na tab `a_separar`, o CTA "Separar" vira botão real (`useTransition` → `startPicking` → `router.push`; erro = toast, sem navegar). Card segue clicável como link no restante da área. Badge da tab `em_separacao`: "Separando · Você" (primary) quando `pickerUserId === sessionUserId`, senão "Separando · {pickerName}" (warning) — card precisa receber o id do ator.
- `_components/resume-banner.tsx`: **remover** (e `getActivePickingForUser` se ficar órfã).
- `_components/picking-complete-panel.tsx`: remover bloco de despacho (D11); adicionar `Ver pedido` → `/dashboard/orders/{orderId}`.
- `data.ts` (produtividade): D13 — duração do 1º bipe com fallback.

### PDF (`orders/picking-list/`)

- Rota permanece; **mode `tab` fica sem caller** (o único uso era o header) → remover o suporte `?tab=` de `resolve-params.ts`/route na implementação (não deixar endpoint órfão). Mode `ids` intacto.
- Conteúdo do documento não muda nesta spec (polimentos: #326).

## Fora de escopo (registrar como issues se ainda não existirem)

- "Atribuir a…" — claim em nome de terceiro (opção C do grilling). Só se a distribuição por gestor virar rotina.
- Despacho em lote + etiqueta (#322).
- Localização física de estoque no PDF (não existe no schema).
- Filial no cabeçalho do PDF + cap do selecionar-todos (#326).

## Verificação (gate de "pronto")

1. **Funcional:** `bun verify`; testes novos pra `bulkStartPicking` (skip por corrida/23505, cap 20, transição paid→preparing) no padrão de `picking-actions.test.ts`.
2. **Perceptual:** screenshots lado a lado das 4 superfícies (listagem Pedidos com dialog, detalhe do pedido, fila A separar com os 2 botões, tab Separando com badges) contra os mockups aprovados.
3. **Dados:** smoke no browser com dado real: enviar lote com/sem filial, "Separar e imprimir" com corrida simulada (2 sessões), conferir `picker_user_id` e produtividade pós-D13. Estado fabricado segue a regra do banco único (linhas pontuais `EM-TEST-*`, reverter ao final).
