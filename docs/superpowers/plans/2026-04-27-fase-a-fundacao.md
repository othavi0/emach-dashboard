# Fase A — Fundação Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reset migrations baseline, fechar gaps de schema (capabilities/idempotência/anti-ciclo/LGPD/oversell), substituir `productType` por `category` hierárquico e criar suíte vitest com Postgres real, deixando fundação sólida para as Fases B–F (Orders, Customers, Site, Reviews).

**Architecture:** Drizzle schemas (TS) + triggers PL/pgSQL anexos para anti-ciclo e idempotência + Vitest com Supabase local CLI para integração + lib/permissions.ts (capabilities enum + can/requireCapability) substituindo `requireRole` em server actions sensíveis + LGPD via `consentLog` table + script de anonimização.

**Tech Stack:** Bun 1.3 + Turborepo 2.9 + Drizzle 0.45 + node-postgres + Next 16 / React 19 + Better Auth 1.5 + Vitest + execa + Supabase CLI + Docker.

**Spec base:** `docs/superpowers/specs/2026-04-27-fase-a-fundacao-design.md`

---

## File Structure

### Novos arquivos

| Arquivo | Responsabilidade |
|---|---|
| `packages/db/src/schema/categories.ts` | Schema `category` (hierárquica + path/depth) e `tool_category` (M2M) |
| `packages/db/src/schema/consent-log.ts` | Schema `consent_log` para LGPD |
| `packages/db/src/migrations/_triggers.sql` | Triggers PL/pgSQL (anti-ciclo + cascade path + partial unique idempotência) |
| `packages/db/scripts/apply-triggers.ts` | Aplica `_triggers.sql` no DB |
| `packages/db/scripts/seed-categories.ts` | Cria 5 categorias raiz idempotentes |
| `packages/db/scripts/anonymize-client.ts` | LGPD direito ao esquecimento |
| `packages/db/vitest.config.ts` | Config vitest do pacote |
| `packages/db/test/setup.ts` | Global setup (Supabase up + db:push --force + apply-triggers) |
| `packages/db/test/helpers/reset-db.ts` | TRUNCATE between tests |
| `packages/db/test/helpers/db.ts` | Drizzle client de teste |
| `packages/db/test/schema/categories.test.ts` | Tests anti-ciclo, path, depth, slug |
| `packages/db/test/schema/stock-movement.test.ts` | Tests idempotência, delta, actor coherence, oversell |
| `packages/db/test/schema/api-keys.test.ts` | Tests scopes default, GIN query, allowedTags |
| `packages/db/test/schema/consent-log.test.ts` | Tests actor_coherence, helpers consent |
| `packages/db/test/scripts/seed-categories.test.ts` | Idempotência seed |
| `packages/db/test/scripts/anonymize-client.test.ts` | LGPD anonimização |
| `apps/web/src/lib/permissions.ts` | Capability enum + `can` + `requireCapability` |
| `apps/web/src/lib/consent.ts` | `logConsent`, `revokeConsent`, `getActiveConsent` |
| `apps/web/__tests__/permissions.test.ts` | Testes unit puro de matriz de capabilities |
| `apps/web/src/app/dashboard/categories/page.tsx` | Listagem flat com indent |
| `apps/web/src/app/dashboard/categories/new/page.tsx` | Form criar |
| `apps/web/src/app/dashboard/categories/[id]/edit/page.tsx` | Form editar |
| `apps/web/src/app/dashboard/categories/actions.ts` | CRUD server actions |
| `apps/web/src/app/dashboard/categories/_components/category-form.tsx` | Form colocated |
| `apps/web/src/app/dashboard/categories/schema.ts` | Zod schemas |

### Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `packages/db/package.json` | Adicionar deps vitest/execa + scripts test |
| `packages/db/src/schema/auth.ts` | `role` → pgEnum `user_role` |
| `packages/db/src/schema/inventory.ts` | check `quantity_non_negative` |
| `packages/db/src/schema/stock-movements.ts` | +`orderId`/`orderItemId`/`actorType`/`apiKeyId`, checks delta_non_zero + actor_coherence, indexes |
| `packages/db/src/schema/api-keys.ts` | +`scopes`/`allowedTags` + GIN |
| `packages/db/src/schema/tools.ts` | Remover `productType` table + `tool.productTypeId` + relations |
| `packages/db/src/index.ts` | Re-exports atualizados |
| `packages/db/CLAUDE.md` | Corrigir nota sobre barrel + adicionar apply-triggers |
| `apps/web/src/app/dashboard/(inventory)/tools/actions.ts` | requireCapability + tool_category persist |
| `apps/web/src/app/dashboard/(inventory)/tools/_components/tool-form.tsx` | Categorias multi + primary |
| `apps/web/src/app/dashboard/(inventory)/stock/actions.ts` | requireCapability + actorType/actorId em stockMovement |
| `apps/web/src/app/dashboard/(inventory)/promotions/actions.ts` | requireCapability |
| `apps/web/src/app/dashboard/branches/actions.ts` | requireCapability |
| `apps/web/src/app/dashboard/suppliers/actions.ts` | requireCapability |
| `apps/web/src/components/app-sidebar.tsx` | -Product Types, +Categorias |
| `apps/web/CLAUDE.md` | Adicionar seção Capabilities |
| `docs/integration/admin-ecommerce.md` | Distribuição cópia versionada + idempotência + actorType + escopos + LGPD |
| `.claude/CLAUDE.md` | Topologia atualizada |
| `turbo.json` | Adicionar task `test` |

### Arquivos removidos

- `apps/web/src/app/dashboard/product-types/` — toda a árvore (page, new, [id]/edit, actions, _components)
- `packages/db/src/migrations/0000_swift_martin_li.sql` — substituída por nova baseline na Etapa 4

---

## Tasks

### Task 1: Adicionar dependências vitest + execa

**Files:**
- Modify: `packages/db/package.json`

- [ ] **Step 1: Adicionar devDependencies**

Adicionar em `packages/db/package.json` na seção `devDependencies`:

```json
"devDependencies": {
  "@emach/config": "workspace:*",
  "@types/pg": "^8.16.0",
  "drizzle-kit": "^0.31.8",
  "execa": "^9.5.2",
  "typescript": "^5",
  "vitest": "^2.1.8"
}
```

E adicionar `scripts`:

```json
"scripts": {
  "db:push": "drizzle-kit push",
  "db:generate": "drizzle-kit generate",
  "db:studio": "drizzle-kit studio",
  "db:migrate": "drizzle-kit migrate",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:supabase:start": "supabase start --workdir .",
  "test:supabase:stop": "supabase stop --workdir ."
}
```

- [ ] **Step 2: Instalar dependências**

```bash
bun install
```

Expected: instalação termina sem erro; `node_modules/.bin/vitest` existe.

- [ ] **Step 3: Verificar typecheck ainda passa**

```bash
bun check-types
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/db/package.json bun.lock
git commit -m "chore(db): adiciona vitest + execa + scripts test"
```

---

### Task 2: Criar lib/permissions.ts (TDD com unit tests puros)

**Files:**
- Create: `apps/web/src/lib/permissions.ts`
- Test: `apps/web/__tests__/permissions.test.ts`
- Modify: `apps/web/package.json` (adicionar vitest se ainda não tiver)

- [ ] **Step 1: Adicionar vitest a apps/web/package.json**

```bash
bun add -D vitest --cwd apps/web
```

Expected: `apps/web/package.json` ganha `vitest` em devDependencies.

- [ ] **Step 2: Criar `apps/web/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
```

- [ ] **Step 3: Adicionar script test em apps/web/package.json**

Adicionar em `scripts`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Escrever teste falhando**

Criar `apps/web/__tests__/permissions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { can, type Capability } from "@/lib/permissions";

describe("can()", () => {
  it("admin tem todas as capabilities", () => {
    const caps: Capability[] = [
      "tools.delete", "branches.manage", "users.manage", "customers.delete",
      "orders.refund", "site.update_settings",
    ];
    for (const cap of caps) expect(can("admin", cap)).toBe(true);
  });

  it("manager tem orders.cancel mas não orders.refund? sim, tem ambos", () => {
    expect(can("manager", "orders.cancel")).toBe(true);
    expect(can("manager", "orders.refund")).toBe(true);
  });

  it("manager NÃO tem branches.manage / users.manage / customers.delete", () => {
    expect(can("manager", "branches.manage")).toBe(false);
    expect(can("manager", "users.manage")).toBe(false);
    expect(can("manager", "customers.delete")).toBe(false);
  });

  it("user (estoquista) tem stock.adjust + orders.update_status + orders.add_note", () => {
    expect(can("user", "stock.adjust")).toBe(true);
    expect(can("user", "orders.update_status")).toBe(true);
    expect(can("user", "orders.add_note")).toBe(true);
  });

  it("user NÃO tem orders.cancel / tools.create / customers.update_tags", () => {
    expect(can("user", "orders.cancel")).toBe(false);
    expect(can("user", "tools.create")).toBe(false);
    expect(can("user", "customers.update_tags")).toBe(false);
  });

  it("user tem todas as reads", () => {
    const reads: Capability[] = [
      "tools.read", "categories.read", "orders.read", "customers.read",
      "site.read", "reviews.read",
    ];
    for (const cap of reads) expect(can("user", cap)).toBe(true);
  });

  it("retorna false para role null/undefined/desconhecida", () => {
    expect(can(null, "tools.read")).toBe(false);
    expect(can(undefined, "tools.read")).toBe(false);
    // @ts-expect-error: role inválida
    expect(can("hacker", "tools.read")).toBe(false);
  });
});
```

- [ ] **Step 5: Rodar teste para confirmar falha**

```bash
bun test --cwd apps/web
```

Expected: FAIL com erro de import — `@/lib/permissions` não existe ainda.

- [ ] **Step 6: Implementar `apps/web/src/lib/permissions.ts`**

```ts
import { redirect } from "next/navigation";
import type { DashboardSession } from "@emach/auth/dashboard";
import type { UserRole } from "@emach/db/schema/auth";
import { requireCurrentSession } from "@/lib/session";

export type Capability =
  | "tools.read" | "tools.create" | "tools.update" | "tools.delete"
  | "categories.read" | "categories.manage"
  | "suppliers.read" | "suppliers.manage"
  | "branches.read" | "branches.manage"
  | "stock.read" | "stock.adjust"
  | "promotions.read" | "promotions.manage"
  | "orders.read" | "orders.update_status" | "orders.cancel" | "orders.refund" | "orders.add_note"
  | "customers.read" | "customers.update_tags" | "customers.update_status" | "customers.delete"
  | "leads.read" | "leads.manage"
  | "site.read" | "site.update_banners" | "site.update_settings" | "site.publish_announcements"
  | "reviews.read" | "reviews.moderate"
  | "users.manage" | "apikeys.manage" | "audit.read";

const ALL_CAPS: readonly Capability[] = [
  "tools.read", "tools.create", "tools.update", "tools.delete",
  "categories.read", "categories.manage",
  "suppliers.read", "suppliers.manage",
  "branches.read", "branches.manage",
  "stock.read", "stock.adjust",
  "promotions.read", "promotions.manage",
  "orders.read", "orders.update_status", "orders.cancel", "orders.refund", "orders.add_note",
  "customers.read", "customers.update_tags", "customers.update_status", "customers.delete",
  "leads.read", "leads.manage",
  "site.read", "site.update_banners", "site.update_settings", "site.publish_announcements",
  "reviews.read", "reviews.moderate",
  "users.manage", "apikeys.manage", "audit.read",
];

const USER_CAPS: readonly Capability[] = [
  "tools.read", "categories.read", "suppliers.read", "branches.read",
  "stock.read", "promotions.read",
  "orders.read", "customers.read", "leads.read",
  "site.read", "reviews.read",
  "stock.adjust",
  "orders.update_status", "orders.add_note",
];

const MANAGER_CAPS: readonly Capability[] = [
  ...USER_CAPS,
  "tools.create", "tools.update", "tools.delete",
  "categories.manage",
  "suppliers.manage",
  "promotions.manage",
  "orders.cancel", "orders.refund",
  "customers.update_tags", "customers.update_status",
  "leads.manage",
  "site.update_banners", "site.update_settings", "site.publish_announcements",
  "reviews.moderate",
  "audit.read",
];

const ROLE_CAPS: Record<UserRole, readonly Capability[]> = {
  admin: ALL_CAPS,
  manager: MANAGER_CAPS,
  user: USER_CAPS,
};

export function can(role: UserRole | null | undefined, cap: Capability): boolean {
  if (!role || !(role in ROLE_CAPS)) return false;
  return ROLE_CAPS[role].includes(cap);
}

export async function requireCapability(cap: Capability): Promise<DashboardSession> {
  const session = await requireCurrentSession();
  const role = session.user.role as UserRole | undefined;
  if (!can(role, cap)) {
    throw new Error(`Forbidden: capability "${cap}" requerida`);
  }
  return session;
}

export async function requireCapabilityOrRedirect(
  cap: Capability,
  redirectTo = "/dashboard",
): Promise<DashboardSession> {
  const session = await requireCurrentSession();
  if (!can(session.user.role as UserRole, cap)) redirect(redirectTo);
  return session;
}
```

- [ ] **Step 7: Rodar teste e validar que passa**

```bash
bun test --cwd apps/web
```

Expected: PASS, 7 testes passando.

- [ ] **Step 8: Commit**

```bash
git add apps/web/package.json apps/web/vitest.config.ts apps/web/__tests__/permissions.test.ts apps/web/src/lib/permissions.ts bun.lock
git commit -m "feat(web): adiciona lib/permissions.ts com capabilities + matriz roles"
```

---

### Task 3: Atualizar auth.ts com pgEnum user_role

**Files:**
- Modify: `packages/db/src/schema/auth.ts`

- [ ] **Step 1: Editar auth.ts**

Substituir os imports e a coluna `role`:

```ts
import { relations } from "drizzle-orm";
import { boolean, index, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["admin", "manager", "user"]);
export type UserRole = (typeof userRoleEnum.enumValues)[number];

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  role: userRoleEnum("role").notNull().default("user"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});
```

(restante do arquivo permanece — `session`, `account`, `verification`, relations).

- [ ] **Step 2: Validar typecheck**

```bash
bun check-types
```

Expected: exit 0. (Os imports já usam `UserRole`, agora vem do enum.)

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema/auth.ts
git commit -m "feat(db): converte user.role para pgEnum user_role"
```

---

### Task 4: Adicionar check quantity_non_negative em stockLevel

**Files:**
- Modify: `packages/db/src/schema/inventory.ts`

- [ ] **Step 1: Editar inventory.ts**

Localizar o array de constraints em `stockLevel`:

```ts
(table) => [
  primaryKey({ columns: [table.toolId, table.branchId] }),
  index("stock_level_tool_id_idx").on(table.toolId),
  index("stock_level_branch_id_idx").on(table.branchId),
  check("min_qty_non_negative", sql`${table.minQty} >= 0`),
  check("reorder_point_non_negative", sql`${table.reorderPoint} >= 0`),
  check("reorder_gte_min", sql`${table.reorderPoint} >= ${table.minQty}`),
  check("quantity_non_negative", sql`${table.quantity} >= 0`),
]
```

- [ ] **Step 2: Validar typecheck**

```bash
bun check-types
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema/inventory.ts
git commit -m "feat(db): adiciona check quantity_non_negative em stockLevel"
```

---

### Task 5: Atualizar stock-movements.ts (cols + checks + actor type)

**Files:**
- Modify: `packages/db/src/schema/stock-movements.ts`

- [ ] **Step 1: Reescrever stock-movements.ts**

```ts
import { relations, sql } from "drizzle-orm";
import { check, index, integer, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { apiKey } from "./api-keys";
import { user } from "./auth";
import { branch } from "./inventory";
import { tool } from "./tools";

export type StockMovementReason =
  | "entrada_compra"
  | "saida_venda"
  | "ajuste_inventario"
  | "perda"
  | "outro";

export const actorTypeEnum = pgEnum("actor_type", ["user", "apiKey", "system"]);
export type ActorType = (typeof actorTypeEnum.enumValues)[number];

export const stockMovement = pgTable(
  "stock_movement",
  {
    id: text("id").primaryKey(),
    toolId: text("tool_id").references(() => tool.id, { onDelete: "set null" }),
    branchId: text("branch_id").references(() => branch.id, { onDelete: "set null" }),
    previousQty: integer("previous_qty").notNull(),
    newQty: integer("new_qty").notNull(),
    delta: integer("delta").notNull(),
    reason: text("reason").$type<StockMovementReason>().notNull(),
    reasonNote: text("reason_note"),
    // referência ao pedido (Fase B cria as tabelas; aqui só prepara)
    orderId: text("order_id"),
    orderItemId: text("order_item_id"),
    // auditoria
    actorType: actorTypeEnum("actor_type").notNull().default("system"),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    apiKeyId: text("api_key_id").references(() => apiKey.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("stock_movement_tool_created_idx").on(table.toolId, table.createdAt.desc()),
    index("stock_movement_order_idx").on(table.orderId),
    index("stock_movement_actor_idx").on(table.actorType, table.actorId, table.apiKeyId),
    check("delta_non_zero", sql`${table.delta} <> 0`),
    check(
      "actor_coherence",
      sql`(
        (${table.actorType} = 'user'   AND ${table.actorId}   IS NOT NULL AND ${table.apiKeyId} IS NULL)
        OR (${table.actorType} = 'apiKey' AND ${table.apiKeyId} IS NOT NULL AND ${table.actorId} IS NULL)
        OR (${table.actorType} = 'system' AND ${table.actorId} IS NULL  AND ${table.apiKeyId} IS NULL)
      )`,
    ),
  ],
);

export const stockMovementRelations = relations(stockMovement, ({ one }) => ({
  tool: one(tool, { fields: [stockMovement.toolId], references: [tool.id] }),
  branch: one(branch, { fields: [stockMovement.branchId], references: [branch.id] }),
  actor: one(user, { fields: [stockMovement.actorId], references: [user.id] }),
  apiKey: one(apiKey, { fields: [stockMovement.apiKeyId], references: [apiKey.id] }),
}));

export type StockMovement = typeof stockMovement.$inferSelect;
export type NewStockMovement = typeof stockMovement.$inferInsert;
```

- [ ] **Step 2: Validar typecheck**

```bash
bun check-types
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema/stock-movements.ts
git commit -m "feat(db): stockMovement ganha orderId/orderItemId/actorType/checks"
```

---

### Task 6: Atualizar api-keys.ts (scopes + allowedTags + GIN)

**Files:**
- Modify: `packages/db/src/schema/api-keys.ts`

- [ ] **Step 1: Reescrever api-keys.ts**

```ts
import { relations, sql } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

export const apiKey = pgTable(
  "api_key",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    keyHash: text("key_hash").unique().notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    scopes: text("scopes").array().notNull().default(sql`'{}'::text[]`),
    allowedTags: text("allowed_tags").array().notNull().default(sql`'{}'::text[]`),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    revokedAt: timestamp("revoked_at"),
  },
  (table) => [
    index("api_key_key_hash_idx").on(table.keyHash),
    index("api_key_scopes_idx").using("gin", table.scopes),
  ],
);

export const apiKeyRelations = relations(apiKey, ({ one }) => ({
  user: one(user, { fields: [apiKey.userId], references: [user.id] }),
}));

export type ApiKey = typeof apiKey.$inferSelect;
export type NewApiKey = typeof apiKey.$inferInsert;
```

- [ ] **Step 2: Validar typecheck**

```bash
bun check-types
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema/api-keys.ts
git commit -m "feat(db): apiKey ganha scopes/allowedTags + GIN"
```

---

### Task 7: Criar categories.ts

**Files:**
- Create: `packages/db/src/schema/categories.ts`

- [ ] **Step 1: Criar arquivo**

```ts
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { tool } from "./tools";

export const category = pgTable(
  "category",
  {
    id: text("id").primaryKey(),
    slug: text("slug").unique().notNull(),
    name: text("name").notNull(),
    parentId: text("parent_id").references((): any => category.id, {
      onDelete: "restrict",
    }),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    description: text("description"),
    imageUrl: text("image_url"),
    path: text("path").notNull(),
    depth: integer("depth").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    check(
      "parent_neq_self",
      sql`${table.parentId} IS NULL OR ${table.parentId} <> ${table.id}`,
    ),
    check("depth_max_5", sql`${table.depth} >= 0 AND ${table.depth} <= 5`),
    index("category_parent_idx").on(table.parentId),
    index("category_path_idx").on(table.path),
  ],
);

export const toolCategory = pgTable(
  "tool_category",
  {
    toolId: text("tool_id")
      .notNull()
      .references(() => tool.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => category.id, { onDelete: "restrict" }),
    isPrimary: boolean("is_primary").notNull().default(false),
  },
  (table) => [
    primaryKey({ columns: [table.toolId, table.categoryId] }),
    uniqueIndex("tool_category_one_primary")
      .on(table.toolId)
      .where(sql`${table.isPrimary} = true`),
  ],
);

export const categoryRelations = relations(category, ({ one, many }) => ({
  parent: one(category, {
    fields: [category.parentId],
    references: [category.id],
    relationName: "parent",
  }),
  children: many(category, { relationName: "parent" }),
  tools: many(toolCategory),
}));

export const toolCategoryRelations = relations(toolCategory, ({ one }) => ({
  tool: one(tool, { fields: [toolCategory.toolId], references: [tool.id] }),
  category: one(category, {
    fields: [toolCategory.categoryId],
    references: [category.id],
  }),
}));

export type Category = typeof category.$inferSelect;
export type NewCategory = typeof category.$inferInsert;
export type ToolCategory = typeof toolCategory.$inferSelect;
export type NewToolCategory = typeof toolCategory.$inferInsert;
```

- [ ] **Step 2: Validar typecheck (vai falhar — `tool` ainda tem `productTypeId`)**

```bash
bun check-types
```

Expected: pode passar (categories.ts importa tool mas não toca productType). Confirmar exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema/categories.ts
git commit -m "feat(db): adiciona schema category + tool_category (M2M)"
```

---

### Task 8: Criar consent-log.ts

**Files:**
- Create: `packages/db/src/schema/consent-log.ts`

- [ ] **Step 1: Criar arquivo**

```ts
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { client } from "./client";

export const consentKindEnum = pgEnum("consent_kind", [
  "tos",
  "privacy",
  "marketing_email",
  "cookies",
]);
export type ConsentKind = (typeof consentKindEnum.enumValues)[number];

export const consentActorEnum = pgEnum("consent_actor", ["client", "lead"]);
export type ConsentActor = (typeof consentActorEnum.enumValues)[number];

export const consentLog = pgTable(
  "consent_log",
  {
    id: text("id").primaryKey(),
    actorType: consentActorEnum("actor_type").notNull(),
    clientId: text("client_id").references(() => client.id, {
      onDelete: "cascade",
    }),
    leadId: text("lead_id"), // FK na Fase C quando lead existir
    kind: consentKindEnum("kind").notNull(),
    granted: boolean("granted").notNull(),
    version: text("version").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    grantedAt: timestamp("granted_at").defaultNow().notNull(),
    revokedAt: timestamp("revoked_at"),
  },
  (table) => [
    check(
      "consent_actor_coherence",
      sql`(${table.actorType} = 'client' AND ${table.clientId} IS NOT NULL AND ${table.leadId} IS NULL)
        OR (${table.actorType} = 'lead' AND ${table.leadId} IS NOT NULL AND ${table.clientId} IS NULL)`,
    ),
    index("consent_log_client_idx").on(
      table.clientId,
      table.kind,
      table.grantedAt.desc(),
    ),
    index("consent_log_lead_idx").on(
      table.leadId,
      table.kind,
      table.grantedAt.desc(),
    ),
  ],
);

export const consentLogRelations = relations(consentLog, ({ one }) => ({
  client: one(client, {
    fields: [consentLog.clientId],
    references: [client.id],
  }),
}));

export type ConsentLog = typeof consentLog.$inferSelect;
export type NewConsentLog = typeof consentLog.$inferInsert;
```

- [ ] **Step 2: Validar typecheck**

```bash
bun check-types
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema/consent-log.ts
git commit -m "feat(db): adiciona schema consent_log (LGPD)"
```

---

### Task 9: Remover productType de tools.ts

**Files:**
- Modify: `packages/db/src/schema/tools.ts`

- [ ] **Step 1: Reescrever tools.ts (sem productType)**

```ts
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export type ToolStatus = "draft" | "active" | "discontinued" | "out_of_stock";

export const supplier = pgTable("supplier", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  contactEmail: text("contact_email"),
  phone: text("phone"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const tool = pgTable(
  "tool",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").unique(),
    description: text("description"),
    sku: text("sku").unique(),
    model: text("model"),
    invoiceModel: text("invoice_model"),
    status: text("status").$type<ToolStatus>().notNull().default("draft"),
    voltage: text("voltage"),
    powerWatts: integer("power_watts"),
    frequencyHz: integer("frequency_hz"),
    warrantyMonths: integer("warranty_months"),
    weightKg: numeric("weight_kg", { precision: 10, scale: 3 }),
    lengthCm: numeric("length_cm", { precision: 10, scale: 2 }),
    widthCm: numeric("width_cm", { precision: 10, scale: 2 }),
    heightCm: numeric("height_cm", { precision: 10, scale: 2 }),
    barcode: text("barcode").unique(),
    manufacturerName: text("manufacturer_name"),
    countryOfOrigin: text("country_of_origin"),
    hsCode: text("hs_code"),
    ncm: text("ncm"),
    cest: text("cest"),
    price: numeric("price", { precision: 10, scale: 2 }),
    cost: numeric("cost", { precision: 10, scale: 2 }),
    visibleOnSite: boolean("visible_on_site").notNull().default(true),
    supplierId: text("supplier_id").references(() => supplier.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("tool_supplier_id_idx").on(table.supplierId),
    index("tool_model_idx").on(table.model),
    index("tool_invoice_model_idx").on(table.invoiceModel),
    index("tool_ncm_idx").on(table.ncm),
    index("tool_status_idx").on(table.status),
    check(
      "valid_tool_status",
      sql`${table.status} IN ('draft','active','discontinued','out_of_stock')`,
    ),
    check(
      "weight_positive",
      sql`${table.weightKg} IS NULL OR ${table.weightKg} >= 0`,
    ),
    check(
      "dimensions_positive",
      sql`(${table.lengthCm} IS NULL OR ${table.lengthCm} >= 0) AND (${table.widthCm} IS NULL OR ${table.widthCm} >= 0) AND (${table.heightCm} IS NULL OR ${table.heightCm} >= 0)`,
    ),
    check(
      "power_watts_positive",
      sql`${table.powerWatts} IS NULL OR ${table.powerWatts} >= 0`,
    ),
    check(
      "frequency_hz_positive",
      sql`${table.frequencyHz} IS NULL OR ${table.frequencyHz} >= 0`,
    ),
    check(
      "warranty_months_positive",
      sql`${table.warrantyMonths} IS NULL OR ${table.warrantyMonths} >= 0`,
    ),
  ],
);

export const supplierRelations = relations(supplier, ({ many }) => ({
  tools: many(tool),
}));

export const toolImage = pgTable(
  "tool_image",
  {
    id: text("id").primaryKey(),
    toolId: text("tool_id")
      .notNull()
      .references(() => tool.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    sortOrder: integer("sort_order").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique("tool_image_tool_sort_unique").on(table.toolId, table.sortOrder),
    index("tool_image_tool_sort_idx").on(table.toolId, table.sortOrder),
  ],
);

export const toolRelations = relations(tool, ({ one, many }) => ({
  supplier: one(supplier, {
    fields: [tool.supplierId],
    references: [supplier.id],
  }),
  images: many(toolImage),
}));

export const toolImageRelations = relations(toolImage, ({ one }) => ({
  tool: one(tool, { fields: [toolImage.toolId], references: [tool.id] }),
}));

export type Supplier = typeof supplier.$inferSelect;
export type NewSupplier = typeof supplier.$inferInsert;
export type Tool = typeof tool.$inferSelect;
export type NewTool = typeof tool.$inferInsert;
export type ToolImage = typeof toolImage.$inferSelect;
export type NewToolImage = typeof toolImage.$inferInsert;
```

- [ ] **Step 2: Verificar typecheck (vai falhar em consumidores)**

```bash
bun check-types
```

Expected: FAIL — server actions/forms ainda referenciam `productType`/`productTypeId`. Será corrigido nas Tasks 19-22.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema/tools.ts
git commit -m "refactor(db): remove productType de tools.ts (substituido por category na Task 7)"
```

---

### Task 10: Atualizar db/index.ts (re-exports)

**Files:**
- Modify: `packages/db/src/index.ts`

- [ ] **Step 1: Reescrever index.ts**

```ts
import { env } from "@emach/env/server";
import { drizzle } from "drizzle-orm/node-postgres";

import { apiKey, apiKeyRelations } from "./schema/api-keys";
import {
  account,
  accountRelations,
  session,
  sessionRelations,
  user,
  userRelations,
} from "./schema/auth";
import {
  category,
  categoryRelations,
  toolCategory,
  toolCategoryRelations,
} from "./schema/categories";
import {
  client,
  clientAccount,
  clientAccountRelations,
  clientAddress,
  clientAddressRelations,
  clientRelations,
  clientSession,
  clientSessionRelations,
  clientVerification,
} from "./schema/client";
import { consentLog, consentLogRelations } from "./schema/consent-log";
import {
  branch,
  branchRelations,
  stockLevel,
  stockLevelRelations,
} from "./schema/inventory";
import {
  promotion,
  promotionRelations,
  promotionTool,
  promotionToolRelations,
} from "./schema/promotions";
import {
  stockMovement,
  stockMovementRelations,
} from "./schema/stock-movements";
import {
  supplier,
  supplierRelations,
  tool,
  toolImage,
  toolImageRelations,
  toolRelations,
} from "./schema/tools";

const schema = {
  account,
  accountRelations,
  apiKey,
  apiKeyRelations,
  branch,
  branchRelations,
  category,
  categoryRelations,
  client,
  clientAccount,
  clientAccountRelations,
  clientAddress,
  clientAddressRelations,
  clientRelations,
  clientSession,
  clientSessionRelations,
  clientVerification,
  consentLog,
  consentLogRelations,
  promotion,
  promotionRelations,
  promotionTool,
  promotionToolRelations,
  session,
  sessionRelations,
  stockLevel,
  stockLevelRelations,
  stockMovement,
  stockMovementRelations,
  supplier,
  supplierRelations,
  tool,
  toolCategory,
  toolCategoryRelations,
  toolImage,
  toolImageRelations,
  toolRelations,
  user,
  userRelations,
};

export function createDb() {
  return drizzle(env.DATABASE_URL, { schema });
}

export const db = createDb();
```

- [ ] **Step 2: Validar typecheck**

```bash
bun check-types
```

Expected: ainda falha em apps/web. OK.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/index.ts
git commit -m "refactor(db): index re-exports incluem category/consentLog, removem productType"
```

---

### Task 11: Atualizar packages/db/src/schema/index.ts barrel

**Files:**
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Atualizar barrel**

```ts
// biome-ignore lint/performance/noBarrelFile: intentional public API barrel for @emach/db schema consumers
export * from "./api-keys";
export * from "./auth";
export * from "./categories";
export * from "./client";
export * from "./consent-log";
export * from "./inventory";
export * from "./promotions";
export * from "./stock-movements";
export * from "./tools";
```

- [ ] **Step 2: Validar typecheck**

```bash
bun check-types
```

Expected: ainda falha em apps/web (esperado).

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema/index.ts
git commit -m "refactor(db): schema/index.ts barrel adiciona categories + consent-log"
```

---

### Task 12: Criar _triggers.sql + apply-triggers.ts

**Files:**
- Create: `packages/db/src/migrations/_triggers.sql`
- Create: `packages/db/scripts/apply-triggers.ts`

- [ ] **Step 1: Criar `packages/db/src/migrations/_triggers.sql`**

```sql
-- Trigger: prevent_category_cycle (anti-ciclo + path/depth materializados)
CREATE OR REPLACE FUNCTION prevent_category_cycle() RETURNS trigger AS $$
DECLARE
  cycle_found boolean;
  parent_path text;
  parent_depth integer;
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.depth := 0;
    NEW.path := '/' || NEW.slug;
    RETURN NEW;
  END IF;

  WITH RECURSIVE ancestors AS (
    SELECT id, parent_id, 1 AS hops FROM category WHERE id = NEW.parent_id
    UNION ALL
    SELECT c.id, c.parent_id, a.hops + 1
    FROM category c JOIN ancestors a ON c.id = a.parent_id
    WHERE a.hops < 10
  )
  SELECT EXISTS(SELECT 1 FROM ancestors WHERE id = NEW.id) INTO cycle_found;

  IF cycle_found THEN
    RAISE EXCEPTION 'category cycle detected for id %', NEW.id USING ERRCODE = 'P0001';
  END IF;

  SELECT path, depth INTO parent_path, parent_depth FROM category WHERE id = NEW.parent_id;
  NEW.path := parent_path || '/' || NEW.slug;
  NEW.depth := parent_depth + 1;

  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_category_cycle ON category;
CREATE TRIGGER trg_prevent_category_cycle
BEFORE INSERT OR UPDATE OF parent_id, slug ON category
FOR EACH ROW EXECUTE FUNCTION prevent_category_cycle();

-- Trigger AFTER: propaga path/depth para descendentes via re-trigger BEFORE no-op.
CREATE OR REPLACE FUNCTION cascade_category_path() RETURNS trigger AS $$
BEGIN
  IF NEW.path IS DISTINCT FROM OLD.path THEN
    UPDATE category SET parent_id = parent_id WHERE parent_id = NEW.id;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cascade_category_path ON category;
CREATE TRIGGER trg_cascade_category_path
AFTER UPDATE OF path ON category
FOR EACH ROW EXECUTE FUNCTION cascade_category_path();

-- Idempotência de débito de venda
CREATE UNIQUE INDEX IF NOT EXISTS stock_movement_sale_idempotency
ON stock_movement (order_item_id)
WHERE reason = 'saida_venda' AND order_item_id IS NOT NULL;
```

- [ ] **Step 2: Criar `packages/db/scripts/apply-triggers.ts`**

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Client } from "pg";
import { env } from "@emach/env/server";

async function main() {
  const sqlPath = resolve(import.meta.dir, "../src/migrations/_triggers.sql");
  const sql = readFileSync(sqlPath, "utf8");

  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(sql);
    console.log("[apply-triggers] OK");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[apply-triggers] FAIL", err);
  process.exit(1);
});
```

- [ ] **Step 3: Adicionar script a packages/db/package.json**

Adicionar em `scripts`:

```json
"db:apply-triggers": "bun run scripts/apply-triggers.ts"
```

- [ ] **Step 4: Validar typecheck**

```bash
bun check-types
```

Expected: ainda falha em apps/web (esperado).

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/migrations/_triggers.sql packages/db/scripts/apply-triggers.ts packages/db/package.json
git commit -m "feat(db): adiciona _triggers.sql + script apply-triggers"
```

---

### Task 13: Criar seed-categories.ts

**Files:**
- Create: `packages/db/scripts/seed-categories.ts`

- [ ] **Step 1: Criar arquivo**

```ts
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../src";
import { category } from "../src/schema/categories";

const ROOTS = [
  { slug: "ferramentas-eletricas", name: "Ferramentas Elétricas" },
  { slug: "ferramentas-manuais", name: "Ferramentas Manuais" },
  { slug: "acessorios", name: "Acessórios" },
  { slug: "pecas", name: "Peças" },
  { slug: "sem-categoria", name: "Sem Categoria" },
];

async function main() {
  for (const root of ROOTS) {
    await db
      .insert(category)
      .values({
        id: crypto.randomUUID(),
        slug: root.slug,
        name: root.name,
        parentId: null,
        sortOrder: 0,
        isActive: true,
        path: `/${root.slug}`,
        depth: 0,
      })
      .onConflictDoNothing({ target: category.slug });
  }

  const rows = await db.select({ slug: category.slug }).from(category);
  console.log("[seed-categories] OK", rows.map((r) => r.slug).join(", "));
}

main().catch((err) => {
  console.error("[seed-categories] FAIL", err);
  process.exit(1);
});
```

- [ ] **Step 2: Adicionar script ao package.json**

Adicionar em `scripts`:

```json
"db:seed-categories": "bun run scripts/seed-categories.ts"
```

- [ ] **Step 3: Commit**

```bash
git add packages/db/scripts/seed-categories.ts packages/db/package.json
git commit -m "feat(db): script seed-categories com 5 raizes idempotentes"
```

---

### Task 14: Criar anonymize-client.ts

**Files:**
- Create: `packages/db/scripts/anonymize-client.ts`

- [ ] **Step 1: Criar arquivo**

```ts
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../src";
import {
  client,
  clientAccount,
  clientAddress,
  clientSession,
} from "../src/schema/client";
import { consentLog } from "../src/schema/consent-log";

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error("uso: bun run scripts/anonymize-client.ts <client-id>");
    process.exit(1);
  }

  await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(client).where(eq(client.id, id));
    if (!existing) throw new Error(`client ${id} não encontrado`);

    const hash = crypto.createHash("sha256").update(id).digest("hex").slice(0, 12);
    const anonEmail = `deleted-${hash}@anonymized.local`;

    await tx
      .update(client)
      .set({
        name: "[anonymized]",
        email: anonEmail,
        emailVerified: false,
        phone: null,
        document: null,
        image: null,
      })
      .where(eq(client.id, id));

    await tx.delete(clientAddress).where(eq(clientAddress.clientId, id));
    await tx.delete(clientSession).where(eq(clientSession.userId, id));
    await tx.delete(clientAccount).where(eq(clientAccount.userId, id));

    await tx.insert(consentLog).values({
      id: crypto.randomUUID(),
      actorType: "client",
      clientId: id,
      kind: "privacy",
      granted: false,
      version: `anonymization-${new Date().toISOString().slice(0, 10)}`,
    });
  });

  console.log(`[anonymize-client] OK id=${id}`);
}

main().catch((err) => {
  console.error("[anonymize-client] FAIL", err);
  process.exit(1);
});
```

- [ ] **Step 2: Adicionar script ao package.json**

Adicionar em `scripts`:

```json
"db:anonymize-client": "bun run scripts/anonymize-client.ts"
```

- [ ] **Step 3: Commit**

```bash
git add packages/db/scripts/anonymize-client.ts packages/db/package.json
git commit -m "feat(db): script anonymize-client (LGPD direito ao esquecimento)"
```

---

### Task 15: Reset baseline migrations + db:push --force + apply-triggers + db:generate + seed

**Files:**
- Delete: `packages/db/src/migrations/0000_swift_martin_li.sql` (e qualquer outro arquivo da pasta)
- Modify (gerado): `packages/db/src/migrations/0000_<auto>.sql`

> **Atenção:** Esta task é destrutiva no banco de dev. Confirmar que prod está vazia (já confirmado no spec). Trabalhar em branch dedicada. Garantir que `apps/web/.env` aponta para banco de dev.

- [ ] **Step 1: Apagar migrations antigas**

```bash
rm -rf packages/db/src/migrations
```

(O diretório será recriado pelo `db:generate`. `_triggers.sql` será reposicionado ao final desta task.)

- [ ] **Step 2: Sincronizar schema TS no banco dev (drop+recreate)**

```bash
bun --cwd packages/db db:push --force
```

Expected: drizzle-kit imprime sumário de drops + creates; conclui sem erro.

- [ ] **Step 3: Aplicar triggers**

`_triggers.sql` foi apagado pelo Step 1. Re-criar agora (mesmo conteúdo da Task 12 Step 1).

```bash
mkdir -p packages/db/src/migrations
```

Recriar `packages/db/src/migrations/_triggers.sql` exatamente com o mesmo conteúdo da Task 12 Step 1 (anti-ciclo + cascade + partial unique).

- [ ] **Step 4: Aplicar triggers no banco**

```bash
bun --cwd packages/db db:apply-triggers
```

Expected: `[apply-triggers] OK`.

- [ ] **Step 5: Gerar baseline para staging/prod**

```bash
bun --cwd packages/db db:generate
```

Expected: cria `packages/db/src/migrations/0000_*.sql` refletindo todo o schema TS atual.

- [ ] **Step 6: Bootstrap categorias**

```bash
bun --cwd packages/db db:seed-categories
```

Expected: `[seed-categories] OK ferramentas-eletricas, ferramentas-manuais, acessorios, pecas, sem-categoria`.

- [ ] **Step 7: Smoke manual via psql ou Drizzle Studio**

```bash
bun --cwd packages/db db:studio
```

Verificar:
- Tabelas: `category`, `tool_category`, `consent_log` existem.
- `productType` **não existe**.
- `tool.product_type_id` **não existe**.
- `category` tem 5 raízes com `path` e `depth=0`.
- `stock_movement` tem colunas `order_id`, `order_item_id`, `actor_type`, `actor_id`, `api_key_id`.

- [ ] **Step 8: Commit**

```bash
git add packages/db/src/migrations
git commit -m "feat(db): reset baseline migrations + nova baseline limpa"
```

---

### Task 16: Criar consent.ts helper

**Files:**
- Create: `apps/web/src/lib/consent.ts`

- [ ] **Step 1: Criar arquivo**

```ts
import crypto from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@emach/db";
import { consentLog, type ConsentKind } from "@emach/db/schema/consent-log";

type ConsentInput = {
  actorType: "client" | "lead";
  clientId?: string;
  leadId?: string;
  kind: ConsentKind;
  granted: boolean;
  version: string;
  request: Request;
};

export async function logConsent(input: ConsentInput): Promise<void> {
  const ipAddress = input.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = input.request.headers.get("user-agent") ?? null;

  await db.insert(consentLog).values({
    id: crypto.randomUUID(),
    actorType: input.actorType,
    clientId: input.clientId,
    leadId: input.leadId,
    kind: input.kind,
    granted: input.granted,
    version: input.version,
    ipAddress,
    userAgent,
  });
}

export async function revokeConsent(args: {
  clientId: string;
  kind: ConsentKind;
}): Promise<void> {
  const [latest] = await db
    .select()
    .from(consentLog)
    .where(
      and(
        eq(consentLog.clientId, args.clientId),
        eq(consentLog.kind, args.kind),
        eq(consentLog.granted, true),
        isNull(consentLog.revokedAt),
      ),
    )
    .orderBy(desc(consentLog.grantedAt))
    .limit(1);

  if (!latest) return;
  await db
    .update(consentLog)
    .set({ revokedAt: new Date() })
    .where(eq(consentLog.id, latest.id));
}

export async function getActiveConsent(
  clientId: string,
  kind: ConsentKind,
): Promise<boolean> {
  const [row] = await db
    .select()
    .from(consentLog)
    .where(
      and(
        eq(consentLog.clientId, clientId),
        eq(consentLog.kind, kind),
        eq(consentLog.granted, true),
        isNull(consentLog.revokedAt),
      ),
    )
    .orderBy(desc(consentLog.grantedAt))
    .limit(1);

  return Boolean(row);
}
```

- [ ] **Step 2: Validar typecheck**

```bash
bun check-types
```

Expected: pode falhar em outros arquivos (productType refs); este arquivo deve compilar.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/consent.ts
git commit -m "feat(web): adiciona lib/consent.ts helpers LGPD"
```

---

### Task 17: Migrar requireRole → requireCapability em branches/actions.ts

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/actions.ts`

- [ ] **Step 1: Substituir imports e chamadas**

Em `branches/actions.ts`, trocar:

```ts
import { requireRole } from "@/lib/session";
// ...
await requireRole("admin");
```

por:

```ts
import { requireCapability } from "@/lib/permissions";
// ...
await requireCapability("branches.manage");
```

Aplicar em todas as actions do arquivo (createBranch, updateBranch, deleteBranch).

- [ ] **Step 2: Validar typecheck**

```bash
bun check-types
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/branches/actions.ts
git commit -m "refactor(web): branches actions usam requireCapability"
```

---

### Task 18: Migrar requireRole → requireCapability em suppliers/actions.ts

**Files:**
- Modify: `apps/web/src/app/dashboard/suppliers/actions.ts`

- [ ] **Step 1: Substituir como Task 17 mas com `suppliers.manage`**

Trocar todas as ocorrências de `requireRole("admin")` por `await requireCapability("suppliers.manage");` em `suppliers/actions.ts`. Atualizar o import.

- [ ] **Step 2: Validar typecheck**

```bash
bun check-types
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/suppliers/actions.ts
git commit -m "refactor(web): suppliers actions usam requireCapability"
```

---

### Task 19: Migrar requireRole → requireCapability em promotions/actions.ts

**Files:**
- Modify: `apps/web/src/app/dashboard/(inventory)/promotions/actions.ts`

- [ ] **Step 1: Substituir**

Trocar `requireRole("admin")` por `await requireCapability("promotions.manage");` em todas as actions de promotions.

- [ ] **Step 2: Validar typecheck**

```bash
bun check-types
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/\(inventory\)/promotions/actions.ts
git commit -m "refactor(web): promotions actions usam requireCapability"
```

---

### Task 20: Migrar stock/actions.ts (capability + actorType)

**Files:**
- Modify: `apps/web/src/app/dashboard/(inventory)/stock/actions.ts`

- [ ] **Step 1: Editar adjustStock**

Trocar `requireRole("admin")` por:

```ts
const session = await requireCapability("stock.adjust");
```

Em todas as inserções de `stockMovement`, garantir os campos:

```ts
await tx.insert(stockMovement).values({
  id: crypto.randomUUID(),
  toolId,
  branchId,
  previousQty,
  newQty,
  delta,
  reason,
  reasonNote,
  actorType: "user",
  actorId: session.user.id,
  // orderId/orderItemId só preenchidos quando vier de Order na Fase B
});
```

Atualizar imports.

- [ ] **Step 2: Validar typecheck**

```bash
bun check-types
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/\(inventory\)/stock/actions.ts
git commit -m "refactor(web): stock actions usam requireCapability + actorType"
```

---

### Task 21: Migrar tools/actions.ts + form (categories + capability)

**Files:**
- Modify: `apps/web/src/app/dashboard/(inventory)/tools/actions.ts`
- Modify: `apps/web/src/app/dashboard/(inventory)/tools/_components/tool-form.tsx`

- [ ] **Step 1: Atualizar tools/actions.ts**

Trocar:
- `await requireRole("admin")` em createTool/updateTool → `await requireCapability("tools.create")` ou `tools.update`.
- `await requireRole("admin")` em deleteTool → `await requireCapability("tools.delete")`.
- Remover toda referência a `productTypeId` no Zod schema, normalize, INSERT/UPDATE.
- Adicionar suporte a `categoryIds: string[]` + `primaryCategoryId: string` no Zod schema; em transação, após criar/atualizar `tool`, deletar `tool_category` da tool e re-inserir as linhas com `isPrimary` setado correto.

Exemplo de bloco para createTool:

```ts
const session = await requireCapability("tools.create");
// ... validação Zod inclui categoryIds + primaryCategoryId
await db.transaction(async (tx) => {
  await tx.insert(tool).values({ ... });
  if (categoryIds.length > 0) {
    await tx.insert(toolCategory).values(
      categoryIds.map((cid) => ({
        toolId: id,
        categoryId: cid,
        isPrimary: cid === primaryCategoryId,
      })),
    );
  }
});
```

E para updateTool:

```ts
await db.transaction(async (tx) => {
  await tx.update(tool).set({ ... }).where(eq(tool.id, id));
  await tx.delete(toolCategory).where(eq(toolCategory.toolId, id));
  if (categoryIds.length > 0) {
    await tx.insert(toolCategory).values(
      categoryIds.map((cid) => ({
        toolId: id,
        categoryId: cid,
        isPrimary: cid === primaryCategoryId,
      })),
    );
  }
});
```

- [ ] **Step 2: Atualizar tool-form.tsx**

Substituir o select de productType por:
- Lista de categorias buscada no Server Component pai (`page.tsx`) e passada como prop.
- Checkbox múltipla mostrando `name` + indent baseado em `depth`.
- Radio que define qual categoria é a principal (somente entre as marcadas).
- Default: mantém categorias atuais da tool em modo edit.

- [ ] **Step 3: Atualizar pages que renderizam tool-form**

Em `dashboard/(inventory)/tools/new/page.tsx` e `dashboard/(inventory)/tools/[id]/edit/page.tsx`, fazer o fetch de `category` (todos, ordenados por path) e passar para o form. Em edit, fetch também `tool_category` da tool.

- [ ] **Step 4: Validar typecheck**

```bash
bun check-types
```

Expected: ainda pode falhar se algum import órfão de productType permanecer. Resolver até zerar.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/\(inventory\)/tools
git commit -m "refactor(web): tools usam categories (M2M) + capability"
```

---

### Task 22: Remover dashboard/product-types/

**Files:**
- Delete: `apps/web/src/app/dashboard/product-types/` (toda a árvore)

- [ ] **Step 1: Listar arquivos e remover**

```bash
ls apps/web/src/app/dashboard/product-types
rm -rf apps/web/src/app/dashboard/product-types
```

- [ ] **Step 2: Validar typecheck**

```bash
bun check-types
```

Expected: exit 0 (todas as referências a productType já removidas em tasks anteriores).

- [ ] **Step 3: Commit**

```bash
git add -A apps/web/src/app/dashboard
git commit -m "refactor(web): remove rotas product-types (substituidas por categories)"
```

---

### Task 23: Criar dashboard/categories/ (CRUD básico)

**Files:**
- Create: `apps/web/src/app/dashboard/categories/page.tsx`
- Create: `apps/web/src/app/dashboard/categories/actions.ts`
- Create: `apps/web/src/app/dashboard/categories/schema.ts`
- Create: `apps/web/src/app/dashboard/categories/_components/category-form.tsx`
- Create: `apps/web/src/app/dashboard/categories/new/page.tsx`
- Create: `apps/web/src/app/dashboard/categories/[id]/edit/page.tsx`

- [ ] **Step 1: Criar `schema.ts`**

```ts
import { z } from "zod";

export const categoryInputSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/),
  parentId: z.string().nullable(),
  description: z.string().max(2000).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
});

export type CategoryInput = z.infer<typeof categoryInputSchema>;
```

- [ ] **Step 2: Criar `actions.ts`**

```ts
"use server";

import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@emach/db";
import { category, type Category } from "@emach/db/schema/categories";
import { requireCapability } from "@/lib/permissions";
import logger from "@/lib/logger";
import { categoryInputSchema } from "./schema";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function createCategory(input: unknown): Promise<ActionResult<{ id: string }>> {
  await requireCapability("categories.manage");
  const parsed = categoryInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validação falhou" };

  try {
    const id = crypto.randomUUID();
    await db.insert(category).values({
      id,
      slug: parsed.data.slug,
      name: parsed.data.name,
      parentId: parsed.data.parentId ?? null,
      description: parsed.data.description ?? null,
      imageUrl: parsed.data.imageUrl ?? null,
      isActive: parsed.data.isActive,
      sortOrder: parsed.data.sortOrder,
      // path e depth são preenchidos pelo trigger
      path: "/" + parsed.data.slug,
      depth: 0,
    });
    revalidatePath("/dashboard/categories");
    return { ok: true, data: { id } };
  } catch (e) {
    logger.error({ err: e }, "createCategory falhou");
    if (e instanceof Error && e.message.includes("category cycle")) {
      return { ok: false, error: "Operação criaria um ciclo na árvore" };
    }
    return { ok: false, error: "Erro ao criar categoria" };
  }
}

export async function updateCategory(id: string, input: unknown): Promise<ActionResult> {
  await requireCapability("categories.manage");
  const parsed = categoryInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Validação falhou" };

  try {
    await db
      .update(category)
      .set({
        slug: parsed.data.slug,
        name: parsed.data.name,
        parentId: parsed.data.parentId ?? null,
        description: parsed.data.description ?? null,
        imageUrl: parsed.data.imageUrl ?? null,
        isActive: parsed.data.isActive,
        sortOrder: parsed.data.sortOrder,
      })
      .where(eq(category.id, id));
    revalidatePath("/dashboard/categories");
    return { ok: true, data: undefined };
  } catch (e) {
    logger.error({ err: e }, "updateCategory falhou");
    if (e instanceof Error && e.message.includes("category cycle")) {
      return { ok: false, error: "Operação criaria um ciclo na árvore" };
    }
    return { ok: false, error: "Erro ao atualizar categoria" };
  }
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  await requireCapability("categories.manage");
  try {
    await db.delete(category).where(eq(category.id, id));
    revalidatePath("/dashboard/categories");
    return { ok: true, data: undefined };
  } catch (e) {
    logger.error({ err: e }, "deleteCategory falhou");
    if (e instanceof Error && e.message.includes("foreign key")) {
      return { ok: false, error: "Categoria possui filhos ou produtos vinculados" };
    }
    return { ok: false, error: "Erro ao excluir categoria" };
  }
}

export async function listCategories(): Promise<Category[]> {
  return await db.select().from(category).orderBy(category.path);
}
```

- [ ] **Step 3: Criar `_components/category-form.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import { Textarea } from "@emach/ui/components/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@emach/ui/components/select";
import { Switch } from "@emach/ui/components/switch";
import type { Category } from "@emach/db/schema/categories";
import { toast } from "sonner";

type Props = {
  mode: "create" | "edit";
  initial?: Partial<Category>;
  categories: Category[];
  onSubmit: (data: FormData) => Promise<{ ok: boolean; error?: string }>;
};

export function CategoryForm({ mode, initial, categories, onSubmit }: Props) {
  const [pending, setPending] = useState(false);

  return (
    <form
      action={async (formData) => {
        setPending(true);
        const res = await onSubmit(formData);
        setPending(false);
        if (!res.ok) toast.error(res.error ?? "Erro");
        else toast.success(mode === "create" ? "Categoria criada" : "Categoria atualizada");
      }}
      className="grid gap-4 max-w-xl"
    >
      <div>
        <Label htmlFor="name">Nome</Label>
        <Input id="name" name="name" defaultValue={initial?.name ?? ""} required />
      </div>
      <div>
        <Label htmlFor="slug">Slug</Label>
        <Input id="slug" name="slug" defaultValue={initial?.slug ?? ""} pattern="[a-z0-9\-]+" required />
      </div>
      <div>
        <Label htmlFor="parentId">Categoria pai</Label>
        <Select name="parentId" defaultValue={initial?.parentId ?? ""}>
          <SelectTrigger><SelectValue placeholder="Nenhuma (raiz)" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">Nenhuma (raiz)</SelectItem>
            {categories
              .filter((c) => c.id !== initial?.id)
              .map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {"—".repeat(c.depth)} {c.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="description">Descrição</Label>
        <Textarea id="description" name="description" defaultValue={initial?.description ?? ""} />
      </div>
      <div>
        <Label htmlFor="imageUrl">Image URL</Label>
        <Input id="imageUrl" name="imageUrl" type="url" defaultValue={initial?.imageUrl ?? ""} />
      </div>
      <div className="flex items-center gap-2">
        <Switch id="isActive" name="isActive" defaultChecked={initial?.isActive ?? true} />
        <Label htmlFor="isActive">Ativa</Label>
      </div>
      <div>
        <Label htmlFor="sortOrder">Ordem</Label>
        <Input id="sortOrder" name="sortOrder" type="number" min={0} defaultValue={initial?.sortOrder ?? 0} />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Salvando..." : mode === "create" ? "Criar" : "Atualizar"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Criar `page.tsx` (listagem)**

```tsx
import Link from "next/link";
import { Button } from "@emach/ui/components/button";
import { requireCapabilityOrRedirect } from "@/lib/permissions";
import { listCategories } from "./actions";

export default async function CategoriesPage() {
  await requireCapabilityOrRedirect("categories.read");
  const categories = await listCategories();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium">Categorias</h1>
        <Button asChild><Link href="/dashboard/categories/new">Nova categoria</Link></Button>
      </div>
      <ul className="divide-y rounded-md border">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center justify-between px-4 py-3">
            <span style={{ paddingLeft: c.depth * 16 }}>
              {c.depth > 0 && "└ "}
              {c.name} <span className="text-muted-foreground text-xs">/{c.slug}</span>
            </span>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/dashboard/categories/${c.id}/edit`}>Editar</Link>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: Criar `new/page.tsx`**

```tsx
import { requireCapabilityOrRedirect } from "@/lib/permissions";
import { createCategory, listCategories } from "../actions";
import { CategoryForm } from "../_components/category-form";

export default async function NewCategoryPage() {
  await requireCapabilityOrRedirect("categories.manage");
  const categories = await listCategories();

  async function handleSubmit(formData: FormData) {
    "use server";
    const data = {
      name: String(formData.get("name") ?? ""),
      slug: String(formData.get("slug") ?? ""),
      parentId: (formData.get("parentId") || null) as string | null,
      description: String(formData.get("description") ?? "") || null,
      imageUrl: String(formData.get("imageUrl") ?? "") || null,
      isActive: formData.get("isActive") === "on",
      sortOrder: Number(formData.get("sortOrder") ?? 0),
    };
    return createCategory(data);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-medium">Nova categoria</h1>
      <CategoryForm mode="create" categories={categories} onSubmit={handleSubmit} />
    </div>
  );
}
```

- [ ] **Step 6: Criar `[id]/edit/page.tsx`**

```tsx
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@emach/db";
import { category } from "@emach/db/schema/categories";
import { requireCapabilityOrRedirect } from "@/lib/permissions";
import { listCategories, updateCategory } from "../../actions";
import { CategoryForm } from "../../_components/category-form";

export default async function EditCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCapabilityOrRedirect("categories.manage");
  const { id } = await params;
  const [existing] = await db.select().from(category).where(eq(category.id, id));
  if (!existing) notFound();

  const categories = await listCategories();

  async function handleSubmit(formData: FormData) {
    "use server";
    const data = {
      name: String(formData.get("name") ?? ""),
      slug: String(formData.get("slug") ?? ""),
      parentId: (formData.get("parentId") || null) as string | null,
      description: String(formData.get("description") ?? "") || null,
      imageUrl: String(formData.get("imageUrl") ?? "") || null,
      isActive: formData.get("isActive") === "on",
      sortOrder: Number(formData.get("sortOrder") ?? 0),
    };
    return updateCategory(id, data);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-medium">Editar categoria</h1>
      <CategoryForm mode="edit" initial={existing} categories={categories} onSubmit={handleSubmit} />
    </div>
  );
}
```

- [ ] **Step 7: Validar typecheck**

```bash
bun check-types
```

Expected: exit 0.

- [ ] **Step 8: Smoke manual**

```bash
bun dev:web
```

Acessar `http://localhost:3001/dashboard/categories`. Criar categoria filha → ver path correto. Tentar criar com slug duplicado → erro.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/app/dashboard/categories
git commit -m "feat(web): adiciona CRUD basico de categorias"
```

---

### Task 24: Atualizar app-sidebar.tsx

**Files:**
- Modify: `apps/web/src/components/app-sidebar.tsx`

- [ ] **Step 1: Localizar entrada Product Types**

Abrir `apps/web/src/components/app-sidebar.tsx` e remover a entrada que aponta para `/dashboard/product-types`. Adicionar entrada apontando para `/dashboard/categories` com label "Categorias".

- [ ] **Step 2: Validar typecheck**

```bash
bun check-types
```

- [ ] **Step 3: Smoke manual**

```bash
bun dev:web
```

Verificar sidebar — "Product Types" sumiu, "Categorias" apareceu.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/app-sidebar.tsx
git commit -m "refactor(web): sidebar substitui Product Types por Categorias"
```

---

### Task 25: Setup vitest em packages/db (config + helpers)

**Files:**
- Create: `packages/db/vitest.config.ts`
- Create: `packages/db/test/setup.ts`
- Create: `packages/db/test/helpers/reset-db.ts`
- Create: `packages/db/test/helpers/db.ts`

> **Pré-requisito:** Supabase CLI instalada localmente. Verificar com `supabase --version`. Se não tiver, instalar antes.

- [ ] **Step 1: Criar `packages/db/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./test/setup.ts"],
    setupFiles: ["./test/helpers/reset-db.ts"],
    sequence: { hooks: "stack" },
    pool: "forks",
    fileParallelism: false,
    testTimeout: 15_000,
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL_TEST ??
        "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    },
  },
});
```

- [ ] **Step 2: Criar `packages/db/test/setup.ts`**

```ts
import { execa } from "execa";

export async function setup() {
  // Verifica se Supabase local já roda; se não, sobe.
  const status = await execa("supabase", ["status", "--workdir", "."], { reject: false });
  const running = status.stdout?.includes("API URL") && status.stdout?.includes("DB URL");

  if (!running) {
    await execa("supabase", ["start", "--workdir", "."]);
  }

  // Sincroniza schema
  await execa("bun", ["run", "db:push", "--", "--force"]);
  // Aplica triggers
  await execa("bun", ["run", "db:apply-triggers"]);
}

export async function teardown() {
  // Não derruba Supabase entre runs (lento). Operador derruba via test:supabase:stop.
}
```

- [ ] **Step 3: Criar `packages/db/test/helpers/db.ts`**

```ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";

const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const client = new Client({ connectionString: url });
let connected = false;

export async function getTestDb() {
  if (!connected) {
    await client.connect();
    connected = true;
  }
  return { db: drizzle(client), client };
}
```

- [ ] **Step 4: Criar `packages/db/test/helpers/reset-db.ts`**

```ts
import { sql } from "drizzle-orm";
import { afterEach } from "vitest";
import { getTestDb } from "./db";

afterEach(async () => {
  const { db } = await getTestDb();
  await db.execute(sql`
    TRUNCATE
      consent_log, tool_category, tool_image, tool, category,
      stock_movement, stock_level, branch, supplier,
      promotion_tool, promotion,
      api_key, account, session, verification, "user",
      client_address, client_account, client_session, client_verification, client
    RESTART IDENTITY CASCADE
  `);
});
```

- [ ] **Step 5: Validar typecheck**

```bash
bun check-types
```

- [ ] **Step 6: Subir Supabase + testar smoke**

```bash
bun --cwd packages/db test:supabase:start
bun --cwd packages/db test
```

Expected: `No tests found` (suíte vazia ainda). Setup global executa: `db:push --force` + `apply-triggers`. Sem erro.

- [ ] **Step 7: Commit**

```bash
git add packages/db/vitest.config.ts packages/db/test
git commit -m "test(db): adiciona infra vitest com Supabase local"
```

---

### Task 26: Testes de schema — categories

**Files:**
- Create: `packages/db/test/schema/categories.test.ts`

- [ ] **Step 1: Escrever testes**

```ts
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { category } from "../../src/schema/categories";
import { getTestDb } from "../helpers/db";

async function insertCat(name: string, slug: string, parentId: string | null = null) {
  const { db } = await getTestDb();
  const id = crypto.randomUUID();
  await db.insert(category).values({
    id, slug, name, parentId,
    sortOrder: 0, isActive: true,
    path: parentId ? "" : `/${slug}`,
    depth: 0,
  });
  return id;
}

describe("category schema", () => {
  it("raiz: trigger calcula path e depth=0", async () => {
    const { db } = await getTestDb();
    const id = await insertCat("Elétricas", "eletricas");
    const [row] = await db.select().from(category).where(sql`id = ${id}`);
    expect(row?.path).toBe("/eletricas");
    expect(row?.depth).toBe(0);
  });

  it("filho: herda path do pai", async () => {
    const { db } = await getTestDb();
    const parent = await insertCat("Elétricas", "eletricas");
    const child = await insertCat("Furadeiras", "furadeiras", parent);
    const [row] = await db.select().from(category).where(sql`id = ${child}`);
    expect(row?.path).toBe("/eletricas/furadeiras");
    expect(row?.depth).toBe(1);
  });

  it("parent_neq_self: rejeita self-parent", async () => {
    const { db } = await getTestDb();
    const id = crypto.randomUUID();
    await expect(
      db.insert(category).values({
        id, slug: "x", name: "X", parentId: id, sortOrder: 0, isActive: true, path: "", depth: 0,
      }),
    ).rejects.toThrow();
  });

  it("ciclo: A→B→C; UPDATE A.parent=C lança exception", async () => {
    const { db } = await getTestDb();
    const a = await insertCat("A", "a");
    const b = await insertCat("B", "b", a);
    const c = await insertCat("C", "c", b);
    await expect(
      db.execute(sql`UPDATE category SET parent_id = ${c} WHERE id = ${a}`),
    ).rejects.toThrow(/category cycle/);
  });

  it("depth_max_5: rejeita 6 níveis", async () => {
    let parent: string | null = null;
    for (let i = 0; i < 5; i++) {
      parent = await insertCat(`L${i}`, `l${i}`, parent);
    }
    // Tentar 6º nível deve falhar pelo check depth_max_5
    await expect(insertCat("L6", "l6", parent)).rejects.toThrow();
  });

  it("slug único", async () => {
    await insertCat("X", "duplicada");
    await expect(insertCat("Y", "duplicada")).rejects.toThrow();
  });

  it("AFTER cascade: mover A com filhos propaga path", async () => {
    const { db } = await getTestDb();
    const root1 = await insertCat("Root1", "root1");
    const root2 = await insertCat("Root2", "root2");
    const a = await insertCat("A", "a", root1);
    const b = await insertCat("B", "b", a);

    // Move A para Root2
    await db.execute(sql`UPDATE category SET parent_id = ${root2} WHERE id = ${a}`);

    const [updatedB] = await db.select().from(category).where(sql`id = ${b}`);
    expect(updatedB?.path).toBe("/root2/a/b");
    expect(updatedB?.depth).toBe(2);
  });
});
```

- [ ] **Step 2: Rodar e validar**

```bash
bun --cwd packages/db test categories
```

Expected: PASS — 7 testes.

- [ ] **Step 3: Commit**

```bash
git add packages/db/test/schema/categories.test.ts
git commit -m "test(db): cobertura schema category (anti-ciclo, path, depth, cascade)"
```

---

### Task 27: Testes de schema — stock-movement

**Files:**
- Create: `packages/db/test/schema/stock-movement.test.ts`

- [ ] **Step 1: Escrever testes**

```ts
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { user } from "../../src/schema/auth";
import { branch, stockLevel } from "../../src/schema/inventory";
import { stockMovement } from "../../src/schema/stock-movements";
import { tool } from "../../src/schema/tools";
import { getTestDb } from "../helpers/db";

async function seedBaseline() {
  const { db } = await getTestDb();
  const userId = crypto.randomUUID();
  const branchId = crypto.randomUUID();
  const toolId = crypto.randomUUID();
  await db.insert(user).values({
    id: userId, name: "U", email: `u-${userId.slice(0, 6)}@x.com`,
  });
  await db.insert(branch).values({ id: branchId, name: "B" });
  await db.insert(tool).values({ id: toolId, name: "T", status: "active" });
  await db.insert(stockLevel).values({ toolId, branchId, quantity: 10, minQty: 0, reorderPoint: 0 });
  return { userId, branchId, toolId };
}

describe("stock_movement", () => {
  it("delta=0 rejeitado", async () => {
    const { db } = await getTestDb();
    const { userId, branchId, toolId } = await seedBaseline();
    await expect(
      db.insert(stockMovement).values({
        id: crypto.randomUUID(),
        toolId, branchId,
        previousQty: 10, newQty: 10, delta: 0,
        reason: "ajuste_inventario",
        actorType: "user", actorId: userId,
      }),
    ).rejects.toThrow(/delta_non_zero/);
  });

  it("idempotência: 1 saida_venda OK, 2ª rejeitada para mesmo orderItemId", async () => {
    const { db } = await getTestDb();
    const { userId, branchId, toolId } = await seedBaseline();
    const orderId = crypto.randomUUID();
    const orderItemId = crypto.randomUUID();
    await db.insert(stockMovement).values({
      id: crypto.randomUUID(),
      toolId, branchId,
      previousQty: 10, newQty: 8, delta: -2,
      reason: "saida_venda",
      orderId, orderItemId,
      actorType: "user", actorId: userId,
    });
    await expect(
      db.insert(stockMovement).values({
        id: crypto.randomUUID(),
        toolId, branchId,
        previousQty: 8, newQty: 6, delta: -2,
        reason: "saida_venda",
        orderId, orderItemId,
        actorType: "user", actorId: userId,
      }),
    ).rejects.toThrow();
  });

  it("ajustes com orderItemId NULL: múltiplos OK", async () => {
    const { db } = await getTestDb();
    const { userId, branchId, toolId } = await seedBaseline();
    const insert = (delta: number) =>
      db.insert(stockMovement).values({
        id: crypto.randomUUID(),
        toolId, branchId,
        previousQty: 10, newQty: 10 + delta, delta,
        reason: "ajuste_inventario",
        actorType: "user", actorId: userId,
      });
    await insert(-1);
    await insert(-1);
    const rows = await db.select().from(stockMovement);
    expect(rows.length).toBe(2);
  });

  it("actor_coherence: actorType=user sem actorId é rejeitado", async () => {
    const { db } = await getTestDb();
    const { branchId, toolId } = await seedBaseline();
    await expect(
      db.insert(stockMovement).values({
        id: crypto.randomUUID(),
        toolId, branchId,
        previousQty: 10, newQty: 9, delta: -1,
        reason: "ajuste_inventario",
        actorType: "user", actorId: null,
      }),
    ).rejects.toThrow(/actor_coherence/);
  });

  it("stock_level.quantity = -1 rejeitado", async () => {
    const { db } = await getTestDb();
    const { branchId, toolId } = await seedBaseline();
    await expect(
      db.execute(sql`UPDATE stock_level SET quantity = -1 WHERE tool_id = ${toolId} AND branch_id = ${branchId}`),
    ).rejects.toThrow(/quantity_non_negative/);
  });
});
```

- [ ] **Step 2: Rodar e validar**

```bash
bun --cwd packages/db test stock-movement
```

Expected: PASS — 5 testes.

- [ ] **Step 3: Commit**

```bash
git add packages/db/test/schema/stock-movement.test.ts
git commit -m "test(db): cobertura idempotencia + actor_coherence + delta + oversell"
```

---

### Task 28: Testes de schema — api-keys + consent-log

**Files:**
- Create: `packages/db/test/schema/api-keys.test.ts`
- Create: `packages/db/test/schema/consent-log.test.ts`

- [ ] **Step 1: Escrever `api-keys.test.ts`**

```ts
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { user } from "../../src/schema/auth";
import { apiKey } from "../../src/schema/api-keys";
import { getTestDb } from "../helpers/db";

async function seedUser() {
  const { db } = await getTestDb();
  const id = crypto.randomUUID();
  await db.insert(user).values({ id, name: "U", email: `u-${id.slice(0, 6)}@x.com` });
  return id;
}

describe("api_key", () => {
  it("scopes default vazio", async () => {
    const { db } = await getTestDb();
    const userId = await seedUser();
    const id = crypto.randomUUID();
    await db.insert(apiKey).values({ id, name: "k", keyHash: id, userId });
    const [row] = await db.select().from(apiKey).where(sql`id = ${id}`);
    expect(row?.scopes).toEqual([]);
    expect(row?.allowedTags).toEqual([]);
  });

  it("GIN permite query scopes @> ARRAY['revalidate']", async () => {
    const { db } = await getTestDb();
    const userId = await seedUser();
    await db.insert(apiKey).values({
      id: crypto.randomUUID(),
      name: "k1", keyHash: "h1", userId,
      scopes: ["revalidate"],
    });
    await db.insert(apiKey).values({
      id: crypto.randomUUID(),
      name: "k2", keyHash: "h2", userId,
      scopes: ["other"],
    });
    const matches = await db.execute<{ count: number }>(sql`
      SELECT count(*)::int as count FROM api_key WHERE scopes @> ARRAY['revalidate']
    `);
    expect(Number(matches.rows[0]?.count)).toBe(1);
  });

  it("allowedTags aceita glob", async () => {
    const { db } = await getTestDb();
    const userId = await seedUser();
    const id = crypto.randomUUID();
    await db.insert(apiKey).values({
      id, name: "k", keyHash: id, userId,
      allowedTags: ["orders", "order:*", "customer:*"],
    });
    const [row] = await db.select().from(apiKey).where(sql`id = ${id}`);
    expect(row?.allowedTags).toContain("order:*");
  });
});
```

- [ ] **Step 2: Escrever `consent-log.test.ts`**

```ts
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { client } from "../../src/schema/client";
import { consentLog } from "../../src/schema/consent-log";
import { getTestDb } from "../helpers/db";

async function seedClient() {
  const { db } = await getTestDb();
  const id = crypto.randomUUID();
  await db.insert(client).values({ id, name: "C", email: `c-${id.slice(0, 6)}@x.com` });
  return id;
}

describe("consent_log", () => {
  it("actor_coherence: client+lead simultâneos rejeitado", async () => {
    const { db } = await getTestDb();
    const clientId = await seedClient();
    await expect(
      db.insert(consentLog).values({
        id: crypto.randomUUID(),
        actorType: "client",
        clientId,
        leadId: crypto.randomUUID(),
        kind: "tos",
        granted: true,
        version: "v1",
      }),
    ).rejects.toThrow(/consent_actor_coherence/);
  });

  it("insere e lê granted=true", async () => {
    const { db } = await getTestDb();
    const clientId = await seedClient();
    const id = crypto.randomUUID();
    await db.insert(consentLog).values({
      id, actorType: "client", clientId,
      kind: "tos", granted: true, version: "v1",
    });
    const [row] = await db.select().from(consentLog).where(sql`id = ${id}`);
    expect(row?.granted).toBe(true);
    expect(row?.revokedAt).toBeNull();
  });

  it("revoke marca revokedAt na linha mais recente", async () => {
    const { db } = await getTestDb();
    const clientId = await seedClient();
    await db.insert(consentLog).values({
      id: crypto.randomUUID(), actorType: "client", clientId,
      kind: "marketing_email", granted: true, version: "v1",
    });
    // Simula revoke
    const { revokeConsent } = await import("../../../../apps/web/src/lib/consent");
    await revokeConsent({ clientId, kind: "marketing_email" });
    const [row] = await db.select().from(consentLog).where(sql`client_id = ${clientId}`);
    expect(row?.revokedAt).not.toBeNull();
  });
});
```

> **Nota:** o teste de revoke importa `lib/consent.ts` cross-package. Se imports relativos quebrarem, mover esse caso para `apps/web/__tests__/consent.test.ts` mais tarde. Para Fase A, este teste valida via path relativo.

- [ ] **Step 3: Rodar e validar**

```bash
bun --cwd packages/db test api-keys
bun --cwd packages/db test consent-log
```

Expected: PASS — 3+3 testes.

- [ ] **Step 4: Commit**

```bash
git add packages/db/test/schema/api-keys.test.ts packages/db/test/schema/consent-log.test.ts
git commit -m "test(db): cobertura schema api_key (scopes/GIN) + consent_log"
```

---

### Task 29: Testes de scripts — seed-categories + anonymize-client

**Files:**
- Create: `packages/db/test/scripts/seed-categories.test.ts`
- Create: `packages/db/test/scripts/anonymize-client.test.ts`

- [ ] **Step 1: Escrever `seed-categories.test.ts`**

```ts
import { execa } from "execa";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { category } from "../../src/schema/categories";
import { getTestDb } from "../helpers/db";

describe("seed-categories.ts", () => {
  it("DB vazio: cria 5 raízes", async () => {
    const { db } = await getTestDb();
    await execa("bun", ["run", "scripts/seed-categories.ts"]);
    const rows = await db.select().from(category);
    expect(rows.length).toBe(5);
    const slugs = rows.map((r) => r.slug).sort();
    expect(slugs).toEqual([
      "acessorios", "ferramentas-eletricas", "ferramentas-manuais",
      "pecas", "sem-categoria",
    ]);
  });

  it("idempotente: rodar 2x não duplica", async () => {
    const { db } = await getTestDb();
    await execa("bun", ["run", "scripts/seed-categories.ts"]);
    await execa("bun", ["run", "scripts/seed-categories.ts"]);
    const rows = await db.select().from(category);
    expect(rows.length).toBe(5);
  });

  it("paths e depth corretos", async () => {
    const { db } = await getTestDb();
    await execa("bun", ["run", "scripts/seed-categories.ts"]);
    const rows = await db.select().from(category).orderBy(category.slug);
    for (const row of rows) {
      expect(row.depth).toBe(0);
      expect(row.path).toBe(`/${row.slug}`);
    }
  });
});
```

- [ ] **Step 2: Escrever `anonymize-client.test.ts`**

```ts
import crypto from "node:crypto";
import { execa } from "execa";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  client, clientAccount, clientAddress, clientSession,
} from "../../src/schema/client";
import { consentLog } from "../../src/schema/consent-log";
import { getTestDb } from "../helpers/db";

async function seedFullClient() {
  const { db } = await getTestDb();
  const id = crypto.randomUUID();
  await db.insert(client).values({
    id, name: "Real Name", email: `real-${id.slice(0, 6)}@x.com`,
    phone: "+5511999999999", document: "12345678900", emailVerified: true,
  });
  await db.insert(clientAddress).values({
    id: crypto.randomUUID(),
    clientId: id, recipient: "R", zipCode: "01000-000",
    street: "Rua X", number: "1", neighborhood: "C", city: "SP", state: "SP",
  });
  return id;
}

describe("anonymize-client.ts", () => {
  it("zera dados PII e mantém id", async () => {
    const { db } = await getTestDb();
    const id = await seedFullClient();
    await execa("bun", ["run", "scripts/anonymize-client.ts", id]);

    const [row] = await db.select().from(client).where(eq(client.id, id));
    expect(row?.id).toBe(id);
    expect(row?.name).toBe("[anonymized]");
    expect(row?.email).toMatch(/^deleted-[a-f0-9]{12}@anonymized\.local$/);
    expect(row?.phone).toBeNull();
    expect(row?.document).toBeNull();
    expect(row?.emailVerified).toBe(false);

    const addresses = await db.select().from(clientAddress).where(eq(clientAddress.clientId, id));
    expect(addresses.length).toBe(0);
  });

  it("registra entrada em consent_log com kind=privacy", async () => {
    const { db } = await getTestDb();
    const id = await seedFullClient();
    await execa("bun", ["run", "scripts/anonymize-client.ts", id]);

    const logs = await db.select().from(consentLog).where(eq(consentLog.clientId, id));
    const privacyLogs = logs.filter((l) => l.kind === "privacy" && l.granted === false);
    expect(privacyLogs.length).toBeGreaterThanOrEqual(1);
    expect(privacyLogs[0]?.version).toMatch(/^anonymization-/);
  });

  it("client inexistente: erro", async () => {
    const fakeId = crypto.randomUUID();
    const result = await execa("bun", ["run", "scripts/anonymize-client.ts", fakeId], { reject: false });
    expect(result.exitCode).not.toBe(0);
  });
});
```

- [ ] **Step 3: Rodar e validar**

```bash
bun --cwd packages/db test seed-categories
bun --cwd packages/db test anonymize-client
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/db/test/scripts
git commit -m "test(db): cobertura scripts seed-categories + anonymize-client"
```

---

### Task 30: Adicionar `test` task em turbo.json

**Files:**
- Modify: `turbo.json`

- [ ] **Step 1: Editar turbo.json**

Adicionar:

```json
"test": {
  "dependsOn": ["^check-types"],
  "outputs": []
}
```

dentro de `tasks`.

- [ ] **Step 2: Rodar `bun test` na raiz**

```bash
bun test
```

Expected: turbo executa `test` em todos os pacotes que têm o script (`packages/db`, `apps/web`). Tudo passa.

- [ ] **Step 3: Commit**

```bash
git add turbo.json
git commit -m "chore: adiciona task test em turbo.json"
```

---

### Task 31: Atualizar packages/db/CLAUDE.md (corrige barrel + adiciona apply-triggers)

**Files:**
- Modify: `packages/db/CLAUDE.md`

- [ ] **Step 1: Editar trecho sobre barrel**

Remover trecho que diz "não criar barrel" e substituir por:

```markdown
## Barrel `schema/index.ts` (exceção legítima)

`packages/db/src/schema/index.ts` re-exporta todos os arquivos de schema. É **exceção** ao anti-pattern global, marcada com `// biome-ignore lint/performance/noBarrelFile: intentional public API barrel ...`. Consumidores externos importam via `@emach/db/schema`. Não remover.
```

- [ ] **Step 2: Adicionar seção sobre triggers + scripts**

```markdown
## Triggers PL/pgSQL

`src/migrations/_triggers.sql` contém triggers anti-ciclo de categoria + idempotência de débito de venda. **Drizzle Kit não gera triggers**, então:

```bash
bun db:apply-triggers   # após bun db:push em dev, OU após bun db:migrate em prod
```

Script `scripts/apply-triggers.ts` é idempotente (`CREATE OR REPLACE FUNCTION` + `DROP TRIGGER IF EXISTS`).

## Scripts disponíveis

```bash
bun db:seed-categories             # cria 5 raizes
bun db:anonymize-client <id>       # LGPD direito ao esquecimento
bun db:apply-triggers              # aplica _triggers.sql
```

## Testes

```bash
bun test:supabase:start    # subir Supabase local (uma vez)
bun test                   # roda toda a suite
bun test:supabase:stop     # derruba quando terminar
```
```

- [ ] **Step 3: Commit**

```bash
git add packages/db/CLAUDE.md
git commit -m "docs(db): corrige nota barrel + adiciona triggers/scripts/test"
```

---

### Task 32: Atualizar apps/web/CLAUDE.md (capabilities)

**Files:**
- Modify: `apps/web/CLAUDE.md`

- [ ] **Step 1: Adicionar seção Capabilities**

Adicionar após a seção de "Padrão de server action":

```markdown
## Capabilities & Permissions

`src/lib/permissions.ts` define o sistema de capabilities:

- `Capability` (union de strings) lista todas as ações sensíveis.
- `can(role, cap)` retorna boolean.
- `requireCapability(cap)` para usar em server actions sensíveis (lança Error 'Forbidden').
- `requireCapabilityOrRedirect(cap)` para Server Components (redireciona para /dashboard).

**Quando usar:**
- Server actions sensíveis → `requireCapability(cap)`.
- Page server components → `requireCapabilityOrRedirect(cap)`.
- Gates grosseiros (layout do dashboard) → `requireRole(role)` em `lib/session.ts`.

Matriz de roles: ver `docs/superpowers/specs/2026-04-27-fase-a-fundacao-design.md` seção A.5.
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/CLAUDE.md
git commit -m "docs(web): adiciona secao Capabilities & Permissions"
```

---

### Task 33: Atualizar docs/integration/admin-ecommerce.md

**Files:**
- Modify: `docs/integration/admin-ecommerce.md`

- [ ] **Step 1: Adicionar seção "Distribuição do schema"**

Adicionar abaixo de "Premissas":

```markdown
## Distribuição do schema (cópia versionada)

Site ecomerce mantém **cópia versionada** de `packages/db/src/schema/` no seu próprio repo. Sincronização manual a cada migration:

1. Admin gera migration nova (`bun db:generate`).
2. Admin commita migration + schema atualizado.
3. Time do site faz `cp -r packages/db/src/schema/ <site>/packages/db/src/schema/` + bumpa versão local.
4. Site smoke-tests + deploy coordenado.

Mudança em tabela compartilhada (`order*`, `client*`, `stock_movement`, `review`, `lead`) **exige comunicação** ao time do site antes do deploy.
```

- [ ] **Step 2: Reescrever "Concorrência de estoque"**

Substituir por:

```markdown
## Concorrência de estoque (idempotência via partial unique)

Ao confirmar pagamento, site faz:

```ts
await db.transaction(async (tx) => {
  // 1. Lock pessimista
  await tx.execute(sql`SELECT * FROM stock_level WHERE tool_id = ${toolId} AND branch_id = ${branchId} FOR UPDATE`);

  // 2. INSERT em stock_movement; UNIQUE INDEX bloqueia duplicata
  try {
    await tx.insert(stockMovement).values({
      ...,
      reason: "saida_venda",
      orderId, orderItemId,
      actorType: "apiKey", apiKeyId,
    });
  } catch (e) {
    if (isUniqueViolation(e, "stock_movement_sale_idempotency")) {
      return { ok: true, idempotent: true };
    }
    throw e;
  }

  // 3. UPDATE stock_level (check quantity_non_negative protege contra oversell)
  await tx.update(stockLevel).set({ quantity: sql`${stockLevel.quantity} + ${delta}` }).where(...);
});
```
```

- [ ] **Step 3: Adicionar "Auditoria com actorType"**

```markdown
## Auditoria com actorType

Toda escrita em tabela com colunas de auditoria preenche:

| `actorType` | `actorId` | `apiKeyId` |
|---|---|---|
| `'user'` | id do user (admin) | NULL |
| `'apiKey'` | NULL | id da apiKey usada |
| `'system'` | NULL | NULL |

Site usa exclusivamente `actorType='apiKey'`. CHECK `actor_coherence` em `stock_movement` valida no DB.
```

- [ ] **Step 4: Reescrever endpoint revalidate**

```markdown
## Endpoint POST /api/internal/revalidate (Fase D)

Header: `X-Api-Key: <plaintext>`. Body: `{ tags: string[] }`.

Servidor faz:

1. Lookup `api_key` via hash do header → confirma `revokedAt IS NULL` e `expiresAt` futuro.
2. Verifica `apiKey.scopes` contém `'revalidate'`.
3. Para cada tag em `body.tags`: confirma que existe pattern em `apiKey.allowedTags` que match (suporta glob `*` no fim).
4. Para tags autorizadas: `revalidateTag(tag)`.
5. Resposta: `{ ok: true, revalidated: [...allowed tags] }` ou 403 com lista de rejeitadas.
```

- [ ] **Step 5: Adicionar seção "LGPD"**

```markdown
## LGPD

- `consent_log` registra TOS, privacy, marketing_email, cookies por client/lead com versão + IP + UA.
- Helpers em `apps/web/src/lib/consent.ts`: `logConsent`, `revokeConsent`, `getActiveConsent`.
- Direito ao esquecimento: `bun --cwd packages/db db:anonymize-client <client-id>` zera PII e gera audit em `consent_log`.
```

- [ ] **Step 6: Atualizar "Pendências"**

Remover a linha sobre distribuição (resolvido).

- [ ] **Step 7: Commit**

```bash
git add docs/integration/admin-ecommerce.md
git commit -m "docs(integration): atualiza admin-ecommerce com decisoes Fase A"
```

---

### Task 34: Atualizar .claude/CLAUDE.md (topologia)

**Files:**
- Modify: `.claude/CLAUDE.md`

- [ ] **Step 1: Editar topologia**

Substituir o bloco de topologia para refletir o estado pós-Fase A:

```
apps/
  web/                    Next 16 dashboard (port 3001)
    src/app/
      login/              Pública
      dashboard/          Protegida via requireCurrentSession
        (inventory)/      Route group: tools/, stock/, promotions/
        branches/, suppliers/
        categories/       Árvore hierárquica (CRUD básico — UI tree na Fase E)
        orders/           (planejado Fase B)
        customers/        (planejado Fase C)
        site/             (planejado Fase D)
        reviews/          (planejado Fase E)
      api/auth/[...all]/  Better Auth catch-all (dashboard)
    src/lib/
      auth-client.ts      Better Auth client (browser)
      session.ts          getCurrentSession / requireRole helpers
      permissions.ts      Capability + can + requireCapability
      consent.ts          LGPD helpers (logConsent, revokeConsent)
      logger.ts           Logger central
      supabase-server.ts  Service-role client (uploads)
```

- [ ] **Step 2: Atualizar tabela de schema**

Substituir linha de `tools.ts` por:

```
| `tools.ts` | `supplier`, `tool`, `toolImage` | `tool.sku`/`barcode` unique; `model` agrupa variantes; categorias via `tool_category` (M2M); enums `status`. |
```

E adicionar:

```
| `categories.ts` | `category`, `toolCategory` | Árvore com `parent_id` + `path`/`depth` materializados via trigger. Anti-ciclo via trigger pl/pgSQL. |
| `consent-log.ts` | `consentLog` | LGPD: TOS/privacy/marketing/cookies por client/lead. |
```

Remover linha de `productType` se ainda existir.

- [ ] **Step 3: Atualizar invariante 6 (já existente)**

Garantir que invariante 6 menciona `actorType` e o endpoint revalidate.

- [ ] **Step 4: Commit**

```bash
git add .claude/CLAUDE.md
git commit -m "docs: atualiza topologia + schema pos-Fase A"
```

---

### Task 35: Verificação end-to-end final

**Files:**
- (sem mudanças, só validação)

- [ ] **Step 1: Rodar fix + check-types + test global**

```bash
bun fix
bun check-types
bun test
```

Expected: tudo verde. Se falhar, parar e investigar.

- [ ] **Step 2: Smoke manual via dashboard**

```bash
bun --cwd packages/db test:supabase:start
bun --cwd packages/db db:seed-categories
bun dev:web
```

No browser:
1. Login com user role 'admin'.
2. Navegar `/dashboard/categories` — ver 5 raízes.
3. Criar categoria filha "Furadeiras" sob "Ferramentas Elétricas".
4. Editar tool existente, adicionar 2 categorias e marcar 1 como primary.
5. Tentar `/dashboard/product-types` — deve dar 404.
6. Ajustar estoque de um produto. Validar via `db:studio` que `stock_movement` ganhou linha com `actor_type='user'` e `actor_id` preenchido.
7. Trocar role do user para 'user' no DB; tentar criar categoria → deve mostrar Forbidden.
8. Voltar role para 'admin'.

- [ ] **Step 3: Commit final + tag**

```bash
git tag fase-a-complete -m "Fase A (fundacao) concluida"
git push origin HEAD
git push origin fase-a-complete
```

---

## Self-Review

### Cobertura do spec

| Spec section | Tasks |
|---|---|
| A.1 Reset baseline | Task 15 |
| A.2 Schemas existentes (auth/inventory/stockmov/apikey/tools) | Tasks 3, 4, 5, 6, 9 |
| A.3 Schemas novos (categories, consent-log) | Tasks 7, 8 |
| A.4 Triggers SQL | Task 12 (criação) + Task 15 Step 4 (aplicação) |
| A.5 lib/permissions.ts | Task 2 |
| A.6 lib/consent.ts | Task 16 |
| A.7 Scripts (seed, anonymize, apply-triggers) | Tasks 12, 13, 14 |
| A.8 Vitest baseline + suíte | Tasks 25–29, 30 |
| A.9 Refatoração actions (capabilities + actorType) | Tasks 17, 18, 19, 20, 21 |
| A.10 Rotas dashboard (categories +, product-types −) | Tasks 22, 23, 24 |
| A.11 Documentação | Tasks 31, 32, 33, 34 |
| Verificação final | Task 35 |

Todas as seções do spec mapeiam para tasks específicas. ✅

### Placeholder scan

Não há "TBD", "TODO", "fill in details" no plano. Todos os steps mostram código completo ou comandos executáveis. ✅

### Type consistency

- `Capability` é o mesmo tipo em Task 2 e usado em Tasks 17–23. ✅
- `requireCapability(cap)` assinatura idêntica em Task 2 e usos. ✅
- `ActorType` enum em Task 5 (`stock-movements.ts`) bate com check `actor_coherence`. ✅
- `Category` type usado em Task 23 vem de schema criado em Task 7. ✅
- `categoryInputSchema` em Task 23 schema.ts batenado com payloads dos pages new/edit. ✅
- `tool_category.is_primary` (snake) ↔ `isPrimary` (camel) — Drizzle faz mapping; uso consistente. ✅

### Escopo

Plano fica restrito à Fase A. Não há tasks de Orders, Site, Customers, Reviews, Resend, Inngest. ✅

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-27-fase-a-fundacao.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — Eu disparo um subagent fresco por task, revisão entre tasks, iteração rápida.

**2. Inline Execution** — Execução das tasks nesta sessão usando executing-plans, batch com checkpoints para revisão.

**Qual abordagem?**
