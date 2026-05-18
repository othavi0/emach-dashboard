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
| `tool`                | Dashboard        | Ambos       | Produto-pai. E-commerce lê para exibir catálogo.                                                 |
| `tool_variant`        | Dashboard        | Ambos       | Variante vendável (SKU, preço, voltagem). E-commerce lê para carrinho e checkout.                |
| `tool_image`          | Dashboard        | Ambos       | Imagens do produto. E-commerce exibe na vitrine.                                                 |
| `attribute_definition`| Dashboard        | Ambos       | Specs técnicas dinâmicas. E-commerce lê para exibir ficha técnica.                              |
| `tool_attribute_value`| Dashboard        | Ambos       | Valores de atributo por tool. E-commerce exibe na ficha técnica.                                 |
| `tool_attribute_assignment` | Dashboard  | Ambos       | Ordem de exibição de atributos por tool.                                                         |
| `branch`              | Dashboard        | Ambos       | Filiais. E-commerce pode exibir disponibilidade por filial.                                      |
| `stock_level`         | Dashboard        | Ambos       | Quantidade por variante × filial. E-commerce lê para exibir disponibilidade.                     |
| `stock_movement`      | Shared           | Dashboard   | Dashboard escreve ajustes manuais (actor `user`). E-commerce escreve débitos de venda (`saida_venda`, actor `system`) na transição para `paid`. |
| `user_branch`         | Dashboard        | Dashboard   | Escopo de staff × filial. E-commerce não usa.                                                    |
| `promotion`           | Dashboard        | Ambos       | Promoções e cupons. E-commerce aplica desconto no checkout.                                      |
| `promotion_tool`      | Dashboard        | Ambos       | Vínculo promoção ↔ tool. E-commerce lê para calcular preço final.                               |
| `order`               | Shared           | Ambos       | Pedido. **E-commerce:** cria a linha e conduz o status até `paid` (campos de checkout, `paymentMethod`, `paymentProviderRef`, campos Asaas/NF-e, `notes`). **Admin:** assume de `paid` em diante — status, carimbos de tempo (`preparingAt`, `shippedAt`, `deliveredAt`, `canceledAt`, `returnedAt`, `refundedAt`), `branchId`, `shippingTrackingCode`. |
| `order_item`          | E-commerce       | Ambos       | Itens do pedido. Criados pelo e-commerce no checkout; dashboard lê para exibir e processar.      |
| `order_status_history`| Shared           | Dashboard   | E-commerce registra transições até `paid`; dashboard registra de `paid` em diante.               |
| `order_note`          | Dashboard        | Dashboard   | Notas internas do staff. O e-commerce nunca lê nem escreve.                                      |
| `order_attachment`    | Dashboard        | Dashboard   | Anexos internos (documentos de despacho, etc.). O e-commerce nunca lê nem escreve.               |
| `review`              | E-commerce       | Ambos       | Avaliação criada pelo cliente. Dashboard lê para moderação; nunca cria review.                   |
| `consent_log`         | E-commerce       | Dashboard   | Consentimentos LGPD do cliente. Dashboard lê para auditoria de compliance.                       |
| `client_audit_log`    | Dashboard        | Dashboard   | Mutações de dados de cliente feitas pelo staff. E-commerce não toca.                             |
| `client_export_log`   | Dashboard        | Dashboard   | Registro de exports CSV/LGPD. E-commerce não toca.                                               |

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
| `discount_amount`      | `numeric(12,2)` em BRL                                           | Sim         | Desconto total aplicado (default `0`).                                                                |
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

## Regra de sincronização do schema TS

As tabelas compartilhadas têm **cópia idêntica** do schema Drizzle (`packages/db/src/schema/`) no repositório do e-commerce. A sincronização é **automatizada por CI** — o workflow `sync-db-schema.yml` espelha `packages/db/src/{schema,queries,sql/triggers.sql}` para o repo `emach-ecommerce` via Pull Request automático sempre que esses arquivos mudam na `main`. Direção unidirecional: dashboard → ecommerce. Ver ADR-0009.

Quando qualquer arquivo em `packages/db/src/schema/` for alterado:

1. Editar o schema no dashboard e fazer merge na `main` — o workflow dispara sozinho e abre um PR no `emach-ecommerce`.
2. Revisar e mergear o PR de sync no e-commerce; o CI dele roda no PR e pega quebra de código local contra o schema novo.
3. Rodar `bun db:sync` em ambos os repositórios (o banco é o mesmo — mas os dois precisam estar em sync com o schema em memória).
4. Para drops ou renames de colunas: coordenar o deploy — um app pode gravar em coluna que o outro ainda não viu ou já não vê.

A fonte de verdade é sempre o dashboard (este repositório). O e-commerce **nunca altera o schema** de forma unilateral — mudanças começam aqui e propagam. Ver ADR-0006 e ADR-0009.
