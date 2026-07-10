# Redesign da listagem de pedidos (/dashboard/orders)

Data: 2026-07-10 · Status: aprovado em brainstorming (visual validado no companion, decisões A/B clicadas pelo user)

## Objetivo

A listagem é a fila diária de **expedição/separação** (~20 pedidos ativos/dia). Hoje o card
mostra só contagem de linhas, valor e data — sem itens, sem transportadora. O redesign torna
itens (foto + nome + quantidade) e envio informação de primeira classe, adiciona filtros por
transportadora e por produto, e cria a aba **Atrasados** com alerta ativo.

## 1. Card (anatomia C1, validada visualmente)

- Grade de **2 colunas** (`grid-cols-1 lg:grid-cols-2`), shell canônico mantido (Link pro
  detalhe, `rounded-[10px] border-border bg-card`, focus ring).
- **Header**: esquerda = nº do pedido (`font-mono` 13px) + nome do cliente + filial (pin);
  direita = badge de status em **CAPSLOCK** (uppercase 10px, tracking 0.05em) e, com respiro
  vertical (~12px), chip da transportadora (mono 10.5px, ícone caminhão, texto
  `text-muted-foreground` — informa sem competir com o status).
- **Bloco de itens** (novo, sempre visível): até 3 linhas `thumb 30px (rounded-6, borda) +
  nome truncado (12.5px) + ×qtd (mono 12px, coluna direita)`; excedente vira "+N itens"
  (muted). Thumb = imagem principal do tool (padrão `tool_image` do detalhe); sem imagem →
  quadrado muted com ícone. Supabase thumb = `<img>` + biome-ignore documentado (padrão do repo).
- **Rodapé** edge-to-edge 3 colunas: **Unidades** (SUM de `quantity`, não contagem de
  linhas) | **Total** | **idade contextual por etapa** (ver §4). Idade em âmbar quando
  pedido está quente (ver §4).
- Badge de frete não-verificado (`shipping_unverified`) **continua** no card (compacto);
  só o filtro morre (§2).

### CAPSLOCK do status — escopo

Aplicado em `OrderStatusBadge` e nos badges de fulfillment (`FULFILLMENT_STATE_META`) em
todas as superfícies (listagem, detalhe, separação) — consistência de badge entre telas.
**Não** tocar o `Badge` base do `@emach/ui` (senão "Inativa"/badges genéricos viram caps).

## 2. Barra de filtros (inline, validada)

Ordem: **Buscar** (nº/cliente) · **Produto** · **Transportadora** · **Filial** · **Período** ·
(sem mais nada).

- **Produto**: combobox buscando o catálogo por nome/SKU — reusar o `ToolCombobox` de
  promotions. Filtra por `tool_id` (EXISTS em `order_item`). Com filtro ativo:
  - o item correspondente **acende** dentro de cada card (tint `primary/12%` + outline);
  - resumo acima da grade: "**{produto}** em **N pedidos** nesta aba · **X unidades** pra
    separar" (query agregada leve, mesma condição WHERE da listagem) + ação "limpar filtro".
- **Transportadora**: Select com opções de `SELECT DISTINCT shipping_method` dentro do
  branch-scope (rótulo normalizado caps) + opção **"A combinar"** (`IS NULL`). Filtro por
  igualdade em `shipping_method`.
- **Período**: controle único substitui De/Até — popover com presets (Hoje, 7 dias,
  30 dias, Este mês) + range custom. URL continua `?from/?to` (deep-links atuais valem).
- **Removido**: toggle "Frete a revisar" e o param `?unverified` (zod passa a ignorar;
  bookmarks antigos não quebram).

## 3. Aba Atrasados + alerta

Relógio: idade = `now() - paid_at` (fallback `created_at` se `paid_at` null). Vale para
`paid` e `preparing` (idade total desde o pagamento).

- **≥48h**: card marcado em âmbar — idade do rodapé em `text-warning` **e** borda do card
  em `border-warning/40` (o pedido "aparece amarelo" à distância, pedido do user) — ainda
  na aba normal.
- **≥72h**: pedido **move exclusivamente** para a aba **Atrasados** — sai de Pago/Em
  preparação (decisão explícita do user; leitura de fila "limpa"). Continua aparecendo em
  "Todos". Contagens das abas refletem a exclusão; Atrasados tem contagem própria com badge
  em tom **warning** quando >0.
- **Posição**: grupo esquerdo (fluxo do operador), após "Em preparação".
- **Ordenação** em Atrasados: mais antigo primeiro (FIFO).
- **Notificação ativa**: ao acessar `/dashboard/orders` **ou** `/dashboard/separacao` com
  atrasados > 0, toast warning na tela ("N pedidos atrasados — ver aba") com CTA pra
  `?tab=late`. Dispara a cada acesso à página (pedido do user), não persiste.
- Implementação da condição: tab `late` = `status IN ('paid','preparing') AND
  COALESCE(paid_at, created_at) <= now() - interval '72 hours'`; Pago/Em preparação ganham a
  condição inversa. `getOrdersTabCounts` estende o GROUP BY com o bucket late (TTL 30s
  existente absorve a fronteira móvel de 72h).

## 4. Tabs, idade contextual e ordenação

- Estrutura split mantida (fluxo | exceções), default "Pago" (spec 2026-07-08 preservada).
- 3ª célula do rodapé por aba: Pago/Em preparação/Atrasados → "**Pago há**"; Enviados →
  "**Enviado há**"; Entregues → "**Entregue em**" (data); Todos/exceções → "**Criado há**".
  Timestamps já existem (`paid_at`, `shipped_at`, `delivered_at`).
- Âmbar da idade: regra única de 48h (§3) nas abas paid/preparing/late; neutro nas demais.
- **Ordenação**: Pago, Em preparação e Atrasados → mais antigo primeiro (FIFO, quem espera
  há mais tempo no topo); demais abas → mais recente primeiro. Cursor keyset ganha variante
  `oldest` (espelho do `newest` em `cursor.ts`).

## 5. Dados

`fetchOrdersPage` (única query viva) passa a selecionar:

- `units_count` = `SUM(oi.quantity)` (subquery/lateral);
- top-3 itens por pedido via `LEFT JOIN LATERAL` (name, quantity, thumb via `tool_image`
  principal — mesmo padrão do `getOrderDetail`) + `items_total` p/ o "+N";
- `shipping_method` (chip) e timestamps de etapa (`paid_at`, `shipped_at`, `delivered_at`);
- condições novas: transportadora, produto (EXISTS por `tool_id`), janela late/não-late.

Higiene (aproveitando a passada):

- **Deletar `listOrders`** (data.ts:441-543) — código morto confirmado (zero callers).
- **Filter-builder único** em `_lib/` — hoje a construção do WHERE existe copiada 3×
  (fetchOrdersPage, export CSV, counts). Export CSV passa a aceitar os filtros novos.
- Money/timestamp de `db.execute` seguem os coercers existentes (`Number`, `toDate`).
- Performance: lateral top-3 + SUM é trivial na escala (~20 ativos; índices
  `order_status_created_idx`/`order_branch_status_created_idx` cobrem).

## 6. Seed de teste — 5 pedidos pagos (autorizado nesta sessão)

Script one-off **insert-only** `packages/db/scripts/seed-test-orders.ts`:

- 5 pedidos `status='paid'`, `paid_at` escalonado (≈2h, 1d, 2d, 3d, 5d atrás — exercita
  âmbar de 48h e a aba Atrasados), 1–4 itens cada;
- FKs 100% reais via SELECT (clients ativos, branch ativa vinculada ao user de teste,
  `tool_variant` ativas com snapshot copiado do catálogo) — nenhum dado novo de
  catálogo/cliente;
- `order_status_history`: criado (`pending_payment→pending_payment`) + pago
  (`pending_payment→paid`), `actor_type='system'`, `actor_user_id=null` (CHECK
  `actor_coherence`);
- `stock_movement` `saida_venda` por item + decremento escopado de `stock_level`
  (única operação não-INSERT; espelha o ecommerce — sem ela o estoque exibido fica
  incoerente com os movimentos; idempotência garantida pelo índice único parcial
  `stock_movement_sale_idempotency`);
- `number` com prefixo **`EM-TEST-90NN`** (unique, shape real no mono, limpeza via
  `LIKE 'EM-TEST-%'`);
- totais respeitando a invariante `total = subtotal − desconto + frete`;
- `shipping_method` variado (SEDEX, PAC, null "a combinar") pra exercitar o filtro;
- guard do banco único (dev=prod=ecommerce): imprime host do `DATABASE_URL` e exige
  `--force`; **execução só com OK explícito do user na hora**.

## 7. Verificação ("pronto" = 3 provas)

1. **Funcional**: `bun verify` + `bun run build` (arquivos `"use server"` mudam) + testes
   dos helpers novos (filter-builder, regra 48/72h, cursor oldest).
2. **Perceptual**: smoke no browser em todas as abas; screenshot lado a lado com a listagem
   de filiais (padrão irmão) e com os mockups aprovados do companion.
3. **Dados**: os 5 seeds renderizados corretos (unidades somadas, transportadora, âmbar,
   atrasados na aba certa, filtro de produto com resumo batendo).

DESIGN.md: documentar a variação do stat-card com bloco de itens + a regra de CAPSLOCK em
badge de status + a aba computada (Atrasados). apps/web/CLAUDE.md: nota sobre o
filter-builder único.

## 8. Fora de escopo

Página de detalhe do pedido, fluxo de separação (além do toast), notificações
push/e-mail, mudanças de schema no banco (tudo deriva de colunas existentes), export CSV
além de aceitar os filtros novos.
