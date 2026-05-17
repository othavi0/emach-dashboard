# CONTEXT.md — Emach Dashboard

Glossário de domínio do monorepo: a **linguagem ubíqua** que código, schema, UI, issues e planos devem usar de forma consistente.

Não é guia de stack — comandos, convenções e anti-patterns vivem em `CLAUDE.md`. Aqui ficam os **conceitos** e como nomeá-los.

> Ao produzir output (título de issue, proposta de refactor, hipótese de bug, nome de teste), use os termos **exatamente** como definidos aqui. Se um conceito necessário não está no glossário, é sinal de gap — registre via `/grill-with-docs` em vez de inventar sinônimo.

---

## O domínio

A Emach é uma distribuidora brasileira de **ferramentas e equipamentos industriais**. Este repositório é o **dashboard administrativo interno**: o staff gerencia catálogo, estoque multi-filial, pedidos, clientes, promoções e moderação de avaliações.

Um **site e-commerce** separado (outro repositório) vende para o cliente final e **compartilha o mesmo banco Postgres**. Admin e site nunca se chamam diretamente — a coordenação acontece só pelo schema compartilhado. Contrato em `docs/integration/admin-ecommerce.md`.

---

## Bounded contexts

| Contexto            | Cobre                                          | Tabelas núcleo                                                  |
| ------------------- | ---------------------------------------------- | --------------------------------------------------------------- |
| Identity & Access   | Autenticação dual e autorização                | `user`, `session`, `client`, `clientSession`                    |
| Catalog             | O que se vende e como se descreve              | `tool`, `toolVariant`, `toolImage`, `category`, `attributeDefinition`, `supplier` |
| Inventory           | Quanto existe e onde                           | `branch`, `stockLevel`, `stockMovement`, `userBranch`           |
| Sales               | Pedidos e seu ciclo de vida                    | `order`, `orderItem`, `orderStatusHistory`, `orderNote`         |
| Marketing           | Descontos                                      | `promotion`, `promotionTool`                                    |
| Voice of customer   | Avaliações de produto                          | `review`                                                        |
| Compliance (LGPD)   | Consentimento e auditoria de dados pessoais    | `consentLog`, `clientAuditLog`, `clientExportLog`               |

---

## Glossário

### Pessoas e acesso

- **User (Staff / Usuário interno)** — funcionário da Emach com acesso ao dashboard. Tabela `user`. Tem `role` e `status`. Em código, `User` significa **sempre** staff — nunca cliente final.
- **Client (Cliente)** — comprador final brasileiro, dono dos pedidos. Tabela `client`. Identificado por `document` (CPF/CNPJ normalizado, só dígitos). Autentica pela instância **ecommerce** do Better Auth; o dashboard apenas **lê** dados de Client, nunca cria sessão de Client.
- **Client type (B2C / B2B)** — `clientType`: rótulo de **segmentação** do Client (pessoa física × jurídica), apenas para filtro e relatório. Não dirige preço, regra fiscal nem fluxo — não há precificação por tipo. Nullable porque o cadastro nem sempre o captura.
- **Role** — papel hierárquico do staff: `super_admin` > `admin` > `manager` > `user`. Agrega um conjunto de Capabilities. `client` **não** tem role.
- **Capability** — permissão granular (`tools.create`, `orders.refund`, `reviews.moderate`, …). É a unidade real de autorização; `role` só mapeia para um conjunto de Capabilities. Server actions sensíveis começam com `requireCapability(cap)`.
- **Branch-scoping** — restrição de uma ação às filiais do staff. `userBranch` liga staff↔filial; `requireCapabilityWithContext` valida que o alvo está no escopo. `super_admin` ignora o escopo.
- **Actor** — quem causou uma mutação auditável: `user` (um membro do staff) ou `system` (automação sem usuário humano — inclui as escritas do app e-commerce, como o débito de estoque por venda). Enum `actor_type`.
- **User status** — `pending` (recém-criado, precisa aprovação) → `active` → `suspended`.

### Catálogo

- **Tool** — qualquer item vendável do catálogo. **Termo de arte**: cobre ferramenta, equipamento e acessório indistintamente — não é só "ferramenta" no sentido literal. É o registro "pai", que **não** carrega SKU, preço nem voltagem (isso vive na Tool Variant). No site e-commerce aparece como "produto"; no domínio do admin o termo canônico é **Tool**. A distinção ferramenta/equipamento, quando importa para navegação, é modelada como Category — não como tipo de Tool.
- **Tool Variant (Variante)** — variação concreta vendável de uma Tool (ex.: 127V vs 220V). Tabela `toolVariant`. **Carrega SKU, preço, custo e voltagem.** Toda Tool tem **≥1 variante**; exatamente uma é a Default Variant.
- **Default Variant** — a variante exibida quando nenhuma é escolhida. Uma por Tool (`isDefault=true`, partial unique index).
- **Tool status** — ciclo de vida **editorial** do catálogo: `draft` (em cadastro) | `active` (publicável) | `discontinued` (saiu de linha) | `out_of_stock`. `out_of_stock` é um **rótulo manual** posto pelo staff — não é derivado do Stock Level real; uma Tool pode estar `active` com zero estoque ou `out_of_stock` com estoque.
- **Visible on site** — chave manual de vitrine (`visibleOnSite`), independente do Tool status. Uma Tool aparece no site e-commerce quando `status='active'` **e** `visibleOnSite=true` — as duas condições juntas.
- **Supplier (Fornecedor)** — de quem a Emach compra a Tool.
- **Category (Categoria)** — nó da árvore de classificação do catálogo. `parentId` + `path`/`depth` materializados por trigger PL/pgSQL (anti-ciclo, profundidade máxima 5). Uma Tool pertence a N categorias via `toolCategory`; exatamente uma é a Primary Category. Regra de domínio: **toda Tool deve ter ≥1 Category real** (uma primary), garantida na validação Zod do form de Tool.
- **Primary Category** — a categoria principal de uma Tool (`isPrimary=true`); determina quais atributos dinâmicos a Tool exibe.
- **Attribute Definition** — definição de uma especificação técnica dinâmica (ex.: "Rotação", "Cor"). Tabela `attributeDefinition`. Tem `inputType` (`text`/`number`/`select`/`boolean`/`numeric_range`/`color`), `unit`, `options`. Pertence **obrigatoriamente** a uma Category — não existe atributo global.
- **Attribute Value** — valor de um atributo para uma Tool específica. `toolAttributeValue`, valor tipado por coluna (`valueText`/`valueNumeric`/`valueNumericMax`/`valueBool`).
- **Attribute Assignment** — quais atributos uma Tool exibe e em que ordem. `toolAttributeAssignment`.
- **Attribute inheritance** — uma Tool herda os Attribute Definitions de todas as categorias no `path` da sua Primary Category. Trocar a Primary Category pode deixar Attribute Values **órfãos** (definição fora do novo path) — `updateTool` detecta e devolve `warning: "orphan_attributes"` antes de deletar.

### Estoque

- **Branch (Filial)** — local físico que mantém estoque. Uma é a default.
- **Stock Level** — quantidade de uma **Tool Variant** em uma **Branch**. PK `(variantId, branchId)`. Tem `minQty` e `reorderPoint`; CHECK `quantity >= 0` é o guard anti-oversell.
- **Stock Movement (Movimento de estoque)** — registro imutável de toda alteração de Stock Level. `reason` ∈ `entrada_compra` | `saida_venda` | `ajuste_inventario` | `perda` | `outro`. Trilha de auditoria por variante; `delta != 0`.
- **Stock Adjustment (Ajuste de estoque)** — a única escrita de estoque que o admin faz diretamente: o staff informa a **quantidade-alvo** (não um delta) e o sistema calcula o `delta`, gerando um Stock Movement com Actor `user`. O débito de venda (`saida_venda`) não é um Adjustment — acontece no e-commerce.
- **Reorder Point** — nível em que uma variante deve ser recomprada (`reorderPoint >= minQty`).

### Vendas

- **Order (Pedido)** — compra feita por um Client. **Nasce sempre no site e-commerce** — o admin nunca cria um Order, apenas progride seu ciclo de vida (status, rastreio, notas, filial de fulfillment). Tem `number` único e legível, snapshots de valores e endereço de entrega. Ver ADR-0001.
- **Order status** — **eixo único** de estado do Order, do pagamento à entrega: `pending_payment` → `payment_failed` / `paid` → `preparing` → `shipped` → `delivered` → `returned` → `refunded`; terminais `canceled` (encerrado sem pagamento) e `refunded` (encerrado com estorno). `canceled` só é alcançável de estados não pagos; encerrar um pedido pago é sempre `refunded`. Não há campo `paymentStatus`. O e-commerce dirige o Order até `paid`; o admin assume daí em diante. Ver ADR-0005.
- **Order Item** — linha do pedido. Referencia `toolId` **e** `variantId`, mais **snapshots** fiscais e de dimensão (`ncm`, `cest`, `weightKg`, …) congelados no momento da compra — imunes a mudanças posteriores na Tool.
- **Order Status History / Order Note** — trilha de transições de status e anotações internas do staff sobre o pedido.

### Marketing

- **Promotion (Promoção)** — desconto percentual aplicado a um conjunto de Tools (`promotionTool`). `type='promotion'`. **Descontos nunca empilham**: quando mais de uma Promotion ou Promocode cobre a mesma Tool, vale apenas o de maior percentual — no máximo um desconto por Tool. Ver ADR-0002.
- **Promocode (Cupom)** — uma Promotion com `type='promocode'` e `code` preenchido. **Não existe tabela `coupon`** — cupom é uma variação de Promotion.

### Voz do cliente

- **Review (Avaliação)** — nota de 1 a 5 + texto de um Client sobre uma Tool. **Toda Review nasce de uma compra verificada** — só a cria quem tem um Order pago, com a Tool nele, dentro da janela de dias após o pagamento (`canCreateReview` é o único caminho). Moderada pelo staff: `status` `pending` → `approved` / `rejected` / `spam`. Única por `(clientId, toolId, orderId)`.

### Compliance / LGPD

- **Consent (Consentimento)** — registro LGPD de aceite ou revogação de `tos` / `privacy` / `marketing_email` / `cookies` por um Client. Tabela `consentLog`, versionado (`version`).
- **Client Audit Log** — trilha de toda mutação de dados de Client feita pelo staff (`profile_updated`, `status_changed`, `exported`, …).
- **Client Export** — exportação CSV/LGPD de clientes; cada export é registrado em `clientExportLog` (filtros, contagem, bytes, truncamento).
- **Right to be forgotten** — anonimização de um Client via `bun --cwd packages/db db:anonymize-client <id>`.

---

## Invariantes de domínio

1. **A auth dual é isolada.** Staff (`User`) e Client autenticam por instâncias Better Auth separadas. O dashboard lê dados de Client, mas nunca cria sessão de Client. `DashboardSession` ≠ `EcommerceSession`.
2. **A variante é a unidade de venda e de estoque.** SKU, preço, voltagem, Stock Level, Stock Movement e Order Item referenciam a **Tool Variant** — nunca a Tool. Toda Tool tem ≥1 variante, uma default.
3. **Todo atributo dinâmico pertence a uma categoria.** Não existe Attribute Definition global.
4. **Toda mutação auditável tem um Actor.** É um membro do staff (`user`) ou automação (`system`) — ver Actor no glossário.
5. **O Order tem um eixo único de status.** Pagamento e fulfillment vivem no mesmo campo `status` — não há `paymentStatus`. Refund e return são sempre do pedido inteiro. Ver ADR-0005.
6. **A coordenação com o e-commerce é só pelo schema.** Admin não chama o site; o site não chama o admin.

---

## Termos preferidos / a evitar

| Use                       | Não use                                  | Por quê                                                              |
| ------------------------- | ----------------------------------------- | -------------------------------------------------------------------- |
| **Tool** / Ferramenta     | "Product" / "Produto" (no domínio do admin) | O site usa "produto"; o admin usa Tool. Não misturar os dois lados.  |
| **Tool Variant** / Variante | "SKU" como sinônimo de variante         | SKU é um *campo* da variante, não a variante.                        |
| **Client** / Cliente      | "User" / "Usuário"                        | User é staff. Conflar os dois é bug P0.                              |
| **User** / Staff          | "Cliente"                                 | Idem — papéis e tabelas disjuntos.                                   |
| **Capability**            | "Permission" genérico                     | O termo do código é Capability; Role apenas agrega Capabilities.     |
| **Branch** / Filial       | "Loja" / "Store" / "Warehouse"            | O termo canônico é Branch / Filial.                                  |
| **Promocode** / Cupom     | "Coupon" como entidade separada           | É uma Promotion com `type='promocode'`, não uma tabela própria.      |

---

## Ambiguidades resolvidas

- **Review sem Order** — resolvido (issue #36): `review.order_id` é NOT NULL e a coluna `verified_purchase` foi removida. `canCreateReview` é o único caminho de criação; a feature de avaliação editorial (review sem pedido) foi eliminada.
- **`out_of_stock` × estoque real** — `Tool.status` tem o valor `out_of_stock`, mas estoque é calculado por variante × filial. Resolvido: `out_of_stock` é um rótulo manual e intencional, desacoplado do Stock Level — não é um status derivado.
- **Lead** — o schema de `consent_log` antecipa um ator `lead` (enum `consent_actor`, coluna `leadId`). Resolvido: Lead não é um conceito do domínio — todo contato é um Client registrado. Esses artefatos de schema são código morto a remover. Ver ADR-0003.
- **Catch-all de categoria** — historicamente existiam duas categorias-raiz catch-all vazias (`sem-categoria` no seed, `geral` resquício de migration). Issue #39 confirmou **0 attribute definitions e 0 tools** sob elas. Issue #41 removeu ambas do seed e do banco: toda Tool tem uma Category real, sem fallback.
- **`paymentStatus`** — `order` tem dois campos de estado (`status` e `paymentStatus`) com `paid`/`refunded` sobrepostos. Resolvido: o Order passa a ter um eixo único `status`; o campo `paymentStatus` e seu enum são removidos. Ver ADR-0005.

## ADRs

Decisões arquiteturais ficam em `docs/adr/`:

- **ADR-0001** — Orders são criados apenas pelo site e-commerce.
- **ADR-0002** — Descontos de Promotion nunca empilham.
- **ADR-0003** — Lead não é um conceito do domínio.
- **ADR-0004** — Integração com o e-commerce é só DB compartilhada (sem API).
- **ADR-0005** — Order tem um eixo único de status.

Se um output contradiz um ADR existente, sinalize explicitamente em vez de sobrescrever em silêncio.
