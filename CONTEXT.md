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
| Identity & Access   | Autenticação dual e autorização                | `user`, `session`, `client`, `clientSession`, `apiKey`          |
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
- **Client (Cliente)** — comprador final brasileiro, dono dos pedidos. Tabela `client`. É `b2c` ou `b2b` (`clientType`). Identificado por `document` (CPF/CNPJ normalizado, só dígitos). Autentica pela instância **ecommerce** do Better Auth; o dashboard apenas **lê** dados de Client, nunca cria sessão de Client.
- **Role** — papel hierárquico do staff: `super_admin` > `admin` > `manager` > `user`. Agrega um conjunto de Capabilities. `client` **não** tem role.
- **Capability** — permissão granular (`tools.create`, `orders.refund`, `reviews.moderate`, …). É a unidade real de autorização; `role` só mapeia para um conjunto de Capabilities. Server actions sensíveis começam com `requireCapability(cap)`.
- **Branch-scoping** — restrição de uma ação às filiais do staff. `userBranch` liga staff↔filial; `requireCapabilityWithContext` valida que o alvo está no escopo. `super_admin` ignora o escopo.
- **Actor** — quem causou uma mutação auditável: `user`, `apiKey` ou `system` (enum `actor_type`). Tabelas de auditoria têm CHECK de coerência: exatamente um id preenchido conforme o tipo.
- **User status** — `pending` (recém-criado, precisa aprovação) → `active` → `suspended`.
- **API Key** — credencial de máquina para o e-commerce e integrações acessarem a API. Escopo por `scopes` + `allowedTags`. Pertence a um `user`.

### Catálogo

- **Tool (Ferramenta)** — o produto vendável: uma ferramenta ou equipamento industrial. Tabela `tool`. É o registro "pai" — **não** carrega SKU, preço nem voltagem. No site e-commerce aparece como "produto"; no domínio do admin o termo canônico é **Tool**.
- **Tool Variant (Variante)** — variação concreta vendável de uma Tool (ex.: 127V vs 220V). Tabela `toolVariant`. **Carrega SKU, preço, custo e voltagem.** Toda Tool tem **≥1 variante**; exatamente uma é a Default Variant.
- **Default Variant** — a variante exibida quando nenhuma é escolhida. Uma por Tool (`isDefault=true`, partial unique index).
- **Tool status** — `draft` | `active` | `discontinued` | `out_of_stock`.
- **Supplier (Fornecedor)** — de quem a Emach compra a Tool.
- **Category (Categoria)** — nó da árvore de classificação do catálogo. `parentId` + `path`/`depth` materializados por trigger PL/pgSQL (anti-ciclo, profundidade máxima 5). Uma Tool pertence a N categorias via `toolCategory`; exatamente uma é a Primary Category.
- **Primary Category** — a categoria principal de uma Tool (`isPrimary=true`); determina quais atributos dinâmicos a Tool exibe.
- **Attribute Definition** — definição de uma especificação técnica dinâmica (ex.: "Rotação", "Cor"). Tabela `attributeDefinition`. Tem `inputType` (`text`/`number`/`select`/`boolean`/`numeric_range`/`color`), `unit`, `options`. Pertence **obrigatoriamente** a uma Category — não existe atributo global (os antigos globais migraram para a categoria-raiz "Geral").
- **Attribute Value** — valor de um atributo para uma Tool específica. `toolAttributeValue`, valor tipado por coluna (`valueText`/`valueNumeric`/`valueNumericMax`/`valueBool`).
- **Attribute Assignment** — quais atributos uma Tool exibe e em que ordem. `toolAttributeAssignment`.
- **Attribute inheritance** — uma Tool herda os Attribute Definitions de todas as categorias no `path` da sua Primary Category. Trocar a Primary Category pode deixar Attribute Values **órfãos** (definição fora do novo path) — `updateTool` detecta e devolve `warning: "orphan_attributes"` antes de deletar.

### Estoque

- **Branch (Filial)** — local físico que mantém estoque. Uma é a default.
- **Stock Level** — quantidade de uma **Tool Variant** em uma **Branch**. PK `(variantId, branchId)`. Tem `minQty` e `reorderPoint`; CHECK `quantity >= 0` é o guard anti-oversell.
- **Stock Movement (Movimento de estoque)** — registro imutável de toda alteração de Stock Level. `reason` ∈ `entrada_compra` | `saida_venda` | `ajuste_inventario` | `perda` | `outro`. Trilha de auditoria por variante; `delta != 0`; índice parcial garante idempotência do débito de venda.
- **Reorder Point** — nível em que uma variante deve ser recomprada (`reorderPoint >= minQty`).

### Vendas

- **Order (Pedido)** — compra feita por um Client. `number` único e legível. Carrega snapshots de valores (`subtotalAmount`/`discountAmount`/`shippingAmount`/`totalAmount`) e `shippingAddress` (jsonb).
- **Order status** — ciclo **logístico**: `pending_payment` → `paid` → `preparing` → `shipped` → `delivered`; ramos `canceled` / `refunded`.
- **Payment status** — ciclo **financeiro**: `pending` → `authorized` → `paid`; ramos `failed` / `refunded`. Evolui **independente** do Order status.
- **Order Item** — linha do pedido. Referencia `toolId` **e** `variantId`, mais **snapshots** fiscais e de dimensão (`ncm`, `cest`, `weightKg`, …) congelados no momento da compra — imunes a mudanças posteriores na Tool.
- **Order Status History / Order Note** — trilha de transições de status e anotações internas do staff sobre o pedido.

### Marketing

- **Promotion (Promoção)** — desconto percentual aplicado a um conjunto de Tools (`promotionTool`). `type='promotion'`.
- **Promocode (Cupom)** — uma Promotion com `type='promocode'` e `code` preenchido. **Não existe tabela `coupon`** — cupom é uma variação de Promotion.

### Voz do cliente

- **Review (Avaliação)** — nota de 1 a 5 + texto de um Client sobre uma Tool. Moderada pelo staff: `status` `pending` → `approved` / `rejected` / `spam`. `verifiedPurchase` quando vinculada a um Order. Única por `(clientId, toolId, orderId)`.

### Compliance / LGPD

- **Consent (Consentimento)** — registro LGPD de aceite ou revogação de `tos` / `privacy` / `marketing_email` / `cookies`. Tabela `consentLog`, por `client` ou `lead`. Versionado (`version`).
- **Lead** — contato pré-cadastro. Ainda sem tabela própria; `consentLog.leadId` é coluna sem FK até a Fase C.
- **Client Audit Log** — trilha de toda mutação de dados de Client feita pelo staff (`profile_updated`, `status_changed`, `exported`, …).
- **Client Export** — exportação CSV/LGPD de clientes; cada export é registrado em `clientExportLog` (filtros, contagem, bytes, truncamento).
- **Right to be forgotten** — anonimização de um Client via `bun --cwd packages/db db:anonymize-client <id>`.

---

## Invariantes de domínio

1. **A auth dual é isolada.** Staff (`User`) e Client autenticam por instâncias Better Auth separadas. O dashboard lê dados de Client, mas nunca cria sessão de Client. `DashboardSession` ≠ `EcommerceSession`.
2. **A variante é a unidade de venda e de estoque.** SKU, preço, voltagem, Stock Level, Stock Movement e Order Item referenciam a **Tool Variant** — nunca a Tool. Toda Tool tem ≥1 variante, uma default.
3. **Todo atributo dinâmico pertence a uma categoria.** Não existe Attribute Definition global.
4. **Toda mutação auditável tem um Actor coerente.** Exatamente um id preenchido conforme `actorType` (`user` / `apiKey` / `system`).
5. **Order status e Payment status são independentes.** Logística e financeiro evoluem em ciclos próprios.
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

## ADRs

`docs/adr/` ainda não existe. Decisões arquiteturais serão registradas lá conforme forem tomadas ou resolvidas (via `/grill-with-docs`). Se um output contradiz um ADR existente, sinalize explicitamente em vez de sobrescrever em silêncio.
