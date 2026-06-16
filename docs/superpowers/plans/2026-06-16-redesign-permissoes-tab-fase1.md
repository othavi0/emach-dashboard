# Redesign da tab de Permissões — Fase 1 (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar a tab `users/[id]?tab=permissoes` como matriz densa por seção (alinhada à sidebar) → recurso → ações, com controle Padrão/Permitir/Bloquear, mestre por seção e scroll interno — sem mudar o modelo de overrides do back.

**Architecture:** Quatro camadas: (1) taxonomia `section` derivada de `resource` no catálogo; (2) lógica de apresentação pura (`permissions-view.ts`) montando a árvore seção→recurso→ação e o estado do mestre; (3) action bulk `setSectionCapabilities`; (4) reescrita do componente client, integrando tudo. O back do toggle individual (`setUserCapability`) e a regra super_admin (issue #184) ficam intactos.

**Tech Stack:** Next 16 / React 19 (client component), Drizzle, vitest (`environment: node`), `@emach/ui` ToggleGroup.

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-06-16-redesign-permissoes-tab-design.md`.
- Mapeamento estado↔override (verbatim): Padrão = `inherit`, Permitir = `grant`, Bloquear = `revoke`.
- Mapa recurso → seção (verbatim): Operação = {Pedidos, Filiais}; Catálogo = {Ferramentas, Atributos, Categorias, Fornecedores, Estoque}; Relacionamento = {Clientes, Avaliações, Promoções}; Sistema = {Site}; Administração = {Usuários, Permissões, Auditoria}.
- Ordem das seções (verbatim): Operação, Catálogo, Relacionamento, Sistema, Administração.
- Regra issue #184 (verbatim): nenhuma escrita de override `grant`/`revoke` sobre alvo `super_admin`; `inherit` permitido.
- Anti-patterns banidos: sem `: any`/`as any`/`@ts-ignore`; sem `console.*` (usar `logger`); `key` estável em `.map` (usar `cap`/`resource`/`section`, nunca índice); sem `useMemo`/`useCallback` (React Compiler ativo).
- Testes: `bun --cwd apps/web test`; antes do commit `bun --cwd apps/web check-types` E `bun check` limpos.
- Implementador: **Read cada arquivo antes de Edit** (não herda state do parent).
- Caminhos com `[id]`: usar a tool Read com o path literal (sed/glob quebram nos brackets).

---

### Task 1: Taxonomia — `section` derivada de `resource`

**Files:**
- Modify: `apps/web/src/lib/capabilities.ts` (adicionar tipos/mapa no fim, antes do `normalizeRole`)
- Test: `apps/web/__tests__/capabilities.test.ts` (adicionar ao arquivo existente)

**Interfaces:**
- Consumes: `CAPABILITIES`, `Capability`, `isCapability` (já existem).
- Produces: `NavSection` (type), `SECTION_ORDER` (readonly NavSection[]), `sectionForCapability(cap: Capability): NavSection`.

- [ ] **Step 1: Write the failing test**

Adicionar ao fim de `apps/web/__tests__/capabilities.test.ts` (antes de qualquer `});` final de arquivo — é um novo `describe` top-level):

Garantir no topo do arquivo os imports: `import { CAPABILITIES, SECTION_ORDER, sectionForCapability, type Capability } from "@/lib/capabilities";` (o arquivo já importa de `@/lib/capabilities`; estender a linha existente em vez de duplicar). Então adicionar o `describe`:

```ts
describe("seções de navegação (redesign permissões)", () => {
	it("mapeia cada recurso para a seção da sidebar", () => {
		expect(sectionForCapability("orders.read")).toBe("Operação");
		expect(sectionForCapability("branches.manage")).toBe("Operação");
		expect(sectionForCapability("tools.create")).toBe("Catálogo");
		expect(sectionForCapability("stock.adjust")).toBe("Catálogo");
		expect(sectionForCapability("reviews.moderate")).toBe("Relacionamento");
		expect(sectionForCapability("promotions.manage")).toBe("Relacionamento");
		expect(sectionForCapability("site.update_settings")).toBe("Sistema");
		expect(sectionForCapability("permissions.manage")).toBe("Administração");
		expect(sectionForCapability("audit.read")).toBe("Administração");
	});

	it("toda capability tem uma seção em SECTION_ORDER", () => {
		for (const cap of Object.keys(CAPABILITIES) as Capability[]) {
			expect(SECTION_ORDER).toContain(sectionForCapability(cap));
		}
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun --cwd apps/web test capabilities.test.ts -t "seções de navegação"`
Expected: FAIL — `sectionForCapability` / `SECTION_ORDER` não existem.

- [ ] **Step 3: Write minimal implementation**

Em `apps/web/src/lib/capabilities.ts`, após o `export type Capability = ...` e `isCapability` (antes de `normalizeRole`), adicionar:

```ts
export type NavSection =
	| "Operação"
	| "Catálogo"
	| "Relacionamento"
	| "Sistema"
	| "Administração";

// Ordem = ordem da sidebar (nav-config.ts). Visão/Dashboard não tem capability.
export const SECTION_ORDER: readonly NavSection[] = [
	"Operação",
	"Catálogo",
	"Relacionamento",
	"Sistema",
	"Administração",
];

// Recurso (meta.resource) → seção da sidebar. Alinha a tela de permissões à navegação.
const RESOURCE_SECTION: Record<string, NavSection> = {
	Pedidos: "Operação",
	Filiais: "Operação",
	Ferramentas: "Catálogo",
	Atributos: "Catálogo",
	Categorias: "Catálogo",
	Fornecedores: "Catálogo",
	Estoque: "Catálogo",
	Clientes: "Relacionamento",
	Avaliações: "Relacionamento",
	Promoções: "Relacionamento",
	Site: "Sistema",
	Usuários: "Administração",
	Permissões: "Administração",
	Auditoria: "Administração",
};

export function sectionForCapability(cap: Capability): NavSection {
	return RESOURCE_SECTION[CAPABILITIES[cap].resource];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun --cwd apps/web test capabilities.test.ts`
Expected: PASS — todas as caps mapeiam; nenhum `resource` fora do `RESOURCE_SECTION` (se faltar algum, o teste de cobertura acusa `undefined`).

- [ ] **Step 5: Type-check, lint, commit**

```bash
bun --cwd apps/web check-types
bun check
git add apps/web/src/lib/capabilities.ts apps/web/__tests__/capabilities.test.ts
git commit -m "feat: seção de navegação derivada de recurso no catálogo de capabilities"
```

---

### Task 2: Lógica de apresentação pura (`permissions-view.ts`)

**Files:**
- Create: `apps/web/src/app/dashboard/users/[id]/permissions/permissions-view.ts`
- Test: `apps/web/__tests__/permissions-view.test.ts`

**Interfaces:**
- Consumes: `Capability`, `CAPABILITIES`, `NavSection`, `SECTION_ORDER`, `sectionForCapability` (Task 1).
- Produces:
  - `type OverrideState = "inherit" | "grant" | "revoke"`
  - `interface ActionRow { cap: Capability; action: string; defaultOn: boolean; state: OverrideState; editable: boolean }`
  - `interface ResourceView { resource: string; rows: ActionRow[] }`
  - `interface SectionView { section: NavSection; resources: ResourceView[] }`
  - `buildPermissionTree(args: { overrides: Map<Capability, OverrideState>; roleDefaults: Set<Capability>; manageable: Set<Capability> }): SectionView[]`
  - `sectionMasterState(section: SectionView): OverrideState | "mixed" | null`

- [ ] **Step 1: Write the failing test**

Criar `apps/web/__tests__/permissions-view.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Capability } from "@/lib/capabilities";
import {
	buildPermissionTree,
	sectionMasterState,
} from "@/app/dashboard/users/[id]/permissions/permissions-view";

const empty = {
	overrides: new Map(),
	roleDefaults: new Set<Capability>(),
	manageable: new Set<Capability>(["tools.read", "tools.create", "tools.delete"]),
};

describe("buildPermissionTree", () => {
	it("agrupa por seção na ordem da sidebar e por recurso", () => {
		const tree = buildPermissionTree(empty);
		const sections = tree.map((s) => s.section);
		// Operação vem antes de Catálogo, que vem antes de Administração
		expect(sections.indexOf("Operação")).toBeLessThan(sections.indexOf("Catálogo"));
		expect(sections.indexOf("Catálogo")).toBeLessThan(
			sections.indexOf("Administração")
		);
		const catalogo = tree.find((s) => s.section === "Catálogo");
		expect(catalogo?.resources.some((r) => r.resource === "Ferramentas")).toBe(true);
	});

	it("ordena ações: Ver primeiro, destrutivas por último", () => {
		const tree = buildPermissionTree(empty);
		const ferramentas = tree
			.find((s) => s.section === "Catálogo")
			?.resources.find((r) => r.resource === "Ferramentas");
		const acts = ferramentas?.rows.map((r) => r.action) ?? [];
		expect(acts[0]).toBe("Ver");
		expect(acts.at(-1)).toBe("Deletar");
	});

	it("popula state/defaultOn/editable por linha", () => {
		const tree = buildPermissionTree({
			overrides: new Map([["tools.create", "revoke"]]),
			roleDefaults: new Set<Capability>(["tools.read"]),
			manageable: new Set<Capability>(["tools.read"]),
		});
		const rows =
			tree
				.find((s) => s.section === "Catálogo")
				?.resources.find((r) => r.resource === "Ferramentas")?.rows ?? [];
		const ver = rows.find((r) => r.cap === "tools.read");
		const criar = rows.find((r) => r.cap === "tools.create");
		expect(ver).toMatchObject({ defaultOn: true, state: "inherit", editable: true });
		expect(criar).toMatchObject({ state: "revoke", editable: false });
	});
});

describe("sectionMasterState", () => {
	const mk = (states: ("inherit" | "grant" | "revoke")[]) => ({
		section: "Catálogo" as const,
		resources: [
			{
				resource: "Ferramentas",
				rows: states.map((s, i) => ({
					cap: `c${i}` as Capability,
					action: "x",
					defaultOn: false,
					state: s,
					editable: true,
				})),
			},
		],
	});

	it("uniforme → devolve o estado", () => {
		expect(sectionMasterState(mk(["grant", "grant"]))).toBe("grant");
	});
	it("divergente → mixed", () => {
		expect(sectionMasterState(mk(["grant", "revoke"]))).toBe("mixed");
	});
	it("sem linhas editáveis → null", () => {
		const s = mk(["grant"]);
		s.resources[0].rows[0].editable = false;
		expect(sectionMasterState(s)).toBeNull();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun --cwd apps/web test permissions-view.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Write minimal implementation**

Criar `apps/web/src/app/dashboard/users/[id]/permissions/permissions-view.ts`:

```ts
import {
	CAPABILITIES,
	type Capability,
	type NavSection,
	SECTION_ORDER,
	sectionForCapability,
} from "@/lib/capabilities";

export type OverrideState = "inherit" | "grant" | "revoke";

export interface ActionRow {
	cap: Capability;
	action: string;
	defaultOn: boolean;
	state: OverrideState;
	editable: boolean;
}
export interface ResourceView {
	resource: string;
	rows: ActionRow[];
}
export interface SectionView {
	section: NavSection;
	resources: ResourceView[];
}

// Ações destrutivas vão ao fim da linha do recurso (peso 2); "Ver" abre (peso 0).
const DESTRUCTIVE = new Set([
	"Deletar",
	"Cancelar",
	"Estornar",
	"Suspender",
	"Alterar role",
]);
function actionWeight(action: string): number {
	if (action === "Ver") {
		return 0;
	}
	return DESTRUCTIVE.has(action) ? 2 : 1;
}

export function buildPermissionTree(args: {
	overrides: Map<Capability, OverrideState>;
	roleDefaults: Set<Capability>;
	manageable: Set<Capability>;
}): SectionView[] {
	const { overrides, roleDefaults, manageable } = args;
	// section -> resource -> rows, preservando a ordem de aparição no catálogo.
	const bySection = new Map<NavSection, Map<string, ActionRow[]>>();
	const catalogOrder = new Map<string, number>();
	let idx = 0;
	for (const [cap, meta] of Object.entries(CAPABILITIES) as [
		Capability,
		(typeof CAPABILITIES)[Capability],
	][]) {
		catalogOrder.set(meta.resource, catalogOrder.get(meta.resource) ?? idx++);
		const section = sectionForCapability(cap);
		const resources = bySection.get(section) ?? new Map<string, ActionRow[]>();
		const rows = resources.get(meta.resource) ?? [];
		rows.push({
			cap,
			action: meta.action,
			defaultOn: roleDefaults.has(cap),
			state: overrides.get(cap) ?? "inherit",
			editable: manageable.has(cap),
		});
		resources.set(meta.resource, rows);
		bySection.set(section, resources);
	}

	const tree: SectionView[] = [];
	for (const section of SECTION_ORDER) {
		const resources = bySection.get(section);
		if (!resources) {
			continue;
		}
		const resourceViews: ResourceView[] = [...resources.entries()]
			.sort((a, b) => (catalogOrder.get(a[0]) ?? 0) - (catalogOrder.get(b[0]) ?? 0))
			.map(([resource, rows]) => ({
				resource,
				rows: [...rows].sort(
					(a, b) => actionWeight(a.action) - actionWeight(b.action)
				),
			}));
		tree.push({ section, resources: resourceViews });
	}
	return tree;
}

export function sectionMasterState(
	section: SectionView
): OverrideState | "mixed" | null {
	const states = section.resources
		.flatMap((r) => r.rows)
		.filter((row) => row.editable)
		.map((row) => row.state);
	if (states.length === 0) {
		return null;
	}
	const first = states[0];
	return states.every((s) => s === first) ? first : "mixed";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun --cwd apps/web test permissions-view.test.ts`
Expected: PASS (3 + 3).

- [ ] **Step 5: Type-check, lint, commit**

```bash
bun --cwd apps/web check-types
bun check
git add apps/web/src/app/dashboard/users/\[id\]/permissions/permissions-view.ts apps/web/__tests__/permissions-view.test.ts
git commit -m "feat: lógica pura de árvore seção→recurso→ação e estado do mestre"
```

---

### Task 3: Action bulk `setSectionCapabilities`

**Files:**
- Modify: `apps/web/src/app/dashboard/users/[id]/permissions/actions.ts` (adicionar a action; não tocar `setUserCapability`)
- Test: `apps/web/__tests__/set-section-capabilities.test.ts`

**Interfaces:**
- Consumes: `requireCapabilityWithContext`, `getUserCapabilities` (`@/lib/permissions`); `isCapability` (`@/lib/capabilities`); `user as userTable` (`@emach/db/schema/auth`); `userBranch`, `userCapabilityOverride` (schema); `logUserActivity`; `ActionResult`.
- Produces: `setSectionCapabilities(raw: { targetUserId: string; capabilities: string[]; state: "grant" | "revoke" | "inherit" }): Promise<ActionResult>`.

- [ ] **Step 1: Write the failing test**

Criar `apps/web/__tests__/set-section-capabilities.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/activity", () => ({ logUserActivity: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@/lib/permissions", () => ({
	requireCapabilityWithContext: vi.fn(),
	getUserCapabilities: vi.fn(),
}));
vi.mock("@emach/db", () => ({
	db: { select: vi.fn(), insert: vi.fn(), delete: vi.fn() },
}));

import { db } from "@emach/db";
import { setSectionCapabilities } from "@/app/dashboard/users/[id]/permissions/actions";
import { logUserActivity } from "@/lib/activity";
import {
	getUserCapabilities,
	requireCapabilityWithContext,
} from "@/lib/permissions";

const actorSuper = {
	user: { id: "actor", role: "super_admin", status: "active" },
} as never;

function mockTargetRole(role: string | null) {
	const limit = vi.fn(() => Promise.resolve(role ? [{ role }] : []));
	const where = vi.fn(() => ({ limit }));
	const from = vi.fn(() => ({ where }));
	(db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({ from });
}
function mockTargetBranches(ids: string[]) {
	const where = vi.fn(() => Promise.resolve(ids.map((branchId) => ({ branchId }))));
	const from = vi.fn(() => ({ where }));
	(db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({ from });
}

beforeEach(() => {
	vi.clearAllMocks();
	(requireCapabilityWithContext as ReturnType<typeof vi.fn>).mockResolvedValue(
		actorSuper
	);
	(getUserCapabilities as ReturnType<typeof vi.fn>).mockResolvedValue(
		new Set(["tools.create", "tools.delete"])
	);
});

describe("setSectionCapabilities", () => {
	it("aplica revoke a várias caps + audita evento agregado", async () => {
		mockTargetRole("user");
		mockTargetBranches(["b1"]);
		const onConflictDoUpdate = vi.fn(() => Promise.resolve());
		const values = vi.fn(() => ({ onConflictDoUpdate }));
		(db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values });
		const r = await setSectionCapabilities({
			targetUserId: "u1",
			capabilities: ["tools.create", "tools.delete"],
			state: "revoke",
		});
		expect(r.ok).toBe(true);
		expect(values).toHaveBeenCalledTimes(2);
		expect(logUserActivity).toHaveBeenCalledTimes(1);
		expect(logUserActivity).toHaveBeenCalledWith(
			expect.objectContaining({
				metadata: expect.objectContaining({ bulk: true, effect: "revoke" }),
			})
		);
	});

	it("alvo super_admin: revoke em massa é rejeitado (issue #184)", async () => {
		mockTargetRole("super_admin");
		const r = await setSectionCapabilities({
			targetUserId: "sa",
			capabilities: ["tools.create"],
			state: "revoke",
		});
		expect(r.ok).toBe(false);
		expect(db.insert).not.toHaveBeenCalled();
	});

	it("grant em massa pula caps que o ator não possui (anti-escalada)", async () => {
		mockTargetRole("user");
		mockTargetBranches(["b1"]);
		const onConflictDoUpdate = vi.fn(() => Promise.resolve());
		const values = vi.fn(() => ({ onConflictDoUpdate }));
		(db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values });
		const r = await setSectionCapabilities({
			targetUserId: "u1",
			capabilities: ["tools.create", "categories.delete"], // ator não tem categories.delete
			state: "grant",
		});
		expect(r.ok).toBe(true);
		expect(values).toHaveBeenCalledTimes(1); // só tools.create
	});

	it("ignora caps fora do registry", async () => {
		mockTargetRole("user");
		mockTargetBranches(["b1"]);
		const onConflictDoUpdate = vi.fn(() => Promise.resolve());
		const values = vi.fn(() => ({ onConflictDoUpdate }));
		(db.insert as ReturnType<typeof vi.fn>).mockReturnValue({ values });
		const r = await setSectionCapabilities({
			targetUserId: "u1",
			capabilities: ["tools.create", "foo.bar"],
			state: "revoke",
		});
		expect(r.ok).toBe(true);
		expect(values).toHaveBeenCalledTimes(1);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun --cwd apps/web test set-section-capabilities.test.ts`
Expected: FAIL — `setSectionCapabilities` não existe.

- [ ] **Step 3: Write minimal implementation**

Em `apps/web/src/app/dashboard/users/[id]/permissions/actions.ts`, adicionar (após `setUserCapability`, reusando os imports já presentes do Task 2 do fix #184 — `userTable`, `getUserCapabilities`, etc.; adicionar Zod schema novo):

```ts
const sectionInputSchema = z.object({
	targetUserId: z.string().min(1),
	capabilities: z.array(z.string().min(1)).min(1),
	state: z.enum(["grant", "revoke", "inherit"]),
});

export async function setSectionCapabilities(
	raw: z.infer<typeof sectionInputSchema>
): Promise<ActionResult> {
	const parsed = sectionInputSchema.safeParse(raw);
	if (!parsed.success) {
		return { ok: false, error: "Dados inválidos" };
	}
	const { targetUserId, state } = parsed.data;
	const caps = parsed.data.capabilities.filter(isCapability);
	if (caps.length === 0) {
		return { ok: false, error: "Nenhuma permissão válida" };
	}

	try {
		// Regra issue #184: nunca grant/revoke sobre super_admin (inherit ok).
		const [targetUser] = await db
			.select({ role: userTable.role })
			.from(userTable)
			.where(eq(userTable.id, targetUserId))
			.limit(1);
		if (targetUser?.role === "super_admin" && state !== "inherit") {
			return {
				ok: false,
				error: "Super admin tem acesso total — permissões não são ajustáveis",
			};
		}

		const targetBranches = await db
			.select({ branchId: userBranch.branchId })
			.from(userBranch)
			.where(eq(userBranch.userId, targetUserId));
		const targetBranchIds = targetBranches.map((b) => b.branchId);

		const actorSession = await requireCapabilityWithContext("permissions.manage", {
			targetUserId,
			targetBranchIds,
		});

		if (targetBranchIds.length === 0 && actorSession.user.role !== "super_admin") {
			return { ok: false, error: "Usuário alvo sem filial atribuída" };
		}

		// Anti-escalada: grant só concede o que o ator possui (espelha setUserCapability).
		let effective = caps;
		if (state === "grant") {
			const actorCaps = await getUserCapabilities(actorSession);
			effective = caps.filter((c) => actorCaps.has(c));
		}
		if (effective.length === 0) {
			return { ok: false, error: "Nenhuma permissão aplicável" };
		}

		for (const capability of effective) {
			if (state === "inherit") {
				await db
					.delete(userCapabilityOverride)
					.where(
						and(
							eq(userCapabilityOverride.userId, targetUserId),
							eq(userCapabilityOverride.capability, capability)
						)
					);
			} else {
				await db
					.insert(userCapabilityOverride)
					.values({
						userId: targetUserId,
						capability,
						effect: state,
						grantedBy: actorSession.user.id,
					})
					.onConflictDoUpdate({
						target: [
							userCapabilityOverride.userId,
							userCapabilityOverride.capability,
						],
						set: {
							effect: state,
							grantedBy: actorSession.user.id,
							grantedAt: new Date(),
						},
					});
			}
		}

		await logUserActivity({
			action: AUDIT_ACTION[state],
			actorUserId: actorSession.user.id,
			targetType: "user",
			targetId: targetUserId,
			metadata: { bulk: true, effect: state, capabilities: effective },
		});

		revalidatePath(`/dashboard/users/${targetUserId}`);
		return { ok: true, data: undefined };
	} catch (err) {
		logger.error("setSectionCapabilities", err);
		return { ok: false, error: "Não foi possível alterar as permissões" };
	}
}
```

(`AUDIT_ACTION`, `db`, `eq`, `and`, `z`, `userBranch`, `userCapabilityOverride`, `userTable`, `requireCapabilityWithContext`, `getUserCapabilities`, `isCapability`, `logUserActivity`, `logger`, `revalidatePath` já estão importados no arquivo após o fix #184. Confirmar e adicionar só o que faltar.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bun --cwd apps/web test set-section-capabilities.test.ts`
Expected: PASS (4).

- [ ] **Step 5: Type-check, lint, commit**

```bash
bun --cwd apps/web check-types
bun check
git add apps/web/src/app/dashboard/users/\[id\]/permissions/actions.ts apps/web/__tests__/set-section-capabilities.test.ts
git commit -m "feat: setSectionCapabilities aplica estado a todas as caps de uma seção"
```

---

### Task 4: Reescrita do componente `permissions-tab.tsx` (matriz + mestre + scroll)

**Files:**
- Rewrite: `apps/web/src/app/dashboard/users/[id]/_components/permissions-tab.tsx`
- Reference (layout): spec `docs/superpowers/specs/2026-06-16-redesign-permissoes-tab-design.md` §Decisões + o mockup `final-layout.html` (se ainda no companion).

**Interfaces:**
- Consumes: `buildPermissionTree`, `sectionMasterState`, `type OverrideState`, `SectionView` (Task 2); `setUserCapability`, `setSectionCapabilities` (Task 3); props atuais (`manageableCaps`, `overrides`, `roleDefaults`, `targetUserId`).
- Produces: componente `PermissionsTab` (mesma assinatura de props — `page.tsx` não muda).

- [ ] **Step 1: Reescrever o componente**

Manter `"use client"` e a assinatura de `Props`. Substituir o corpo. Estrutura (seguir o layout do spec — densidade, sem espaço morto):

- Converter props em estruturas: `const overrideMap = new Map(overrides)`, `const defaultSet = new Set(roleDefaults)`, `const manageable = new Set(manageableCaps)`; `const tree = buildPermissionTree({ overrides: overrideMap, roleDefaults: defaultSet, manageable })`.
- `apply(cap, state)` → `setUserCapability({ targetUserId, capability: cap, state })` dentro de `startTransition`, com `notify` (igual ao atual).
- `applySection(section, state)` → `setSectionCapabilities({ targetUserId, capabilities: <caps editáveis da seção>, state })` dentro de `startTransition` + `notify`.
- Render por seção: header (nome + mestre via `sectionMasterState`) → por recurso: nome + linha de ações com `overflow-x-auto` → por ação: o tri-state.
- `key`: seção→`section`, recurso→`resource`, ação→`cap` (nunca índice).

Componente interno do controle (substitui o `TriState` atual), com os 3 estados Padrão/Permitir/Bloquear:

```tsx
function CapabilityTriState({
	value,
	disabled,
	label,
	onChange,
}: {
	value: OverrideState;
	disabled: boolean;
	label: string;
	onChange: (s: OverrideState) => void;
}) {
	const options: { key: OverrideState; label: string }[] = [
		{ key: "inherit", label: "Padrão" },
		{ key: "grant", label: "Permitir" },
		{ key: "revoke", label: "Bloquear" },
	];
	return (
		<ToggleGroup
			aria-label={`Permissão de ${label}`}
			className="shrink-0"
			disabled={disabled}
			onValueChange={(v) => {
				const next = v[0] as OverrideState | undefined;
				if (next) {
					onChange(next);
				}
			}}
			size="sm"
			value={[value]}
			variant="outline"
		>
			{options.map((opt) => (
				<ToggleGroupItem key={opt.key} value={opt.key}>
					{opt.label}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
}
```

Mestre da seção: quando `sectionMasterState(section)` é `"mixed"`, renderizar o controle com `value={[]}` (nenhum ativo) + um badge "Misto"; quando é um estado, `value={[estado]}`; quando `null` (nada editável), não renderizar o mestre. `onChange` do mestre → `applySection`.

Linha do recurso (scroll horizontal interno):

```tsx
<div className="flex items-center gap-3 px-4 py-2">
	<span className="w-28 shrink-0 font-medium text-sm">{resource}</span>
	<div className="flex gap-3 overflow-x-auto">
		{rows.map((row) => (
			<div className="flex shrink-0 flex-col items-center gap-1" key={row.cap}>
				<span className="whitespace-nowrap text-muted-foreground text-[11px]">
					{row.action}
				</span>
				<CapabilityTriState
					disabled={!row.editable || pending}
					label={`${resource} · ${row.action}`}
					onChange={(s) => apply(row.cap, s)}
					value={row.state}
				/>
			</div>
		))}
	</div>
</div>
```

(Estilos exatos — espaçamento, bordas, header de seção — seguir DESIGN.md e o padrão visual do mockup; manter neutros warm, accent coral, sem cool blue-grays.)

- [ ] **Step 2: Type-check e lint**

Run:
```bash
bun --cwd apps/web check-types
bun check
```
Expected: sem erro. (Componente client sem teste unitário de render — verificação é o smoke visual.)

- [ ] **Step 3: Smoke visual (obrigatório — mudança de UI)**

Pré-requisito: dev server deste checkout (`apps/web/node_modules/.bin/next dev --port 3010`) + um usuário `admin`/`user` como alvo. (Reverter o "Estoquista" para `user` se ainda estiver super_admin do smoke do #184.)

1. Logar como super_admin, abrir `/dashboard/users/<id-de-um-user>?tab=permissoes`.
2. Confirmar: matriz por **seção** (Operação, Catálogo, Relacionamento, Sistema, Administração); 1 linha por recurso; controle **Padrão/Permitir/Bloquear**.
3. Recurso com muitas ações (Usuários, Pedidos) → **scroll horizontal interno** na linha (nada cortado/escondido).
4. Header de seção → **mestre**; clicar "Permitir" aplica à seção; estado misto mostra **"Misto"**.
5. Togglear uma ação individual → persiste (reload mantém).
6. Alvo `super_admin` → a **nota** do #184 (sem matriz) continua.

Stack trace se quebrar: `nextjs_call 3010 get_errors` (MCP `next-devtools`).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/users/\[id\]/_components/permissions-tab.tsx
git commit -m "feat: tab de permissões como matriz por seção com mestre e scroll interno"
```

---

## Verificação final (após todas as tasks)

- [ ] `bun --cwd apps/web test` — suíte inteira verde.
- [ ] `bun --cwd apps/web check-types` + `bun check` limpos.
- [ ] Smoke visual da Task 4 confirmado (incluindo nota super_admin intacta).
- [ ] `group` órfão em `capabilities.ts`: deixar como está (Fase 1 não remove; cleanup opcional futuro) — não bloqueia.

## Fora de escopo (Fase 2, plano separado)

- Sidebar espelhar `<resource>.read` (mudança de comportamento de navegação).
- Decisão fina de cap por item de nav (Banners/Configurações/Usuários).
