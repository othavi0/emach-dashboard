# Handoff — Fase B (Orders + Reviews)

> **Próximo agente:** leia este arquivo INTEIRO antes de qualquer ação. Em seguida abra o spec da Fase A em `docs/superpowers/specs/2026-04-27-fase-a-fundacao-design.md` e o plano global em `/home/othavio/.claude/plans/eu-quero-que-voce-curious-sun.md`. Só depois rode `/superpowers:brainstorming` focado em Fase B.

**Data deste handoff:** 2026-04-27
**Branch atual:** `feat/fase-b-orders` (baseada em `feat/fase-a-fundacao` — PR #8 ainda aberto, aguardando merge em main)
**Status do projeto:** Fase A concluída, código em produção via cópia versionada com o site ecomerce.

---

## Contexto do produto

`emach-dashboard` é um admin para um e-commerce brasileiro de ferramentas industriais (E-mach). O **site ecomerce** (loja pública) está em outro repo e **escreve direto no mesmo banco Supabase** via cópia versionada de `packages/db/src/schema/`. Pagamento, gateway, frete e checkout são 100% responsabilidade do site — admin **não toca** nessas decisões.

Roadmap macro: Fase A (fundação) → Fase B (Orders + Reviews) → Fase C (Customers + Leads) → Fase D (Site/CMS) → Fase E (Categorias UI tree + finalizações) → Fase F (observabilidade + testes integração).

---

## O que está pronto (Fase A — base sobre a qual a Fase B será construída)

**Schema (ver `packages/db/src/schema/`):**
- `user.role` é pgEnum (`admin`/`manager`/`user`).
- `stockLevel` tem check `quantity_non_negative` (oversell guard).
- `stockMovement` tem `orderId` (text, nullable, FK a ser criada na Fase B), `orderItemId` (text, nullable, FK a ser criada na Fase B), `actorType` enum (`user`/`apiKey`/`system`), `actorId` FK user, `apiKeyId` FK apiKey + checks `delta_non_zero` e `actor_coherence`.
- `apiKey` tem `scopes text[]` + `allowedTags text[]` + GIN index.
- `category` + `toolCategory` (M2M, `isPrimary` partial unique). Anti-ciclo + path/depth via trigger PL/pgSQL em `_triggers.sql`.
- `consentLog` (LGPD).
- **Removido:** `productType` table + `tool.productTypeId`.

**Triggers PL/pgSQL aplicados (em `packages/db/src/migrations/_triggers.sql`):**
- `prevent_category_cycle` (BEFORE INSERT/UPDATE de category).
- `cascade_category_path` (AFTER UPDATE).
- `stock_movement_sale_idempotency` (partial unique index `WHERE reason='saida_venda' AND order_item_id IS NOT NULL`).

**Capabilities (em `apps/web/src/lib/permissions.ts`):**
- `Capability` enum com 30 caps. `can(role, cap)` + `requireCapability(cap)` + `requireCapabilityOrRedirect(cap, redirectTo)`.
- Matriz: `admin` (tudo) > `manager` (operacional + comercial + conteúdo) > `user` (estoquista + expedição: `stock.adjust`, `orders.update_status`, `orders.add_note`, todos os reads).
- Caps de Orders **já declaradas mas não usadas ainda** no enum: `orders.read`, `orders.update_status`, `orders.cancel`, `orders.refund`, `orders.add_note`. `reviews.read`, `reviews.moderate`.

**LGPD:**
- Helper `apps/web/src/lib/consent.ts` com `logConsent`, `revokeConsent`, `getActiveConsent`.
- Script `bun --cwd packages/db db:anonymize-client <id>` (preserva orders por 5 anos para auditoria fiscal).

**Auth:** dual instances Better Auth (admin × clientes BR) já isoladas. `apps/web` nunca importa schema do client.

**DB atual (produção/staging compartilhada):** 1 user · 8 categorias · 30 tools · 30 tool_category · 2 suppliers · 2 branches.

---

## Escopo da Fase B

**Entrega:** módulo de pedidos read+update (admin processa fulfillment) + módulo de reviews moderado.

**O admin NÃO faz na Fase B:**
- Criar pedido (site cria via apiKey; admin só lê e atualiza status).
- Processar pagamento (`paymentStatus`, `paymentMethod`, `paymentProviderRef` são read-only no admin — site escreve).
- Calcular frete (`shippingAmount`, `shippingMethod`, `shippingTrackingCode` chegam preenchidos do site; admin pode editar `trackingCode` quando despachar).

**O admin FAZ na Fase B:**
- Listar pedidos com filtros (status, data, cliente, filial).
- Ver detalhe (timeline, itens, endereço snapshot, pagamento, frete, notas).
- Mudar status: `pending_payment` → `paid` (site faz) → `preparing` → `shipped` → `delivered` | `canceled` | `refunded`.
- Adicionar notas internas em pedido.
- Imprimir etiqueta/separação (PDF ou print-friendly page).
- Moderar reviews (`pending` → `approved`/`rejected`/`spam`).

---

## Schemas a criar (já desenhados — copiar do plano global)

Ver `/home/othavio/.claude/plans/eu-quero-que-voce-curious-sun.md` Bloco 2.1 para o desenho completo. Resumo:

### `packages/db/src/schema/orders.ts` (novo)

```ts
order
  id (uuid pk)
  number (text unique, gerado via Postgres SEQUENCE order_number_seq — formato "2026-000123")
  clientId (fk client.id)
  branchId (fk branch.id, nullable — atribuído na separação)
  status (pgEnum: 'pending_payment' | 'paid' | 'preparing' | 'shipped' | 'delivered' | 'canceled' | 'refunded')
  paymentStatus (pgEnum: 'pending' | 'authorized' | 'paid' | 'failed' | 'refunded')  -- read-only no admin
  paymentMethod (text)                                                                  -- read-only no admin
  paymentProviderRef (text)                                                              -- read-only no admin
  subtotalAmount, discountAmount, shippingAmount, totalAmount (numeric 12,2)
  shippingAddress (jsonb — snapshot completo do clientAddress)
  shippingMethod (text)
  shippingTrackingCode (text, nullable)  -- admin pode editar quando despachar
  notes (text — notas do cliente)
  createdAt, paidAt, shippedAt, deliveredAt, canceledAt (timestamps)

orderItem  -- SNAPSHOT FISCAL COMPLETO (NF-e exige imutabilidade)
  id, orderId (fk cascade), toolId (fk restrict)
  -- snapshots imutáveis vindos de tool no momento do checkout:
  sku, name, model, voltage
  unitPrice, quantity, lineTotal, discountAmount
  cost                     -- para relatório de margem
  ncm, cest                -- BR fiscal
  manufacturerName
  weightKg, lengthCm, widthCm, heightCm

orderStatusHistory  -- com actorType
  id, orderId, fromStatus, toStatus
  actorType pgEnum('actor_type', ['user','apiKey','system'])  -- reusa o existente
  actorUserId (fk user.id, nullable)
  actorApiKeyId (fk apiKey.id, nullable)
  reason, createdAt
  CHECK actor_coherence  -- copiar do stockMovement

orderNote  -- nota interna admin
  id, orderId, authorId (fk user.id), body, createdAt
```

**Sequence (em `_triggers.sql`):**
```sql
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1;
-- formato: EXTRACT(YEAR FROM NOW()) || '-' || lpad(nextval('order_number_seq')::text, 6, '0')
```

**FKs em stockMovement (já têm as colunas, falta amarrar):**
```sql
ALTER TABLE stock_movement
  ADD CONSTRAINT stock_movement_order_id_fkey FOREIGN KEY (order_id) REFERENCES "order"(id) ON DELETE SET NULL,
  ADD CONSTRAINT stock_movement_order_item_id_fkey FOREIGN KEY (order_item_id) REFERENCES order_item(id) ON DELETE SET NULL;
```

### `packages/db/src/schema/reviews.ts` (novo)

```ts
review
  id, toolId (fk), clientId (fk), orderId (fk NOT NULL — só verified buyer)
  rating (int CHECK 1..5), title, body
  status (pgEnum: 'pending' | 'approved' | 'rejected' | 'spam')
  moderatedBy (fk user.id, nullable), moderatedAt, moderationNote
  createdAt, updatedAt
  -- unique index (clientId, toolId, orderId): cliente só avalia 1x por compra
```

---

## Telas a criar (`apps/web/src/app/dashboard/`)

```
orders/
  page.tsx                  -- listagem + filtros (status, data, cliente, filial)
  [id]/page.tsx             -- detalhe: timeline + itens + endereço + pagamento + frete + notas
  [id]/edit/page.tsx        -- mudar status + atribuir branch + adicionar nota
  [id]/print/page.tsx       -- separação/etiqueta (print-friendly)
  actions.ts                -- updateStatus, addNote, assignBranch, generateLabel
  schema.ts                 -- Zod
  _components/

reviews/
  page.tsx                  -- fila de moderação (pending por padrão)
  [id]/page.tsx             -- detalhe + ações approve/reject/spam
  actions.ts
  schema.ts
  _components/
```

**Sidebar:** adicionar "Pedidos" e "Avaliações" em `apps/web/src/app/dashboard/_components/app-sidebar.tsx`.

**Dashboard home:** adicionar card de "Pedidos pendentes" (`status='paid'` ou `'preparing'`) na grid de stats.

---

## Padrões obrigatórios (já estabelecidos)

1. **Server actions:** `"use server"` no topo + `requireCapability(cap)` + Zod safeParse + transação Drizzle quando múltiplas tabelas + `revalidatePath`.
2. **ActionResult:** `{ ok: true; data: T } | { ok: false; error: string }`.
3. **IDs:** `crypto.randomUUID()` (sem nanoid).
4. **Logger:** `import logger from "@/lib/logger"` (não `console.*`).
5. **Auditoria de mudança de status:** ao mudar order.status, INSERT em `order_status_history` na **mesma transação** com `actorType: "user"` + `actorUserId: session.user.id`.
6. **Status change side-effects:** mudança de pago→cancelado pode precisar criar `stockMovement` reverso (devolução ao estoque). Discutir no brainstorming.
7. **Capabilities:** Tools delete/Orders refund/Branches manage = só admin. Outras operações de orders = admin+manager. Listagem/detalhe = todos os 3 roles.
8. **Reviews:** insert via site (com apiKey). Admin só atualiza `status` + `moderatedBy` + `moderatedAt` + `moderationNote`.

---

## Decisões já fechadas (não rebrainstormar)

| Tema | Decisão |
|---|---|
| Pagamento/gateway | 100% no site ecomerce (admin read-only) |
| Frete | 100% no site (admin pode editar `trackingCode`) |
| `order.number` | Postgres SEQUENCE `order_number_seq`, formato `YYYY-000NNN` |
| Snapshot fiscal | Completo em `orderItem` (sku, name, model, voltage, ncm, cest, manufacturer, weight, dimensions, cost) — NF-e exige imutabilidade |
| Reviews verified-buyer | `orderId` obrigatório (NOT NULL) |
| Auditoria de status | Mesmo padrão `actorType` do `stockMovement` (`user`/`apiKey`/`system` + check coherence) |
| Idempotência débito venda | Já implementada via partial unique em stockMovement (Fase A) — site usa `actorType='apiKey'` + `apiKeyId` + `orderItemId` |
| Distribuição schema | Cópia versionada manual a cada migration (ver `docs/integration/admin-ecommerce.md`) |
| Vitest com Postgres real | Adiado para Fase F |

---

## Comando de arranque (próximo agente)

1. Ler este arquivo (feito).
2. Ler `docs/superpowers/specs/2026-04-27-fase-a-fundacao-design.md` (decisões fundamentais) e `docs/integration/admin-ecommerce.md` (contrato com site).
3. Ler `apps/web/src/lib/permissions.ts` (capabilities) e `packages/db/src/schema/stock-movements.ts` (padrão `actorType`/idempotência) e `packages/db/src/schema/categories.ts` (padrão de schema com checks/triggers).
4. Rodar `/superpowers:brainstorming` com escopo: "Fase B do plano em /home/othavio/.claude/plans/eu-quero-que-voce-curious-sun.md — Orders (com snapshot fiscal completo + actorType auditing + sequence) + Reviews (verified-buyer)".
5. Em seguida `/superpowers:writing-plans` produz plano executável.
6. Implementar via `/superpowers:subagent-driven-development` ou inline conforme preferência do user.

**Não:** começar a codar antes do brainstorm. **Não:** repensar decisões já fechadas acima sem permissão explícita do user.

---

## Histórico da conversa anterior

Exportação completa em `pre-fase-2.txt` na raiz do repo (gerada pelo `/export` no fim da sessão). Use só se precisar resgatar uma decisão ambígua não capturada aqui.
