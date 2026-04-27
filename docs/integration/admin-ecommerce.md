# Contrato: Admin Dashboard ↔ Site Ecomerce

> **Status:** rascunho — alinhar com o time do site ecomerce antes de codificar.

Os dois apps escrevem na **mesma DB Supabase** via Drizzle. Não há chamadas HTTP entre eles, exceto invalidação de cache. Este documento define quem escreve onde.

## Premissas

- Schema é **single source of truth** em `packages/db/src/schema/`. App ecomerce consome via cópia ou git submodule do `@emach/db`.
- Nenhum app importa schema do "outro lado" (admin não importa `client.ts`; ecomerce não importa `auth.ts`).
- Pagamento e gateway: **100% no site ecomerce**. Admin lê `order.paymentStatus`, `order.paymentMethod`, `order.paymentProviderRef` mas nunca os modifica.
- Frete: **100% no site ecomerce**. Admin só lê `order.shippingAmount`, `order.shippingMethod`, `order.shippingTrackingCode`.

## Matriz de escrita

| Tabela | Quem cria | Quem atualiza | Notas |
|---|---|---|---|
| `tool`, `productType`, `category`, `supplier`, `branch` | admin | admin | catálogo |
| `toolImage`, `siteBanner`, `siteAnnouncement`, `siteSetting`, `featuredTool` | admin | admin | site lê |
| `stockLevel` | admin | admin **e** site | site debita ao confirmar pedido (transação serializável) |
| `stockMovement` | admin **e** site | imutável (audit) | site cria com `reason='saida_venda'` + `orderId` |
| `client`, `clientAddress` | site | site (perfil) **e** admin (tags/notes/status) | colunas disjuntas |
| `order`, `orderItem` | site | admin (status/branchId/notas) **e** site (paymentStatus/tracking) | colunas disjuntas |
| `orderStatusHistory`, `orderNote` | admin **e** site | imutável | append-only |
| `review` | site | admin (moderação: status, moderationNote) | site cria como `pending` |
| `lead` | site (form de contato) | admin (status, assignedTo) | |
| `promotion`, `promotionTool` | admin | admin | site só lê |
| `apiKey` | admin | admin | site usa para autenticar `/api/internal/revalidate` |

## Endpoints HTTP

### `POST /api/internal/revalidate` (no admin)

Site chama quando insere/atualiza dado que o admin pode ter cacheado.

- **Auth:** header `X-Api-Key: <apiKey>`.
- **Body:** `{ tags: string[] }`. Ex: `{ tags: ['orders', 'order:abc-123'] }`.
- **Resposta:** `{ ok: true }` ou `{ ok: false, error }`.

### `POST /api/internal/revalidate` (no site, recíproco)

Admin chama quando modifica catálogo/CMS.

- Mesma assinatura. Tags do site: `tools`, `tool:<id>`, `category:<slug>`, `banners`, `announcements`, `settings`.

## Concorrência de estoque

`stockLevel.quantity` pode ser decrementado por:
1. Site ao confirmar pagamento.
2. Admin ao registrar saída manual (perda, ajuste).

**Regra:** sempre dentro de transação com `SELECT ... FOR UPDATE` em `stockLevel` referente ao `(toolId, branchId)`. Caso `quantity < requested`, abortar e retornar erro estruturado para o site mostrar "produto indisponível".

## Validação compartilhada (futuro)

Criar `packages/contracts` com Zod schemas exportados (CPF/CNPJ, endereço BR, payload de order). Ambos os apps importam para garantir formato consistente.

## Versionamento de schema

Toda mudança em tabela compartilhada (`order*`, `client*`, `stockMovement`, `review`, `lead`):

1. PR no monorepo do admin com a migration.
2. Comunicar ao time do site **antes** de aplicar em prod.
3. Garantir que ambas as versões dos apps são compatíveis com o schema antigo + novo durante o deploy (rolling).

## Pendências para alinhar com o site

- [ ] Site importa `@emach/db` via git submodule, monorepo unificado, ou cópia versionada?
- [ ] Estratégia de geração de `order.number` (sequência Postgres? UUID + número humano?).
- [ ] Onde mora a config de impostos / NFe / integração SEFAZ.
- [ ] Política de retenção de `orderStatusHistory` / `stockMovement` (anos? particionamento?).
