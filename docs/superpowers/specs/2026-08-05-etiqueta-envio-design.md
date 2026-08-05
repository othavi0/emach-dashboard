# Etiqueta de envio + fluxo de rastreio — design

> Aprovado em 2026-08-05 via brainstorming com mockups no companion visual
> (`.superpowers/brainstorm/2497307-1785954471/content/etiqueta-final.html` e
> `acao-pedido.html`). Pesquisa de padrão de mercado (Mercado Livre, Shopee,
> Correios, Frenet) via workflow de research na mesma sessão.

## Problema

1. **Nomenclatura**: o documento de despacho se chama "Dados de envio" no app.
   O mercado inteiro (ML, Shopee, Melhor Envio) chama de **etiqueta de envio**
   (termo técnico Correios: "rótulo de endereçamento"). O dono não reconheceu a
   funcionalidade de emissão em massa que já existia, em parte por causa do nome.
2. **Formato**: o PDF atual é uma folha A4 corporativa por pedido (blocos
   remetente/destinatário + declaração de conteúdo com valores + rodapé de
   emissão/operador). Não é uma etiqueta: desperdiça papel e imprime valores
   que a operação não quer no volume.
3. **Fluxo de rastreio invertido**: a coluna de ação permite salvar o código
   ANTES de enviar (botão "Salvar" avulso) mas não permite adicionar/corrigir
   DEPOIS de enviado — e a operação real posta no balcão dos Correios, onde o
   código nasce depois da postagem ("o código é adicionado depois muitas vezes").

## Fatos da operação (confirmados com o dono, 2026-08-05)

- **Postagem no balcão** dos Correios, sem pré-postagem → o código de rastreio
  não existe na hora de imprimir a etiqueta. A etiqueta NÃO leva barcode de
  rastreio (diferente de ML/Shopee, que pré-geram).
- **Impressora A4 comum** — sem térmica.
- **NF-e (DANFE) acompanha a caixa** → declaração de conteúdo com valores é
  dispensável; a lista de itens da etiqueta é só conferência de empacotamento.
  (Nota: a emissão de NF-e pelo sistema ainda não existe — ADR-0027; a decisão
  reflete a operação, não o estado do banco.)
- Transportadoras em uso: PAC e SEDEX (`shipping_method`).

## Decisões de design

### D1 — Renomeação global "Dados de envio" → "Etiqueta de envio"

| Superfície | Antes | Depois |
|---|---|---|
| `PickingStatusCard` (detalhe do pedido, estado picked) | "Dados de envio" | **"Emitir etiqueta"** |
| Bulk action na tab picked (`orders-view.tsx`) | "Dados de envio (N)" | **"Emitir etiquetas (N)"** |
| `<Document title>` e título do doc | "Dados de Envio" | "Etiqueta de envio" |
| `Content-Disposition` filename | `dados-envio-<ts>.pdf` | `etiqueta-envio-<ts>.pdf` |

Rota `/dashboard/orders/shipping-doc` e o tag de logger `shipping_doc.pdf`
permanecem (identificadores internos; renomear é churn sem ganho de UX).

### D2 — Novo documento: 2 etiquetas por A4 retrato

Mockup aprovado: `etiqueta-final.html` (opção 3 da exploração, com ajustes).

- **A4 retrato, dois pedidos por folha** — metade superior e inferior, linha
  de corte tracejada (com ✂) no meio. Lote de 5 pedidos = 3 folhas; lote ímpar
  deixa a última metade em branco.
- **Cada metade** (auto-contida):
  - Header: título **"ETIQUETA DE ENVIO"** (Barlow Condensed, caps) à esquerda
    + número do pedido (IBM Plex Mono) à direita. Régua forte (2pt) abaixo.
    **Sem wordmark/marca**.
  - Duas colunas: **itens à esquerda (~47%)** — "Conferência · N itens · N un.",
    tabela Qtd × Item (nome + voltagem, SKU em mono abaixo), **sem preços** —
    e **endereços à direita (~53%)**: remetente compacto (box hairline; nome da
    filial + endereço em linha corrida) em cima, destinatário embaixo em box
    de borda forte com faixa preta "DESTINATÁRIO" (padrão Correios de destaque),
    nome em Condensed bold, endereço com **CEP inline na linha de cidade/UF**
    (`Cristo Rei · Curitiba/PR · CEP 80050-450`, CEP em mono) e, no pé do box,
    **barcode Code 128 do CEP na largura do box com o número centrado em cima**
    (padrão de triagem dos Correios).
- **Não aparecem**: valores, selo/card de serviço (PAC/SEDEX fora da etiqueta
  — decisão explícita do dono), rodapé de emissão/operador/paginação, marca.
- **Regra de produção**: metade comporta ~8 linhas de item. Pedido com mais
  itens ocupa **folha inteira exclusiva** (mesma estrutura, coluna de itens com
  mais espaço); acima de ~20 linhas o wrap de página do react-pdf segue natural
  (caso raro, aceito).
- Fallbacks preservados do doc atual: campos ausentes omitidos (nunca
  "undefined"), documento vazio → página "Nenhum pedido no escopo" com 200
  (não vaza existência de pedido fora do escopo, spec #319).

**Dependência técnica**: barcode Code 128 real gerado server-side com
`bwip-js` → PNG buffer/data-URI → `<Image>` do `@react-pdf/renderer` (rota já
roda `runtime = "nodejs"`). SVG-para-react-pdf é alternativa se o PNG pesar.

### D3 — Fluxo de rastreio na coluna de ação

Mockup aprovado: `acao-pedido.html`. Três estados:

1. **`preparing` (pronto para enviar)** — campo "Código de rastreio · opcional"
   **sem botão "Salvar"**; hint "Sem código? Envia assim mesmo e registra
   depois."; botão primário "Marcar como Enviado" leva o código digitado junto
   (o server `updateOrderStatus` já aceita `trackingCode` — sem mudança).
   O gate de separação concluída (`enforceShipGate`) não muda.
2. **`shipped`/`delivered` sem código** — card novo **"Rastreio"** com badge
   `warning` "Pendente" (ícone triangle-alert), texto "Pedido despachado sem
   código de rastreio…", input + botão "Salvar" (action `updateTrackingCode`
   existente; audita `tracking_set` na timeline).
3. **`shipped`/`delivered` com código** — código em leitura (mono) + botão
   ghost "Corrigir" que troca para o input. Mesma action, mesma auditoria.

Consequências:
- `runTrackingUpdate`/botão Salvar saem do estado `preparing`.
- `updateTrackingCode` passa a ser chamada só pós-envio. **Sem mudança
  server-side**: a action não tem guard de status (verificado em
  `actions.ts:780` — só capability + branch-scope via `lockOrderAndAuthorize`),
  então já funciona em `shipped`/`delivered`.
- Card "Rastreio" não aparece em estados terminais de exceção
  (`canceled`/`refunded`/`returned`) nem antes de `shipped`.

### D4 — Emissão em massa (já existe; só nomenclatura e doc novo)

O fluxo Selecionar → barra de ações → abrir PDF com `?ids=` (máx 100) já
funciona e re-valida escopo/etapa server-side. Padrão confirmado na pesquisa
(ML "Imprimir Etiquetas", Shopee "Gerar Documentos"): **imprimir não muda o
status do pedido** — o envio continua sendo marcado por pedido (ou em massa
futura, fora deste escopo).

## Fora de escopo (decidido, não esquecido)

- **Emissão de etiqueta via Frenet** (`/v1/shipments/oneclick` com LabelUrl):
  exige contrato próprio com os Correios + plano Frenet pago. Registrado como
  evolução possível quando a operação tiver contrato.
- **Formato térmico 10×15/ZPL** — sem impressora térmica na operação.
- **DC-e/DACE** (declaração de conteúdo eletrônica, obrigatória desde
  06/04/2026 para envio SEM NF) — envios saem com DANFE; se a operação mudar,
  reavaliar.
- **Barcode de rastreio na etiqueta** — impossível sem pré-postagem.
- **"Marcar como enviado" em massa** — não pedido; avaliar depois do uso real.

## Testes

- `shipping-doc-logic`: helpers novos puros — pareamento 2-por-página (ímpar,
  vazio, pedido >8 itens → folha exclusiva), linha de endereço com CEP inline,
  entrada do barcode (CEP só-dígitos).
- `document.test.tsx`: atualizar para a estrutura nova (2 metades, títulos).
- `resolve-params` inalterado (cobertura existente vale).
- Coluna de ação: lógica de visibilidade do card Rastreio extraída pura
  (`_lib`) + testes (estado × código presente/ausente); smoke visual nas rotas
  reais com os pedidos EM-TEST-91NN.

## Referências

- Pesquisa (fontes primárias e limitações em `nao_encontrado`): output do
  workflow `etiqueta-envio-research` — sessão 2026-08-05.
- Guia Correios: rótulo de endereçamento, destinatário "em negativo", barcode
  CEP Code 128 40×15mm, rastreio GS1-128 (não usado — sem pré-postagem).
- Código atual: `apps/web/src/app/dashboard/orders/shipping-doc/*`,
  `orders-view.tsx` (bulk), `[id]/_components/order-action-column.tsx`,
  `picking-status-card.tsx`.
