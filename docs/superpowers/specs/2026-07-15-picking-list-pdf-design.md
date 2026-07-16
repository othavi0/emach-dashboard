# Lista de Separação em PDF — design

> Sessão de brainstorm 2026-07-15. Mockups de alta fidelidade validados no visual companion
> (artefatos de sessão em `.superpowers/brainstorm/161240-1784133636/content/`, não versionados).
> Referência de formato: `Controle.pdf` (picking list gerada pelo Mercado Livre, elogiada pelos
> operadores do cliente).

## Contexto

Quando pedidos chegam em `paid`, o operador seleciona e dispara "Enviar para separação"
(`bulkStartSeparation`, já existente). O separador usa hoje a tela de picking com bipagem —
mas caminha o estoque sem guia físico. A feature adiciona a **Lista de Separação em PDF**:
guia de coleta impresso no padrão que os operadores já conhecem dos marketplaces, sem tocar
na bipagem (que continua sendo a confirmação).

A pesquisa (Shopee Seller Center + Mercado Livre, fontes oficiais, 2026-07-15) validou o fluxo
de status atual: estrutura equivalente etapa a etapa, com o emach à frente em bipagem auditada,
gate de envio e régua de urgência. Nenhuma mudança estrutural de fluxo.

## Decisões

| # | Decisão | Racional |
|---|---|---|
| 1 | Escopo: só pedidos do site próprio | Shopee/ML são referência de UX, não integração |
| 2 | PDF = guia de coleta impresso; bipagem segue confirmando | Cliente tem leitor + barcodes cadastrados |
| 3 | Disparo duplo: lote no bulk + fila de separação | Lote imprime os N recém-enviados; fila reimprime recorte/seleção |
| 4 | Estrutura híbrida: coleta consolidada por SKU + conferência por pedido | Resolve "itens iguais perto" E mantém o formato ML de conferência |
| 5 | Agrupamento por transportadora na conferência | `order.shippingMethod` (a UI de pedidos já trata como transportadora) |
| 6 | Documento adaptativo: coleta só com 2+ pedidos | 1 pedido = ficha única de 1 página; o bloco do pedido já é a coleta |
| 7 | Geração via `@react-pdf/renderer` (arquivo .pdf real) | Escolha do dono do produto; permite anexar/armazenar no futuro |
| 8 | Fluxo de status mantido; badge derivado "Separado" → **"Pronto para enviar"** | Nome do ML, familiar aos operadores |
| 9 | v1 sem campo de cor | Cor não existe estruturada em `order_item`; incluir = cross-repo (checkout ecommerce) |
| 10 | Fixes de picking no escopo | Guard de cancelamento (P1) + nome da filial na execução |
| 11 | Identificador de lote efêmero (ex: `L-1507-1432`, dia+hora) | Distingue folhas no galpão sem persistir entidade "lote" |
| 12 | v1 sem barcode gráfico no PDF | Barras decorativas não bipam; o código impresso em mono (texto) basta pra conferência visual |
| 13 | v1 sem log persistente de geração | Documento operacional; expõe o mesmo dado que a listagem de orders pro mesmo usuário (≠ export CSV de clientes) |

## Arquitetura

### 1. Documento (`@react-pdf/renderer`)

- Dep nova em `apps/web`. Componente `PickingListDocument` em
  `apps/web/src/app/dashboard/orders/picking-list/_lib/document.tsx`.
- Layout = mockup v2 aprovado, em 4 zonas no header: wordmark emach (paths do
  `apps/web/public/emach-nome-branco.svg` re-renderizados via `<Svg>/<Path>` com fill tinta) +
  título "LISTA DE SEPARAÇÃO" · box de lote (`L-ddMM-HHmm`) · faixa de contexto com micro-rótulos
  (FILIAL / EMISSÃO / OPERADOR) · stat row (Pedidos / Unidades / SKUs / Transportadoras).
- **Seção Coleta** (só com 2+ pedidos): linhas por SKU — checkbox, qtd (condensada, destaque),
  nome, `SKU · voltagem · modelo` em mono, código de barras textual, "N pedidos".
- **Seção Conferência**: bandas por transportadora (nome + contagem), blocos por pedido —
  checkbox grande, `order.number` em mono, cliente (`client.name`), cidade/UF
  (do `shippingAddress` snapshot), itens com qtd + nome + SKU/voltagem.
- Tipografia: Barlow / Barlow Condensed / IBM Plex Mono via `Font.register` com **TTFs locais**
  em `apps/web/public/fonts/` (OFL, baixados do repo google/fonts). ⚠️ Verificar no build da
  Vercel que os TTFs entram no bundle da rota (`outputFileTracingIncludes` se necessário).
- Datas via helpers de `src/lib/format/datetime.ts` (fuso `America/Sao_Paulo`).

### 2. Rota + dados

- Route handler `GET apps/web/src/app/dashboard/orders/picking-list/route.ts`
  (padrão de `customers/export/route.ts`).
- Auth: `requireCapability("orders.read")` + branch-scoping fail-closed
  (`getUserBranchScope` / `orderBranchCondition`) — ids fora do escopo são excluídos do documento,
  sem erro.
- Dois modos de query, mutuamente exclusivos:
  - `?ids=<csv>` — lote do bulk ou seleção na fila. Máx. 100 (mesmo teto do bulk); acima → 400.
  - `?tab=a_separar | em_separacao` — recorte da fila resolvido server-side (mesma condição
    da tab; `excecoes` não imprime), cap 100.
- Resposta: `renderToBuffer` → `application/pdf` com `Content-Disposition: inline;
  filename="lista-separacao-<lote>.pdf"` — abre no viewer do browser (imprime/salva de lá).
- Lógica pura em `_lib/picking-list-logic.ts` (testável sem render): consolidação por
  `variantId` (fallback `sku`), agrupamento por `shippingMethod` (null → seção
  "Sem transportadora definida", ao final), regra adaptativa (≥2 pedidos), ordenações
  (transportadoras A→Z; pedidos por `number`; coleta por qtd desc, depois nome).

### 3. Integração UI

- **Pedidos (bulk):** após `bulkStartSeparation` ok, `window.open` do PDF com os ids que
  avançaram + toast de sucesso com botão "Imprimir lista (N)" — fallback garantido contra
  popup blocker.
- **Fila de separação:** botão "Imprimir lista" no header (gera do recorte da tab ativa) +
  modo seleção com o kit bulk existente (`useBulkSelection` + `SelectionToolbar` +
  `SelectableItem`) para imprimir pedidos específicos.

### 4. Rename "Pronto para enviar"

Conceito `picked` renomeado em todas as superfícies pela fonte única:
`FULFILLMENT_STATE_META` (`separacao/fulfillment-meta.ts`) + tab de etapa "Separado" e pill de
atrasados (`orders/status-meta.ts`). Testes que citam o label acompanham. `order.status` no DB
não muda (contrato com o ecommerce intacto — segue `preparing`).

### 5. Fixes do fluxo de separação

- **Guard P1 — pedido cancelado durante picking ativo:** `scanItem`, `completePicking` e
  `reportMissing` re-checam `locked.status === "preparing"` após `lockOrderAndAuthorize`.
  Status incompatível → sessão encerrada automaticamente (`order_picking.status = "canceled"`,
  `cancelReason` explicativo, ator `system`) + erro amigável ao operador ("Pedido foi
  cancelado — separação encerrada"). `cancelPicking` fica **fora** do guard: cancelar a sessão
  de um pedido cancelado é exatamente a ação de limpeza e precisa continuar funcionando.
- **Nome da filial:** `branchName` passa da fila/detalhe ao `PickingExecution` (hoje o header
  mostra só o rótulo "Filial").

## Error handling & edge cases

- `ids` vazio ou todos fora do escopo → 200 com PDF "Nenhum pedido no escopo" (1 página) —
  não vaza a existência de pedidos de outra filial.
- Pedido sem `shippingMethod` → banda "Sem transportadora definida" no fim da conferência.
- Nome de produto longo → wrap nativo do react-pdf (sem truncate).
- Quebra de página natural entre bandas de transportadora; bloco de pedido nunca quebra no
  meio (`wrap={false}` no bloco).
- Falha de render → 500 com `logger.error`; toast do caller mantém o link pra retry.

## Testes

- `picking-list-logic.test.ts`: consolidação (variantes iguais somam; barcode/sku fallback),
  agrupamento e ordenação por transportadora, regra adaptativa (1 pedido sem coleta / 2+ com),
  null shippingMethod, contagens do stat row.
- Route handler: 401/403 sem capability, scoping (admin de filial A não vê pedido da B),
  cap de 100, modos `ids` × `tab`.
- Guard P1: unit das 3 actions guardadas com pedido cancelado (sessão encerra + erro
  amigável) + `cancelPicking` seguindo permitido no mesmo cenário.
- Smoke manual: gerar PDF de lote real em dev, conferir com `Controle.pdf` lado a lado.

## Fora de escopo (registrado)

- Cor estruturada em `order_item` (snapshot de atributos; exige mudança no checkout do
  ecommerce — repo separado, coordenação via ADR-0009).
- Persistência de lote como entidade (reimpressão histórica por lote).
- Localização física de estoque (corredor/prateleira) na coleta.
- Log persistente de geração de PDF (avaliar se o documento passar a incluir mais PII).

## Fontes da pesquisa

Shopee: Centro de Educação do Vendedor (artigos 2813, 2846, 3054, 3885) — fluxo
"Não Pago → A Enviar → Processado → Enviado → Concluído", documento "Lista de Empacotamento".
ML: Central de Vendedores + docs da API de Shipments — fluxo "Pendente → Em preparação →
Pronto para enviar → A caminho → Entregue", documentos "Folha de controle" / "Lista de produtos".
Picking list com checkbox por SKU é padrão de ERP integrado (Tiny/Bling), não nativo — o
`Controle.pdf` do cliente segue esse formato.
