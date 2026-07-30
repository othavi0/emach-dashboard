# Contrato de integração: admin ↔ site e-commerce

O dashboard administrativo e o site e-commerce compartilham o mesmo banco Postgres via Drizzle. **Nenhum dos dois chama o outro por HTTP.** Toda coordenação acontece pelo schema compartilhado. Ver ADR-0004.

---

## Tabela de ownership

Cada tabela tem um dono primário (quem cria e mantém os registros) e pode ter leitores secundários. "Shared" significa que os dois apps escrevem.

| Tabela                | Dono primário    | Quem lê     | Notas                                                                                            |
| --------------------- | ---------------- | ----------- | ------------------------------------------------------------------------------------------------ |
| `user`                | Dashboard        | Dashboard   | Staff interno. O e-commerce nunca toca essa tabela.                                              |
| `session`             | Dashboard        | Dashboard   | Sessões do staff (Better Auth dashboard instance).                                               |
| `account`             | Dashboard        | Dashboard   | Providers OAuth do staff.                                                                        |
| `verification`        | Dashboard        | Dashboard   | Tokens de verificação do staff.                                                                  |
| `client`              | E-commerce       | Ambos       | Conta do cliente final. Dashboard lê para `customers/`, `reviews/`; nunca cria sessão de client. |
| `client_session`      | E-commerce       | E-commerce  | Sessões do cliente (Better Auth ecommerce instance). Dashboard não toca.                         |
| `client_account`      | E-commerce       | E-commerce  | Providers OAuth do cliente. Dashboard não toca.                                                  |
| `client_verification` | E-commerce       | E-commerce  | Tokens de verificação do cliente. Dashboard não toca.                                            |
| `client_address`      | E-commerce       | Ambos       | Endereços salvos do cliente. Dashboard lê para exibir no detalhe do pedido.                      |
| `supplier`            | Dashboard        | E-commerce  | Fornecedores. E-commerce lê para exibir informações de fabricante.                               |
| `category`            | Dashboard        | Ambos       | Árvore de categorias. E-commerce lê para navegação de catálogo.                                  |
| `tool_category`       | Dashboard        | Ambos       | Vínculo tool ↔ categoria. E-commerce lê para filtrar por categoria.                              |
| `tool`                | Dashboard        | Ambos       | Produto-pai. E-commerce lê para exibir catálogo. Colunas de frete: `packaging_weight_kg`, `stackable`, `ships_in_own_box` — ver "Consolidação em caixas + cotação Frenet". |
| `tool_variant`        | Dashboard        | Ambos       | Variante vendável (SKU, preço, voltagem). E-commerce lê para carrinho e checkout.                |
| `tool_image`          | Dashboard        | Ambos       | Imagens do produto. E-commerce exibe na vitrine.                                                 |
| `attribute_definition`| Dashboard        | Ambos       | Specs técnicas dinâmicas. E-commerce lê para exibir ficha técnica.                              |
| `tool_attribute_value`| Dashboard        | Ambos       | Valores de atributo por tool. E-commerce exibe na ficha técnica.                                 |
| `tool_attribute_assignment` | Dashboard  | Ambos       | Ordem de exibição de atributos por tool.                                                         |
| `branch`              | Dashboard        | Ambos       | Filiais. E-commerce pode exibir disponibilidade por filial.                                      |
| `stock_level`         | Dashboard        | Ambos       | Quantidade por variante × filial. E-commerce lê para exibir disponibilidade.                     |
| `stock_movement`      | Shared           | Dashboard   | Dashboard escreve ajustes manuais (actor `user`). E-commerce escreve débitos de venda (`saida_venda`, actor `system`) na transição para `paid`. |
| `user_branch`         | Dashboard        | Dashboard   | Escopo de staff × filial. E-commerce não usa.                                                    |
| `store_settings`      | Dashboard        | E-commerce  | Singleton (`id='singleton'`) de configurações da loja: origem do despacho (`shipping_origin_branch_id` → `branch`) e política de seguro de frete. E-commerce lê via `getShippingSettings`. |
| `banner`              | Dashboard        | E-commerce  | Banners do hero/carrossel da home. E-commerce lê para renderizar. Os campos de render (`layout`, escalas, `badge_text`, `countdown_target`, `background_mobile_mode`) devem ser honrados fielmente — ver "Render do hero". |
| `promotion`           | Dashboard        | Ambos       | Promoções e cupons. E-commerce aplica desconto no checkout.                                      |
| `promotion_tool`      | Dashboard        | Ambos       | Vínculo promoção ↔ tool. E-commerce lê para calcular preço final.                               |
| `order`               | Shared           | Ambos       | Pedido. **E-commerce:** cria a linha e conduz o status até `paid` (campos de checkout, `paymentMethod`, `paymentProviderRef`, campos Asaas/NF-e, `notes`). **Admin:** assume de `paid` em diante — status, carimbos de tempo (`preparingAt`, `shippedAt`, `deliveredAt`, `canceledAt`, `returnedAt`, `refundedAt`), `branchId`, `shippingTrackingCode`. |
| `order_item`          | E-commerce       | Ambos       | Itens do pedido. Criados pelo e-commerce no checkout; dashboard lê para exibir e processar.      |
| `cart_event`          | E-commerce       | Dashboard   | Evento bruto de "adicionar ao carrinho" (1 linha por clique). E-commerce só INSERE (fire-and-forget); dashboard lê janelas 15/30/90 e expurga >180d via cron. |
| `order_status_history`| Shared           | Dashboard   | E-commerce registra transições até `paid`; dashboard registra de `paid` em diante.               |
| `order_note`          | Dashboard        | Dashboard   | Notas internas do staff. O e-commerce nunca lê nem escreve.                                      |
| `order_attachment`    | Dashboard        | Dashboard   | Anexos internos (documentos de despacho, etc.). O e-commerce nunca lê nem escreve.               |
| `order_picking`       | Dashboard        | Dashboard   | Sessão de separação física (picking) de `paid`/`preparing` em diante: quem separou, status, carimbos. O e-commerce nunca lê nem escreve; chega via sync (ADR-0009) mas **não exige mudança no checkout**. |
| `order_picking_item`  | Dashboard        | Dashboard   | Itens da sessão de separação (qtd esperada × bipada, falta). O e-commerce nunca lê nem escreve.   |
| `order_picking_scan`  | Dashboard        | Dashboard   | Log de cada bipagem (quem, quando, código lido). O e-commerce nunca lê nem escreve.              |
| `review`              | E-commerce       | Ambos       | Avaliação criada pelo cliente. Dashboard lê para moderação; nunca cria review.                   |
| `consent_log`         | E-commerce       | Dashboard   | Consentimentos LGPD do cliente. Dashboard lê para auditoria de compliance.                       |
| `client_audit_log`    | Dashboard        | Dashboard   | Mutações de dados de cliente feitas pelo staff. E-commerce não toca.                             |
| `client_export_log`   | Dashboard        | Dashboard   | Registro de exports CSV/LGPD. E-commerce não toca.                                               |

---

## Métricas de carrinho (`cart_event`)

O storefront insere 1 linha por clique de "adicionar ao carrinho":
`{ id: crypto.randomUUID(), toolId, variantId, clientId (se logado, senão null), sessionId (id de visitante/sessão do carrinho), quantity }`.
`created_at` tem default `now()` — não enviar.

Regras: INSERT-only e fire-and-forget (try/catch com log — falha na métrica
jamais quebra o fluxo de carrinho). E-commerce não lê nem deleta; o expurgo
(>180 dias) é do dashboard (`/api/cron/prune-cart-events`). Janelas exibidas
no admin: 15/30/90 dias, contagem bruta de eventos.

---

## Faixas de CEP por filial (`branch.cep_ranges`)

`branch.cep_ranges` (jsonb) é `Array<{ from: string; to: string; label?: string }>` — CEPs em **8 dígitos** (sem máscara). Editado só no dashboard (form da filial).

Helper compartilhado em `@emach/db/queries/branch-cep`:

- `matchBranchByCep(cep, branches)` — função pura; **primeira filial** (na ordem) cuja faixa cobre o CEP vence.
- `getBranchByCep(db, cep)` — consulta filiais `active` com faixas e roda o match.

**Semântica:** sugestão **não-autoritativa**. Hoje não há roteamento automático — todo pedido chega para todas as filiais e a primeira que o assume fica com ele. O e-commerce **pode** usar `getBranchByCep` para sugerir filial, sem obrigatoriedade. Sobreposição entre filiais é permitida (resolvida por first-match-wins).

---

## Configurações de frete (`store_settings` + `getShippingSettings`)

Singleton (`store_settings`, `id='singleton'`) editado só no dashboard (`/dashboard/site/settings`, aba Frete). Define a **origem do despacho** e a **política de seguro** da cotação da loja.

Helper compartilhado em `@emach/db/queries/store-settings`:

- `getShippingSettings(db)` → `{ originBranchId, originCep, insurancePolicy, insuranceCapAmount }`. Sem linha singleton → DEFAULTS (`originCep: null`, `insurancePolicy: 'none'`, `insuranceCapAmount: 3000`), espelhando o comportamento atual do storefront.

**Contrato para o e-commerce:**

- `originCep` (CEP da filial de origem, ou `null`): origem da cotação. O storefront **já consome** — usa `originCep` como `SellerCEP` quando tem 8 dígitos válidos; senão cai no fallback `env.FRENET_SELLER_CEP`.
- `insurancePolicy`: `'none'` (sem valor declarado adicional) ou `'cart_value'` (declara o valor do carrinho até `insuranceCapAmount` como `ShipmentInvoiceValue` na cotação Frenet). Também já consumido pelo storefront.
- **Frete grátis** não vive aqui: é só via cupom/promoção (`promotion`). O `R$ 299` hardcoded no storefront é bug a remover (issue separado no emach-ecommerce).

As colunas `shipping_fill_factor` e `shipping_box_padding_cm` foram removidas do schema em 2026-07-29 (nunca foram consumidas pela cotação; o motor usa folga fixa de 0.9). O drop físico das colunas no banco é coordenado — ver "Regra de sincronização" abaixo.

---

## Consolidação em caixas + cotação Frenet

A cotação de frete do storefront é feita na **API Frenet** (`POST /shipping/quote`). O papel do
dashboard é manter os insumos: o **catálogo de caixas** (`shipping_box`) e os **dados físicos do
produto** (`tool`). Antes de cotar, o checkout consolida o carrinho em caixas reais via
`packItems`; cada caixa vira uma linha do `ShippingItemArray` da Frenet.

### Tabela compartilhada

| Tabela         | Dono primário | Quem lê    | Notas                                                                 |
| -------------- | ------------- | ---------- | --------------------------------------------------------------------- |
| `shipping_box` | Dashboard     | E-commerce | Caixa do catálogo: dimensões internas (cm), peso máximo e tara (kg). |

### Colunas de `tool` consumidas pela cotação

| Coluna                                   | Semântica                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| `weight_kg`, `length_cm`, `width_cm`, `height_cm` | Peso e dimensões do produto (obrigatórios no cadastro).                     |
| `packaging_weight_kg`                    | Peso da embalagem/proteção. Peso de despacho = `weight_kg + packaging_weight_kg`.    |
| `stackable`                              | Pode empilhar sobre/sob outros itens na consolidação de volume.                      |
| `ships_in_own_box`                       | Viaja em embalagem própria (ex: item longo); não consolida com outros itens.         |

A coluna `upright_only` foi removida do schema em 2026-07-29 (nunca foi enviada
pelo checkout à cotação). O drop físico é coordenado — ver "Regra de sincronização".

### Funções compartilhadas (`@emach/db/queries/shipping*`)

Sincronizadas ao ecommerce via CI (ADR-0009):

```ts
import { getActiveBoxes } from "@emach/db/queries/shipping";
import { packItems, type QuoteItem } from "@emach/db/queries/shipping-quote";

const boxes = await getActiveBoxes(db);
const packages = packItems(items, boxes);
// → cada ShippingPackage vira { Weight, Length, Height, Width, Quantity: 1 }
//   no ShippingItemArray da Frenet.
```

A consolidação usa folga fixa de ocupação (0.9 do volume interno) embutida no motor —
não há mais `PackOptions` (removido em 2026-07-29 junto com as colunas de settings).

Pacote marcado `outOfCatalog: true` (item que não cabe nem na maior caixa ativa) → o checkout
exibe **"Frete a combinar"** sem chamar a Frenet. Pacotes `outOfCatalog` e `shipsInOwnBox` usam as
dimensões do próprio produto.

O motor antigo de tabelas próprias (`carrier`/`carrier_zone`/`carrier_rate` + `quoteShipping`)
foi removido em 2026-07-03 (issue #287 do dashboard).

---

## O que o checkout deve gravar em `order` / `order_item`

### `order` — campos obrigatórios no INSERT do checkout

| Campo                  | Tipo / Formato                                                   | Obrigatório | Observação                                                                                           |
| ---------------------- | ---------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------- |
| `id`                   | `text` UUID v4                                                   | Sim         | `crypto.randomUUID()` no e-commerce.                                                                  |
| `number`               | `text` único e legível                                           | Sim         | Formato sugerido: `EM-YYYYMMDD-XXXX` (sequencial ou aleatório). Exibido para o cliente.              |
| `client_id`            | FK → `client.id`                                                 | Sim         | Cliente autenticado que fez a compra.                                                                 |
| `status`               | `order_status` enum                                              | Sim         | **Sempre `pending_payment` na criação.** Nunca criar pedido em outro status.                         |
| `subtotal_amount`      | `numeric(12,2)` em BRL                                           | Sim         | Soma dos `line_total` dos itens antes de desconto e frete.                                            |
| `discount_amount`      | `numeric(12,2)` em BRL                                           | Sim         | **Apenas o desconto de cupom** (default `0`). A economia da promoção automática **não** entra aqui — já está embutida no `subtotal_amount`. Ver "Semântica de desconto" abaixo. |
| `coupon_id`            | FK → `promotion.id` (`onDelete: set null`)                      | Não         | Cupom (`promotion` tipo `promocode`) aplicado no checkout. Nulo se nenhum cupom. Ver "Aplicação de cupom" abaixo. |
| `shipping_amount`      | `numeric(12,2)` em BRL                                           | Sim         | Custo de frete (default `0`).                                                                         |
| `total_amount`         | `numeric(12,2)` em BRL                                           | Sim         | `subtotal - discount + shipping`.                                                                     |
| `shipping_address`     | `jsonb` com shape `ShippingAddress`                              | Sim         | Snapshot do endereço no momento da compra. Ver shape abaixo.                                          |
| `created_at`           | `timestamp` UTC                                                  | Sim         | `defaultNow()` — deixar o DB preencher.                                                               |
| `payment_method`       | `text`                                                           | Não         | Ex.: `"pix"`, `"credit_card"`. Preencher quando conhecido.                                            |
| `payment_provider_ref` | `text`                                                           | Não         | ID da cobrança no Asaas (ex.: `pay_abc123`). Preencher após criar cobrança no gateway.               |
| `branch_id`            | FK → `branch.id`                                                 | Não         | Filial de fulfillment. O admin define em `preparing`; o e-commerce pode deixar nulo na criação.      |
| `shipping_method`      | `text`                                                           | Não         | Ex.: `"sedex"`, `"pac"`.                                                                              |
| `notes`                | `text`                                                           | Não         | **Observação do cliente** digitada no checkout (campo de texto livre). Ver seção "Observações × Notas internas" abaixo. |

Shape esperado de `shipping_address` (JSONB):

```json
{
  "recipient": "Nome Completo",
  "zipCode": "01310-100",
  "street": "Av. Paulista",
  "number": "1000",
  "complement": "Apto 42",
  "neighborhood": "Bela Vista",
  "city": "São Paulo",
  "state": "SP",
  "country": "BR"
}
```

#### Semântica de desconto (`discount_amount` × auto-promo)

`order.discount_amount` captura **apenas o desconto de cupom** (`promotion` tipo `promocode`).
A economia da **promoção automática** (`type='promotion'`) **não** é somada aqui: ela já está
embutida no `order.subtotal_amount`, porque o `order_item.unit_price` gravado é o preço **pós
auto-promo**. A invariante `subtotal − discount + shipping = total` fecha numericamente.

> ⚠️ Para relatórios de margem/desconto no dashboard: ler `discount_amount` como "desconto total
> concedido" **subconta** — ignora a economia da auto-promo. Para o total realmente concedido,
> derivar a economia de auto-promo comparando `order_item.unit_price` com o preço de catálogo da
> tool na data do pedido. Não somar via `discount_amount`. (issue #124)

### `order_item` — campos obrigatórios no INSERT do checkout

| Campo              | Tipo / Formato          | Obrigatório | Observação                                                                     |
| ------------------ | ----------------------- | ----------- | ------------------------------------------------------------------------------- |
| `id`               | `text` UUID v4          | Sim         | `crypto.randomUUID()`.                                                          |
| `order_id`         | FK → `order.id`         | Sim         |                                                                                 |
| `tool_id`          | FK → `tool.id`          | Sim         | Tool-pai do item.                                                               |
| `variant_id`       | FK → `tool_variant.id`  | Sim         | **A variante é a unidade de venda.** Nunca usar só `tool_id`.                  |
| `name`             | `text`                  | Sim         | Snapshot do nome do produto no momento da compra.                               |
| `unit_price`       | `numeric(12,2)` em BRL  | Sim         | Preço unitário cobrado (após desconto por item, se houver).                     |
| `quantity`         | `integer > 0`           | Sim         | CHECK no DB rejeita `quantity <= 0`.                                            |
| `line_total`       | `numeric(12,2)` em BRL  | Sim         | `unit_price * quantity`.                                                        |
| `discount_amount`  | `numeric(12,2)` em BRL  | Sim         | Desconto aplicado neste item (default `0`).                                     |
| `sku`              | `text`                  | Não         | Snapshot do SKU da variante. Recomendado para rastreabilidade fiscal.           |
| `barcode`          | `text`                  | Não         | Snapshot do `tool_variant.barcode`; gravar se disponível. Pedidos anteriores à introdução do campo ficam null. |
| `model`            | `text`                  | Não         | Snapshot do modelo.                                                             |
| `voltage`          | `text`                  | Não         | Snapshot da voltagem da variante.                                               |
| `ncm`              | `text`                  | Não         | Código NCM — obrigatório para emissão de NF-e. Gravar se disponível no catálogo. |
| `cest`             | `text`                  | Não         | Código CEST — para substituição tributária.                                     |
| `manufacturer_name`| `text`                  | Não         | Snapshot do nome do fabricante/fornecedor.                                      |
| `weight_kg`        | `numeric(10,3)`         | Não         | Peso — usado para cálculo de frete e NF-e.                                      |
| `length_cm`        | `numeric(10,2)`         | Não         | Dimensões para frete.                                                           |
| `width_cm`         | `numeric(10,2)`         | Não         | Dimensões para frete.                                                           |
| `height_cm`        | `numeric(10,2)`         | Não         | Dimensões para frete.                                                           |
| `cost`             | `numeric(12,2)` em BRL  | Não         | Snapshot do custo de aquisição copiado de `tool_variant.cost` no momento do checkout, para análise de margem pelo admin. **Campo interno — nunca renderizar no checkout nem em qualquer tela do cliente.** O e-commerce deve gravá-lo na inserção mas não pode exibi-lo. |

> **Importante:** `order_item` é imutável após o INSERT. Os snapshots de nome, SKU, voltagem, dimensões e NCM ficam congelados — mudanças posteriores na Tool ou na Variant não afetam o histórico do pedido.

---

## Handoff de status: fronteira e-commerce × admin

O status `pending_payment` é o único em que um pedido nasce. O e-commerce conduz o fluxo de pagamento; o admin assume a operação física após a confirmação.

```
[E-COMMERCE]                                   [ADMIN]
pending_payment ──→ payment_failed ──→ canceled
pending_payment ──→ canceled
pending_payment ──→ paid ─────────────────────────→ preparing
                                                    preparing ──→ shipped
                                                    shipped ──→ delivered
                                                    shipped ──→ returned      ← falha de entrega
                                                    delivered ──→ returned     ← devolução pelo cliente
                                                    returned ──→ refunded
                                                    paid/preparing/shipped ──→ refunded
payment_failed ──→ pending_payment
```

**Fronteira:** o e-commerce é responsável pelo Order até `paid` (inclusive). A partir de `paid`, **apenas o dashboard** progride o status. Ver ADR-0001 e ADR-0005.

Transições completas (fonte canônica: `apps/web/src/app/dashboard/orders/schema.ts`):

| De                | Para                                    |
| ----------------- | --------------------------------------- |
| `pending_payment` | `paid`, `payment_failed`, `canceled`    |
| `payment_failed`  | `pending_payment`, `canceled`           |
| `paid`            | `preparing`, `refunded`                 |
| `preparing`       | `shipped`, `refunded`                   |
| `shipped`         | `delivered`, `returned`, `refunded`     |
| `delivered`       | `returned`                              |
| `returned`        | `refunded`                              |
| `canceled`        | *(terminal)*                            |
| `refunded`        | *(terminal)*                            |

`canceled` só é alcançável de estados **não pagos** (`pending_payment`, `payment_failed`). Encerrar um pedido já pago é sempre `refunded`.

---

## Estoque: débito ocorre em `paid`

**`pending_payment` não reserva estoque.** O débito de `stock_level` acontece apenas quando o pedido transita para `paid`.

Motivação: pedidos não pagos não devem imobilizar estoque — o cliente pode abandonar o checkout. Cancelar um pedido em `pending_payment` ou `payment_failed` não mexe em `stock_movement` nem em `stock_level`. Ver ADR-0007.

Quando o e-commerce confirmar o pagamento e gravar o status `paid`, deve também:

1. Decrementar `stock_level.quantity` para cada `(variant_id, branch_id)` dos itens.
2. Inserir um registro em `stock_movement` por item:
   - `reason = 'saida_venda'`
   - `actor_type = 'system'` (sem `actor_id`)
   - `order_id` e `order_item_id` preenchidos
   - `delta` negativo igual à `quantity` do item

O índice `stock_movement_sale_idempotency` (`UNIQUE` parcial em `order_item_id WHERE reason = 'saida_venda'`) garante idempotência — um segundo disparo do mesmo evento não gera duplo débito.

O CHECK `quantity_non_negative` em `stock_level` rejeita débitos que levariam o estoque abaixo de zero (`quantity >= 0`).

---

## Campos do Asaas em `order`

O e-commerce integra com o gateway Asaas para pagamentos e NF-e. O dashboard **nunca** chama a API do Asaas diretamente — recebe os dados pelo banco. Ver ADR-0008.

| Campo em `order`        | Origem no Asaas                                                | Quando preencher                                      |
| ----------------------- | -------------------------------------------------------------- | ----------------------------------------------------- |
| `payment_receipt_url`   | `transactionReceiptUrl` da resposta do endpoint de pagamento   | Após confirmação de pagamento (`paid`)                |
| `nfe_number`            | Número da NF-e emitida                                         | Após emissão da nota fiscal                           |
| `nfe_url`               | URL do PDF / DANFE da NF-e                                     | Após emissão da nota fiscal                           |
| `nfe_xml_url`           | URL do XML da NF-e                                             | Após emissão da nota fiscal                           |
| `nfe_status`            | Status de emissão da NF-e (ex.: `authorized`, `cancelled`)     | Atualizar conforme ciclo de vida da nota no Asaas     |

Todos esses campos são nullable — o admin não os edita e não depende deles para progredir o status. São exibidos na tela de detalhe do pedido para consulta do staff e do cliente.

---

## `order.notes` × `order_note`: diferença crítica

São dois conceitos distintos que **não devem ser confundidos**:

| Conceito       | Campo / Tabela    | Quem escreve | Conteúdo                                                                  | Visível para o cliente |
| -------------- | ----------------- | ------------ | ------------------------------------------------------------------------- | ---------------------- |
| **Observação do cliente** | `order.notes` (`text`) | E-commerce (no checkout) | Campo de texto livre que o cliente preenche durante a compra (ex.: "deixar com o porteiro"). | Sim — exibido no detalhe do pedido para o cliente |
| **Nota interna** | `order_note` (tabela) | Dashboard (staff) | Anotação interna do staff (ex.: "cliente ligou, aguarda reposição"). Nunca exposta ao cliente. | Não |

O e-commerce preenche `order.notes` no INSERT do pedido e não deve escrever em `order_note`. O dashboard nunca sobrescreve `order.notes` (campo imutável após o checkout).

---

## Aplicação de cupom no checkout (`promotion` tipo `promocode`)

> Status: **implementado no e-commerce** (PR ecommerce#58). O checkout aplica o cupom e grava
> `order.coupon_id` + `order.discount_amount`. O dashboard é dono de `promotion`/`promotion_tool`
> e define os campos; o enforcement do cupom vive no checkout (ecommerce).

Modelo (após o redesenho de 2026-06-05): `promotion` tem `type` (`promotion` automática |
`promocode` cupom), `discount_type` (`percent` | `fixed`), `discount_value` (numeric),
`applies_to_all` (bool), `max_redemptions` (int, nullable = ilimitado), `redemption_count` (int),
`min_order_amount` (numeric, nullable = sem mínimo). Os campos `max_redemptions`/`min_order_amount`
só existem em `promocode` (CHECK `promo_no_coupon_fields`).

Algoritmo na validação do cupom (carrinho/checkout):

1. Resolver `promotion` por `code` + `type='promocode'` + `active=true` + dentro da vigência
   (`starts_at`/`ends_at` são nullable → vazio significa "imediato"/"sem prazo").
2. **Escopo:** `applies_to_all=true` → todo o carrinho elegível; senão só itens cujo `tool` ∈
   `promotion_tool`. Em ambos os casos "elegível" **exclui** itens com auto-promoção ativa — cupom e
   promoção automática **não empilham** (ADR-0002). O desconto incide **apenas sobre o subtotal
   elegível** (escopo ∩ sem auto-promo). Comportamento travado pelos testes `restringe escopo a
   promotion_tool do cupom` e `pedido mínimo usa o subtotal elegível, não o total do carrinho` no
   `emach-ecommerce` (`apps/web/src/lib/coupons/validate-coupon.ts`, commit `60dde43`).
3. **Mínimo:** rejeitar se o **subtotal elegível** (o mesmo do passo 2, não o total do carrinho) <
   `min_order_amount` (quando não-nulo).
4. **Limite:** rejeitar se `redemption_count >= max_redemptions` (quando não-nulo).
5. **Cálculo:** `percent` → percentual sobre a base elegível; `fixed` → abate `discount_value`
   em reais (clamp em ≥ 0).

Na confirmação do pedido (transição para `paid`):

- Incrementar `redemption_count` de forma **idempotente**: `SELECT ... FOR UPDATE` na `promotion`
  + re-check do limite na mesma transação (mesmo padrão do débito de estoque em `stock_movement`).
  O contador nunca pode ultrapassar `max_redemptions` sob disparo concorrente.
- Persistir o cupom aplicado no pedido: `order.coupon_id` (FK → `promotion.id`, `set null`) +
  o valor abatido em `order.discount_amount`.
- Qualquer write automático: `actor_type='system'`, sem `actor_id` (CHECK `actor_coherence`).

A promoção **automática** (`type='promotion'`) **não** passa por aqui — já é aplicada no preço de
listagem por `packages/db/src/queries/catalog.ts`, que escolhe o **maior desconto efetivo** entre
a promoção global (`applies_to_all`) e a específica. Cupom e promoção automática nunca somam: o
catálogo decide a vitrine; o cupom decide o checkout.

---

## Aplicação de desconto (promoções)

O admin não valida `discountValue` (R$ fixo) contra o preço da ferramenta — um
desconto fixo pode exceder o preço. O **ecommerce** deve clampar o preço final
em `max(0, preço - desconto)` ao aplicar promoções/cupons, nunca permitindo
preço negativo. Desconto percentual já é limitado a 100% no admin.

---

## Render do hero (`banner`) — composition v1

O dashboard é a fonte de verdade da **composição** do banner (posição/forma de cada elemento); o
storefront (`hero-carousel.tsx`) renderiza. Desde a spec 2026-07-29 ("Banner Builder por
elemento"), a fonte de verdade **deixou de ser** o enum `layout` + `product_scale`/`cta_scale` e
passou a ser a coluna nova **`composition`** (jsonb, nullable). O preview do dashboard (canvas do
editor + card da listagem) espelha 1:1 o que o storefront deve produzir via o mesmo componente de
referência — divergência entre os dois é bug. **Status da migração:** o dashboard já escreve
`composition` em todo save; o storefront ainda não lê essa coluna — migração rastreada em
[emach-ecommerce#210](https://github.com/othavi0/emach-ecommerce/issues/210) (ver "Transição"
abaixo).

Conteúdo (textos, link, URLs de imagem, `ctaVariant`, `specs`, `countdownTarget`,
`backgroundMobileMode`/`backgroundImageMobileUrl`) continua nas colunas atuais — a `composition`
guarda só **forma/posição**. Nenhuma coluna existente foi removida.

### Shape

```ts
type Anchor9 = "tl" | "tc" | "tr" | "ml" | "mc" | "mr" | "bl" | "bc" | "br";
type ElementKey = "badge" | "title" | "subtitle" | "specs" | "countdown" | "product" | "cta";

type ElementPlacement = {
  anchor: Anchor9;
  offsetX: number;   // -20..20 (% do container, a partir do ponto-base da âncora)
  offsetY: number;   // -20..20
  scale: number;      // inteiro; ver faixa por elemento abaixo
  maxWidth?: number;  // só badge/title/subtitle/specs/countdown: 12..80 (ch)
};

type BackgroundConfig = {
  zoom: number;   // 100..200 (%)
  focal: Anchor9; // ponto focal do corte (object-position)
};

type MobileOverride =
  | { hidden: true }   // esconde só no mobile
  | ElementPlacement;  // destacado da pilha, posição livre no 9:16

type BannerComposition = {
  version: 1;
  desktop: {
    background: BackgroundConfig;                              // imagem em si vem das colunas atuais
    elements: Partial<Record<ElementKey, ElementPlacement>>;    // ausente = elemento desligado
  };
  mobile: {
    background?: BackgroundConfig;                              // ausente = mesmo zoom/focal do desktop
    elements: Partial<Record<ElementKey, MobileOverride>>;      // ausente = herda a pilha segura
  };
};
```

Faixa de `scale` por elemento (`SCALE_BOUNDS`, inteiro):

| Elemento | `scale` |
| --- | --- |
| `badge`, `title`, `subtitle`, `specs`, `countdown` | 60–160 |
| `product` | 50–160 |
| `cta` | 80–140 |

`maxWidth` (12–80, em `ch`) só existe nos 5 elementos de texto (`badge`/`title`/`subtitle`/
`specs`/`countdown`); `product` e `cta` não têm.

**Elemento ligado** = presente em `desktop.elements`. Elemento sem entry não renderiza mesmo com
conteúdo preenchido na coluna (ex.: título com texto mas sem entry em `desktop.elements.title` =
oculto). **`composition = null`** = banner ainda não migrado (pré-backfill) — nesse caso o
storefront deve cair no caminho legado (`layout`/`productScale`/`ctaScale`), nunca quebrar.

### Semântica de âncora, offset e escala

Cada `Anchor9` é uma grade 3×3 (`t/m/b` linha × `l/c/r` coluna). O **ponto-base** da âncora (antes
do offset) é uma posição fixa em % do container:

- Coluna (`charAt(1)`): `l` → `5%`, `c` → `50%`, `r` → `95%`.
- Linha (`charAt(0)`): `t` → `5%`, `m` → `50%`, `b` → `88%` no desktop / `84%` no mobile (a linha
  inferior recua mais no mobile pra reservar espaço aos indicadores do carrossel).

A posição final do elemento é `left = base.x + offsetX`, `top = base.y + offsetY` (ambos em %). O
elemento é então traduzido pra ancorar o **ponto de referência** (não o canto top-left da box) no
ponto calculado — equivalente a `transform-origin` + `translate` no CSS:

```
translateX: l → 0%, c → -50%, r → -100%
translateY: t → 0%, m → -50%, b → -100%
transformOrigin: mesma tabela em %, aplicada nos dois eixos (0%/50%/100%)
transform: translate(tx, ty) scale(scale / 100)
```

`offsetX`/`offsetY` são validados pelo zod só na faixa `-20..20`; o **clamp de área segura**
(abaixo) é responsabilidade do editor do dashboard — a `composition` que chega ao storefront já
sai clampada, o renderer de referência não reclama.

Se `maxWidth` estiver presente, aplica `max-width: <valor>ch` no elemento.

### Área segura (clamp, aplicado no editor)

Nenhum elemento é posicionado com sua bounding box fora de: margem lateral `2%`, topo `2%`, base
`10%` no desktop / `16%` no mobile (faixa reservada aos indicadores do carrossel + botão de pause
da loja).

### Fundo (zoom + ponto focal)

`background.zoom` (100–200%) e `background.focal` (`Anchor9`) controlam o recorte da imagem:

```
transform: scale(zoom / 100)
transformOrigin: focal mapeado pra % (mesma tabela 0%/50%/100% da âncora, nos dois eixos)
object-position (no <img object-fit: cover>): mesmo valor de transformOrigin
```

**Modos mobile do fundo** (`background_mobile_mode`, enum `banner_background_mobile_mode`:
`inherit` | `custom` | `none` — coluna própria, **fora** da `composition`) continuam sendo o
contrato de qual **imagem** usar no mobile; o storefront **deve** honrar:

- `inherit` — usar `background_image_url` (desktop) também no mobile.
- `custom` — usar `background_image_mobile_url`; se nulo, cair para o desktop.
- `none` — **não** exibir imagem de fundo no mobile (só o gradiente/fundo sólido da marca). Produto
  e demais slots continuam.

Banners criados antes da coluna recebem `inherit` (default); o backfill marcou `custom` os que já
tinham `background_image_mobile_url`, preservando o comportamento anterior (`mobileUrl ??
desktopUrl`). `composition.mobile.background` (zoom/focal) só existe quando há imagem própria no
mobile; ausente = herda o zoom/focal do desktop.

### Pilha segura mobile

Ordem fixa, sem reordenação (`SAFE_STACK_ORDER`): **badge → título → specs → descrição →
countdown → produto → CTA**.

Só elementos presentes em `desktop.elements` entram na partição mobile (chave ausente no desktop =
ausente no mobile também). Para cada um, o override em `mobile.elements[key]` decide:

- **Ausente** → entra na pilha segura (empilhado, ordem acima, a partir do terço inferior do
  banner 9:16 — texto alinhado à esquerda, produto centralizado, CTA full-width na base).
- **`{ hidden: true }`** → não renderiza no mobile.
- **`ElementPlacement`** → sai da pilha e posiciona absoluto no 9:16 (mesma semântica de
  âncora/offset/escala do desktop, mas com o `base.y` da linha inferior em `84%`).

### Gradiente de legibilidade (automático, não configurável)

Só renderiza quando há `title` **ou** `subtitle` preenchido (independente de estarem ligados na
composition). Direção derivada da coluna da âncora do título (fallback pra subtitle se título
ausente; `center` se nenhum dos dois):

| Coluna da âncora | Direção do gradiente |
| --- | --- |
| `l` (esquerda) | `to right` (escuro à esquerda, transparente à direita) |
| `r` (direita) | `to left` |
| `c` ou nenhum título/subtítulo com âncora | `to top` |

### Transição: dual-write (colunas legadas) — CONCLUÍDA (2026-07-30)

O storefront lê `composition` **em produção** desde o merge do ecommerce#212 (paridade visual
confirmada e registrada na ecommerce#210). O dual-write foi **removido** do dashboard na mesma
data: `createBanner`/`updateBanner` gravam só `composition`; **`layout`/`product_scale`/
`cta_scale` são deprecated** — mantidas no schema com o último valor gravado, sem escritor e sem
leitor primário (o único uso restante é o fallback de leitura `legacyToComposition` para
`composition` NULL/inválida, nos dois apps). Não reintroduzir escrita nessas colunas; remoção
física do schema fica pra um ciclo futuro (exige sync coordenado — ADR-0009).

### Duas armadilhas de render descobertas no smoke visual

1. **Elemento posicionado absoluto precisa de `width: max-content`.** Sem isso, um elemento
   ancorado perto da borda (ex.: CTA em `br`) sofre *shrink-to-fit* contra o espaço restante até a
   borda do container e quebra palavra a palavra, mesmo sem `maxWidth` definido. Aplicar
   `width: max-content` (Tailwind `w-max`) em todo elemento posicionado exceto `product`.
   `maxWidth` (quando presente) continua limitando pelo cap de caracteres do texto, não pelo espaço
   disponível.
2. **A box do produto precisa de dimensão explícita.** `next/image` com `fill` colapsa pra `0×0`
   sem uma caixa dimensionada por baixo (o wrapper de posicionamento só tem `left`/`top`/
   `transform`, sem `width`/`height` próprios). Baseline fixo por viewport (a `scale` do
   `transform` segue multiplicando por cima):
   - Desktop / mobile posicionado (override com `ElementPlacement`): `height: 60%; width: 38%`
     no desktop, `height: 32%; width: 70%` no mobile.
   - Mobile na pilha segura (sem override): a pilha já tem box própria (`height: 38%; width: 82%`,
     centralizada) — não passa pelo caminho acima.

### Implementação de referência (dashboard)

`composition-renderer.tsx` é o componente puro `(banner, composition, viewport) → JSX` usado pelo
canvas do editor **e** pelo card da listagem — é a implementação de referência pro storefront:

- `apps/web/src/app/dashboard/site/banners/_components/composition/composition-schema.ts` — zod,
  types, `SCALE_BOUNDS`, `SAFE_AREA`, `SAFE_STACK_ORDER`, `anchorBasePosition`,
  `partitionMobileElements`, `clampOffsets`.
- `.../composition/placement-css.ts` — `placementToStyle`, `backgroundToStyle`,
  `focalToObjectPosition`, `textSide`, `GRADIENT_CLASS`.
- `.../composition/composition-renderer.tsx` — montagem do banner completo (fundo, gradiente,
  elementos desktop, partição mobile).
- `.../composition/element-renders.tsx` — markup de cada elemento (`renderElement`).
- `.../composition/safe-stack.tsx` — render da pilha segura mobile.
- `.../composition/derive-legacy.ts` — `legacyToComposition` (fallback de leitura + mapa do
  backfill histórico); `deriveLegacyLayout` foi removida junto com o dual-write.

---

## Regra de sincronização do schema TS

As tabelas compartilhadas têm **cópia idêntica** do schema Drizzle (`packages/db/src/schema/`) no repositório do e-commerce. A sincronização é **automatizada por CI** — o workflow `sync-db-schema.yml` espelha `packages/db/src/{schema,queries,sql/triggers.sql}` para o repo `emach-ecommerce` via Pull Request automático sempre que esses arquivos mudam na `main`. Direção unidirecional: dashboard → ecommerce. Ver ADR-0009.

Quando qualquer arquivo em `packages/db/src/schema/` for alterado:

1. Editar o schema no dashboard e fazer merge na `main` — o workflow dispara sozinho e abre um PR no `emach-ecommerce`.
2. Revisar e mergear o PR de sync no e-commerce; o CI dele roda no PR e pega quebra de código local contra o schema novo.
3. Aplicar o schema em **ambos** os lados (o banco é o mesmo, mas cada repo precisa estar em sync com seu schema em memória). **O comando difere por repositório:**
   - **Dashboard:** `bun db:sync` (= `drizzle-kit push` + `db:apply-sql`, que roda `triggers.sql` + `rls.sql`).
   - **Ecommerce:** `bun db:push` + `bun --cwd packages/db db:apply-triggers` — **não há `db:sync` lá** (índices são partial-unique declarados no schema TS, sem `_indexes.sql`). Rodar após mergear o PR de sync. (O `rls.sql` sincronizado é deny-all idempotente e o RLS já está no banco compartilhado; aplicá-lo pelo ecommerce é opcional — follow-up de simetria lá.)
4. Para drops ou renames de colunas: coordenar o deploy — um app pode gravar em coluna que o outro ainda não viu ou já não vê.

A fonte de verdade é sempre o dashboard (este repositório). O e-commerce **nunca altera o schema** de forma unilateral — mudanças começam aqui e propagam. Ver ADR-0006 e ADR-0009.

---

## Seção de promoção em destaque (home)

O storefront renderiza a promoção `featured` da home com regras de layout que
dependem da quantidade de produtos vinculados:

- **Mínimo de 2 produtos** — com menos de 2 produtos específicos, a seção **não
  renderiza**.
- **Teto de 4 produtos** — a home exibe os 4 mais recentes (`created_at`); os
  demais só em "Ver todas as ofertas".

O dashboard espelha esses números em
`apps/web/src/app/dashboard/promotions/_lib/featured-home.ts`
(`HOME_MIN_PRODUCTS = 2`, `HOME_MAX_PRODUCTS = 4`) para validar/avisar no form e
na listagem. **Alterar o layout no storefront exige atualizar essas constantes
no dashboard junto** (sincronia manual — não há import cross-repo).
