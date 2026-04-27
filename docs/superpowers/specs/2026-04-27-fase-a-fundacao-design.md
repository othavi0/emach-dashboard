# Spec — Fase A: Fundação (schema baseline, capabilities, LGPD, vitest)

**Data:** 2026-04-27
**Status:** Aprovado para implementação
**Plano-pai:** `/home/othavio/.claude/plans/eu-quero-que-voce-curious-sun.md`
**Próximo passo:** invocar `/superpowers:writing-plans` após review do user

---

## Contexto

O `emach-dashboard` cobre hoje o admin de inventário (tools, stock, promotions, branches, suppliers, product-types). As próximas fases (B–F) precisam adicionar Orders, Customers/Leads, Site/CMS e Reviews — todas dependem de uma **fundação** que hoje tem buracos importantes:

1. **Drift severo entre migration e schema TS:** `packages/db/src/migrations/0000_swift_martin_li.sql` tem tabela `category` + `tool.product_type` enum literal que **não existem** no schema TS atual. Schema regrediu nos commits `2dacae8` → `35972ca` e a migration nunca foi reconciliada. Qualquer `bun db:generate` agora gera SQL caótico.
2. **Bypass de role:** `requireRole` faz cast mentiroso (`as UserRole`) e `user.role` é `text` sem enum/check no DB. Roles desconhecidas passam pela autorização.
3. **Oversell silencioso:** `stockLevel` não tem `check(quantity >= 0)`.
4. **Débito duplo de estoque:** `stockMovement` não tem `orderId`/`orderItemId` nem unique constraint para idempotência. Retry de webhook do site duplica movimento.
5. **Auditoria sem ator externo:** sem `actorType`, movimentos vindos do site (autenticados por apiKey) ficam anônimos.
6. **Endpoint revalidate sem escopo:** `apiKey` não tem `scopes`/`allowedTags`. Chave vazada invalida tudo.
7. **Categorias faltam:** sistema usa `productType` flat (FK obrigatório), inadequado para um e-commerce com taxonomia hierárquica.
8. **LGPD ausente:** cliente BR exige consent log + processo de anonimização. Não há nada.
9. **Capabilities grosseiras:** `requireRole("admin")` espalhado nas server actions. Manager e user (estoquista/expedição) não têm granularidade.
10. **Sem testes:** zero suíte. Mudanças de schema não validadas; idempotência e anti-ciclo não testáveis.

A Fase A resolve **todos os 10 pontos acima** antes de qualquer feature nova de produto. Sem isso, Orders (Fase B) entra com fundação podre.

**Escopo explícito:** apenas backend (schemas, migrations, scripts, capabilities, vitest). UI nova para categorias é mínima (CRUD básico, sem tree drag-and-drop — isso é Fase E).

**Fora de escopo:** Orders, Site/CMS, Customers/Leads, Reviews, observabilidade (Sentry/PostHog), Inngest, Resend, Playwright. Tudo isso vem em Fases B–F.

---

## Decisões fundamentais (alinhadas)

| Tema | Decisão |
|---|---|
| Reset baseline | `rm -rf packages/db/src/migrations/` + `bun db:push --force` em dev + `bun db:generate` cria nova baseline |
| Prod state | Vazio/staging — drop+recreate aceitável |
| Anti-ciclo categoria | Híbrido: check DB simples + trigger pl/pgSQL + validação app-side |
| Vitest scope | `packages/db` com Supabase local CLI (Postgres real para testar triggers) + unit puro em `apps/web` (permissions) |
| Cupons | Reuso de `promotion.type='promocode'` (não criar tabela `coupon`) |
| Reviews | `orderId` obrigatório (verified buyer) — schema vem na Fase B |
| LGPD | Schema + helper + script anonimize na Fase A |
| Capabilities | Enum + `can(role, cap)` + `requireCapability(cap)` em `apps/web/src/lib/permissions.ts` |
| Matriz roles | `user` é estoquista+expedição (stock.adjust + orders.update_status/add_note); `manager` é gerente operacional+comercial+conteúdo; `admin` mexe em estrutura |
| Distribuição `@emach/db` | Cópia versionada do schema no site ecomerce (sync manual a cada migration) |
| Legado | Qualquer coisa deprecada/não-usada pode ser **removida** sem migração de dados |

---

## Arquitetura final

### A.1 Schema baseline reset

**Sequência operacional (irreversível em dev):**

```bash
# 1. Apagar migrations antigas
rm -rf packages/db/src/migrations/

# 2. Aplicar mudanças de schema TS (descritas em A.2/A.3)
# 3. Sincronizar dev
bun db:push --force

# 4. Aplicar triggers anexos
bun run --cwd packages/db scripts/apply-triggers.ts

# 5. Gerar baseline limpa para staging/prod
bun db:generate
```

### A.2 Mudanças em schemas existentes

| Arquivo | Mudança |
|---|---|
| `packages/db/src/schema/auth.ts` | `role: text(...)` → `userRoleEnum = pgEnum("user_role", ["admin","manager","user"])`; `role: userRoleEnum("role").notNull().default("user")` |
| `packages/db/src/schema/inventory.ts` | Em `stockLevel`: adicionar `check("quantity_non_negative", sql\`${quantity} >= 0\`)` |
| `packages/db/src/schema/stock-movements.ts` | Adicionar colunas `orderId text` (nullable, FK criada na Fase B com `onDelete: set null`), `orderItemId text` (idem), `actorType actorTypeEnum notNull default 'system'` (`pgEnum("actor_type", ["user","apiKey","system"])`), `apiKeyId text` (fk apiKey, set null). Adicionar `check("delta_non_zero", sql\`${delta} <> 0\`)`. Adicionar `check("actor_coherence", ...)` que valida coerência entre `actorType` e `actorId`/`apiKeyId`. Reason vira `notNull` (era nullable). Index `(orderId)`. Index composto `(actorType, actorId, apiKeyId)`. |
| `packages/db/src/schema/api-keys.ts` | Adicionar `scopes text[] notNull default '{}'`, `allowedTags text[] notNull default '{}'`. GIN index em `scopes`. |
| `packages/db/src/schema/tools.ts` | **REMOVER** `productType` table, `tool.productTypeId`, todas as relations `productTypeRelations` e referências em `toolRelations`. |
| `packages/db/src/index.ts` | Remover imports de `productType`/`productTypeRelations`. Adicionar imports de `category`, `categoryRelations`, `toolCategory`, `toolCategoryRelations`, `consentLog`, `consentLogRelations`. |

### A.3 Schemas novos

#### `packages/db/src/schema/categories.ts`

```ts
import { relations, sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { tool } from "./tools";

export const category = pgTable("category", {
  id: text("id").primaryKey(),
  slug: text("slug").unique().notNull(),
  name: text("name").notNull(),
  parentId: text("parent_id").references((): any => category.id, { onDelete: "restrict" }),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  description: text("description"),
  imageUrl: text("image_url"),
  path: text("path").notNull(),       // populado pelo trigger
  depth: integer("depth").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
}, (t) => [
  check("parent_neq_self", sql`${t.parentId} IS NULL OR ${t.parentId} != ${t.id}`),
  check("depth_max_5", sql`${t.depth} >= 0 AND ${t.depth} <= 5`),
  index("category_parent_idx").on(t.parentId),
  index("category_path_idx").on(t.path),
]);

export const toolCategory = pgTable("tool_category", {
  toolId: text("tool_id").notNull().references(() => tool.id, { onDelete: "cascade" }),
  categoryId: text("category_id").notNull().references(() => category.id, { onDelete: "restrict" }),
  primary: boolean("is_primary").notNull().default(false),
}, (t) => [
  primaryKey({ columns: [t.toolId, t.categoryId] }),
  uniqueIndex("tool_category_one_primary").on(t.toolId).where(sql`${t.primary} = true`),
]);

export const categoryRelations = relations(category, ({ one, many }) => ({
  parent: one(category, { fields: [category.parentId], references: [category.id], relationName: "parent" }),
  children: many(category, { relationName: "parent" }),
  tools: many(toolCategory),
}));

export const toolCategoryRelations = relations(toolCategory, ({ one }) => ({
  tool: one(tool, { fields: [toolCategory.toolId], references: [tool.id] }),
  category: one(category, { fields: [toolCategory.categoryId], references: [category.id] }),
}));

export type Category = typeof category.$inferSelect;
export type NewCategory = typeof category.$inferInsert;
export type ToolCategory = typeof toolCategory.$inferSelect;
export type NewToolCategory = typeof toolCategory.$inferInsert;
```

#### `packages/db/src/schema/consent-log.ts`

```ts
import { sql } from "drizzle-orm";
import { boolean, check, index, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { client } from "./client";

export const consentKindEnum = pgEnum("consent_kind", ["tos", "privacy", "marketing_email", "cookies"]);
export const consentActorEnum = pgEnum("consent_actor", ["client", "lead"]);

export const consentLog = pgTable("consent_log", {
  id: text("id").primaryKey(),
  actorType: consentActorEnum("actor_type").notNull(),
  clientId: text("client_id").references(() => client.id, { onDelete: "cascade" }),
  leadId: text("lead_id"),  // FK criada na Fase C quando `lead` existir
  kind: consentKindEnum("kind").notNull(),
  granted: boolean("granted").notNull(),
  version: text("version").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  grantedAt: timestamp("granted_at").defaultNow().notNull(),
  revokedAt: timestamp("revoked_at"),
}, (t) => [
  check("consent_actor_coherence", sql`
    (${t.actorType} = 'client' AND ${t.clientId} IS NOT NULL AND ${t.leadId} IS NULL)
    OR (${t.actorType} = 'lead' AND ${t.leadId} IS NOT NULL AND ${t.clientId} IS NULL)
  `),
  index("consent_log_client_idx").on(t.clientId, t.kind, t.grantedAt.desc()),
  index("consent_log_lead_idx").on(t.leadId, t.kind, t.grantedAt.desc()),
]);

export type ConsentLog = typeof consentLog.$inferSelect;
export type NewConsentLog = typeof consentLog.$inferInsert;
```

### A.4 Triggers SQL anexos

**`packages/db/src/migrations/_triggers.sql`** — não é migration Drizzle (Drizzle Kit não gera triggers PL/pgSQL). É anexo aplicado por script.

```sql
-- Trigger: prevent_category_cycle (anti-ciclo + path materializado)
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

  -- detecta ciclo via recursive CTE
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

  -- recalcula path + depth a partir do pai
  SELECT path, depth INTO parent_path, parent_depth FROM category WHERE id = NEW.parent_id;
  NEW.path := parent_path || '/' || NEW.slug;
  NEW.depth := parent_depth + 1;

  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_category_cycle ON category;
CREATE TRIGGER trg_prevent_category_cycle
BEFORE INSERT OR UPDATE OF parent_id, slug ON category
FOR EACH ROW EXECUTE FUNCTION prevent_category_cycle();

-- Trigger AFTER: propaga path/depth para descendentes quando uma categoria é movida.
-- Sem isso, mover A (com filhos B, C) para baixo de outra categoria deixaria B.path/C.path inconsistentes.
CREATE OR REPLACE FUNCTION cascade_category_path() RETURNS trigger AS $$
BEGIN
  IF NEW.path IS DISTINCT FROM OLD.path THEN
    -- força re-execução do BEFORE trigger em cada descendente direto via UPDATE no-op.
    UPDATE category SET parent_id = parent_id WHERE parent_id = NEW.id;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cascade_category_path ON category;
CREATE TRIGGER trg_cascade_category_path
AFTER UPDATE OF path ON category
FOR EACH ROW EXECUTE FUNCTION cascade_category_path();

-- Idempotência de débito de venda (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS stock_movement_sale_idempotency
ON stock_movement (order_item_id)
WHERE reason = 'saida_venda' AND order_item_id IS NOT NULL;
```

### A.5 lib/permissions.ts

**`apps/web/src/lib/permissions.ts`:**

```ts
import { redirect } from "next/navigation";
import type { DashboardSession } from "@emach/auth/dashboard";
import type { UserRole } from "@emach/db/schema/auth";
import { requireCurrentSession } from "@/lib/session";

export type Capability =
  // catálogo
  | "tools.read" | "tools.create" | "tools.update" | "tools.delete"
  | "categories.read" | "categories.manage"
  | "suppliers.read" | "suppliers.manage"
  | "branches.read" | "branches.manage"
  // estoque
  | "stock.read" | "stock.adjust"
  // promoções (incluindo cupons via promotion.type='promocode')
  | "promotions.read" | "promotions.manage"
  // pedidos (Fase B+)
  | "orders.read" | "orders.update_status" | "orders.cancel" | "orders.refund" | "orders.add_note"
  // clientes (Fase C+)
  | "customers.read" | "customers.update_tags" | "customers.update_status" | "customers.delete"
  | "leads.read" | "leads.manage"
  // site CMS (Fase D+)
  | "site.read" | "site.update_banners" | "site.update_settings" | "site.publish_announcements"
  // reviews (Fase E+)
  | "reviews.read" | "reviews.moderate"
  // sistema
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
  // reads
  "tools.read", "categories.read", "suppliers.read", "branches.read",
  "stock.read", "promotions.read",
  "orders.read", "customers.read", "leads.read",
  "site.read", "reviews.read",
  // writes operacionais (estoquista + expedição)
  "stock.adjust",
  "orders.update_status", "orders.add_note",
];

const MANAGER_CAPS: readonly Capability[] = [
  ...USER_CAPS,
  // catálogo
  "tools.create", "tools.update", "tools.delete",
  "categories.manage",
  "suppliers.manage",
  "promotions.manage",
  // pedidos (comercial)
  "orders.cancel", "orders.refund",
  // clientes/leads
  "customers.update_tags", "customers.update_status",
  "leads.manage",
  // site
  "site.update_banners", "site.update_settings", "site.publish_announcements",
  // reviews
  "reviews.moderate",
  // audit (read-only)
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

**Matriz diferencial:**

| Capability | admin | manager | user |
|---|:-:|:-:|:-:|
| `stock.adjust`, `orders.update_status`, `orders.add_note` | ✅ | ✅ | ✅ (estoquista+expedição) |
| `orders.cancel`, `orders.refund` | ✅ | ✅ | ❌ |
| `tools.*` (create/update/delete) | ✅ | ✅ | ❌ |
| `categories.manage`, `suppliers.manage`, `promotions.manage` | ✅ | ✅ | ❌ |
| `customers.update_tags`, `customers.update_status` | ✅ | ✅ | ❌ |
| `customers.delete` (LGPD) | ✅ | ❌ | ❌ |
| `site.update_banners`, `site.update_settings`, `site.publish_announcements` | ✅ | ✅ | ❌ |
| `branches.manage` | ✅ | ❌ | ❌ |
| `users.manage`, `apikeys.manage` | ✅ | ❌ | ❌ |
| `audit.read` | ✅ | ✅ | ❌ |

### A.6 lib/consent.ts

**`apps/web/src/lib/consent.ts`:**

```ts
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@emach/db";
import { consentLog, type ConsentKind } from "@emach/db/schema/consent-log";
import crypto from "node:crypto";

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

export async function revokeConsent(args: { clientId: string; kind: ConsentKind }): Promise<void> {
  // Marca o último granted=true ainda não revogado como revoked.
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
  await db.update(consentLog).set({ revokedAt: new Date() }).where(eq(consentLog.id, latest.id));
}

export async function getActiveConsent(clientId: string, kind: ConsentKind): Promise<boolean> {
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

### A.7 Scripts em packages/db/scripts/

#### `seed-categories.ts`

Cria 5 raízes idempotentes (`ON CONFLICT (slug) DO NOTHING`):

- `ferramentas-eletricas` — Ferramentas Elétricas
- `ferramentas-manuais` — Ferramentas Manuais
- `acessorios` — Acessórios
- `pecas` — Peças
- `sem-categoria` — Sem Categoria (fallback)

Uso: `bun run --cwd packages/db scripts/seed-categories.ts`.

#### `anonymize-client.ts`

Direito ao esquecimento LGPD. Recebe `<client-id>` por argv. Em transação:

1. UPDATE em `client`: name='[anonymized]', email=`deleted-${sha256(id).slice(0,12)}@anonymized.local`, emailVerified=false, phone=NULL, document=NULL, image=NULL.
2. DELETE em `client_address`, `client_session`, `client_account` para o `clientId`.
3. INSERT em `consent_log` com `kind='privacy'`, `granted=false`, `version='anonymization-{date}'` para audit.
4. **Não toca** em `order`/`orderItem` (Fase B) — preserva auditoria fiscal.

Uso: `bun run --cwd packages/db scripts/anonymize-client.ts <client-id>`.

#### `apply-triggers.ts`

Lê `packages/db/src/migrations/_triggers.sql` e executa via `pg.query`. Idempotente (`CREATE OR REPLACE FUNCTION` + `DROP TRIGGER IF EXISTS` + `CREATE UNIQUE INDEX IF NOT EXISTS`).

Uso: `bun run --cwd packages/db scripts/apply-triggers.ts`.

### A.8 Vitest

**`packages/db/vitest.config.ts`:**

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
      DATABASE_URL: process.env.DATABASE_URL_TEST
        ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    },
  },
});
```

**`packages/db/test/setup.ts`** — global setup que verifica/inicia Supabase local, aplica `bun db:push --force`, aplica `apply-triggers.ts`.

**`packages/db/test/helpers/reset-db.ts`** — `afterEach(async () => { TRUNCATE ... CASCADE })` para isolar testes.

**Suíte mínima:**

| Arquivo | Casos testados |
|---|---|
| `test/schema/categories.test.ts` | Raiz cria path/depth corretos, filho herda path, parent_neq_self rejeita, ciclo A→B→C com `UPDATE A.parent=C` lança exception, depth_max_5 rejeita 6 níveis, slug único, **mover A (com filhos B/C) para baixo de outra categoria propaga path/depth nos descendentes** |
| `test/schema/stock-movement.test.ts` | `delta=0` rejeitado, idempotência aceita 1 saída_venda(orderItemId=X) e rejeita a 2ª, ajustes com orderItemId NULL múltiplos OK, actor_coherence rejeita inconsistência, `stock_level.quantity = -1` rejeitado |
| `test/schema/api-keys.test.ts` | scopes default `[]`, GIN index permite query `scopes @> '{revalidate}'`, allowedTags aceita glob |
| `test/schema/consent-log.test.ts` | actor_coherence rejeita clientId+leadId simultâneos, logConsent insere com IP/UA, revokeConsent marca revokedAt, getActiveConsent reflete estado |
| `test/scripts/seed-categories.test.ts` | DB vazio cria 5 raízes, idempotente, slugs e paths corretos |
| `test/scripts/anonymize-client.test.ts` | Cliente com endereços/accounts: tudo zera/deleta exceto id, email tem padrão `deleted-*@anonymized.local`, consent_log ganha auditoria, client inexistente erro |
| `apps/web/__tests__/permissions.test.ts` (unit puro) | Matriz role × cap completa, `can(null, X) === false`, `can('hacker', X) === false`, `requireCapability` lança quando não autorizado (mock session) |

**Scripts npm em `packages/db/package.json`:**

```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest",
  "test:supabase:start": "supabase start --workdir .",
  "test:supabase:stop": "supabase stop --workdir ."
}
```

**Turbo:** adicionar `test` em `turbo.json`:

```json
"test": {
  "dependsOn": ["^check-types"],
  "outputs": []
}
```

### A.9 Refatoração nas server actions existentes

Migrar `requireRole("admin")` → `requireCapability(...)`:

| Arquivo | Action(s) | Capability |
|---|---|---|
| `apps/web/src/app/dashboard/(inventory)/tools/actions.ts` | createTool, updateTool | `tools.create`, `tools.update` |
| `apps/web/src/app/dashboard/(inventory)/tools/actions.ts` | deleteTool | `tools.delete` |
| `apps/web/src/app/dashboard/(inventory)/stock/actions.ts` | adjustStock | `stock.adjust` |
| `apps/web/src/app/dashboard/(inventory)/promotions/actions.ts` | todas | `promotions.manage` |
| `apps/web/src/app/dashboard/branches/actions.ts` | todas | `branches.manage` |
| `apps/web/src/app/dashboard/suppliers/actions.ts` | todas | `suppliers.manage` |
| `apps/web/src/app/dashboard/categories/actions.ts` (novo) | todas | `categories.manage` |

`requireRole` permanece em `lib/session.ts` para gates grosseiros (layout do dashboard etc).

**Refatoração obrigatória em todas as inserções de `stockMovement`:** preencher `actorType: 'user'` + `actorId: session.user.id` no `stock/actions.ts`.

### A.10 Rotas dashboard impactadas

**Removidas:**
- `apps/web/src/app/dashboard/product-types/**` — todas as páginas e actions. `app-sidebar.tsx` perde a entrada.

**Novas:**
- `apps/web/src/app/dashboard/categories/page.tsx` — listagem flat com indent visual baseado em `depth`.
- `apps/web/src/app/dashboard/categories/new/page.tsx` — form: name, slug, parentId (select), description, imageUrl, isActive.
- `apps/web/src/app/dashboard/categories/[id]/edit/page.tsx`.
- `apps/web/src/app/dashboard/categories/actions.ts` — `createCategory`, `updateCategory`, `deleteCategory` (validação app-side de ciclo antes de update; tratamento de exception P0001 do trigger como erro amigável).

**Modificadas:**
- `apps/web/src/app/dashboard/(inventory)/tools/_components/tool-form.tsx` — substituir `productTypeId` select por `categoryIds` select-múltiplo (checkbox) + flag `primary` para uma só.
- `apps/web/src/app/dashboard/(inventory)/tools/actions.ts` — adicionar criação/atualização das linhas em `tool_category` em transação com a tool.
- `apps/web/src/components/app-sidebar.tsx` — `Product Types` → `Categorias`. Mantém ordem.

### A.11 Documentação

**Criar/Corrigir:**

- `packages/db/CLAUDE.md` — corrigir parágrafo sobre barrels: documentar que `schema/index.ts` é exceção legítima (`biome-ignore` no topo). Adicionar `apply-triggers.ts` ao workflow de dev. Mencionar `bun test` como parte do ciclo.
- `apps/web/CLAUDE.md` — adicionar seção "Capabilities & Permissions" referenciando `lib/permissions.ts`. Documentar convenção `requireCapability` em server actions sensíveis e `requireRole` para gates grosseiros.
- `docs/integration/admin-ecommerce.md` — atualização ampla:
  - Seção "Distribuição do schema" → cópia versionada com processo manual.
  - Seção "Concorrência de estoque" → fluxo SELECT FOR UPDATE + INSERT idempotente + UPDATE.
  - Seção "Auditoria com actorType" → site preenche `actorType='apiKey'` + `apiKeyId`.
  - Seção "Endpoint revalidate" → escopos via `apiKey.scopes` + match glob de `allowedTags`.
  - Seção "LGPD" → consent log + script anonymize.
  - Atualizar pendências (cópia versionada resolvido).
- `.claude/CLAUDE.md` raiz — atualizar Topologia: remover linha de `product-types` (já marcada planejada), confirmar `categories/` como existente.

---

## Plano de execução

A implementação acontece em ordem rigorosa para evitar quebrar dev environment:

### Etapa 1: Preparação (sem mudanças destrutivas)
1. Criar arquivos novos isolados: `packages/db/src/schema/categories.ts`, `consent-log.ts`.
2. Criar `packages/db/scripts/` + scripts.
3. Criar `apps/web/src/lib/permissions.ts`, `consent.ts`.
4. Criar `packages/db/test/` + `vitest.config.ts`.
5. `bun install` para vitest + execa.
6. Compila tudo (`bun check-types`) — esperado falhar em imports de `productType` ainda existentes; vamos resolver na Etapa 4.

### Etapa 2: Atualizações de schema TS
1. `auth.ts`: pgEnum para role.
2. `inventory.ts`: check quantity_non_negative.
3. `stock-movements.ts`: novas colunas + checks.
4. `api-keys.ts`: scopes + allowedTags + GIN.
5. `tools.ts`: **remover** productType + productTypeId + relations.
6. `db/index.ts`: re-exports atualizados.

### Etapa 3: Reset baseline
1. `rm -rf packages/db/src/migrations/`.
2. `bun db:push --force` (dev).
3. `bun run --cwd packages/db scripts/apply-triggers.ts`.
4. `bun db:generate` cria nova baseline limpa.
5. `bun run --cwd packages/db scripts/seed-categories.ts` cria 5 raízes.

### Etapa 4: Refatoração de código que usava productType
1. Server actions em `tools/actions.ts` — remover productTypeId das queries; adicionar criação/update em `tool_category`.
2. UI `tool-form.tsx` — substituir select.
3. Remover rotas `product-types/`.
4. Atualizar `app-sidebar.tsx`.
5. Migrar `requireRole("admin")` → `requireCapability(...)` em todas as actions afetadas.
6. Adicionar `actorType: 'user'` + `actorId` em todas as inserções de stockMovement.
7. `bun check-types` deve passar.

### Etapa 5: Vitest baseline + testes
1. `bun test:supabase:start` em packages/db.
2. `bun test` — toda a suíte deve passar.
3. Configurar `turbo test` em raiz e validar que `bun test` (raiz) executa só `packages/db` (apps/web sem testes ainda exceto permissions.test.ts).

### Etapa 6: Documentação
1. Aplicar correções/criações em todos os CLAUDE.md.
2. Atualizar `docs/integration/admin-ecommerce.md`.
3. Verificar links cruzados.

### Etapa 7: Verificação end-to-end
1. `bun fix` (auto-format).
2. `bun check-types` global.
3. `bun test` (packages/db + apps/web).
4. `bun dev:web` smoke: login, criar categoria, marcar tool com 2 categorias (1 primary), ajustar estoque (validar audit com actorType='user'), tentar acessar /product-types deve 404.
5. Smoke role: criar user com role='user' e validar que pode ajustar estoque + atualizar status mas não pode criar tool.
6. Skill `web-design-guidelines` em UI nova (categorias, tool-form refatorado).

---

## Estratégia de testes

**Cobertura mínima esperada na Fase A:**

- Schema constraints e triggers via Postgres real (Supabase local).
- Idempotência de stockMovement.
- Anti-ciclo + path/depth de categoria.
- Helpers de consent (logConsent, revokeConsent, getActiveConsent).
- Scripts seed-categories e anonymize-client.
- Permissions matrix (puramente unit).

**Não cobertos nesta fase (vão em fases B+):**
- E2E com Playwright.
- Server actions completas com mock de session.
- Endpoint revalidate (Fase D).

**Ferramentas:**
- Vitest 1.x + execa para shell calls em setup.
- Supabase CLI (assume-se instalada localmente — `supabase --version` antes de iniciar; `packages/db/supabase/config.toml` já existe). Se não tiver, instalar via `bun add -g supabase` ou via brew/scoop conforme documentação oficial.
- pg client (já dependência de `@emach/db`).
- Docker rodando (Supabase local CLI usa containers).

---

## Rollback

Como Fase A é destrutiva (drop de tabelas, reset de migrations), o rollback **não é trivial**. Estratégia:

1. **Antes de iniciar:** confirmar com user que prod está vazia e o snapshot mais recente do banco está em backup local (Supabase project → backups).
2. Trabalhar em **branch dedicada** `feat/fase-a-fundacao` desde o início. Não merge antes da Etapa 7 passar.
3. Se algo der muito errado em qualquer Etapa: `git reset --hard origin/main` na branch + restaurar Supabase via backup.
4. Passar pela Etapa 4 sem `bun check-types` verde **bloqueia** progressão. Não avançar com erros.

---

## Riscos identificados

| Risco | Mitigação |
|---|---|
| Trigger PL/pgSQL não roda em test env | Vitest globalSetup aplica `_triggers.sql` antes da suíte. Script `apply-triggers.ts` é idempotente. |
| `db:push --force` em dev derruba dados úteis | User confirmou prod vazia. Equipe roda em branch local com seed deterministic. |
| Drift recorrente schema↔migrations | Documentar em CLAUDE.md que toda mudança = `bun db:generate` (não `db:push` puro em prod). Fase F adiciona check de CI. |
| `tool_category` migration sem dados existentes | Prod vazia. Se houver tools de teste em dev, eles ficam órfãos até serem editados. Aceitável. |
| Site ecomerce (cópia versionada) defasa do admin | Documentar processo no `admin-ecommerce.md`. Fase F pode automatizar com bot/git submodule depois. |
| Vitest setup pesado (Supabase local) | `pool: forks` + `fileParallelism: false` mantém estabilidade. Aceita-se ~20s de startup, melhora DX. |

---

## Verificação final (definição de pronto)

A Fase A está pronta quando todos esses comandos passam, em sequência, sem erro:

```bash
bun install
bun fix
bun check-types
bun --cwd packages/db test:supabase:start
bun test
bun --cwd packages/db scripts/seed-categories.ts
bun --cwd packages/db scripts/apply-triggers.ts
bun dev:web    # smoke manual: criar categoria, criar tool com 2 categorias, ajustar estoque, login com user role
```

**Critérios qualitativos:**
- Toda server action sensível usa `requireCapability`.
- Toda inserção de `stockMovement` tem `actorType` + `actorId`/`apiKeyId` adequado.
- Nenhum import de `productType` permanece em `apps/web` ou `packages/db`.
- `apps/web/src/app/dashboard/product-types/` removido.
- `_triggers.sql` aplicado em dev.
- `docs/integration/admin-ecommerce.md` atualizado.

---

## Próximo passo

Após aprovação deste spec pelo user, invocar `/superpowers:writing-plans` para criar o plano de implementação executável passo-a-passo.
