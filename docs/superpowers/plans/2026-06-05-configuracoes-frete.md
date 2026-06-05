# Seção Configurações + aba Frete (#117) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a seção Configurações no dashboard (`/dashboard/site/settings`) com aba Frete funcional — origem do despacho + política de seguro num singleton `store_settings` — e o campo por-produto de frete pesado no editor de ferramenta.

**Architecture:** Tabela singleton `store_settings` (push-only, ADR-0006) lida/criada lazy pelo Server Component da página. Form client segue o padrão `BranchForm` (useTransition + safeParse + FormErrorPanel). Query helper `getShippingSettings` entra na superfície de sync (`queries/`) pro storefront consumir via CI (ADR-0009). Campo `tool.overweightShippingAmount` reusa a UX de aviso de frete já existente no tool form.

**Tech Stack:** Drizzle 0.45 (pgTable/check/numeric), Next 16 RSC + server actions, React 19, Zod, `@emach/ui` (Tabs, Select), Better Auth dashboard session.

**Spec de origem:** `docs/superpowers/specs/2026-06-05-configuracoes-frete-design.md`. Mockup aprovado: `.superpowers/brainstorm/632671-1780670753/content/configuracoes-frete-v4.html`.

**Decisão corrigida vs spec:** a capability é **`site.update_settings`** (já existe em `apps/web/src/lib/permissions.ts:40`), não `settings.manage`. ADR-0012 proíbe capability nova — usar a existente.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `packages/db/src/schema/store-settings.ts` (criar) | Tabela singleton `store_settings` |
| `packages/db/src/schema/index.ts` (modificar) | Adicionar export do novo schema ao barrel |
| `packages/db/src/schema/tools.ts` (modificar) | Coluna `overweightShippingAmount` + check |
| `packages/db/src/queries/store-settings.ts` (criar) | `getShippingSettings()` — contrato storefront (sync CI) |
| `apps/web/src/app/dashboard/site/settings/_components/shipping-schema.ts` (criar) | Zod `shippingSettingsSchema` + tipos |
| `apps/web/src/app/dashboard/site/settings/actions.ts` (criar) | `getOrCreateShippingSettings` + `updateShippingSettings` |
| `apps/web/src/app/dashboard/site/settings/page.tsx` (criar) | Server Component: header + tabs + grid |
| `apps/web/src/app/dashboard/site/settings/_components/shipping-settings-form.tsx` (criar) | Client form (cards Origem + Seguro) |
| `apps/web/src/app/dashboard/site/settings/_components/shipping-preview-rail.tsx` (criar) | Trilho "Como o cliente vê" (server) |
| `apps/web/src/app/dashboard/_components/nav-config.ts` (modificar) | Mover Configurações p/ grupo "Sistema", remover `disabled` |
| `apps/web/src/app/dashboard/tools/_components/tool-schema.ts` (modificar) | Campo `overweightShippingAmount` no Zod |
| `apps/web/src/app/dashboard/tools/_components/tool-form.tsx` (modificar) | Input condicional no bloco de aviso de frete |
| `apps/web/src/app/dashboard/tools/actions.ts` (modificar) | `normalizeToolPayload` inclui o novo campo |

Ordem de execução respeita dependências: schema → query/action → UI. Frente do tool (Tasks 7-8) é independente das Tasks 3-6 e pode ir em paralelo após a Task 1.

---

### Task 1: Schema — tabela `store_settings` + coluna `tool.overweightShippingAmount`

**Files:**
- Create: `packages/db/src/schema/store-settings.ts`
- Modify: `packages/db/src/schema/index.ts:16` (adicionar export)
- Modify: `packages/db/src/schema/tools.ts:81` (coluna) e `:110` (check)

- [ ] **Step 1: Criar o schema da tabela singleton**

Create `packages/db/src/schema/store-settings.ts`:

```ts
import { sql } from "drizzle-orm";
import {
	check,
	numeric,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

import { branch } from "./inventory";

export type ShippingInsurancePolicy = "none" | "cart_value";

export const storeSettings = pgTable(
	"store_settings",
	{
		// Singleton: id fixo "singleton" garantido pelo check abaixo.
		id: text("id").primaryKey().default("singleton"),
		shippingOriginBranchId: text("shipping_origin_branch_id").references(
			() => branch.id,
			{ onDelete: "set null" }
		),
		shippingInsurancePolicy: text("shipping_insurance_policy")
			.$type<ShippingInsurancePolicy>()
			.notNull()
			.default("none"),
		shippingInsuranceCapAmount: numeric("shipping_insurance_cap_amount", {
			precision: 10,
			scale: 2,
		})
			.notNull()
			.default("3000.00"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		check("store_settings_singleton", sql`${table.id} = 'singleton'`),
		check(
			"insurance_policy_valid",
			sql`${table.shippingInsurancePolicy} IN ('none','cart_value')`
		),
		check(
			"insurance_cap_non_negative",
			sql`${table.shippingInsuranceCapAmount} >= 0`
		),
	]
);

export type StoreSettings = typeof storeSettings.$inferSelect;
export type NewStoreSettings = typeof storeSettings.$inferInsert;
```

- [ ] **Step 2: Adicionar ao barrel** (`packages/db/src/schema/index.ts`)

Inserir em ordem alfabética, após a linha `export * from "./stock-movements";`:

```ts
export * from "./store-settings";
```

- [ ] **Step 3: Adicionar a coluna `overweightShippingAmount` em `tool`**

Em `packages/db/src/schema/tools.ts`, dentro do objeto `tool` (após `supplierId`, antes de `createdAt`, ~linha 81):

```ts
		// Frete por-produto p/ itens > 30kg (teto SuperFrete). Null = "a combinar".
		overweightShippingAmount: numeric("overweight_shipping_amount", {
			precision: 10,
			scale: 2,
		}),
```

E no array de constraints do `tool` (após o check `power_watts_positive`, ~linha 109):

```ts
		check(
			"overweight_shipping_non_negative",
			sql`${table.overweightShippingAmount} IS NULL OR ${table.overweightShippingAmount} >= 0`
		),
```

- [ ] **Step 4: Aplicar no banco**

Run: `cd packages/db && bun db:sync`
Expected: drizzle-kit push cria a tabela `store_settings` e a coluna `overweight_shipping_amount` sem erro. Se pedir confirmação TTY de rename ambíguo, rodar interativo (gotcha em `packages/db/CLAUDE.md`).

- [ ] **Step 5: Verificar tipos**

Run: `bun check-types`
Expected: PASS. `StoreSettings`/`storeSettings` resolvem; `tool.$inferSelect` ganha `overweightShippingAmount: string | null`.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema/store-settings.ts packages/db/src/schema/index.ts packages/db/src/schema/tools.ts
git commit -m "feat(db): tabela store_settings + tool.overweightShippingAmount"
```

---

### Task 2: Query helper `getShippingSettings` (contrato storefront)

**Files:**
- Create: `packages/db/src/queries/store-settings.ts`

> Dentro da superfície de sync (`queries/`) — **não importar de fora de `queries/`/`schema/`** (incidente #88). Assinatura `db` parametrizado, não singleton.

- [ ] **Step 1: Criar o query helper**

Create `packages/db/src/queries/store-settings.ts`:

```ts
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { branch } from "../schema/inventory";
import {
	type ShippingInsurancePolicy,
	storeSettings,
} from "../schema/store-settings";

export type ShippingSettings = {
	originBranchId: string | null;
	originCep: string | null;
	insurancePolicy: ShippingInsurancePolicy;
	insuranceCapAmount: number;
};

const DEFAULTS: ShippingSettings = {
	originBranchId: null,
	originCep: null,
	insurancePolicy: "none",
	insuranceCapAmount: 3000,
};

/**
 * Settings de frete owned-by-dashboard. Consumido pelo storefront (emach-ecommerce)
 * via schema/query sincronizados por CI (ADR-0009). Substitui getOriginBranchCep()
 * baseado em env. Sem linha singleton → DEFAULTS (espelha o storefront atual).
 */
export async function getShippingSettings(
	db: NodePgDatabase<Record<string, unknown>>
): Promise<ShippingSettings> {
	const rows = await db
		.select({
			originBranchId: storeSettings.shippingOriginBranchId,
			originCep: branch.cep,
			insurancePolicy: storeSettings.shippingInsurancePolicy,
			insuranceCapAmount: storeSettings.shippingInsuranceCapAmount,
		})
		.from(storeSettings)
		.leftJoin(branch, eq(storeSettings.shippingOriginBranchId, branch.id))
		.where(eq(storeSettings.id, "singleton"))
		.limit(1);

	const row = rows[0];
	if (!row) {
		return DEFAULTS;
	}
	return {
		originBranchId: row.originBranchId,
		originCep: row.originCep,
		insurancePolicy: row.insurancePolicy,
		insuranceCapAmount: Number(row.insuranceCapAmount),
	};
}
```

- [ ] **Step 2: Verificar tipos**

Run: `bun check-types`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/queries/store-settings.ts
git commit -m "feat(db): getShippingSettings query helper (contrato storefront)"
```

---

### Task 3: Zod schema da aba Frete

**Files:**
- Create: `apps/web/src/app/dashboard/site/settings/_components/shipping-schema.ts`
- Test: `apps/web/src/app/dashboard/site/settings/_components/__tests__/shipping-schema.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Create `apps/web/src/app/dashboard/site/settings/_components/__tests__/shipping-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { shippingSettingsSchema } from "../shipping-schema";

describe("shippingSettingsSchema", () => {
	it("aceita política none sem origem", () => {
		const r = shippingSettingsSchema.safeParse({
			originBranchId: "",
			insurancePolicy: "none",
			insuranceCapAmount: 3000,
		});
		expect(r.success).toBe(true);
		if (r.success) {
			expect(r.data.originBranchId).toBeUndefined();
		}
	});

	it("rejeita política inválida", () => {
		const r = shippingSettingsSchema.safeParse({
			insurancePolicy: "full",
			insuranceCapAmount: 3000,
		});
		expect(r.success).toBe(false);
	});

	it("rejeita teto negativo", () => {
		const r = shippingSettingsSchema.safeParse({
			insurancePolicy: "cart_value",
			insuranceCapAmount: -1,
		});
		expect(r.success).toBe(false);
	});
});
```

- [ ] **Step 2: Rodar pra confirmar que falha**

Run: `bun vitest run apps/web/src/app/dashboard/site/settings/_components/__tests__/shipping-schema.test.ts`
Expected: FAIL — `Cannot find module '../shipping-schema'`.

- [ ] **Step 3: Implementar o schema**

Create `apps/web/src/app/dashboard/site/settings/_components/shipping-schema.ts`:

```ts
import { z } from "zod";

export const INSURANCE_POLICY_OPTIONS = ["none", "cart_value"] as const;

export const INSURANCE_POLICY_LABELS: Record<
	(typeof INSURANCE_POLICY_OPTIONS)[number],
	string
> = {
	none: "Sem seguro",
	cart_value: "Declarar o valor do carrinho",
};

export const shippingSettingsSchema = z.object({
	originBranchId: z
		.string()
		.trim()
		.optional()
		.or(z.literal(""))
		.transform((v) => (v ? v : undefined)),
	insurancePolicy: z.enum(INSURANCE_POLICY_OPTIONS),
	insuranceCapAmount: z
		.number({ error: "Informe o teto do seguro" })
		.nonnegative("Teto não pode ser negativo")
		.max(100_000, "Teto muito alto"),
});

export type ShippingSettingsFormValues = z.infer<typeof shippingSettingsSchema>;
```

- [ ] **Step 4: Rodar o teste pra confirmar que passa**

Run: `bun vitest run apps/web/src/app/dashboard/site/settings/_components/__tests__/shipping-schema.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/site/settings/_components/shipping-schema.ts apps/web/src/app/dashboard/site/settings/_components/__tests__/shipping-schema.test.ts
git commit -m "feat(settings): zod schema da aba Frete + testes"
```

---

### Task 4: Server actions — `getOrCreateShippingSettings` + `updateShippingSettings`

**Files:**
- Create: `apps/web/src/app/dashboard/site/settings/actions.ts`

> Padrão de `branches/actions.ts`: `ActionResult<T>` local, `requireCapability` retorna session, `logUserActivity`, `revalidatePath`.

- [ ] **Step 1: Implementar as actions**

Create `apps/web/src/app/dashboard/site/settings/actions.ts`:

```ts
"use server";

import { db } from "@emach/db";
import { branch } from "@emach/db/schema/inventory";
import {
	type StoreSettings,
	storeSettings,
} from "@emach/db/schema/store-settings";
import { asc, eq, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { logUserActivity } from "@/lib/activity";
import { requireCapability } from "@/lib/permissions";
import {
	type ShippingSettingsFormValues,
	shippingSettingsSchema,
} from "./_components/shipping-schema";

const SETTINGS_PATH = "/dashboard/site/settings";
const SINGLETON_ID = "singleton";

export type ActionResult<T = undefined> =
	| { ok: true; data: T }
	| { ok: false; error: string };

function zodErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message;
	}
	return "Erro de validação";
}

/** Lê o singleton; cria com defaults na primeira leitura (lazy bootstrap). */
export async function getOrCreateShippingSettings(): Promise<StoreSettings> {
	const existing = await db
		.select()
		.from(storeSettings)
		.where(eq(storeSettings.id, SINGLETON_ID))
		.limit(1);
	if (existing[0]) {
		return existing[0];
	}
	const [created] = await db
		.insert(storeSettings)
		.values({ id: SINGLETON_ID })
		.onConflictDoNothing()
		.returning();
	if (created) {
		return created;
	}
	// Corrida: outra request criou entre o select e o insert.
	const [row] = await db
		.select()
		.from(storeSettings)
		.where(eq(storeSettings.id, SINGLETON_ID))
		.limit(1);
	if (!row) {
		throw new Error("Falha ao inicializar store_settings");
	}
	return row;
}

export interface OriginBranchOption {
	id: string;
	name: string;
	cep: string;
}

/** Filiais ativas com CEP preenchido — candidatas a origem do despacho. */
export async function listOriginBranchOptions(): Promise<OriginBranchOption[]> {
	const rows = await db
		.select({ id: branch.id, name: branch.name, cep: branch.cep })
		.from(branch)
		.where(isNotNull(branch.cep))
		.orderBy(asc(branch.name));
	return rows.filter((r): r is OriginBranchOption => Boolean(r.cep));
}

export async function updateShippingSettings(
	input: ShippingSettingsFormValues
): Promise<ActionResult<{ id: string }>> {
	const session = await requireCapability("site.update_settings");

	const parsed = shippingSettingsSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: zodErrorMessage(parsed.error) };
	}

	const payload = {
		shippingOriginBranchId: parsed.data.originBranchId ?? null,
		shippingInsurancePolicy: parsed.data.insurancePolicy,
		shippingInsuranceCapAmount: parsed.data.insuranceCapAmount.toFixed(2),
	};

	try {
		await db
			.insert(storeSettings)
			.values({ id: SINGLETON_ID, ...payload })
			.onConflictDoUpdate({
				target: storeSettings.id,
				set: payload,
			});
	} catch (error) {
		return { ok: false, error: zodErrorMessage(error) };
	}

	await logUserActivity({
		actorUserId: session.user.id,
		action: "settings.shipping.updated",
		targetId: SINGLETON_ID,
		targetType: "store_settings",
		metadata: {
			insurancePolicy: payload.shippingInsurancePolicy,
			originBranchId: payload.shippingOriginBranchId,
		},
	});
	revalidatePath(SETTINGS_PATH);
	return { ok: true, data: { id: SINGLETON_ID } };
}
```

- [ ] **Step 2: Verificar tipos**

Run: `bun check-types`
Expected: PASS. Confirma `requireCapability("site.update_settings")` aceita a cap (existe no enum) e o upsert tipa.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/site/settings/actions.ts
git commit -m "feat(settings): actions get/update shipping settings + origem"
```

---

### Task 5: Página — header + tabs + grid (form + trilho)

**Files:**
- Create: `apps/web/src/app/dashboard/site/settings/page.tsx`
- Create: `apps/web/src/app/dashboard/site/settings/_components/shipping-preview-rail.tsx`

- [ ] **Step 1: Trilho de prévia (server, derivado dos settings)**

Create `apps/web/src/app/dashboard/site/settings/_components/shipping-preview-rail.tsx`:

```tsx
import type { ShippingInsurancePolicy } from "@emach/db/schema/store-settings";

interface PreviewRow {
	label: string;
	value: string;
}

interface ShippingPreviewRailProps {
	originLabel: string | null;
	insurancePolicy: ShippingInsurancePolicy;
	insuranceCapAmount: number;
}

const BRL = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
});

export function ShippingPreviewRail({
	originLabel,
	insurancePolicy,
	insuranceCapAmount,
}: ShippingPreviewRailProps) {
	const rows: PreviewRow[] = [
		{
			label: "Origem do despacho",
			value: originLabel ?? "Sem origem definida",
		},
		{
			label: "Seguro declarado",
			value:
				insurancePolicy === "cart_value"
					? `Valor do carrinho (até ${BRL.format(insuranceCapAmount)})`
					: "Sem seguro",
		},
		{ label: "Item até 30 kg", value: "Cotação automática (SuperFrete)" },
		{ label: "Item acima de 30 kg", value: "Frete por-produto ou a combinar" },
		{ label: "Frete grátis", value: "Apenas via cupom de promoção" },
	];

	return (
		<aside className="flex flex-col gap-3 rounded-md border border-border bg-card p-4">
			<div className="flex flex-col gap-1">
				<h2 className="font-medium text-sm">Como o cliente vê</h2>
				<p className="text-muted-foreground text-xs">
					Reflete o efeito destas configurações na cotação da loja.
				</p>
			</div>
			<dl className="flex flex-col">
				{rows.map((row) => (
					<div
						className="-mx-4 flex flex-col gap-0.5 border-border border-b px-4 py-2.5 last:border-b-0"
						key={row.label}
					>
						<dt className="text-muted-foreground text-xs">{row.label}</dt>
						<dd className="text-foreground text-sm">{row.value}</dd>
					</div>
				))}
			</dl>
		</aside>
	);
}
```

- [ ] **Step 2: Página Server Component**

Create `apps/web/src/app/dashboard/site/settings/page.tsx`:

```tsx
import { Badge } from "@emach/ui/components/badge";
import { Tabs, TabsList, TabsTrigger } from "@emach/ui/components/tabs";

import { PageHeader } from "@/components/page-header";
import { requireCurrentSession } from "@/lib/session";
import { ShippingPreviewRail } from "./_components/shipping-preview-rail";
import { ShippingSettingsForm } from "./_components/shipping-settings-form";
import {
	getOrCreateShippingSettings,
	listOriginBranchOptions,
} from "./actions";

export const dynamic = "force-dynamic";

const SECTION_TABS: Array<{ value: string; label: string; soon?: boolean }> = [
	{ value: "frete", label: "Frete" },
	{ value: "redes", label: "Redes sociais", soon: true },
	{ value: "local", label: "Localização", soon: true },
];

interface PageProps {
	searchParams: Promise<{ tab?: string }>;
}

export default async function SettingsPage({ searchParams }: PageProps) {
	await requireCurrentSession();
	const { tab } = await searchParams;
	const activeTab = tab === "redes" || tab === "local" ? tab : "frete";

	const [settings, originOptions] = await Promise.all([
		getOrCreateShippingSettings(),
		listOriginBranchOptions(),
	]);

	const originLabel =
		originOptions.find((o) => o.id === settings.shippingOriginBranchId)?.name ??
		null;

	return (
		<>
			<PageHeader
				description="Ajustes globais da loja — frete, redes sociais e localização da cotação."
				title="Configurações"
			/>

			<Tabs value={activeTab}>
				<TabsList scrollable>
					{SECTION_TABS.map((t) => (
						<TabsTrigger
							disabled={t.soon}
							key={t.value}
							value={t.value}
						>
							{t.label}
							{t.soon ? (
								<Badge className="ml-2" variant="secondary">
									Em breve
								</Badge>
							) : null}
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>

			<div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
				<ShippingSettingsForm
					originOptions={originOptions}
					settings={{
						originBranchId: settings.shippingOriginBranchId,
						insurancePolicy: settings.shippingInsurancePolicy,
						insuranceCapAmount: Number(settings.shippingInsuranceCapAmount),
					}}
				/>
				<ShippingPreviewRail
					insuranceCapAmount={Number(settings.shippingInsuranceCapAmount)}
					insurancePolicy={settings.shippingInsurancePolicy}
					originLabel={originLabel}
				/>
			</div>
		</>
	);
}
```

> Nota: as tabs `Frete`/`Redes`/`Localização` aqui são apenas o esqueleto visual — só Frete tem conteúdo. Como Redes/Local estão `disabled`, não precisam de navegação `?tab=` agora (default sempre cai em `frete`). Mantido `searchParams.tab` pra quando ganharem conteúdo.

- [ ] **Step 3: Verificar tipos**

Run: `bun check-types`
Expected: PASS. Se `Badge` não existir em `@emach/ui/components/badge`, confirmar o path real com `bfs packages/ui/src/components -name "badge.tsx"` e ajustar o import.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/site/settings/page.tsx apps/web/src/app/dashboard/site/settings/_components/shipping-preview-rail.tsx
git commit -m "feat(settings): página Configurações com tabs + grid form/prévia"
```

---

### Task 6: Form client — cards Origem do despacho + Seguro

**Files:**
- Create: `apps/web/src/app/dashboard/site/settings/_components/shipping-settings-form.tsx`

> Padrão `BranchForm`: `"use client"`, `useTransition`, `safeParse`, `FormErrorPanel` no topo, toast com contagem. Descrições explicativas pro admin leigo (DESIGN §8).

- [ ] **Step 1: Implementar o form**

Create `apps/web/src/app/dashboard/site/settings/_components/shipping-settings-form.tsx`:

```tsx
"use client";

import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";
import { Spinner } from "@emach/ui/components/spinner";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
	FormErrorPanel,
	type FormIssue,
	zodIssuesToFormIssues,
} from "@/components/form-error-panel";

import { updateShippingSettings } from "../actions";
import type { OriginBranchOption } from "../actions";
import {
	INSURANCE_POLICY_LABELS,
	INSURANCE_POLICY_OPTIONS,
	type ShippingSettingsFormValues,
	shippingSettingsSchema,
} from "./shipping-schema";

const FIELD_LABELS: Record<string, string> = {
	originBranchId: "Filial de origem",
	insurancePolicy: "Política de seguro",
	insuranceCapAmount: "Teto do seguro",
};

const NO_ORIGIN = "__none__";

interface ShippingSettingsFormProps {
	originOptions: OriginBranchOption[];
	settings: {
		originBranchId: string | null;
		insurancePolicy: (typeof INSURANCE_POLICY_OPTIONS)[number];
		insuranceCapAmount: number;
	};
}

export function ShippingSettingsForm({
	originOptions,
	settings,
}: ShippingSettingsFormProps) {
	const [isPending, startTransition] = useTransition();
	const [issues, setIssues] = useState<FormIssue[]>([]);
	const [originBranchId, setOriginBranchId] = useState(
		settings.originBranchId ?? NO_ORIGIN
	);
	const [insurancePolicy, setInsurancePolicy] = useState(
		settings.insurancePolicy
	);
	const [capAmount, setCapAmount] = useState(String(settings.insuranceCapAmount));

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setIssues([]);

		const values: ShippingSettingsFormValues = {
			originBranchId: originBranchId === NO_ORIGIN ? undefined : originBranchId,
			insurancePolicy,
			insuranceCapAmount: Number(capAmount),
		};

		const parsed = shippingSettingsSchema.safeParse(values);
		if (!parsed.success) {
			const next = zodIssuesToFormIssues(parsed.error, FIELD_LABELS);
			setIssues(next);
			toast.error(
				`${next.length} ${next.length === 1 ? "erro" : "erros"} no formulário — veja detalhes acima`
			);
			return;
		}

		startTransition(async () => {
			const result = await updateShippingSettings(parsed.data);
			if (result.ok) {
				toast.success("Configurações de frete salvas");
			} else {
				toast.error(result.error || "Não foi possível salvar");
			}
		});
	}

	return (
		<form className="flex flex-col gap-6" onSubmit={handleSubmit}>
			<FormErrorPanel issues={issues} />

			<section className="flex flex-col gap-4 rounded-md border border-border bg-card p-6">
				<div className="flex flex-col gap-1">
					<h2 className="font-medium text-sm">Origem do despacho</h2>
					<p className="text-muted-foreground text-sm">
						De qual filial a loja calcula a distância até o cliente. O CEP dessa
						filial é o ponto de partida de toda cotação de frete no checkout.
						Só aparecem filiais com CEP cadastrado.
					</p>
				</div>
				{originOptions.length === 0 ? (
					<p className="rounded-md border border-border border-dashed bg-muted/40 p-4 text-muted-foreground text-sm">
						Nenhuma filial tem CEP cadastrado. Cadastre o CEP de uma filial para
						definir a origem do despacho.
					</p>
				) : (
					<div className="flex flex-col gap-2">
						<Label htmlFor="originBranchId">Filial de origem</Label>
						<Select
							onValueChange={setOriginBranchId}
							value={originBranchId}
						>
							<SelectTrigger id="originBranchId">
								<SelectValue placeholder="Selecione a filial" />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									<SelectItem value={NO_ORIGIN}>Sem origem definida</SelectItem>
									{originOptions.map((o) => (
										<SelectItem key={o.id} value={o.id}>
											{o.name}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					</div>
				)}
			</section>

			<section className="flex flex-col gap-4 rounded-md border border-border bg-card p-6">
				<div className="flex flex-col gap-1">
					<h2 className="font-medium text-sm">Seguro do frete</h2>
					<p className="text-muted-foreground text-sm">
						Quando o seguro está ativo, a loja declara o valor do carrinho à
						transportadora — encarece o frete, mas cobre o cliente em caso de
						extravio. Sem seguro, o frete sai mais barato e a loja assume o
						risco. O teto limita o valor declarado por envio.
					</p>
				</div>
				<div className="flex flex-col gap-2">
					<Label htmlFor="insurancePolicy">Política de seguro</Label>
					<Select
						onValueChange={(v) =>
							setInsurancePolicy(v as typeof insurancePolicy)
						}
						value={insurancePolicy}
					>
						<SelectTrigger id="insurancePolicy">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								{INSURANCE_POLICY_OPTIONS.map((p) => (
									<SelectItem key={p} value={p}>
										{INSURANCE_POLICY_LABELS[p]}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
				</div>
				{insurancePolicy === "cart_value" ? (
					<div className="flex flex-col gap-2">
						<Label htmlFor="insuranceCapAmount">Teto do seguro (R$)</Label>
						<Input
							id="insuranceCapAmount"
							inputMode="decimal"
							onChange={(e) => setCapAmount(e.target.value)}
							placeholder="3000.00"
							value={capAmount}
						/>
						<p className="text-muted-foreground text-xs">
							Valor máximo declarado por envio. Padrão R$ 3.000 (teto SuperFrete).
						</p>
					</div>
				) : null}
			</section>

			<div className="flex items-center gap-3">
				<Button disabled={isPending} type="submit">
					{isPending ? (
						<>
							<Spinner /> Salvando…
						</>
					) : (
						"Salvar alterações"
					)}
				</Button>
			</div>
		</form>
	);
}
```

- [ ] **Step 2: Verificar tipos**

Run: `bun check-types`
Expected: PASS. Se algum import de `@emach/ui/components/{input,label,badge}` divergir, confirmar paths com `bfs packages/ui/src/components`.

- [ ] **Step 3: Verificar lint**

Run: `bun check`
Expected: PASS (ultracite). Corrigir o que apontar.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/site/settings/_components/shipping-settings-form.tsx
git commit -m "feat(settings): form de frete (origem + seguro)"
```

---

### Task 7: Nav — mover Configurações para grupo "Sistema"

**Files:**
- Modify: `apps/web/src/app/dashboard/_components/nav-config.ts:118-124` (remover item disabled) e `:125` (adicionar grupo)

- [ ] **Step 1: Remover o item "Configurações" do grupo "Relacionamento"**

Em `nav-config.ts`, apagar o bloco (linhas ~118-123):

```ts
			{
				label: "Configurações",
				href: "/dashboard/site/settings" as Route,
				icon: Settings,
				disabled: true,
			},
```

- [ ] **Step 2: Adicionar o grupo "Sistema" antes de "Administração"**

Inserir um novo objeto no array `NAV_GROUPS`, imediatamente antes do grupo `{ label: "Administração", ... }`:

```ts
	{
		label: "Sistema",
		items: [
			{
				label: "Configurações",
				href: "/dashboard/site/settings" as Route,
				icon: Settings,
			},
		],
	},
```

- [ ] **Step 3: Verificar tipos**

Run: `bun check-types`
Expected: PASS. `Settings` já está importado de `lucide-react` (linha 13) — sem import novo.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/_components/nav-config.ts
git commit -m "feat(nav): grupo Sistema com Configurações habilitada"
```

---

### Task 8: Campo `overweightShippingAmount` no editor de ferramenta

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-schema.ts:99` (campo) e `:84` superRefine se necessário
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-form.tsx:156` (ToolFormState), `:184` (EMPTY_VALUES), `:671-682` (input no bloco de aviso)
- Modify: `apps/web/src/app/dashboard/tools/actions.ts:80` (normalizeToolPayload)

- [ ] **Step 1: Adicionar o campo ao Zod do tool**

Em `tool-schema.ts`, dentro de `toolFormSchema` (após `heightCm: requiredPositiveNumber,`, ~linha 99):

```ts
			overweightShippingAmount: optionalNumber,
```

(`optionalNumber` já existe no arquivo, linha 29 — aceita `number | undefined`, não-negativo.)

- [ ] **Step 2: Estender o estado do form**

Em `tool-form.tsx`, no tipo `ToolFormState` (~linha 152), adicionar à interseção:

```ts
	weightKg?: number;
	lengthCm?: number;
	widthCm?: number;
	heightCm?: number;
	overweightShippingAmount?: number;
```

E em `EMPTY_VALUES` (~linha 184), após `heightCm: undefined,`:

```ts
	overweightShippingAmount: undefined,
```

- [ ] **Step 3: Renderizar o input dentro do bloco de aviso de frete**

Em `tool-form.tsx`, no bloco `{exceedsShippingLimit && (...)}` (~linha 671), adicionar o input após o parágrafo de aviso, dentro do mesmo container:

```tsx
				{exceedsShippingLimit && (
					<div className="flex flex-col gap-3 rounded-md border border-warning/40 bg-warning/10 p-3">
						<div className="flex items-start gap-2">
							<TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
							<p className="text-foreground text-xs leading-relaxed">
								Esta ferramenta excede os limites de cotação do SuperFrete (máx.
								30 kg e 100 cm por lado). A loja não conseguirá cotar o frete
								automaticamente para itens assim — o custo real do envio pode
								sair <strong>mais caro do que o cliente pagou</strong>. Defina
								um frete fixo abaixo ou trate manualmente.
							</p>
						</div>
						<div className="flex max-w-xs flex-col gap-2">
							<Label htmlFor="overweightShippingAmount">
								Frete para item pesado (R$)
							</Label>
							<MaskedInput
								id="overweightShippingAmount"
								mask={decimalMask}
								onChange={(v) => update("overweightShippingAmount", v)}
								placeholder="Ex: 250,00"
								value={values.overweightShippingAmount}
							/>
							<p className="text-muted-foreground text-xs">
								Cobrado no lugar da cotação automática. Em branco = "Frete a
								combinar" na loja.
							</p>
						</div>
					</div>
				)}
```

> O `<Label>`, `<MaskedInput>`, `decimalMask` e `update()` já estão em uso no mesmo arquivo (seção Dimensões). Sem imports novos.

- [ ] **Step 4: Persistir o campo na action**

Em `tools/actions.ts`, dentro de `normalizeToolPayload` (~linha 80, após `heightCm: input.heightCm.toFixed(2),`):

```ts
		overweightShippingAmount: toNumericString(input.overweightShippingAmount),
```

(`toNumericString` já existe, linha 46 — devolve `string | null` em `.toFixed(2)`.)

- [ ] **Step 5: Confirmar que o form carrega o valor existente no modo edit**

Em `apps/web/src/app/dashboard/tools/[id]/edit/page.tsx:93` (logo após `heightCm: row.heightCm ? Number(row.heightCm) : undefined,`), adicionar ao objeto de valores iniciais:

```ts
	overweightShippingAmount: row.overweightShippingAmount
		? Number(row.overweightShippingAmount)
		: undefined,
```

(`row` é o `tool.$inferSelect`; o campo vem como `string | null` do Drizzle.)

- [ ] **Step 6: Verificar tipos e lint**

Run: `bun check-types && bun check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/tools/_components/tool-schema.ts apps/web/src/app/dashboard/tools/_components/tool-form.tsx apps/web/src/app/dashboard/tools/actions.ts
git commit -m "feat(tools): frete por-produto para item pesado (>30kg)"
```

---

### Task 9: Smoke run-time + verificação final

> `tsc` não pega SQL inválido em template nem coluna removida (apps/web + packages/db CLAUDE.md). Smoke obrigatório após mexer em schema/queries SSR.

- [ ] **Step 1: Subir o dev server**

Run: `bun dev:web` (ou `/dev-here <porta>` numa cópia)

- [ ] **Step 2: Smoke da página de Configurações**

- Visitar `/dashboard/site/settings`. Confirmar: header "Configurações", tabs (Frete ativa; Redes/Localização com badge "Em breve" desabilitadas), card Origem + card Seguro à esquerda, trilho "Como o cliente vê" à direita.
- Selecionar uma filial de origem, mudar política para "Declarar o valor do carrinho", ajustar teto, **Salvar**. Confirmar toast de sucesso e que o trilho reflete (após refresh) origem + seguro.
- Recarregar a página: valores persistidos (singleton criado/atualizado).
- Conferir stack trace rápido se algo quebrar: `nextjs_call <port> get_errors` (MCP next-devtools).

- [ ] **Step 3: Smoke da sidebar**

- Confirmar grupo "Sistema" no rodapé com "Configurações" clicável (não mais cinza/disabled).

- [ ] **Step 4: Smoke do tool pesado**

- Abrir editor de uma ferramenta, setar peso > 30kg. Confirmar que o aviso de frete aparece **com** o campo "Frete para item pesado (R$)". Preencher, salvar, reabrir: valor persistido.

- [ ] **Step 5: Verificação consolidada**

Run: `bun check-types && bun check && bun vitest run apps/web/src/app/dashboard/site/settings`
Expected: tudo PASS.

- [ ] **Step 6: Atualizar contrato (follow-up doc)**

Adicionar a tabela `store_settings` e a query `getShippingSettings` em `docs/integration/admin-ecommerce.md` (seção de superfície sincronizada). Commit:

```bash
git add docs/integration/admin-ecommerce.md
git commit -m "docs(integration): store_settings + getShippingSettings no contrato"
```

---

## Fora de escopo (follow-ups — NÃO implementar aqui)

- **emach-ecommerce** (repo separado): remover `R$ 299` hardcoded de frete grátis; trocar `getOriginBranchCep()` (env) por `getShippingSettings()`; aplicar `insurancePolicy`/cap na cotação. Abre via PR de sync automático (ADR-0009) após o schema/query entrarem na `main`.
- Conteúdo real das tabs **Redes sociais** e **Localização** (hoje só placeholders "Em breve").

## Self-Review (preenchido)

- **Cobertura do spec:** singleton `store_settings` (Task 1) ✓ · `tool.overweightShippingAmount` (Tasks 1, 8) ✓ · query helper contrato (Task 2) ✓ · rota/página/tabs/grid (Task 5) ✓ · form origem+seguro (Task 6) ✓ · trilho prévia edge-to-edge (Task 5) ✓ · server action + Zod + logActivity + revalidate (Tasks 3, 4) ✓ · nav grupo Sistema (Task 7) ✓ · empty state origem sem CEP (Task 6) ✓ · lazy bootstrap singleton (Task 4) ✓ · testes action/schema (Task 3) + smoke (Task 9) ✓ · doc contrato (Task 9) ✓.
- **Divergências do spec (intencionais):** (1) capability `site.update_settings` em vez de `settings.manage` (a real, ADR-0012). (2) Frete grátis fora do dashboard — só citado no trilho como "via cupom", sem campo. (3) Tabs Redes/Local sem navegação `?tab=` enquanto desabilitadas.
- **A confirmar na execução:** existência exata de `@emach/ui/components/badge` e `input`/`label` (Step de verificação em cada task cobre); ponto de hidratação de `overweightShippingAmount` no modo edit do tool (Task 8 Step 5).
