# Contrato de integração: Admin Dashboard ↔ App Ecommerce

Ambos os apps compartilham o mesmo banco Supabase via Drizzle. O dashboard é **fonte de verdade** do schema. O storefront sincroniza manualmente a cada migration.

- **Repo do dashboard (admin):** `github.com/othavioquiliao/emach-dashboard` (este repo).
- **Repo do app ecommerce (storefront):** `github.com/othavioquiliao/emach-ecommerce`. Mudanças de schema que o afetam viram Issue nesse repo pedindo sincronização.

## Regras gerais

- Admin **não** chama o app ecommerce diretamente.
- App ecommerce **não** chama o admin diretamente.
- Coordenação via schema compartilhado + endpoint `POST /api/internal/revalidate` (signed via `apiKey`) quando uma das pontas precisar invalidar cache da outra.
- Tabelas owned-by-dashboard: `tool`, `tool_variant`, `tool_image`, `category`, `tool_category`, `attribute_definition`, `tool_attribute_value`, `supplier`, `promotion`, `promotion_tool`.
- Tabelas escritas pelo ecommerce: `order`, `order_item`, `stock_movement`, `client*`, `review`, `lead`.

## Queries compartilhadas

`packages/db/src/queries/*.ts` é owned-by-dashboard. Storefront sincroniza byte-a-byte. Não editar em isolamento no ecommerce.

## Filial default do ecommerce

A filial que processa pedidos do storefront vive em `branch.isDefault = true` no DB
(partial unique index garante max 1 default ativa). Mudança via dashboard em
`/dashboard/branches/[id]/edit` por super_admin (toggle "Filial padrão do ecommerce").

O ecommerce lê via helper `getDefaultBranchId()` (`apps/web/src/lib/default-branch.ts`)
cacheado por 1h. Trocar a default no dashboard chama `revalidatePath` localmente; o
ecommerce só vê a mudança após o TTL (até 1h) ou redeploy.

Histórico: substituiu o env var `ECOMMERCE_DEFAULT_BRANCH_ID` em 2026-05.

## Histórico de mudanças no schema

- 2026-05-08: `promotion` ganha `created_by`, `updated_by` (FKs nullable para `user(id)` ON DELETE SET NULL). Storefront não consome essas colunas; sem ação necessária no repo ecommerce.
- 2026-05-11: `branch` ganha `isDefault` (boolean, partial unique index). `user` ganha `status` (pgEnum: pending/active/suspended) e `super_admin` role. Tabela `user_branch` criada. Env var `ECOMMERCE_DEFAULT_BRANCH_ID` removido — ecommerce lê via `branch.isDefault`.
- 2026-05-15 — `category.image_url` removida. A coluna foi dropada do schema. As queries compartilhadas `getCategoryTree` e `getCategoryBySlug` não selecionam mais `image_url`. O app ecomerce deve sincronizar a cópia versionada do schema e remover qualquer leitura de `imageUrl` em categoria. Issue de sincronização: `othavioquiliao/emach-ecommerce#15`.
