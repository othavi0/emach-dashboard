# Design — `db:seed-demo`: fixture coerente da DB de dev

**Data:** 2026-05-17
**Contexto:** Issue #44 adotou o workflow push-only (ADR-0006). A DB de dev tem dados mock que violam invariantes de domínio (orders sem `order_status_history`, `stock_level` sem `stock_movement`, clients sem `consent_log`). Decisão do grill (`/grill-with-docs`, 2026-05-17): wipe + seed realista — um fixture coerente completo, truncate-and-seed.

## Objetivo

Um comando único — `bun db:seed-demo` — que reconstrói a DB de dev inteira com um dataset **coerente e que honra os invariantes de domínio**, permitindo desenvolver e validar o backend contra dados que seguem o fluxo real (orders com trilha de status, estoque lastreado por movimentos, clients com consentimento).

## Escopo do truncate

`user`, `account`, `session`, `verification` são as tabelas de auth **do dashboard** — login real do staff, não dado mock. O seed **não trunca** essas 4. Trunca todo o resto das 32 tabelas de `public` (incluindo as `client*` de auth do ecommerce — clientes são mock; o app ecommerce ainda não existe).

O seed **lê** o(s) staff `user` existente(s) e os usa como Actor em `stock_movement`, `order_status_history`, `client_audit_log` e `promotion.createdBy`/`updatedBy`. Se não houver nenhum `user`, o seed aborta com mensagem clara ("crie um usuário staff / faça login antes de rodar o seed").

## Estrutura do código

Módulos por domínio + orquestrador (auto-contido — um comando, zero dependências de scripts externos):

```
packages/db/scripts/seed-demo.ts     # orquestrador — entry de `bun db:seed-demo`
packages/db/scripts/reset-demo.ts    # entry de `bun db:reset-demo` — só o truncate
packages/db/scripts/seed/
  truncate.ts    # TRUNCATE de todas as tabelas exceto user/account/session/verification
  core.ts        # branch, user_branch
  catalog.ts     # category, attribute_definition, supplier, tool, tool_variant,
                 # tool_image, tool_category, tool_attribute_value, tool_attribute_assignment
  inventory.ts   # stock_level + stock_movement de abertura (entrada_compra)
  clients.ts     # client, client_address, consent_log, client_audit_log, client_export_log
  sales.ts       # order, order_item, order_status_history, order_note,
                 # stock_movement saida_venda, review
  marketing.ts   # promotion, promotion_tool
  verify.ts      # asserções de invariante pós-seed
```

Cada módulo exporta `seedX(tx, ctx)`: insere seu slice em ordem de dependência e grava os IDs criados num objeto `ctx` (`SeedContext`) repassado ao próximo módulo. `seed-demo.ts` abre uma transação e roda na ordem: `truncate → core → catalog → inventory → clients → sales → marketing → verify`. Se `verify` falhar, a transação dá rollback.

IDs via `crypto.randomUUID()` (convenção do projeto). Sem dependência de `nanoid`.

## Dataset

Volume calibrado para "povoar as telas sem exagero":

| Entidade | Quantidade / regra |
| --- | --- |
| `branch` | 3 (1 Matriz default + 2 filiais) |
| `user_branch` | liga o(s) staff existente(s) às 3 branches |
| `supplier` | 6 |
| `category` | ~20 nós — 4 raízes + filhas (depth 2–3), `path`/`depth` materializados pelo trigger |
| `attribute_definition` | ~14, distribuídas pelas categorias (`categoryId` NOT NULL) |
| `tool` | ~11 — mix de `status` (`draft`/`active`/`discontinued`/`out_of_stock`) e `visibleOnSite` |
| `tool_variant` | ~20 (1–3 por tool, exatamente uma `isDefault`) |
| `tool_image` | 1–3 por tool |
| `tool_category` | 1–2 por tool (exatamente uma `isPrimary`) |
| `tool_attribute_assignment` + `tool_attribute_value` | por tool, só atributos no `path` da primary category |
| `stock_level` | por variante × branch (subconjunto — cada variante em 1–3 branches) |
| `stock_movement` | abertura `entrada_compra` por stock_level + `saida_venda` por item de order pago+ |
| `client` | ~12 — mix `b2c`/`b2b`, statuses `active`/`inactive`/`blocked` |
| `client_address` | 1–2 por client |
| `consent_log` | `tos` + `privacy` por client; `marketing_email` em alguns |
| `order` | ~17 — **pelo menos um por valor de `order_status`** (9 valores) |
| `order_item` | 1–4 por order, com snapshots fiscais |
| `order_status_history` | trilha completa por order |
| `order_note` | em alguns orders |
| `review` | ~9 — só de orders entregues; statuses variados |
| `promotion` + `promotion_tool` | ~4 (mix `promotion` e `promocode`) |
| `client_audit_log` | alguns (staff editou alguns clients) |
| `client_export_log` | 1–2 |

Conteúdo realista: nomes de ferramentas industriais brasileiras, CPF/CNPJ normalizados (só dígitos), preços em BRL, alinhado ao domínio do `PRODUCT.md`.

## Regras de coerência (verificadas por `verify.ts`)

1. Toda `tool` tem ≥1 `tool_variant` (uma `isDefault`) e ≥1 `tool_category` (uma `isPrimary`).
2. `tool_attribute_value` só existe para atributos cuja `attribute_definition.categoryId` está no `path` da primary category da tool.
3. **Estoque — cadeia completa:** para cada `(variantId, branchId)`, `stock_level.quantity` = soma dos `stock_movement.delta`. Abertura = um `entrada_compra`; cada item de order pago+ gera um `saida_venda` (delta negativo), respeitando o partial unique index de idempotência de débito de venda. `quantity >= 0` sempre.
4. Todo `order` tem trilha **completa** em `order_status_history` — de `pending_payment` até o status atual, seguindo o caminho legal do ADR-0005 (`pending_payment → paid → preparing → shipped → delivered → returned → refunded`; `canceled` só de estado não-pago; `payment_failed` de `pending_payment`).
5. `order_item` referencia `toolId` **e** `variantId`, com snapshots fiscais/dimensão congelados.
6. `review` só para `(clientId, toolId, orderId)` onde o order é pago+ e contém a tool; única por `(toolId, clientId, orderId)`.
7. Todo `client` tem `consent_log` de `tos` e `privacy` (`granted=true`).
8. Actor coherence: linhas com `actor_type='user'` referenciam um `user` real; `system` tem actor nulo. Vale para `stock_movement`, `order_status_history`, `client_audit_log`.

## Scripts

| Script | Faz |
| --- | --- |
| `bun db:seed-demo` | `bun run scripts/seed-demo.ts` — truncate (escopo acima) + popula o fixture coerente + `verify` |
| `bun db:reset-demo` | `bun run scripts/reset-demo.ts` — só o truncate (estado limpo, auth do dashboard intacta) |

`db:seed-categories` e `db:seed-attributes` (e os arquivos `scripts/seed-categories.ts`, `scripts/seed-attributes.ts`) são **removidos** — `seed-demo` os supersede. Atualizar `package.json` (root + `packages/db`), `turbo.json` e as docs que os citam.

Pré-requisito: `bun db:sync` aplicado antes (schema + triggers de `category` path/depth ativos) — o seed insere categorias e depende do trigger para materializar `path`/`depth`.

## Verificação

`verify.ts` roda no fim da transação do seed e checa cada regra de coerência (seção acima) com queries de agregação; lança erro (→ rollback) se algo violar. É o "teste" do seed — garante que o fixture nasce coerente.

Validação manual adicional: após `bun db:seed-demo`, `bun dev:web` e visitar as rotas de `dashboard/` (tools, stock, orders, customers, reviews, promotions) — devem aparecer povoadas e sem erro de SSR.

## Fora de escopo

- Policies de RLS (o #44 deixou RLS deny-all; policies viriam quando o storefront precisar).
- Seed de dados de auth do dashboard (`user`/`account`) — preservados, não tocados.
- O app ecommerce — não existe; o seed simula o que ele escreveria.
