---
created: "2026-04-14"
last_edited: "2026-04-15"
---

# Cavekit: Data Model

## Scope

Full Drizzle ORM schema for the inventory domain: tools, categories, suppliers, branches, stock levels, promotions (schema only — no UI), and API keys (schema only — no validation logic). Extend the existing `user` table with a `role` column. Wire all schema modules into `createDb()` and into the `drizzleAdapter` used by better-auth. Document the Supabase Storage bucket convention for tool images (bucket creation is a manual operational step, not automated code).

## Column Specifications (reference)

These specs are the source of truth for the acceptance criteria in each requirement below.

**category:** id (text PK), name (text, not null), slug (text, unique), description (text, nullable), createdAt (timestamp, defaultNow), updatedAt (timestamp, defaultNow, $onUpdate)

**supplier:** id (text PK), name (text, not null), contactEmail (text, nullable), phone (text, nullable), notes (text, nullable), createdAt (timestamp, defaultNow), updatedAt (timestamp, defaultNow, $onUpdate)

**branch:** id (text PK), name (text, not null), address (text, nullable), createdAt (timestamp, defaultNow), updatedAt (timestamp, defaultNow, $onUpdate)

**tool:** id (text PK), name (text, not null), slug (text, unique), description (text, nullable), sku (text, unique), voltage (text, nullable — e.g. "127V" / "220V" / "Bivolt" / "380V"), price (numeric 10,2, nullable), cost (numeric 10,2, nullable), imageUrl (text, nullable), visibleOnSite (boolean, default true, not null), categoryId (text, FK → category.id, onDelete cascade), supplierId (text, FK → supplier.id, onDelete set null, nullable), createdAt (timestamp, defaultNow), updatedAt (timestamp, defaultNow, $onUpdate)

**stockLevel:** toolId (text, FK → tool.id, onDelete cascade), branchId (text, FK → branch.id, onDelete cascade), quantity (integer, default 0, not null), updatedAt (timestamp, defaultNow, $onUpdate); composite PK (toolId, branchId)

**promotion:** id (text PK), title (text, not null), description (text, nullable), toolId (text, FK → tool.id, onDelete cascade), discountPct (numeric 5,2, not null), active (boolean, default false, not null), startsAt (timestamp, nullable), endsAt (timestamp, nullable), createdAt (timestamp, defaultNow)

**apiKey:** id (text PK), name (text, not null), keyHash (text, unique, not null), userId (text, FK → user.id, onDelete cascade), expiresAt (timestamp, nullable), createdAt (timestamp, defaultNow), revokedAt (timestamp, nullable)

**user (extension):** add `role` column — text, not null, default `'user'`

## Requirements

### R1: Tools Schema File
**Description:** A new schema file defines the `tool`, `category`, and `supplier` tables with all specified columns and Drizzle relation definitions.
**Acceptance Criteria:**
- [ ] File `packages/db/src/schema/tools.ts` exists
- [ ] Exports named `tool`, `category`, `supplier` as Drizzle `pgTable` instances
- [ ] `category` table has columns: `id`, `name`, `slug`, `description`, `createdAt`, `updatedAt` — matching column specs above
- [ ] `supplier` table has columns: `id`, `name`, `contactEmail`, `phone`, `notes`, `createdAt`, `updatedAt` — matching column specs
- [ ] `tool` table has columns: `id`, `name`, `slug`, `description`, `sku`, `voltage`, `price`, `cost`, `imageUrl`, `visibleOnSite`, `categoryId`, `supplierId`, `createdAt`, `updatedAt` — matching column specs
- [ ] `tool.categoryId` declares `references(() => category.id, { onDelete: 'cascade' })`
- [ ] `tool.supplierId` declares `references(() => supplier.id, { onDelete: 'set null' })` and is nullable
- [ ] `tool.price` and `tool.cost` use Drizzle `numeric` type with precision 10 and scale 2
- [ ] `tool.slug` has a `unique()` constraint
- [ ] `tool.sku` has a `unique()` constraint
- [ ] `category.slug` has a `unique()` constraint
- [ ] Drizzle `relations()` are exported for: `toolRelations` (one category, one supplier, many stockLevels, many promotions), `categoryRelations` (many tools), `supplierRelations` (many tools)
- [ ] All `id` fields use `text` type — NOT `serial` or `uuid` Drizzle type
- [ ] All `createdAt`/`updatedAt` use `timestamp` with `defaultNow()`; `updatedAt` additionally uses `.$onUpdate(() => new Date())`

### R2: Inventory Schema File
**Description:** A new schema file defines the `branch` table and `stockLevel` join table with composite primary key.
**Acceptance Criteria:**
- [ ] File `packages/db/src/schema/inventory.ts` exists
- [ ] Exports named `branch` and `stockLevel` as Drizzle `pgTable` instances
- [ ] `branch` table has columns: `id`, `name`, `address`, `createdAt`, `updatedAt` — matching column specs
- [ ] `stockLevel` table has columns: `toolId`, `branchId`, `quantity`, `updatedAt`
- [ ] `stockLevel` composite primary key is defined on `(toolId, branchId)` using Drizzle's `primaryKey()` or equivalent table-level constraint
- [ ] `stockLevel.toolId` declares `references(() => tool.id, { onDelete: 'cascade' })`
- [ ] `stockLevel.branchId` declares `references(() => branch.id, { onDelete: 'cascade' })`
- [ ] `stockLevel.quantity` is `integer` type with `default(0).notNull()`
- [ ] `stockLevel` has a Drizzle index on `toolId` and a separate index on `branchId`
- [ ] Drizzle `relations()` exported: `branchRelations` (many stockLevels), `stockLevelRelations` (one tool, one branch)

### R3: Promotions Schema File
**Description:** **Superseded by `cavekit-promotions-crud.md` R1 (Phase 3)** — the `toolId` FK column and `one(tool)` relation are dropped, replaced by N:N `promotion_tool` join table. The ACs below describe the Phase 1 baseline that is built first; Phase 3 R1 then evolves this schema.

A new schema file defines the `promotion` table with FK to `tool`. This table is Phase 1 data infrastructure only — no UI or routes are created in Phase 1.
**Acceptance Criteria:**
- [ ] File `packages/db/src/schema/promotions.ts` exists
- [ ] Exports named `promotion` as a Drizzle `pgTable` instance
- [ ] `promotion` table has columns: `id`, `title`, `description`, `toolId`, `discountPct`, `active`, `startsAt`, `endsAt`, `createdAt` — matching column specs
- [ ] `promotion.toolId` declares `references(() => tool.id, { onDelete: 'cascade' })`
- [ ] `promotion.discountPct` uses Drizzle `numeric` type with precision 5 and scale 2
- [ ] `promotion.active` is `boolean` with `default(false).notNull()`
- [ ] `promotion.startsAt` and `promotion.endsAt` are nullable `timestamp` columns
- [ ] Drizzle `relations()` exported: `promotionRelations` (one tool)

### R4: API Keys Schema File
**Description:** A new schema file defines the `apiKey` table. This is Phase 1 data infrastructure only — no key validation middleware or routes exist in Phase 1.
**Acceptance Criteria:**
- [ ] File `packages/db/src/schema/api-keys.ts` exists
- [ ] Exports named `apiKey` as a Drizzle `pgTable` instance
- [ ] `apiKey` table has columns: `id`, `name`, `keyHash`, `userId`, `expiresAt`, `createdAt`, `revokedAt` — matching column specs
- [ ] `apiKey.keyHash` has a `unique()` constraint
- [ ] `apiKey.userId` declares `references(() => user.id, { onDelete: 'cascade' })`
- [ ] `apiKey.expiresAt` and `apiKey.revokedAt` are nullable `timestamp` columns
- [ ] A Drizzle index is defined on `apiKey.keyHash`
- [ ] Drizzle `relations()` exported: `apiKeyRelations` (one user)

### R5: User Table Extended with Role Column
**Description:** The existing `user` table in `packages/db/src/schema/auth.ts` gains a `role` text column. A TypeScript type `UserRole` enumerating valid values is exported from the same file.
**Acceptance Criteria:**
- [ ] `packages/db/src/schema/auth.ts` — the `user` table definition includes a `role` column of type `text`, with `.notNull()` and `.default('user')`
- [ ] The file exports `type UserRole = 'admin' | 'manager' | 'user'`
- [ ] The `role` column in the Drizzle schema does NOT use a Drizzle `pgEnum` — it uses plain `text` to remain flexible (enum constraint enforcement is application-level)
- [ ] No other columns are added to or removed from `user`, `session`, `account`, or `verification` tables

### R6: Schema Index Re-Exports All Modules
**Description:** A single schema barrel file re-exports every schema module so that `drizzle.config.ts` schema glob and `createDb()` can import from one location.
**Acceptance Criteria:**
- [ ] File `packages/db/src/schema/index.ts` exists
- [ ] It re-exports everything from `./auth`, `./tools`, `./inventory`, `./promotions`, `./api-keys`
- [ ] No schema module is omitted from the re-exports
- [ ] **[Phase-3-dependent]** After `cavekit-promotions-crud.md` R1 executes, `packages/db/src/schema/index.ts` also re-exports `promotionTool` from `./promotions`

### R7: createDb() Passes Full Schema to Drizzle
**Description:** The `createDb` factory in `packages/db/src/index.ts` must include all domain tables in the schema object passed to `drizzle()` so that relational queries work across domains.
**Acceptance Criteria:**
- [ ] `packages/db/src/index.ts` imports all table exports from the schema index (or individual schema files)
- [ ] The `schema` object passed to `drizzle(pool, { schema })` includes at minimum: `user`, `session`, `account`, `verification`, `tool`, `category`, `supplier`, `branch`, `stockLevel`, `promotion`, `apiKey`
- [ ] `drizzle()` is called with the `{ schema }` option — not without it
- [ ] **[Phase-3-dependent]** After `cavekit-promotions-crud.md` R1 executes, the `schema` object passed to `drizzle(pool, { schema })` additionally includes `promotionTool`

### R8: drizzleAdapter Schema Includes Role-Extended User
**Description:** better-auth's `drizzleAdapter` must reference the updated `user` table (with `role` column) so that session inference picks up the role field without `any` casts.
**Acceptance Criteria:**
- [ ] `packages/auth/src/index.ts` imports `user` from `packages/db/src/schema/auth.ts` (the same file that now has the `role` column)
- [ ] The `schema` object passed to `drizzleAdapter` includes `{ user, session, account, verification }` — the existing four tables, but `user` now carries the `role` column
- [ ] TypeScript compiles `packages/auth` without errors after the schema change (`tsc --noEmit` or `bun run build` on the package)

### R9: Schema Applies to Local Supabase Without Error
**Description:** Running the push script applies the full schema to the local Supabase Postgres instance cleanly.
**Acceptance Criteria:**
- [ ] `bun --cwd packages/db run db:push` exits with code 0 against a running local Supabase instance
- [ ] All tables (`category`, `supplier`, `tool`, `branch`, `stock_level`, `promotion`, `api_key`) appear in the `public` schema of the local database after the push
- [ ] The `role` column exists on the `user` table in the database after the push
- [ ] The composite primary key `(tool_id, branch_id)` exists on the `stock_level` table
- [ ] No destructive migration warnings are emitted for existing auth tables (user, session, account, verification)

### R10: Supabase Storage Bucket Documentation
**Description:** The kit documents the required storage bucket for tool images. Bucket creation is a manual step — it is not automated by code.
**Acceptance Criteria:**
- [ ] This kit (or an adjacent operational note linked from this kit) specifies: bucket name = `tool-images`, access = public read
- [ ] The documentation includes the Supabase CLI command to create the bucket: `supabase storage create tool-images --public` (or equivalent Studio steps)
- [ ] No code in `packages/db` or `packages/auth` creates the bucket programmatically
- [ ] [manual-check] After running the CLI command on the local Supabase instance, the bucket `tool-images` is visible in Supabase Studio under Storage

**Bucket creation command (operational reference):**
```bash
# Run once against local Supabase (from repo root)
supabase storage create tool-images --public
```
To create via Studio: open http://localhost:54323 → Storage → New bucket → Name: `tool-images` → Enable public bucket → Save.

### R11: Text IDs and Timestamp Conventions Consistent
**Description:** All new tables must use the same ID and timestamp conventions as the existing auth tables.
**Acceptance Criteria:**
- [ ] All `id` primary key columns are `text` type (not `serial`, `bigserial`, or Drizzle `uuid` type)
- [ ] ID values are expected to be generated at the application layer via `nanoid` or `crypto.randomUUID()` — the Drizzle column definition does NOT set a database-level default for IDs
- [ ] All `createdAt` columns use `timestamp('created_at').defaultNow().notNull()`
- [ ] All `updatedAt` columns use `timestamp('updated_at').defaultNow().$onUpdate(() => new Date()).notNull()` — exactly matching the pattern in the existing `user` table
- [ ] Columns named `startsAt`, `endsAt`, `expiresAt`, `revokedAt` that are nullable omit `.notNull()` and omit `defaultNow()`

## Out of Scope

- Seed data or fixture scripts
- Migration history files — Phase 1 uses `db:push` exclusively
- Supabase Row Level Security (RLS) policies
- Audit log or event sourcing tables
- Soft-delete columns (`deletedAt`) on any table
- Any UI routes, server actions, or API handlers for promotions or API keys (Phase 2)
- Automated bucket creation scripts

## Cross-References

- See also: `cavekit-auth-access.md` — reads the `role` column from `user` table defined here; requires R5 to be complete before session type extension
- See also: `cavekit-inventory-tools.md` — queries `tool`, `category`, `supplier`, `stockLevel` tables defined here; requires R1 and R2 to be complete
- See also: `cavekit-promotions-crud.md` R1 — supersedes this kit's R3 (drops `toolId` FK, adds `promotionTool` join table); R6 and R7 of this kit have Phase-3-dependent follow-up ACs that are satisfied when `cavekit-promotions-crud.md` R1 is executed

## Changelog

| Date | Change |
|------|--------|
| 2026-04-14 | Initial draft |
| 2026-04-15 | Phase 3 cross-reference notes — R3 marcado como supersedido por `cavekit-promotions-crud.md` R1 (N:N join substitui FK 1:1); R6 e R7 receberam ACs Phase-3-dependent para `promotionTool`; backward cross-reference adicionado à seção Cross-References |
