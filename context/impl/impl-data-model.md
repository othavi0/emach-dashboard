---
created: "2026-04-14"
last_edited: "2026-04-14"
---

# Implementation Tracking: Data Model

Build site: context/plans/build-site.md

| Task  | Status  | Notes |
|-------|---------|-------|
| T-012 | DONE    | `packages/db/src/schema/tools.ts` — `tool`, `category`, `supplier` + relations (toolRelations one→category,supplier; categoryRelations many→tool; supplierRelations many→tool) |
| T-013 | DONE    | `packages/db/src/schema/inventory.ts` — `branch`, `stockLevel` w/ composite PK + indexes + relations (branchRelations many→stockLevel; stockLevelRelations one→tool,branch) |
| T-014 | DONE    | `packages/db/src/schema/promotions.ts` — `promotion` + promotionRelations one→tool |
| T-015 | DONE    | `packages/db/src/schema/api-keys.ts` — `apiKey` w/ unique keyHash + index + apiKeyRelations one→user |
| T-016 | DONE    | `packages/db/src/schema/auth.ts` — `role text NOT NULL DEFAULT 'user'` column added; `UserRole = 'admin' \| 'manager' \| 'user'` type exported; column uses `.$type<UserRole>()` for TS narrowing |
| T-017 | DROPPED | Barrel file removed to satisfy biome `performance/noBarrelFile` — named imports handled directly in `packages/db/src/index.ts` instead |
| T-018 | DONE    | `packages/db/src/index.ts` — imports all tables + relations explicitly (no namespace import, no barrel), builds `schema` object manually, passes to `drizzle(env.DATABASE_URL, { schema })` |
| T-019 | DONE    | `packages/auth/src/index.ts` — no edit required: already destructures `{ account, session, user, verification }` from `@emach/db/schema/auth` and passes to `drizzleAdapter`. `role` column TypeScript-inferred automatically via the extended user table. |
| T-020 | PARTIAL | `drizzle-kit push` execution blocked — DATABASE_URL unreachable (local Supabase not running). Command to retry: `cd packages/db && bun run db:push` after `npx supabase start --workdir packages/db/supabase` |
| T-021 | DONE    | `packages/db/supabase/BUCKETS.md` — `tool-images` bucket creation command + public URL pattern + upload constraints documented |
| T-022 | DONE    | All new tables use `text("id").primaryKey()` (except `stockLevel` which uses composite `primaryKey({ columns: [...] })`); all `createdAt` use `defaultNow().notNull()`; all `updatedAt` use `defaultNow().$onUpdate(() => new Date()).notNull()` (except `promotion` which per spec has only `createdAt`) |

## Deviations from cavekit

- **T-017 dropped**: biome rule `performance/noBarrelFile` rejects `export * from` barrel files. Workaround: `packages/db/src/index.ts` imports each schema module by named exports and builds the schema object inline. This achieves the same effect (all tables + relations registered with `drizzle()`) without a barrel file. Consumers wanting individual tables import directly from `@emach/db/schema/<module>` via the existing `./*` wildcard export in `packages/db/package.json`.
- **T-019 no-op**: `packages/auth/src/index.ts` already had the correct wiring from the better-t-stack scaffold. The addition of `role` to `user` table propagates automatically via TypeScript inference — no edit required.

## Architectural Notes

- **No circular imports**: Tool relations in `tools.ts` only reference siblings in same file (category, supplier). Inventory relations in `inventory.ts` one-way import from `./tools`. Promotions relations in `promotions.ts` one-way import from `./tools`. API keys relations in `api-keys.ts` one-way import from `./auth`. Auth relations in `auth.ts` reference only same-file tables. Zero cycles.
- **Missing reverse relations** (intentional, avoids cycles):
  - `user.apiKeys` — not defined. Use `db.query.apiKey.findMany({ where: eq(apiKey.userId, userId), with: { user: true }})` instead.
  - `tool.stockLevels` — not defined. Query `stockLevel` directly filtered by `toolId`.
  - `tool.promotions` — not defined. Query `promotion` directly filtered by `toolId`.
  - These reverse directions can be added in a dedicated `relations.ts` file later if needed.

## T-020 Recovery Command

```bash
npx supabase start --workdir packages/db/supabase
cd packages/db && bun run db:push
```
