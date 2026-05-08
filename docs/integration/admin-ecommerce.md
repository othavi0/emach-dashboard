# Contrato de integração: Admin Dashboard ↔ App Ecommerce

Ambos os apps compartilham o mesmo banco Supabase via Drizzle. O dashboard é **fonte de verdade** do schema. O storefront sincroniza manualmente a cada migration.

## Regras gerais

- Admin **não** chama o app ecommerce diretamente.
- App ecommerce **não** chama o admin diretamente.
- Coordenação via schema compartilhado + endpoint `POST /api/internal/revalidate` (signed via `apiKey`) quando uma das pontas precisar invalidar cache da outra.
- Tabelas owned-by-dashboard: `tool`, `tool_variant`, `tool_image`, `category`, `tool_category`, `attribute_definition`, `tool_attribute_value`, `supplier`, `promotion`, `promotion_tool`.
- Tabelas escritas pelo ecommerce: `order`, `order_item`, `stock_movement`, `client*`, `review`, `lead`.

## Queries compartilhadas

`packages/db/src/queries/*.ts` é owned-by-dashboard. Storefront sincroniza byte-a-byte. Não editar em isolamento no ecommerce.

## Histórico de mudanças no schema

- 2026-05-08: `promotion` ganha `created_by`, `updated_by` (FKs nullable para `user(id)` ON DELETE SET NULL). Storefront não consome essas colunas; sem ação necessária no repo ecommerce.
