# Contrato: Admin Dashboard ↔ Site Ecomerce

> **Status:** rascunho — alinhar com o time do site ecomerce antes de codificar.

Os dois apps escrevem na **mesma DB Supabase** via Drizzle. Não há chamadas HTTP entre eles, exceto invalidação de cache. Este documento define quem escreve onde.

## Premissas

- Schema é **single source of truth** em `packages/db/src/schema/` deste repo. App ecomerce mantém **cópia versionada** sincronizada manualmente.
- Nenhum app importa schema do "outro lado" (admin não importa `client.ts`; ecomerce não importa `auth.ts`).
- Pagamento e gateway: **100% no site ecomerce**. Admin lê `order.paymentStatus`, `order.paymentMethod`, `order.paymentProviderRef` mas nunca os modifica.
- Frete: **100% no site ecomerce**. Admin só lê `order.shippingAmount`, `order.shippingMethod`, `order.shippingTrackingCode`.
- `productType` foi removido (Fase A). Catálogo usa `category` (hierárquica) + `tool_category` (M2M).

## Distribuição do schema (cópia versionada)

Site ecomerce mantém **cópia versionada** de `packages/db/src/schema/` no seu próprio repo. Sincronização manual a cada migration:

1. Admin gera migration nova: `bun --cwd packages/db db:generate` + revisão SQL + commit.
2. Admin aplica em prod: `bun --cwd packages/db db:migrate` + `bun --cwd packages/db db:apply-triggers`.
3. Time do site faz `cp -r packages/db/src/schema/ <site>/packages/db/src/schema/` + bump de versão local + smoke-test.
4. Deploy coordenado (admin antes do site quando há colunas novas; site antes quando há drops).

Mudança em tabela compartilhada (`order*`, `client*`, `stock_movement`, `review`, `lead`, `category`, `tool_category`) **exige comunicação prévia** ao time do site.

## Matriz de escrita

| Tabela | Quem cria | Quem atualiza | Notas |
|---|---|---|---|
| `tool`, `category`, `tool_category`, `supplier`, `branch` | admin | admin | catálogo |
| `siteBanner`, `siteAnnouncement`, `siteSetting`, `featuredTool` | admin | admin | site só lê (Fase D) |
| `stockLevel` | admin | admin **e** site | site debita ao confirmar pedido (transação serializável + check `quantity_non_negative`) |
| `stockMovement` | admin **e** site | imutável (audit) | site cria com `reason='saida_venda'` + `orderId`/`orderItemId` + `actorType='apiKey'` + `apiKeyId` |
| `client`, `clientAddress` | site | site (perfil) **e** admin (tags/notes/status — Fase C) | colunas disjuntas |
| `order`, `orderItem` | site | admin (status/branchId/notas) **e** site (paymentStatus/tracking) | colunas disjuntas — Fase B |
| `orderStatusHistory`, `orderNote` | admin **e** site | imutável | append-only com `actorType` — Fase B |
| `review` | site | admin (moderação: status, moderationNote) | site cria como `pending` — Fase E |
| `lead` | site (form de contato) | admin (status, assignedTo) — Fase C | |
| `consent_log` | site (login/checkout) e admin (script anonymize) | imutável | LGPD — usar `lib/consent.ts` |
| `promotion`, `promotionTool` | admin | admin | site só lê. Cupons via `promotion.type='promocode'` |
| `apiKey` | admin | admin | site usa para autenticar `/api/internal/revalidate`; campos `scopes` + `allowedTags` controlam escopo |

## Auditoria com `actorType`

Toda escrita em tabela com colunas de auditoria preenche:

| origem | `actor_type` | `actor_id` | `api_key_id` |
|---|---|---|---|
| admin user | `'user'` | `session.user.id` | `NULL` |
| site ecomerce (apiKey) | `'apiKey'` | `NULL` | `apiKey.id` da chave usada |
| seed/script automático | `'system'` | `NULL` | `NULL` |

CHECK `actor_coherence` em `stock_movement` valida no DB. CHECK semelhante deverá existir em `order_status_history` (Fase B).

## Concorrência de estoque (idempotência)

Ao confirmar pagamento, site faz:

```ts
await db.transaction(async (tx) => {
  // 1. Lock pessimista
  await tx.execute(sql`SELECT * FROM stock_level WHERE tool_id = ${toolId} AND branch_id = ${branchId} FOR UPDATE`);

  // 2. INSERT em stock_movement; UNIQUE INDEX bloqueia duplicata
  try {
    await tx.insert(stockMovement).values({
      id: crypto.randomUUID(),
      toolId, branchId,
      previousQty, newQty, delta,
      reason: "saida_venda",
      orderId, orderItemId,
      actorType: "apiKey", apiKeyId,
    });
  } catch (e) {
    if (isUniqueViolation(e, "stock_movement_sale_idempotency")) {
      return { ok: true, idempotent: true };  // já processado antes
    }
    throw e;
  }

  // 3. UPDATE stock_level (check quantity_non_negative protege contra oversell)
  await tx.update(stockLevel).set({ quantity: sql`${stockLevel.quantity} + ${delta}` }).where(...);
});
```

O **partial unique index** `stock_movement_sale_idempotency` (em `_triggers.sql`) garante que cada `(orderItemId)` só recebe um movimento `reason='saida_venda'`. Movimentos de ajuste (`orderItemId IS NULL`) ficam ilimitados.

## Endpoint POST /api/internal/revalidate (Fase D)

Site chama quando insere/atualiza dado que o admin pode ter cacheado.

- **Auth:** header `X-Api-Key: <plaintext>` → admin verifica via hash + checa `revokedAt IS NULL` + `expiresAt > now()`.
- **Escopo:** `apiKey.scopes` deve conter `'revalidate'`.
- **Tags:** cada tag em `body.tags` deve ter match em pelo menos um pattern de `apiKey.allowedTags` (suporta glob `*` no fim, ex: `order:*`).
- **Body:** `{ tags: string[] }`. Ex: `{ tags: ['orders', 'order:abc-123'] }`.
- **Resposta:** `{ ok: true, revalidated: string[] }` ou 403 com lista de tags rejeitadas.

Recíproco: admin chama endpoint similar no site quando modifica catálogo/CMS. Tags previstas: `tools`, `tool:<id>`, `category:<slug>`, `banners`, `announcements`, `settings`.

## LGPD

- `consent_log` registra TOS, privacy, marketing_email, cookies por client/lead com versão + IP + UA.
- Helpers em `apps/web/src/lib/consent.ts`: `logConsent`, `revokeConsent`, `getActiveConsent`.
- Direito ao esquecimento: `bun --cwd packages/db db:anonymize-client <client-id>`. Anonimiza PII (nome/email/telefone/documento/imagem), deleta `client_address`/`client_session`/`client_account`, registra entrada em `consent_log` com `kind='privacy'` + `granted=false`. **Preserva** `order`/`orderItem` (auditoria fiscal NF-e exige retenção de ~5 anos).
- Site deve chamar `logConsent` em pontos críticos (cadastro, opt-in newsletter, banner de cookies).

## Pendências para alinhar com o site

- [ ] Estratégia de geração de `order.number` (sequência Postgres? UUID + número humano?). Sugestão: Postgres SEQUENCE `order_number_seq` + format `lpad(nextval, 6, '0')` em ANO-XXXXXX.
- [ ] Onde mora a config de impostos / NFe / integração SEFAZ.
- [ ] Política de retenção de `orderStatusHistory` / `stockMovement` (anos? particionamento?).
- [ ] Tabela `consent_log` precisa FK para `lead` quando essa tabela existir (Fase C).
