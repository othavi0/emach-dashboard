# Fase 0 — Primitives compartilhados + schemas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extrair primitives reutilizáveis e criar tabelas/colunas novas que servirão de base para as Fases 1 (Users), 2 (Branches) e 3 (Suppliers).

**Architecture:** Componentes em `apps/web/src/components/entity/` para reuso entre features. Helpers em `apps/web/src/lib/`. Schemas Drizzle em `packages/db/src/schema/`. Workflow push-only via `bun db:sync` (ADR-0006). Rota dev-only `/dashboard/_dev/entity-preview` serve como bancada visual e canvas do impeccable audit.

**Tech Stack:** Next 16 + React 19 (RSC default), shadcn/ui sobre Tailwind 4, Drizzle 0.45 + Postgres, vitest para unit tests, Better Auth para auth (não tocado nesta fase).

**Spec:** `docs/superpowers/specs/2026-05-20-users-branches-suppliers-design.md` (Seções "Arquitetura compartilhada" + "Restrições de polish").

---

## File structure

**Novos:**

- `packages/db/src/schema/user-activity.ts` — tabela `userActivityLog`
- `packages/db/src/schema/supplier-audit.ts` — tabela `supplierAuditLog`
- `apps/web/src/lib/activity.ts` — helper `logUserActivity`
- `apps/web/src/lib/validation/cnpj.ts` — `normalizeCnpj` + `isValidCnpj`
- `apps/web/__tests__/cnpj.test.ts` — unit tests CNPJ
- `apps/web/__tests__/activity.test.ts` — unit tests helper
- `apps/web/src/components/entity/entity-kpis-row.tsx`
- `apps/web/src/components/entity/entity-identity-header.tsx`
- `apps/web/src/components/entity/entity-tabs.tsx`
- `apps/web/src/components/entity/entity-edit-sheet.tsx`
- `apps/web/src/components/entity/entity-audit-log-table.tsx`
- `apps/web/src/app/dashboard/_dev/entity-preview/page.tsx` — bancada visual (gated por NODE_ENV !== "production")
- `apps/web/src/app/dashboard/_dev/layout.tsx` — layout gating dev-only

**Modificados:**

- `packages/db/src/schema/auth.ts` — adicionar `user.lastLoginAt`
- `packages/db/src/schema/inventory.ts` — adicionar `branch.phone`, `branch.responsibleUserId`
- `packages/db/src/schema/tools.ts` — adicionar `supplier.website`, `supplier.cnpj`
- `packages/db/src/schema/index.ts` — exportar 2 novos arquivos (barrel intencional)
- `apps/web/src/components/activity-feed.tsx` — adicionar `"user"` em `ActivityKind` + meta

**Reusados sem mudança:**

- `apps/web/src/components/pending-panel.tsx` (já é genérico)
- `apps/web/src/components/page-header.tsx` (já é genérico)
- `apps/web/src/components/form-error-panel.tsx`

---

## Polish constraints (aplicar em TODOS os primitives)

Vindas do `DESIGN.md` e do spec (Seção "Restrições de polish"):

- Depth via surface contrast (Card do shadcn já cuida) — **não adicionar `border` extra em wrappers**.
- Hairline `border-border` somente em: divisor sob PageHeader, top de Table, separador de tab content.
- `lucide-react` icons, NUNCA emoji em UI.
- Status = ícone + label + cor. Nunca só cor.
- `font-medium` (500) default em títulos de card (seguir padrão de `CustomerKpisHeader`). `font-semibold` reservado para `PageHeader` e h2 de seção.
- Empty states = ícone Lucide grande (`size-12 opacity-40`) + label + sub-text + CTA.
- Nada de emoji em string literal (incluindo arquivos `.tsx`).
- Cor warm-dark do design system — não introduzir azuis frios.

---

### Task 1: Adicionar coluna `user.lastLoginAt`

**Files:**
- Modify: `packages/db/src/schema/auth.ts`

- [ ] **Step 1: Localizar definição da tabela `user`**

Ler `packages/db/src/schema/auth.ts`. Identificar onde `pgTable("user", { ... })` é definido.

- [ ] **Step 2: Adicionar coluna `lastLoginAt`**

Dentro do bloco de colunas de `user`, ao lado de `updatedAt`:

```ts
lastLoginAt: timestamp("last_login_at"),
```

Garantir que `timestamp` está importado de `drizzle-orm/pg-core`.

- [ ] **Step 3: Sync DB**

Run:
```bash
bun db:sync
```

Expected: drizzle-kit reporta `+ column "last_login_at" timestamp` e aplica sem prompt (é coluna nullable add — sem destrutivo).

- [ ] **Step 4: Verificar tipo TS**

Run:
```bash
bun --cwd packages/db check-types
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/auth.ts
git commit -m "feat(db): adiciona user.lastLoginAt"
```

---

### Task 2: Adicionar colunas `branch.phone` e `branch.responsibleUserId`

**Files:**
- Modify: `packages/db/src/schema/inventory.ts`

- [ ] **Step 1: Localizar tabela `branch`**

Ler `packages/db/src/schema/inventory.ts`. Identificar `export const branch = pgTable("branch", { ... })`.

- [ ] **Step 2: Adicionar colunas**

Dentro de `branch`, antes de `createdAt`:

```ts
phone: text("phone"),
responsibleUserId: text("responsible_user_id").references(() => user.id, {
  onDelete: "set null",
}),
```

Garantir import: `import { user } from "./auth";` no topo. Se já estiver, deixar.

- [ ] **Step 3: Sync DB**

Run:
```bash
bun db:sync
```

Expected: adiciona 2 colunas nullable. Sem prompt.

- [ ] **Step 4: Verificar tipo**

Run:
```bash
bun --cwd packages/db check-types
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/inventory.ts
git commit -m "feat(db): branch.phone + responsibleUserId"
```

---

### Task 3: Adicionar colunas `supplier.website` e `supplier.cnpj`

**Files:**
- Modify: `packages/db/src/schema/tools.ts`

- [ ] **Step 1: Localizar tabela `supplier`**

Ler `packages/db/src/schema/tools.ts`. Identificar `pgTable("supplier", { ... })`.

- [ ] **Step 2: Adicionar colunas + índice parcial**

Dentro de `supplier`, antes de `createdAt`:

```ts
website: text("website"),
cnpj: text("cnpj"),
```

E adicionar índice único parcial no segundo argumento de `pgTable` (table-level config):

```ts
(table) => [
  uniqueIndex("supplier_cnpj_unique_when_present")
    .on(table.cnpj)
    .where(sql`${table.cnpj} IS NOT NULL`),
]
```

Imports necessários: `sql` de `drizzle-orm`, `uniqueIndex` de `drizzle-orm/pg-core`. Se já houver outro callback de table-level config, mesclar ao array existente.

- [ ] **Step 3: Sync DB**

Run:
```bash
bun db:sync
```

Expected: adiciona 2 colunas + 1 índice parcial. Sem prompt.

- [ ] **Step 4: Verificar tipo**

Run:
```bash
bun --cwd packages/db check-types
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/tools.ts
git commit -m "feat(db): supplier.website + cnpj (unique partial)"
```

---

### Task 4: Criar schema `userActivityLog`

**Files:**
- Create: `packages/db/src/schema/user-activity.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Criar `user-activity.ts`**

```ts
import { relations } from "drizzle-orm";
import {
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

export const userActivityLog = pgTable(
	"user_activity_log",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		actorUserId: text("actor_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		action: text("action").notNull(),
		targetType: text("target_type"),
		targetId: text("target_id"),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("user_activity_actor_created_idx").on(
			table.actorUserId,
			table.createdAt.desc()
		),
		index("user_activity_target_idx").on(table.targetType, table.targetId),
		index("user_activity_action_created_idx").on(
			table.action,
			table.createdAt.desc()
		),
	]
);

export const userActivityLogRelations = relations(userActivityLog, ({ one }) => ({
	actor: one(user, {
		fields: [userActivityLog.actorUserId],
		references: [user.id],
	}),
}));

export type UserActivityLogRow = typeof userActivityLog.$inferSelect;
export type UserActivityLogInsert = typeof userActivityLog.$inferInsert;
```

- [ ] **Step 2: Exportar em `index.ts`**

Adicionar linha em `packages/db/src/schema/index.ts`:

```ts
export * from "./user-activity";
```

(Manter o `// biome-ignore lint/performance/noBarrelFile` no topo se já existe.)

- [ ] **Step 3: Sync DB**

Run:
```bash
bun db:sync
```

Expected: CREATE TABLE + 3 indexes.

- [ ] **Step 4: Verificar tipo**

Run:
```bash
bun --cwd packages/db check-types
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/user-activity.ts packages/db/src/schema/index.ts
git commit -m "feat(db): tabela userActivityLog"
```

---

### Task 5: Criar schema `supplierAuditLog`

**Files:**
- Create: `packages/db/src/schema/supplier-audit.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Criar `supplier-audit.ts` espelhando `client-audit.ts`**

```ts
import { relations, sql } from "drizzle-orm";
import {
	check,
	index,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { actorTypeEnum } from "./shared-enums";
import { supplier } from "./tools";

export const supplierAuditActionEnum = pgEnum("supplier_audit_action", [
	"created",
	"profile_updated",
	"deleted",
	"restored",
]);
export type SupplierAuditAction =
	(typeof supplierAuditActionEnum.enumValues)[number];

export const supplierAuditLog = pgTable(
	"supplier_audit_log",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		supplierId: text("supplier_id")
			.notNull()
			.references(() => supplier.id, { onDelete: "cascade" }),
		actorType: actorTypeEnum("actor_type").notNull(),
		actorUserId: text("actor_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		action: supplierAuditActionEnum("action").notNull(),
		beforeJson: jsonb("before_json"),
		afterJson: jsonb("after_json"),
		reason: text("reason"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("supplier_audit_supplier_created_idx").on(
			table.supplierId,
			table.createdAt.desc()
		),
		index("supplier_audit_action_created_idx").on(
			table.action,
			table.createdAt.desc()
		),
		check(
			"supplier_audit_actor_coherence",
			sql`(
				(${table.actorType} = 'user'   AND ${table.actorUserId} IS NOT NULL)
				OR (${table.actorType} = 'system' AND ${table.actorUserId} IS NULL)
			)`
		),
	]
);

export const supplierAuditLogRelations = relations(supplierAuditLog, ({ one }) => ({
	supplier: one(supplier, {
		fields: [supplierAuditLog.supplierId],
		references: [supplier.id],
	}),
	actor: one(user, {
		fields: [supplierAuditLog.actorUserId],
		references: [user.id],
	}),
}));

export type SupplierAuditLogRow = typeof supplierAuditLog.$inferSelect;
export type SupplierAuditLogInsert = typeof supplierAuditLog.$inferInsert;
```

- [ ] **Step 2: Exportar em `index.ts`**

```ts
export * from "./supplier-audit";
```

- [ ] **Step 3: Sync DB**

Run:
```bash
bun db:sync
```

Expected: CREATE TYPE + CREATE TABLE + 2 indexes + CHECK constraint.

- [ ] **Step 4: Verificar tipo**

Run:
```bash
bun --cwd packages/db check-types
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema/supplier-audit.ts packages/db/src/schema/index.ts
git commit -m "feat(db): tabela supplierAuditLog"
```

---

### Task 6: Helper `logUserActivity` (TDD)

**Files:**
- Create: `apps/web/__tests__/activity.test.ts`
- Create: `apps/web/src/lib/activity.ts`

- [ ] **Step 1: Escrever teste falhando**

```ts
// apps/web/__tests__/activity.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const insertMock = vi.fn().mockReturnValue({
	values: vi.fn().mockResolvedValue(undefined),
});

vi.mock("@emach/db", () => ({
	db: { insert: insertMock },
}));

vi.mock("@emach/db/schema", () => ({
	userActivityLog: { __table: "user_activity_log" },
}));

import { logUserActivity } from "@/lib/activity";

describe("logUserActivity", () => {
	beforeEach(() => {
		insertMock.mockClear();
	});

	it("insere row com actorUserId + action + metadata", async () => {
		await logUserActivity({
			actorUserId: "user-1",
			action: "user.approved",
			targetType: "user",
			targetId: "user-2",
			metadata: { reason: "ok" },
		});
		expect(insertMock).toHaveBeenCalledOnce();
		const values = insertMock.mock.results[0]?.value.values;
		expect(values).toHaveBeenCalledWith({
			actorUserId: "user-1",
			action: "user.approved",
			targetType: "user",
			targetId: "user-2",
			metadata: { reason: "ok" },
		});
	});

	it("aceita chamada sem targetType / targetId / metadata", async () => {
		await logUserActivity({
			actorUserId: "user-1",
			action: "system.healthcheck",
		});
		const values = insertMock.mock.results[0]?.value.values;
		expect(values).toHaveBeenCalledWith({
			actorUserId: "user-1",
			action: "system.healthcheck",
			targetType: null,
			targetId: null,
			metadata: null,
		});
	});
});
```

- [ ] **Step 2: Rodar teste — deve falhar**

Run:
```bash
bun --cwd apps/web test apps/web/__tests__/activity.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/activity'`.

- [ ] **Step 3: Implementar `activity.ts`**

```ts
// apps/web/src/lib/activity.ts
import "server-only";

import { db } from "@emach/db";
import { userActivityLog } from "@emach/db/schema";

import { logger } from "./logger";

export interface LogUserActivityInput {
	actorUserId: string;
	action: string;
	targetType?: string;
	targetId?: string;
	metadata?: Record<string, unknown>;
}

export async function logUserActivity(
	input: LogUserActivityInput
): Promise<void> {
	try {
		await db.insert(userActivityLog).values({
			actorUserId: input.actorUserId,
			action: input.action,
			targetType: input.targetType ?? null,
			targetId: input.targetId ?? null,
			metadata: input.metadata ?? null,
		});
	} catch (err) {
		logger.error({ err, input }, "logUserActivity failed");
	}
}
```

Nota: o helper engole falha de log (logging não pode quebrar a operação primária). É a única exceção à regra "não engolir erros" do CLAUDE.md.

- [ ] **Step 4: Rodar teste — deve passar**

Run:
```bash
bun --cwd apps/web test apps/web/__tests__/activity.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/activity.ts apps/web/__tests__/activity.test.ts
git commit -m "feat(web): helper logUserActivity"
```

---

### Task 7: Helper de validação CNPJ (TDD)

**Files:**
- Create: `apps/web/__tests__/cnpj.test.ts`
- Create: `apps/web/src/lib/validation/cnpj.ts`

- [ ] **Step 1: Escrever testes falhando**

```ts
// apps/web/__tests__/cnpj.test.ts
import { describe, expect, it } from "vitest";

import { isValidCnpj, normalizeCnpj } from "@/lib/validation/cnpj";

describe("normalizeCnpj", () => {
	it("remove caracteres não numéricos", () => {
		expect(normalizeCnpj("11.444.777/0001-61")).toBe("11444777000161");
		expect(normalizeCnpj("  11444777000161  ")).toBe("11444777000161");
	});

	it("retorna string vazia para input vazio", () => {
		expect(normalizeCnpj("")).toBe("");
		expect(normalizeCnpj("   ")).toBe("");
	});
});

describe("isValidCnpj", () => {
	it("aceita CNPJs com dígitos verificadores corretos", () => {
		expect(isValidCnpj("11.444.777/0001-61")).toBe(true);
		expect(isValidCnpj("11444777000161")).toBe(true);
	});

	it("rejeita comprimento errado", () => {
		expect(isValidCnpj("11444777000")).toBe(false);
		expect(isValidCnpj("114447770001610")).toBe(false);
	});

	it("rejeita todos os dígitos iguais (caso patológico)", () => {
		expect(isValidCnpj("00000000000000")).toBe(false);
		expect(isValidCnpj("11111111111111")).toBe(false);
	});

	it("rejeita dígito verificador incorreto", () => {
		expect(isValidCnpj("11444777000162")).toBe(false);
		expect(isValidCnpj("11444777000171")).toBe(false);
	});
});
```

- [ ] **Step 2: Rodar — deve falhar**

Run:
```bash
bun --cwd apps/web test apps/web/__tests__/cnpj.test.ts
```

Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementar**

```ts
// apps/web/src/lib/validation/cnpj.ts
const FIRST_WEIGHTS = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const SECOND_WEIGHTS = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

export function normalizeCnpj(input: string): string {
	return input.replace(/\D/g, "");
}

function calcCheckDigit(digits: string, weights: number[]): number {
	let sum = 0;
	for (let i = 0; i < weights.length; i++) {
		sum += Number(digits[i]) * (weights[i] ?? 0);
	}
	const rem = sum % 11;
	return rem < 2 ? 0 : 11 - rem;
}

export function isValidCnpj(input: string): boolean {
	const cnpj = normalizeCnpj(input);
	if (cnpj.length !== 14) return false;
	if (/^(\d)\1{13}$/.test(cnpj)) return false;
	const d1 = calcCheckDigit(cnpj.slice(0, 12), FIRST_WEIGHTS);
	if (d1 !== Number(cnpj[12])) return false;
	const d2 = calcCheckDigit(cnpj.slice(0, 13), SECOND_WEIGHTS);
	return d2 === Number(cnpj[13]);
}
```

- [ ] **Step 4: Rodar — deve passar**

Run:
```bash
bun --cwd apps/web test apps/web/__tests__/cnpj.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/validation/cnpj.ts apps/web/__tests__/cnpj.test.ts
git commit -m "feat(web): helper validação CNPJ"
```

---

### Task 8: Adicionar `"user"` em `ActivityKind`

**Files:**
- Modify: `apps/web/src/components/activity-feed.tsx`

- [ ] **Step 1: Localizar `ActivityKind` e `KIND_META`**

No topo do arquivo. Adicionar `"user"` ao union e ao mapa.

- [ ] **Step 2: Editar**

Trocar:
```ts
export type ActivityKind = "order" | "review" | "stock" | "customer";
```
Por:
```ts
export type ActivityKind = "order" | "review" | "stock" | "customer" | "user";
```

E em `KIND_META`, adicionar entrada:
```ts
user: { icon: UserCogIcon, color: "text-info" },
```

Adicionar `UserCogIcon` ao import de `lucide-react` (substituir `UserIcon` se está usado só para customer? Confirmar — manter ambos se necessário).

- [ ] **Step 3: Verificar tipo**

Run:
```bash
bun --cwd apps/web check-types
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/activity-feed.tsx
git commit -m "feat(web): ActivityFeed aceita kind 'user'"
```

---

### Task 9: `EntityKpisRow` primitive

**Files:**
- Create: `apps/web/src/components/entity/entity-kpis-row.tsx`

- [ ] **Step 1: Implementar componente**

```tsx
// apps/web/src/components/entity/entity-kpis-row.tsx
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { cn } from "@emach/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export type KpiTone = "default" | "warning" | "danger" | "success";

export interface KpiItem {
	label: string;
	value: ReactNode;
	hint?: ReactNode;
	icon?: LucideIcon;
	tone?: KpiTone;
	href?: string;
}

interface Props {
	items: KpiItem[];
}

const TONE_VALUE: Record<KpiTone, string> = {
	default: "text-foreground",
	warning: "text-warning",
	danger: "text-destructive",
	success: "text-success",
};

const TONE_ICON: Record<KpiTone, string> = {
	default: "text-muted-foreground",
	warning: "text-warning",
	danger: "text-destructive",
	success: "text-success",
};

export function EntityKpisRow({ items }: Props) {
	return (
		<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
			{items.map((item) => {
				const tone = item.tone ?? "default";
				const Icon = item.icon;
				const inner = (
					<Card className="h-full">
						<CardHeader className="flex flex-row items-center justify-between gap-2 pb-1">
							<CardTitle className="text-muted-foreground text-xs uppercase tracking-wide">
								{item.label}
							</CardTitle>
							{Icon ? (
								<Icon className={cn("size-4", TONE_ICON[tone])} aria-hidden />
							) : null}
						</CardHeader>
						<CardContent>
							<p
								className={cn(
									"font-medium text-2xl tracking-tight tabular-nums",
									TONE_VALUE[tone]
								)}
							>
								{item.value}
							</p>
							{item.hint ? (
								<p className="text-muted-foreground text-xs">{item.hint}</p>
							) : null}
						</CardContent>
					</Card>
				);
				return (
					<div key={item.label}>
						{item.href ? (
							<Link
								className="block transition-opacity hover:opacity-80"
								href={item.href}
							>
								{inner}
							</Link>
						) : (
							inner
						)}
					</div>
				);
			})}
		</div>
	);
}
```

- [ ] **Step 2: Verificar tipo**

Run:
```bash
bun --cwd apps/web check-types
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/entity/entity-kpis-row.tsx
git commit -m "feat(web): EntityKpisRow primitive"
```

---

### Task 10: `EntityIdentityHeader` primitive

**Files:**
- Create: `apps/web/src/components/entity/entity-identity-header.tsx`

- [ ] **Step 1: Implementar**

```tsx
// apps/web/src/components/entity/entity-identity-header.tsx
import { Avatar, AvatarFallback, AvatarImage } from "@emach/ui/components/avatar";
import { cn } from "@emach/ui/lib/utils";
import type { ReactNode } from "react";

interface Props {
	avatarUrl?: string | null;
	avatarFallback: ReactNode; // 1–2 chars OR ícone Lucide
	title: ReactNode;
	subtitle?: ReactNode;
	badges?: ReactNode;
	actions?: ReactNode;
	className?: string;
}

export function EntityIdentityHeader({
	avatarUrl,
	avatarFallback,
	title,
	subtitle,
	badges,
	actions,
	className,
}: Props) {
	return (
		<div
			className={cn(
				"flex flex-col gap-4 border-border border-b pb-4 sm:flex-row sm:items-center sm:justify-between",
				className
			)}
		>
			<div className="flex min-w-0 items-center gap-3">
				<Avatar className="size-12 shrink-0">
					{avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
					<AvatarFallback className="bg-muted text-base">
						{avatarFallback}
					</AvatarFallback>
				</Avatar>
				<div className="min-w-0">
					<h1 className="truncate font-medium text-xl leading-tight">
						{title}
					</h1>
					{subtitle ? (
						<p className="truncate text-muted-foreground text-sm">
							{subtitle}
						</p>
					) : null}
					{badges ? (
						<div className="mt-1.5 flex flex-wrap gap-1.5">{badges}</div>
					) : null}
				</div>
			</div>
			{actions ? (
				<div className="flex shrink-0 flex-wrap items-center gap-2">
					{actions}
				</div>
			) : null}
		</div>
	);
}
```

- [ ] **Step 2: Verificar tipo**

Run:
```bash
bun --cwd apps/web check-types
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/entity/entity-identity-header.tsx
git commit -m "feat(web): EntityIdentityHeader primitive"
```

---

### Task 11: `EntityTabs` primitive

**Files:**
- Create: `apps/web/src/components/entity/entity-tabs.tsx`

- [ ] **Step 1: Implementar (Client Component — usa Link prefetch + nuqs-like via window? Não — usa Tabs do shadcn com value/onValueChange acoplado a router para preservar URL)**

```tsx
// apps/web/src/components/entity/entity-tabs.tsx
"use client";

import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@emach/ui/components/tabs";
import { cn } from "@emach/ui/lib/utils";
import type { LucideIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

export interface EntityTab {
	value: string;
	label: ReactNode;
	icon?: LucideIcon;
	badge?: ReactNode;
	content: ReactNode;
}

interface Props {
	tabs: EntityTab[];
	defaultValue: string;
	paramName?: string;
	className?: string;
}

export function EntityTabs({
	tabs,
	defaultValue,
	paramName = "tab",
	className,
}: Props) {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const current = params.get(paramName) ?? defaultValue;

	const handleChange = (next: string) => {
		const sp = new URLSearchParams(params);
		if (next === defaultValue) {
			sp.delete(paramName);
		} else {
			sp.set(paramName, next);
		}
		const qs = sp.toString();
		router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
	};

	return (
		<Tabs
			className={cn("w-full", className)}
			onValueChange={handleChange}
			value={current}
		>
			<TabsList className="w-full justify-start overflow-x-auto">
				{tabs.map((tab) => {
					const Icon = tab.icon;
					return (
						<TabsTrigger
							className="flex items-center gap-1.5"
							key={tab.value}
							value={tab.value}
						>
							{Icon ? <Icon className="size-3.5" aria-hidden /> : null}
							{tab.label}
							{tab.badge}
						</TabsTrigger>
					);
				})}
			</TabsList>
			{tabs.map((tab) => (
				<TabsContent
					className="mt-4 focus-visible:outline-none"
					key={tab.value}
					value={tab.value}
				>
					{tab.content}
				</TabsContent>
			))}
		</Tabs>
	);
}
```

- [ ] **Step 2: Verificar tipo**

Run:
```bash
bun --cwd apps/web check-types
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/entity/entity-tabs.tsx
git commit -m "feat(web): EntityTabs primitive com URL state"
```

---

### Task 12: `EntityEditSheet` primitive

**Files:**
- Create: `apps/web/src/components/entity/entity-edit-sheet.tsx`

- [ ] **Step 1: Implementar (sheet padronizada com form slot + footer)**

```tsx
// apps/web/src/components/entity/entity-edit-sheet.tsx
"use client";

import { Button } from "@emach/ui/components/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@emach/ui/components/sheet";
import type { FormEvent, ReactNode } from "react";

import { FormErrorPanel } from "@/components/form-error-panel";

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: ReactNode;
	description?: ReactNode;
	errors?: string[];
	submitting?: boolean;
	submitLabel?: string;
	cancelLabel?: string;
	onSubmit: (e: FormEvent<HTMLFormElement>) => void;
	children: ReactNode;
}

export function EntityEditSheet({
	open,
	onOpenChange,
	title,
	description,
	errors,
	submitting = false,
	submitLabel = "Salvar",
	cancelLabel = "Cancelar",
	onSubmit,
	children,
}: Props) {
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
				<SheetHeader className="border-border border-b">
					<SheetTitle>{title}</SheetTitle>
					{description ? <SheetDescription>{description}</SheetDescription> : null}
				</SheetHeader>
				<form
					className="flex min-h-0 flex-1 flex-col"
					onSubmit={onSubmit}
				>
					<div className="flex-1 overflow-y-auto p-6">
						{errors && errors.length > 0 ? (
							<FormErrorPanel errors={errors} className="mb-4" />
						) : null}
						{children}
					</div>
					<SheetFooter className="border-border border-t">
						<Button
							disabled={submitting}
							onClick={() => onOpenChange(false)}
							type="button"
							variant="outline"
						>
							{cancelLabel}
						</Button>
						<Button disabled={submitting} type="submit">
							{submitting ? "Salvando…" : submitLabel}
						</Button>
					</SheetFooter>
				</form>
			</SheetContent>
		</Sheet>
	);
}
```

Nota: depende de `FormErrorPanel` aceitar prop `className` — confirmar lendo o componente; ajustar se necessário.

- [ ] **Step 2: Verificar `FormErrorPanel` props**

Read `apps/web/src/components/form-error-panel.tsx`. Se não aceita `className`, adicionar prop opcional `className?: string` e aplicar via `cn`. Commit separado se isso for necessário.

- [ ] **Step 3: Verificar tipo**

Run:
```bash
bun --cwd apps/web check-types
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/entity/entity-edit-sheet.tsx apps/web/src/components/form-error-panel.tsx
git commit -m "feat(web): EntityEditSheet primitive"
```

---

### Task 13: `EntityAuditLogTable` primitive

**Files:**
- Create: `apps/web/src/components/entity/entity-audit-log-table.tsx`

- [ ] **Step 1: Implementar — tabela com expand row para diff before/after**

```tsx
// apps/web/src/components/entity/entity-audit-log-table.tsx
"use client";

import { Badge } from "@emach/ui/components/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";
import { cn } from "@emach/ui/lib/utils";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";

export interface AuditEntry {
	id: string;
	at: Date;
	action: string;
	actor: { id: string | null; name: string; type: "user" | "system" };
	target?: { label: string; href?: string };
	before?: Record<string, unknown> | null;
	after?: Record<string, unknown> | null;
	reason?: string | null;
}

interface Props {
	entries: AuditEntry[];
	actionLabels?: Record<string, string>;
	emptyMessage?: string;
}

const DATETIME = new Intl.DateTimeFormat("pt-BR", {
	dateStyle: "short",
	timeStyle: "short",
});

function hasDiff(entry: AuditEntry): boolean {
	return Boolean(
		(entry.before && Object.keys(entry.before).length > 0) ||
			(entry.after && Object.keys(entry.after).length > 0) ||
			entry.reason
	);
}

export function EntityAuditLogTable({
	entries,
	actionLabels = {},
	emptyMessage = "Sem registros.",
}: Props) {
	const [expanded, setExpanded] = useState<Set<string>>(new Set());

	if (entries.length === 0) {
		return (
			<p className="py-8 text-center text-muted-foreground text-sm">
				{emptyMessage}
			</p>
		);
	}

	const toggle = (id: string) => {
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead className="w-10" />
					<TableHead>Quando</TableHead>
					<TableHead>Ator</TableHead>
					<TableHead>Ação</TableHead>
					<TableHead>Alvo</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{entries.map((entry) => {
					const isOpen = expanded.has(entry.id);
					const expandable = hasDiff(entry);
					return (
						<>
							<TableRow
								className={cn(expandable && "cursor-pointer")}
								key={entry.id}
								onClick={() => expandable && toggle(entry.id)}
							>
								<TableCell>
									{expandable ? (
										isOpen ? (
											<ChevronDownIcon className="size-4 text-muted-foreground" />
										) : (
											<ChevronRightIcon className="size-4 text-muted-foreground" />
										)
									) : null}
								</TableCell>
								<TableCell className="tabular-nums text-sm">
									{DATETIME.format(entry.at)}
								</TableCell>
								<TableCell className="text-sm">
									{entry.actor.name}
									{entry.actor.type === "system" ? (
										<Badge className="ml-1.5" variant="outline">
											sistema
										</Badge>
									) : null}
								</TableCell>
								<TableCell>
									<Badge variant="secondary">
										{actionLabels[entry.action] ?? entry.action}
									</Badge>
								</TableCell>
								<TableCell className="text-sm">
									{entry.target?.label ?? "—"}
								</TableCell>
							</TableRow>
							{isOpen && expandable ? (
								<TableRow key={`${entry.id}-detail`}>
									<TableCell />
									<TableCell className="bg-muted/30" colSpan={4}>
										{entry.reason ? (
											<p className="mb-2 text-sm">
												<span className="font-medium">Motivo:</span>{" "}
												{entry.reason}
											</p>
										) : null}
										<div className="grid gap-3 sm:grid-cols-2">
											{entry.before ? (
												<div>
													<p className="mb-1 text-muted-foreground text-xs uppercase">
														Antes
													</p>
													<pre className="rounded border-border bg-background p-2 text-xs">
														{JSON.stringify(entry.before, null, 2)}
													</pre>
												</div>
											) : null}
											{entry.after ? (
												<div>
													<p className="mb-1 text-muted-foreground text-xs uppercase">
														Depois
													</p>
													<pre className="rounded border-border bg-background p-2 text-xs">
														{JSON.stringify(entry.after, null, 2)}
													</pre>
												</div>
											) : null}
										</div>
									</TableCell>
								</TableRow>
							) : null}
						</>
					);
				})}
			</TableBody>
		</Table>
	);
}
```

- [ ] **Step 2: Verificar tipo**

Run:
```bash
bun --cwd apps/web check-types
```

Expected: PASS. Se React complains sobre `<>` fragment dentro de `TableBody`, trocar por uma key estável usando `React.Fragment`:

```tsx
import { Fragment } from "react";
// ...
<Fragment key={entry.id}>{/* rows */}</Fragment>
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/entity/entity-audit-log-table.tsx
git commit -m "feat(web): EntityAuditLogTable primitive"
```

---

### Task 14: Rota dev-only `/dashboard/_dev/entity-preview`

**Files:**
- Create: `apps/web/src/app/dashboard/_dev/layout.tsx`
- Create: `apps/web/src/app/dashboard/_dev/entity-preview/page.tsx`

- [ ] **Step 1: Criar layout gating**

```tsx
// apps/web/src/app/dashboard/_dev/layout.tsx
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

export default function DevLayout({ children }: { children: ReactNode }) {
	if (process.env.NODE_ENV === "production") {
		notFound();
	}
	return children;
}
```

- [ ] **Step 2: Criar page com todos os primitives**

```tsx
// apps/web/src/app/dashboard/_dev/entity-preview/page.tsx
"use client";

import { Badge } from "@emach/ui/components/badge";
import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import {
	AlertCircle,
	Ban,
	Building2,
	CheckCircle2,
	Clock,
	Factory,
	Package,
} from "lucide-react";
import { useState } from "react";

import { EntityAuditLogTable } from "@/components/entity/entity-audit-log-table";
import { EntityEditSheet } from "@/components/entity/entity-edit-sheet";
import { EntityIdentityHeader } from "@/components/entity/entity-identity-header";
import { EntityKpisRow } from "@/components/entity/entity-kpis-row";
import { EntityTabs } from "@/components/entity/entity-tabs";
import { PageHeader } from "@/components/page-header";

const SAMPLE_AUDIT = [
	{
		id: "a1",
		at: new Date("2026-05-19T14:32:00"),
		action: "profile_updated",
		actor: { id: "u1", name: "João Mendes", type: "user" as const },
		target: { label: "Joaquim Industrial" },
		before: { phone: "11 9999-1111" },
		after: { phone: "11 9999-2222" },
	},
	{
		id: "a2",
		at: new Date("2026-05-18T09:10:00"),
		action: "created",
		actor: { id: null, name: "sistema", type: "system" as const },
		target: { label: "Joaquim Industrial" },
	},
];

export default function EntityPreview() {
	const [open, setOpen] = useState(false);
	return (
		<div className="space-y-8">
			<PageHeader
				title="Entity Preview"
				description="Bancada visual dos primitives da Fase 0"
			/>

			<section className="space-y-3">
				<h2 className="font-semibold text-lg">EntityKpisRow</h2>
				<EntityKpisRow
					items={[
						{ label: "Ativos", value: 12, icon: CheckCircle2 },
						{
							label: "Pendentes",
							value: 3,
							tone: "warning",
							icon: Clock,
							href: "?status=pending",
						},
						{ label: "Suspensos", value: 1, icon: Ban },
						{ label: "Filiais", value: 4, icon: Building2 },
					]}
				/>
			</section>

			<section className="space-y-3">
				<h2 className="font-semibold text-lg">EntityIdentityHeader</h2>
				<EntityIdentityHeader
					avatarFallback="JM"
					title="João Mendes"
					subtitle="joao@emach.com.br"
					badges={
						<>
							<Badge>Admin</Badge>
							<Badge variant="outline">
								<CheckCircle2 className="mr-1 size-3" /> Ativo
							</Badge>
						</>
					}
					actions={
						<>
							<Button onClick={() => setOpen(true)}>Editar</Button>
							<Button variant="outline">Reset senha</Button>
							<Button variant="outline">Suspender</Button>
						</>
					}
				/>
				<EntityIdentityHeader
					avatarFallback={<Factory className="size-5" />}
					title="Joaquim Industrial Ltda"
					subtitle="contato@joaquim.com.br"
					badges={<Badge variant="outline">website</Badge>}
				/>
			</section>

			<section className="space-y-3">
				<h2 className="font-semibold text-lg">EntityTabs</h2>
				<EntityTabs
					defaultValue="profile"
					tabs={[
						{
							value: "profile",
							label: "Perfil",
							content: <p>Conteúdo perfil</p>,
						},
						{
							value: "branches",
							label: "Filiais",
							badge: (
								<Badge className="ml-1" variant="secondary">
									2
								</Badge>
							),
							content: <p>Conteúdo filiais</p>,
						},
						{
							value: "activity",
							label: "Atividade",
							content: <p>Conteúdo atividade</p>,
						},
					]}
				/>
			</section>

			<section className="space-y-3">
				<h2 className="font-semibold text-lg">EntityAuditLogTable</h2>
				<EntityAuditLogTable
					entries={SAMPLE_AUDIT}
					actionLabels={{
						profile_updated: "Perfil atualizado",
						created: "Criado",
					}}
				/>
			</section>

			<section className="space-y-3">
				<h2 className="font-semibold text-lg">EntityEditSheet</h2>
				<Button onClick={() => setOpen(true)}>Abrir sheet</Button>
				<EntityEditSheet
					onOpenChange={setOpen}
					onSubmit={(e) => {
						e.preventDefault();
						setOpen(false);
					}}
					open={open}
					title="Editar usuário"
					description="Atualize os dados do usuário"
				>
					<div className="space-y-4">
						<div>
							<Label htmlFor="name">Nome</Label>
							<Input defaultValue="João Mendes" id="name" />
						</div>
						<div>
							<Label htmlFor="email">Email</Label>
							<Input defaultValue="joao@emach.com.br" id="email" />
						</div>
					</div>
				</EntityEditSheet>
			</section>
		</div>
	);
}
```

- [ ] **Step 3: Smoke run**

Run:
```bash
bun dev:web
```

Abrir `http://localhost:3001/dashboard/_dev/entity-preview` (precisa estar logado). Verificar:
- Todos os primitives renderizam sem erro no console
- EntityTabs muda `?tab=...` na URL ao clicar
- EntityEditSheet abre/fecha
- EntityAuditLogTable expande a primeira linha ao clicar

- [ ] **Step 4: `nextjs_call get_errors` para confirmar sem SSR error**

Via MCP `next-devtools` (se disponível): chamar `nextjs_call 3001 get_errors`. Expected: empty.

- [ ] **Step 5: Verificar tipo**

Run:
```bash
bun --cwd apps/web check-types
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/_dev/
git commit -m "feat(web): rota dev-only entity-preview"
```

---

### Task 15: Impeccable audit + polish

**Files:**
- Iterar nos primitives criados nas tasks 9–13.

- [ ] **Step 1: Invocar skill `impeccable`**

No prompt do agent executor:
> Invoque a skill `impeccable` sub-task `audit` na rota `/dashboard/_dev/entity-preview` (rodar `bun dev:web` antes). Aplicar as Restrições de polish do spec em `docs/superpowers/specs/2026-05-20-users-branches-suppliers-design.md`. Foco: depth via surface, sem borders extras, status com ícone+label+cor, Lucide-only, font-medium default.

- [ ] **Step 2: Aplicar ajustes recomendados**

Editar os primitives conforme findings da skill. Cada ajuste fica num commit pequeno: `style(entity): {nome do primitive} {ajuste}`.

- [ ] **Step 3: Re-rodar audit até verde**

Iterar até a skill considerar OK.

- [ ] **Step 4: Verificação final**

Run:
```bash
bun check-types
bun fix
```

Expected: PASS sem warnings em arquivos novos.

---

### Task 16: Verificação final + push

- [ ] **Step 1: Rodar testes**

Run:
```bash
bun --cwd apps/web test
```

Expected: 4 tests (CNPJ + activity helper) verde, mais o que já tinha.

- [ ] **Step 2: Rodar check-types em todos os workspaces**

Run:
```bash
bun check-types
```

Expected: PASS em todos.

- [ ] **Step 3: Rodar lint**

Run:
```bash
bun check
```

Expected: PASS em todos os arquivos novos.

- [ ] **Step 4: Smoke run final**

Run:
```bash
bun dev:web
```

Visitar:
- `/dashboard` (homepage não regrediu)
- `/dashboard/_dev/entity-preview` (todos primitives ok)
- `/dashboard/customers` (activity-feed não regrediu com o novo kind)

- [ ] **Step 5: Confirmar com usuário antes de push**

Pedir aprovação explícita antes de `git push`. Listar os commits da fase com `git log --oneline origin/main..HEAD`.

- [ ] **Step 6: Push (APÓS aprovação explícita)**

```bash
git push origin <branch>
```

Abrir PR via `gh pr create` com título `feat: Fase 0 — primitives e schemas` e body com checklist do que foi entregue.

---

## Self-review checklist

**Cobertura do spec:**

- [x] `entity-kpis-row.tsx` → Task 9
- [x] `entity-identity-header.tsx` → Task 10
- [x] `entity-tabs.tsx` → Task 11
- [x] `entity-edit-sheet.tsx` → Task 12
- [x] `entity-audit-log-table.tsx` → Task 13
- [x] `entity-pending-panel.tsx` → não criado (reuso direto de `pending-panel.tsx`)
- [x] `entity-activity-feed.tsx` → não criado (refinement de `activity-feed.tsx` para aceitar `"user"` kind — Task 8)
- [x] `userActivityLog` table → Task 4
- [x] `supplierAuditLog` table → Task 5
- [x] `logUserActivity` helper → Task 6
- [x] `user.lastLoginAt` → Task 1
- [x] `branch.phone` + `responsibleUserId` → Task 2
- [x] `supplier.website` + `cnpj` → Task 3
- [x] CNPJ validation helper → Task 7
- [x] Rota dev-only preview → Task 14
- [x] Skill impeccable audit → Task 15
- [x] Push gated por aprovação explícita → Task 16
