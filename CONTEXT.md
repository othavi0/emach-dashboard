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
| Identity & Access   | Autenticação dual e autorização                | `user`, `session`, `client`, `clientSession`, `clientAddress`, `userActivityLog` |
| Catalog             | O que se vende e como se descreve              | `tool`, `toolVariant`, `toolImage`, `category`, `attributeDefinition`, `supplier`, `supplierAuditLog` |
| Inventory           | Quanto existe e onde                           | `branch`, `stockLevel`, `stockMovement`, `userBranch`           |
| Sales               | Pedidos e seu ciclo de vida                    | `order`, `orderItem`, `orderStatusHistory`, `orderNote`, `orderAttachment`, `orderEvent`, `refundRequest` |
| Marketing           | Descontos                                      | `promotion`, `promotionTool`                                    |
| Voice of customer   | Avaliações de produto                          | `review`                                                        |
| Compliance (LGPD)   | Consentimento e auditoria de dados pessoais    | `consentLog`, `clientAuditLog`, `clientExportLog`               |
| Configurações       | Settings operacionais da loja (frete)          | `storeSettings`                                                  |

---

## Glossário

### Pessoas e acesso

- **User (Staff / Usuário interno)** — funcionário da Emach com acesso ao dashboard. Tabela `user`. Tem `role` e `status`. Em código, `User` significa **sempre** staff — nunca cliente final.
- **Client (Cliente)** — comprador final brasileiro, dono dos pedidos. Tabela `client`. Identificado por `document` (CPF/CNPJ normalizado, só dígitos). Autentica pela instância **ecommerce** do Better Auth; o dashboard apenas **lê** dados de Client, nunca cria sessão de Client.
- **Client type (B2C / B2B)** — `clientType`: rótulo de **segmentação** do Client (pessoa física × jurídica), apenas para filtro e relatório. Não dirige preço, regra fiscal nem fluxo — não há precificação por tipo. **Derivado automaticamente** do `document` por trigger (`derive_client_type`: CPF → `b2c`, CNPJ → `b2b`); override manual é respeitado. `null` apenas quando `document` é nulo.
- **Client Address (Endereço do cliente)** — endereço cadastrado de um Client (tabela `client_address`), com um default por cliente. **Distinto** do `shipping_address` do Order (snapshot JSONB congelado no checkout).
- **Role** — papel hierárquico do staff: `super_admin` > `admin` > `user` (**3 níveis**). Agrega um conjunto de Capabilities. `client` **não** tem role. O enum Postgres tem 3 valores: `super_admin`/`admin`/`user`; o valor `manager` foi removido em 2026-06-16 (ADR-0016).
- **Capability** — permissão granular (`tools.create`, `orders.refund`, `reviews.moderate`, …). É a unidade real de autorização; `role` só mapeia para um conjunto de Capabilities. Server actions sensíveis começam com `requireCapability(cap)`.
- **Branch-scoping** — restrição do staff às suas filiais (`userBranch` liga staff↔filial), em **dois planos**: **visibilidade** (listagens de Pedidos e Stock Levels só mostram dados das filiais do staff) e **ação** (`requireCapabilityWithContext` valida que o alvo está no escopo). Só se aplica a contextos com filial — **Vendas e Inventory**; Catálogo, Clientes, Reviews e Store Settings são **globais** (governados só por Capability). Staff sem nenhuma filial vinculada vê/age sobre **nada** (fail-closed). `super_admin` ignora o escopo (vê tudo, inclusive Pedidos na triagem); `admin` enxerga adicionalmente os Pedidos na triagem; `user` só a própria filial.
- **Actor** — quem causou uma mutação auditável: `user` (um membro do staff) ou `system` (automação sem usuário humano — inclui as escritas do app e-commerce, como o débito de estoque por venda). Enum `actor_type`.
- **User status** — `pending` (convidado, aguardando aceite) → `active` → `suspended`. O acesso é **convite-only** (ADR-0013): admin convida, o user nasce `pending` com `inviteToken`, e vira `active` ao aceitar (definir nome + senha). Não há mais auto-cadastro.
- **User Activity Log** — trilha de atividade do staff no dashboard (tabela `user_activity_log`): `action`, `targetType`, `targetId`, `metadata`. Sobrevive ao delete do ator via snapshot do nome em `metadata` (ADR-0011). **Distinto** do Client Audit Log (que rastreia mutações de dados de Client).
- **Convite (Invitation)** — mecanismo de onboarding de staff. Um admin convida (email + cargo + filiais); cria-se o `user` em `pending` com `inviteToken`/`inviteTokenExpiresAt` (7 dias, single-use) na própria linha de `user` — **não há tabela `invite`**. **Cargo `admin`/`user` exige ≥1 filial no convite** (invariante "todo staff operacional pertence a ≥1 filial"); `super_admin` é convidado sem filial (escopo global). O aceite em `/convite?token=…` cria a credential, seta `active` e loga. Ver ADR-0013.

### Catálogo

- **Tool** — qualquer item vendável do catálogo. **Termo de arte**: cobre ferramenta, equipamento e acessório indistintamente — não é só "ferramenta" no sentido literal. É o registro "pai", que **não** carrega SKU, preço nem voltagem (isso vive na Tool Variant). No site e-commerce aparece como "produto"; no domínio do admin o termo canônico é **Tool**. A distinção ferramenta/equipamento, quando importa para navegação, é modelada como Category — não como tipo de Tool.
- **Tool Variant (Variante)** — variação concreta vendável de uma Tool (ex.: 127V vs 220V). Tabela `toolVariant`. **Carrega SKU, preço, custo e voltagem.** Toda Tool tem **≥1 variante**; exatamente uma é a Default Variant.
- **Default Variant** — a variante exibida quando nenhuma é escolhida. Uma por Tool (`isDefault=true`, partial unique index).
- **Tool status** — ciclo de vida **editorial** do catálogo: `draft` (em cadastro) | `active` (publicável) | `discontinued` (saiu de linha). Enum `tool_status`, garantido pelo CHECK `valid_tool_status`. **Não existe valor `out_of_stock`** — disponibilidade é sempre derivada do Stock Level (variante × filial), nunca um status editorial.
- **Visible on site** — chave manual de vitrine (`visibleOnSite`), independente do Tool status. Uma Tool aparece no site e-commerce quando `status='active'` **e** `visibleOnSite=true` — as duas condições juntas.
- **Supplier (Fornecedor)** — de quem a Emach compra. A relação Fornecedor↔Tool é **N:N derivada das entradas**: um Fornecedor "fornece" uma Tool quando existe ≥1 Stock Movement de `entrada_compra` ligando os dois — **não há coluna `tool.supplier_id` nem tabela de vínculo** (removida; ver Ambiguidades resolvidas e ADR-0015). Tem `status` (`active`/`archived`): arquivar é soft-delete que **preserva a proveniência** das entradas associadas. Mutações do cadastro trilhadas em `supplier_audit_log`. **O Fornecedor não tem nenhuma informação financeira** (custo de compra não é responsabilidade deste sistema — estoque é controle de quantidade e proveniência, não gestão financeira).
- **Category (Categoria)** — nó da árvore de classificação do catálogo. `parentId` + `path`/`depth` materializados por trigger PL/pgSQL (anti-ciclo, profundidade máxima 5). Uma Tool pertence a N categorias via `toolCategory`; exatamente uma é a Primary Category. Regra de domínio: **toda Tool deve ter ≥1 Category real** (uma primary), garantida na validação Zod do form de Tool.
- **Primary Category** — a categoria principal de uma Tool (`isPrimary=true`); determina quais atributos dinâmicos a Tool exibe.
- **Attribute Definition** — definição de uma especificação técnica dinâmica (ex.: "Rotação", "Cor"). Tabela `attributeDefinition`. Tem `inputType` (`text`/`number`/`select`/`boolean`/`numeric_range`/`color`), `unit`, `options`. Pertence **obrigatoriamente** a uma Category — não existe atributo global.
- **Attribute Value** — valor de um atributo para uma Tool específica. `toolAttributeValue`, valor tipado por coluna (`valueText`/`valueNumeric`/`valueNumericMax`/`valueBool`).
- **Attribute Assignment** — quais atributos uma Tool exibe e em que ordem. `toolAttributeAssignment`.
- **Attribute inheritance** — uma Tool herda os Attribute Definitions de todas as categorias no `path` da sua Primary Category. Trocar a Primary Category pode deixar Attribute Values **órfãos** (definição fora do novo path) — `updateTool` detecta e devolve `warning: "orphan_attributes"` antes de deletar.

### Estoque

- **Branch (Filial)** — local físico que mantém estoque. Tem `status` (`active`/`inactive`), responsável (`responsibleUserId`), faixas de CEP de atendimento (`cepRanges`) e horário de funcionamento (`businessHours`). Não há filial "default" no schema.
- **Stock Level** — quantidade de uma **Tool Variant** em uma **Branch**. PK `(variantId, branchId)`. Tem `minQty` e `reorderPoint`; CHECK `quantity >= 0` é o guard anti-oversell.
- **Stock Movement (Movimento de estoque)** — registro imutável de toda alteração de Stock Level. `reason` ∈ `entrada_compra` | `saida_venda` | `ajuste_inventario` | `perda` | `outro`. Trilha de auditoria por variante; `delta != 0`. Carrega `supplierId` **obrigatório quando `reason='entrada_compra'`** (a proveniência da compra) e **nulo nos demais motivos** — é a base da relação Fornecedor↔Tool derivada.
- **Operações de estoque do admin** — o staff escreve estoque por **três operações de intenção distinta**, todas gerando Stock Movement com Actor `user`:
  - **Entrada (Recebimento)** — soma estoque (delta **positivo**) por recebimento de um Fornecedor. `reason='entrada_compra'`; **Fornecedor obrigatório**. Não captura custo.
  - **Baixa** — subtrai estoque (delta **negativo**) por perda ou outro motivo operacional. `reason='perda'`/`'outro'`; sem Fornecedor.
  - **Ajuste de inventário (Recontagem)** — o staff informa a **quantidade-alvo** (não um delta) numa recontagem física; o sistema calcula o `delta`. `reason='ajuste_inventario'`; sem Fornecedor.

  O débito de venda (`saida_venda`) **não é** nenhuma das três — acontece no e-commerce com Actor `system`. Ver ADR-0015.
- **Estoque geral** — total de unidades de uma Tool em todo lugar: soma de `stock_level.quantity` sobre **todas as variantes da Tool × todas as Branches**. É o número que a aba Estoque do Fornecedor exibe por ferramenta. **Distinto** do Stock Level (que é por variante × filial). A saída de venda consome do estoque geral, sem escolher Fornecedor — por isso a aba do Fornecedor mostra o estoque geral da Tool, não só o que veio dele. **Sujeito a Branch-scoping na exibição:** só o `super_admin` vê o total cross-filial verdadeiro; para `admin`/`user` o agregado exibido (cards de Tool, aba do Fornecedor) é limitado à soma das **suas** filiais — nunca revela quanto as outras têm.
- **Reorder Point** — nível em que uma variante deve ser recomprada (`reorderPoint >= minQty`).

### Vendas

- **Order (Pedido)** — compra feita por um Client. **Nasce sempre no site e-commerce** — o admin nunca cria um Order, apenas progride seu ciclo de vida (status, rastreio, notas, filial de fulfillment). Tem `number` único e legível, snapshots de valores e endereço de entrega. Ver ADR-0001.
- **Order status** — **eixo único** de estado do Order, do pagamento à entrega: `pending_payment` → `payment_failed` / `paid` → `preparing` → `shipped` → `delivered` → `returned` → `refunded`; terminais `canceled` (encerrado sem pagamento) e `refunded` (encerrado com estorno). `canceled` só é alcançável de estados não pagos; encerrar um pedido pago é sempre `refunded`. Não há campo `paymentStatus`. O e-commerce dirige o Order até `paid`; o admin assume daí em diante. Arestas completas: `shipped → returned` (falha de entrega) e `delivered → returned` (devolução pelo cliente). Ver ADR-0005.
- **Order Item** — linha do pedido. Referencia `toolId` **e** `variantId`, mais **snapshots** fiscais e de dimensão (`ncm`, `cest`, `weightKg`, …) congelados no momento da compra — imunes a mudanças posteriores na Tool.
- **Order Status History** — trilha imutável de transições de status do pedido, com `actorType` + `reason` descritivo.
- **Order Note** — anotação interna do staff sobre um pedido. **Distinto de `order.notes`** (observação do cliente no checkout). Tabela `order_note`; apenas o admin escreve; nunca exposta ao cliente.
- **`order.notes`** — campo `text` na tabela `order`, preenchido pelo **cliente** durante o checkout (ex.: "deixar com o porteiro"). Imutável após a criação do pedido. Completamente distinto de Order Note (tabela de anotações do staff).
- **Order Attachment** — arquivo anexado ao pedido pelo staff (ex.: documento de despacho, autorização de devolução). Tabela `order_attachment`. Nunca criado pelo e-commerce; visível apenas no dashboard.
- **Order Event** — evento operacional auditável de um Order que **não** é transição de status. Tabela `order_event`, tipos `tracking_set` | `branch_assigned`. Complementa o Order Status History (que cobre só transições de `status`).
- **Filial de fulfillment** — a Branch que prepara e despacha um Order (`order.branchId`). Atribuída pelo staff (nunca pelo e-commerce) via Branch Assignment (Order Event `branch_assigned`); obrigatória ao entrar em `preparing`. É o eixo de Branch-scoping de Vendas: admin/user só operam pedidos da(s) sua(s) filial(is) de fulfillment.
- **Pedido na triagem** — Order com `branchId IS NULL`, ainda **sem filial de fulfillment**. Forma a fila de triagem visível só a **super_admin e admin** (não a `user`); sai dela quando recebe uma filial via Branch Assignment.
- **Refund Request (Solicitação de reembolso)** — pedido de estorno de um Order. Tabela `refund_request`, ciclo próprio `requested → under_review → approved → refunded | rejected`. Motivo categorizado (`refund_reason`: `defeito`/`item_errado`/`avaria_transporte`/`arrependimento`/`outro`) + texto livre. **No máximo uma ativa por Order** (índice parcial `refund_request_one_open_per_order`, derivado de `ACTIVE_REFUND_STATUSES`). Guarda snapshot do valor no momento da solicitação.
- **Comprovante de pagamento** — URL do comprovante emitido pelo gateway Asaas (`order.payment_receipt_url`). Preenchido pelo e-commerce após confirmação de pagamento; o dashboard apenas exibe. O dashboard nunca chama o Asaas diretamente. Ver ADR-0008.
- **returned** — status que cobre **dois cenários**: (a) devolução pelo cliente após entrega (`delivered → returned`); (b) falha de entrega pela transportadora, com o pedido retornando ao centro de distribuição (`shipped → returned`). Não há status separado para falha de entrega. O campo `reason` em `order_status_history` distingue os dois casos. Ver ADR-0005.

### Marketing

- **Promotion (Promoção)** — desconto aplicado a um conjunto de Tools (`promotionTool`) ou a todas (`appliesToAll`). `type='promotion'`. O desconto é **percentual ou fixo** (`discountType` `percent`|`fixed` + `discountValue`). **Descontos nunca empilham**: quando mais de uma cobre a mesma Tool, vale o de **maior desconto efetivo** (menor preço resultante) — no máximo um por Tool. Ver ADR-0002.
- **Promocode (Cupom)** — uma Promotion com `type='promocode'` e `code` preenchido. **Não existe tabela `coupon`** — cupom é uma variação de Promotion. Campos só de cupom: `maxRedemptions`/`redemptionCount` e `minOrderAmount`. Aplicado no checkout pelo e-commerce, que grava `order.couponId` + `order.discountAmount` (só o desconto de cupom; a economia de auto-promo já está no `subtotalAmount`).
- **Store Settings (Configurações da loja)** — singleton `storeSettings` com a configuração operacional da loja que o storefront lê (ex.: origem da cotação de frete, política de seguro). Editado em `/dashboard/site/settings`; exposto ao e-commerce via `getShippingSettings` (superfície de sync, ADR-0009). Frete excedente de peso por Tool fica em `tool.overweightShippingAmount`.

### Voz do cliente

- **Review (Avaliação)** — nota de 1 a 5 + texto de um Client sobre uma Tool. **Toda Review nasce de uma compra verificada** — só a cria quem tem um Order pago, com a Tool nele, dentro da janela de dias após o pagamento (`canCreateReview` é o único caminho). Moderada pelo staff: `status` `pending` → `approved` / `rejected` / `spam`. Única por `(clientId, toolId, orderId)`.

### Compliance / LGPD

- **Consent (Consentimento)** — registro LGPD de aceite ou revogação de `tos` / `privacy` / `marketing_email` / `cookies` por um Client. Tabela `consentLog`, versionado (`version`).
- **Client Audit Log** — trilha de toda mutação de dados de Client feita pelo staff. Enum `client_audit_action` (8 ações): `profile_updated`, `status_changed`, `type_changed`, `notes_updated`, `session_revoked`, `sessions_revoked_all`, `password_reset_link_generated`, `exported`.
- **Client Export** — exportação CSV/LGPD de clientes; cada export é registrado em `clientExportLog` (filtros, contagem, bytes, truncamento).
- **Right to be forgotten** — direito do Client à anonimização dos seus dados pessoais sob a LGPD. Ainda **não implementado** — não há script nem server action (gap registrado em `packages/db/CLAUDE.md`).

---

## Invariantes de domínio

1. **A auth dual é isolada.** Staff (`User`) e Client autenticam por instâncias Better Auth separadas. O dashboard lê dados de Client, mas nunca cria sessão de Client. `DashboardSession` ≠ `EcommerceSession`.
2. **A variante é a unidade de venda e de estoque.** SKU, preço, voltagem, Stock Level, Stock Movement e Order Item referenciam a **Tool Variant** — nunca a Tool. Toda Tool tem ≥1 variante, uma default.
3. **Todo atributo dinâmico pertence a uma categoria.** Não existe Attribute Definition global.
4. **Toda mutação auditável tem um Actor.** É um membro do staff (`user`) ou automação (`system`) — ver Actor no glossário.
5. **O Order tem um eixo único de status.** Pagamento e fulfillment vivem no mesmo campo `status` — não há `paymentStatus`. Refund e return são sempre do pedido inteiro. `returned` cobre devolução pelo cliente **e** falha de entrega. Ver ADR-0005.
6. **A coordenação com o e-commerce é só pelo schema.** Admin não chama o site; o site não chama o admin. O dashboard nunca chama APIs de terceiros (ex.: Asaas) — recebe dados pelo banco. Ver ADR-0004, ADR-0008.
7. **Débito de estoque ocorre em `paid`.** `pending_payment` não reserva estoque. Cancelar um pedido não pago não gera `stock_movement`. Ver ADR-0007.
8. **Todo staff operacional pertence a ≥1 filial.** `admin` e `user` têm sempre ≥1 vínculo em `userBranch` — exigido no convite e preservado por guard ao desvincular (não se remove a última filial de um admin/user). Só `super_admin` é sem-filial (escopo global). Não existe staff `admin`/`user` sem filial — logo, não existe "usuário na triagem".

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
- **`out_of_stock` × estoque real** — historicamente `tool_status` teve um valor `out_of_stock`, ambíguo com o estoque calculado por variante × filial. Resolvido: o valor foi **removido do enum** (`tool_status` = `draft`/`active`/`discontinued`); disponibilidade é sempre derivada do Stock Level, nunca um status editorial.
- **Lead** — o schema de `consent_log` antecipava um ator `lead` (enum `consent_actor`, coluna `leadId`). Resolvido: Lead não é um conceito do domínio — todo contato é um Client registrado. Os artefatos de schema **já foram removidos** — hoje `consent_log.client_id` é `NOT NULL` e não há enum `consent_actor`. Ver ADR-0003.
- **Catch-all de categoria** — historicamente existiam duas categorias-raiz catch-all vazias (`sem-categoria` no seed, `geral` resquício de migration). Issue #39 confirmou **0 attribute definitions e 0 tools** sob elas. Issue #41 removeu ambas do seed e do banco: toda Tool tem uma Category real, sem fallback.
- **`paymentStatus`** — `order` tem dois campos de estado (`status` e `paymentStatus`) com `paid`/`refunded` sobrepostos. Resolvido: o Order passa a ter um eixo único `status`; o campo `paymentStatus` e seu enum são removidos. Ver ADR-0005.
- **Fornecedor na Tool × na entrada** — historicamente o Fornecedor era **1:1 fixo na Tool** (`tool.supplier_id`, definido na criação da ferramenta). Resolvido: a proveniência pertence à **compra**, não à ferramenta — a relação Fornecedor↔Tool é **N:N derivada das entradas** (`stock_movement.supplier_id` em `reason='entrada_compra'`), e a coluna `tool.supplier_id` foi **removida**. Ver ADR-0015.
- **Custo no estoque** — a variante tem `cost_amount` e houve a tentação de capturar custo por entrada. Resolvido: **estoque não é gestão financeira** — o fluxo de estoque não captura custo. (A remoção de `tool_variant.cost_amount` é limpeza à parte, fora da feature de fluxo de estoque.)
- **Transferência entre filiais** — não é um conceito do domínio. Cada Branch tem seu estoque isolado; **não existe operação de transferência** de estoque entre filiais (não há motivo de movimento, UX nem registro para isso). Movimentos entre filiais, se um dia necessários, seriam Baixa numa + Entrada noutra — mas hoje isso está **fora de escopo por decisão de produto**.

## ADRs

Decisões arquiteturais ficam em `docs/adr/`:

- **ADR-0001** — Orders são criados apenas pelo site e-commerce.
- **ADR-0002** — Descontos de Promotion nunca empilham.
- **ADR-0003** — Lead não é um conceito do domínio.
- **ADR-0004** — Integração com o e-commerce é só DB compartilhada (sem API).
- **ADR-0005** — Order tem um eixo único de status (inclui aresta `shipped → returned` para falha de entrega).
- **ADR-0006** — DB workflow é push-only até produção (sem migrations versionadas).
- **ADR-0007** — Débito de estoque ocorre na transição para `paid`, não na criação do pedido.
- **ADR-0008** — Documentos do Asaas chegam ao dashboard pelo banco de dados; o dashboard nunca chama a API do Asaas.
- **ADR-0009** — O schema do e-commerce sincroniza do dashboard via CI (PR automático); o dashboard é a fonte de verdade.
- **ADR-0010** — ~~Signup de staff é público (aprovação manual), sem flow de invitation.~~ **Superado por ADR-0013.**
- **ADR-0011** — Audit log de user sobrevive ao delete: FK `set null` + snapshot do nome em `metadata`.
- **ADR-0012** — ~~Gates role-based desligados; roles mantidos como rótulo (religar antes de produção).~~ **Superado por ADR-0016.**
- **ADR-0013** — Auth de staff é convite-only (substitui ADR-0010); sem signup público.
- **ADR-0014** — RLS deny-all nas tabelas expostas via PostgREST (fecha a porta REST para `anon`/`authenticated`).
- **ADR-0015** — Proveniência de Fornecedor vive na entrada de estoque (N:N derivado), não na Tool; admin tem três operações de estoque (entrada/baixa/ajuste).
- **ADR-0016** — Religar gates com 3 níveis (`manager` aposentado) e Branch-scoping em dois planos (visibilidade + ação); admin filial-scoped, fail-closed, invariante "todo admin/user tem ≥1 filial". Substitui ADR-0012.
- **ADR-0017** — Overrides de capability por usuário: registry declarativo (`capabilities.ts`), tabela `user_capability_override` (text livre, não pgEnum), `can()` async com request-cache, anti-escalada em grant, auditoria em `userActivityLog`. Estende ADR-0016.
- **ADR-0018** — Read server actions enforçam capability (não só mutations): toda fn exportada de `actions.ts` recebe `requireCapability(<recurso>.read)` como primeira instrução; funções em `data.ts`/`*-data.ts` são `server-only` (não-endpoint) — o caller é responsável pelo guard. Estende ADR-0016.
- **ADR-0019** — Split de god-module em `data.ts` (server-only) + `_lib` + `actions.ts` enxuto: 3 camadas — `data.ts` (`import "server-only"`, reads+tipos+builders) + `_lib/*` (helpers puros, sem auth) + `actions.ts` (`"use server"`, só mutations + thin wrappers com guard). `bun run build` é gate obrigatório após refatorar `"use server"`. Estende ADR-0018.
- **ADR-0020** — ~~`cookieCache` na sessão do dashboard (staleness de gate aceita).~~ **Superado por ADR-0021.**
- **ADR-0021** — Remoção do `cookieCache` da sessão do dashboard: RSC não propaga `Set-Cookie` no App Router, então o cache nunca era renovado em SSR; a liability de staleness P0 superou o ganho medido (~dezenas de ms). Sessão volta a ler o Postgres em todo request. Substitui ADR-0020.

Se um output contradiz um ADR existente, sinalize explicitamente em vez de sobrescrever em silêncio.
