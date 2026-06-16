# Permissões do role `user` (estoqueista) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o role `user` um operador puro — opera pedidos e estoque das filiais dele, gerencia fornecedores, lê o catálogo — e corrigir os gates que travam o ajuste de estoque, a navegação e o feedback de acesso negado.

**Architecture:** Ajuste cirúrgico sobre o modelo de capabilities existente (ADR-0016/0017). Cinco frentes: (1) matriz `defaultRoles` do `user`; (2) hardening de self-action; (3) gates de criação por capability; (4) destravar o detalhe de filial; (5) sidebar consistente + página 403. Sem mudança de schema.

**Tech Stack:** Next 16 / React 19, Better Auth (dashboard), Drizzle, vitest (`environment: node`), Biome/ultracite.

## Global Constraints

- Idioma: textos de UI e mensagens em PT; identificadores/erros literais em EN.
- Anti-patterns banidos (P0/P1): sem `console.*` (usar `logger`), sem `: any`/`as any`/`@ts-ignore`, sem `key={index}`, sem `useMemo`/`useCallback` manuais (React Compiler ativo), sem barrel files.
- Server actions: `"use server"` + gate (`requireCapability*`/`requireCurrentSession`) no início; retorno `ActionResult<T>`; `revalidatePath`/`revalidateTag` após mutação.
- Schema é push-only; **esta mudança não altera schema** (nenhuma capability nova — só `defaultRoles`, que é TS).
- Antes de commitar: `bun --cwd apps/web check-types` **e** `bun --cwd apps/web test` verdes; antes de fechar, `bun check` (ultracite).
- `check-types` não pega lint, SQL em template string, nem hook client em Server Component → smoke visual obrigatório em mudança de página/UI.
- Read de cada arquivo antes de Edit (não se herda state entre tasks).

---

### Task 1: Matriz alvo do role `user`

**Files:**
- Modify: `apps/web/src/lib/capabilities.ts` (blocos `defaultRoles` das 5 capabilities)
- Test: `apps/web/__tests__/capabilities.test.ts` (lista `LEGACY_USER`)
- Test: `apps/web/__tests__/permissions.test.ts` (bloco `roleHasCapability` do user)

**Interfaces:**
- Consumes: `roleDefaultCapabilities(role)`, `roleHasCapability(role, cap)`, `CAPABILITIES` (já existentes).
- Produces: matriz nova do `user` — passa a conter `suppliers.manage`; deixa de conter `customers.read`, `reviews.read`, `promotions.read`, `site.read`.

- [ ] **Step 1: Atualizar a expectativa de test em `capabilities.test.ts`**

Substituir a constante `LEGACY_USER` (linhas 13-28) por esta lista nova (remove os 4 reads não-operacionais, adiciona `suppliers.manage`):

```typescript
// Matriz alvo do role user (estoqueista/operacional) — ver ADR-0016 + spec
// docs/superpowers/specs/2026-06-16-permissoes-role-user-design.md
const OPERATIONAL_USER: readonly Capability[] = [
	"tools.read",
	"categories.read",
	"attributes.read",
	"suppliers.read",
	"suppliers.manage",
	"branches.read",
	"stock.read",
	"stock.adjust",
	"orders.read",
	"orders.update_status",
	"orders.add_note",
];
```

E trocar a asserção (linhas 57-60) para usar o novo nome:

```typescript
	it("user default == OPERATIONAL_USER (mais nada)", () => {
		const userCaps = roleDefaultCapabilities("user");
		expect([...userCaps].sort()).toEqual([...OPERATIONAL_USER].sort());
	});
```

- [ ] **Step 2: Estender o bloco `roleHasCapability` do user em `permissions.test.ts`**

No teste `"user é operacional..."` (linhas 65-72), adicionar as asserções das mudanças:

```typescript
		expect(roleHasCapability("user", "suppliers.manage")).toBe(true);
		expect(roleHasCapability("user", "customers.read")).toBe(false);
		expect(roleHasCapability("user", "reviews.read")).toBe(false);
		expect(roleHasCapability("user", "promotions.read")).toBe(false);
		expect(roleHasCapability("user", "site.read")).toBe(false);
```

- [ ] **Step 3: Rodar os testes e confirmar que FALHAM**

Run: `bun --cwd apps/web test capabilities permissions`
Expected: FAIL — `user default == OPERATIONAL_USER` e o bloco do user falham (capabilities.ts ainda tem a matriz antiga).

- [ ] **Step 4: Editar `defaultRoles` em `capabilities.ts`**

Aplicar 5 trocas pontuais (os atalhos `S`/`SA`/`SAU` já existem nas linhas 18-20):

| Capability | Linha aprox. | De | Para |
| --- | --- | --- | --- |
| `suppliers.manage` | ~110-116 | `defaultRoles: SA,` | `defaultRoles: SAU,` |
| `promotions.read` | ~117-123 | `defaultRoles: SAU,` | `defaultRoles: SA,` |
| `customers.read` | ~212-218 | `defaultRoles: SAU,` | `defaultRoles: SA,` |
| `reviews.read` | ~247-253 | `defaultRoles: SAU,` | `defaultRoles: SA,` |
| `site.read` | ~262-268 | `defaultRoles: SAU,` | `defaultRoles: SA,` |

Cada `Edit` deve incluir contexto suficiente (a key da capability acima) para o `old_string` ser único — há vários `defaultRoles: SAU,` idênticos no arquivo. Exemplo para `suppliers.manage`:

```typescript
	"suppliers.manage": {
		group: "Catálogo",
		resource: "Fornecedores",
		action: "Gerenciar",
		description: "Criar/editar fornecedores",
		defaultRoles: SAU,
	},
```

- [ ] **Step 5: Rodar os testes e confirmar que PASSAM**

Run: `bun --cwd apps/web test capabilities permissions`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/capabilities.ts apps/web/__tests__/capabilities.test.ts apps/web/__tests__/permissions.test.ts
git commit -m "feat: matriz do role user vira operacional (estoque+fornecedores, sem relacionamento)"
```

---

### Task 2: Hardening de self-action (revoke_sessions + reset_password)

**Files:**
- Modify: `apps/web/src/lib/permissions.ts:88-95` (`SELF_RESTRICTED`)
- Modify: `apps/web/src/app/dashboard/users/actions.ts` (`revokeUserSession` ~579, `forceLogoutAllSessions` ~608)
- Test: `apps/web/__tests__/permissions.test.ts`

**Interfaces:**
- Consumes: `requireCapabilityWithContext(cap, { targetUserId })`, `requireCurrentSession()`, `userIdSchema`, `revokeSessionSchema` (já existentes).
- Produces: `SELF_RESTRICTED` passa a incluir `users.revoke_sessions` e `users.reset_password`. Nenhum ator (incl. admin/super_admin) força o próprio logout nem dispara reset da própria senha pelo painel.

- [ ] **Step 1: Atualizar os testes de self-guard em `permissions.test.ts`**

O teste `"self-action guard NÃO bloqueia caps fora de SELF_RESTRICTED"` (linhas 164-175) usa hoje `users.reset_password` como exemplo de cap **fora** da lista — isso vai inverter. Trocar a cap de exemplo por uma que **continua** fora (`users.update_branches`):

```typescript
	it("self-action guard NÃO bloqueia caps fora de SELF_RESTRICTED", async () => {
		const s = {
			user: { id: "guard-self-2", status: "active", role: "super_admin" },
		} as never;
		(requireCurrentSession as ReturnType<typeof vi.fn>).mockResolvedValue(s);
		// super_admin: early-return em getUserCapabilities — db.select não é chamado.
		await expect(
			requireCapabilityWithContext("users.update_branches", {
				targetUserId: "guard-self-2",
			})
		).resolves.toBe(s);
	});
```

Adicionar dois testes novos logo após (confirmam o bloqueio das caps recém-incluídas):

```typescript
	it("self-action guard: não reseta a própria senha", async () => {
		const s = {
			user: { id: "guard-self-reset", status: "active", role: "super_admin" },
		} as never;
		(requireCurrentSession as ReturnType<typeof vi.fn>).mockResolvedValue(s);
		await expect(
			requireCapabilityWithContext("users.reset_password", {
				targetUserId: "guard-self-reset",
			})
		).rejects.toThrow("Não é possível executar essa ação em si mesmo");
	});

	it("self-action guard: não revoga as próprias sessões", async () => {
		const s = {
			user: { id: "guard-self-revoke", status: "active", role: "super_admin" },
		} as never;
		(requireCurrentSession as ReturnType<typeof vi.fn>).mockResolvedValue(s);
		await expect(
			requireCapabilityWithContext("users.revoke_sessions", {
				targetUserId: "guard-self-revoke",
			})
		).rejects.toThrow("Não é possível executar essa ação em si mesmo");
	});
```

- [ ] **Step 2: Rodar o teste e confirmar que FALHA**

Run: `bun --cwd apps/web test permissions`
Expected: FAIL — os dois testes novos falham (caps ainda não estão em `SELF_RESTRICTED`); o teste editado passa.

- [ ] **Step 3: Ampliar `SELF_RESTRICTED` em `permissions.ts`**

Substituir o array (linhas 88-95) por:

```typescript
const SELF_RESTRICTED: readonly Capability[] = [
	"users.suspend",
	"users.delete",
	"users.update_role",
	// Permissões são geridas de OUTROS usuários, nunca de si mesmo (evita drift
	// role↔override e auto-gestão fora da hierarquia via self-bypass).
	"permissions.manage",
	// Auto-logout e auto-reset pelo painel não fazem sentido e travariam o ator.
	"users.revoke_sessions",
	"users.reset_password",
];
```

- [ ] **Step 4: Rodar o teste e confirmar que PASSA**

Run: `bun --cwd apps/web test permissions`
Expected: PASS.

- [ ] **Step 5: Acionar o self-guard em `forceLogoutAllSessions`**

Hoje a action chama o gate com `{}` (sem `targetUserId`), então o self-guard nunca dispara. Reordenar: parse antes do gate e passar `targetUserId`, com try/catch no padrão de `deleteUser`. Substituir o início da função (linhas ~608-616):

```typescript
export async function forceLogoutAllSessions(
	input: unknown
): Promise<ActionResult<{ count: number }>> {
	const actor = await requireCurrentSession();
	const parsed = userIdSchema.safeParse(input);
	if (!parsed.success) {
		return { ok: false, error: "validação" };
	}
	try {
		await requireCapabilityWithContext("users.revoke_sessions", {
			targetUserId: parsed.data.userId,
		});
	} catch (e) {
		const message = e instanceof Error ? e.message : "Acesso negado";
		return { ok: false, error: message };
	}
```

(O restante da função — `db.delete(...)`, `logUserActivity`, `revalidatePath`, `return` — permanece igual. Remover a linha antiga `const actor = await requireCurrentSession();` que vinha **depois** do gate, já que `actor` agora é declarado no topo.)

- [ ] **Step 6: Adicionar guard self explícito em `revokeUserSession`**

O input é um `sessionId`; o `userId` só é conhecido após o lookup. Adicionar o guard logo após o `if (!target)` (linhas ~590-592):

```typescript
	if (!target) {
		return { ok: false, error: "Sessão não encontrada" };
	}
	if (target.userId === actor.user.id) {
		return {
			ok: false,
			error: "Não é possível revogar a própria sessão por aqui",
		};
	}
```

- [ ] **Step 7: check-types + suíte**

Run: `bun --cwd apps/web check-types && bun --cwd apps/web test`
Expected: sem erros de tipo; suíte verde.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/permissions.ts apps/web/src/app/dashboard/users/actions.ts apps/web/__tests__/permissions.test.ts
git commit -m "fix: self-guard cobre revoke_sessions e reset_password (sem auto-logout/auto-reset)"
```

---

### Task 3: Gates de criação por capability (suppliers/new, branches/new)

**Files:**
- Modify: `apps/web/src/app/dashboard/suppliers/new/page.tsx:3,11`
- Modify: `apps/web/src/app/dashboard/branches/new/page.tsx:3,11`

**Interfaces:**
- Consumes: `requireCapability(cap)` de `@/lib/permissions`.
- Produces: páginas `/new` gateadas por capability (respeitam overrides), não por `requireRole`.

- [ ] **Step 1: `suppliers/new/page.tsx` — trocar import e gate**

Trocar `import { requireRole } from "@/lib/session";` por `import { requireCapability } from "@/lib/permissions";` e a linha 11 `await requireRole("admin");` por:

```typescript
	await requireCapability("suppliers.manage");
```

- [ ] **Step 2: `branches/new/page.tsx` — trocar import e gate**

Trocar `import { requireRole } from "@/lib/session";` por `import { requireCapability } from "@/lib/permissions";` e a linha 11 `await requireRole("admin");` por:

```typescript
	await requireCapability("branches.manage");
```

- [ ] **Step 3: check-types**

Run: `bun --cwd apps/web check-types`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/suppliers/new/page.tsx apps/web/src/app/dashboard/branches/new/page.tsx
git commit -m "fix: páginas /new de fornecedor e filial gateadas por capability (respeitam overrides)"
```

---

### Task 4: Destravar o detalhe de filial (acesso por `branches.read`, abas gateadas)

**Files:**
- Modify: `apps/web/src/app/dashboard/branches/[id]/page.tsx:12,43-123`

**Interfaces:**
- Consumes: `requireCapabilityOrRedirect("branches.read")`, `can(session, cap)`. A aba Estoque (`StockTab`) já gateia internamente por `requireCapabilityWithContextOrRedirect("stock.adjust", { targetBranchIds:[branchId] })` — sem mudança.
- Produces: a página abre para qualquer role com `branches.read` (super_admin/admin/user); aba "Equipe" e botão "Editar filial" só aparecem para quem tem `users.manage` / `branches.manage`.

- [ ] **Step 1: Trocar o import do gate**

Linha 12 — trocar:

```typescript
import { requireCapabilityOrRedirect } from "@/lib/permissions";
```

por:

```typescript
import { can, requireCapabilityOrRedirect } from "@/lib/permissions";
```

- [ ] **Step 2: Gate de entrada por `branches.read` + resolver caps**

Substituir a linha 47 `await requireCapabilityOrRedirect("branches.manage");` por:

```typescript
	const session = await requireCapabilityOrRedirect("branches.read");
	const [canManageBranch, canManageTeam] = await Promise.all([
		can(session, "branches.manage"),
		can(session, "users.manage"),
	]);
```

- [ ] **Step 3: Tornar a aba "Equipe" condicional**

A aba `team` (linhas 70-80) expõe gestão de usuários — incluí-la no array só quando `canManageTeam`. Trocar o objeto literal da aba `team` por um spread condicional. Substituir o bloco do objeto `{ value: "team", ... }` por:

```typescript
		...(canManageTeam
			? [
					{
						value: "team",
						label: "Equipe",
						icon: <Users aria-hidden className="size-3.5" />,
						badge: (
							<span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-secondary px-1 font-medium text-secondary-foreground text-xs tabular-nums">
								{kpis.teamSize}
							</span>
						),
						content: sp.tab === "team" ? <TeamTab branchId={id} /> : null,
					},
				]
			: []),
```

(As demais abas — `overview`, `orders`, `stock`, `activity` — permanecem inalteradas.)

- [ ] **Step 4: Tornar o header action condicional às caps**

Substituir o bloco `let headerAction` (linhas 118-123) por:

```typescript
	let headerAction: React.ReactNode = null;
	if (sp.tab === "team" && canManageTeam) {
		headerAction = <TeamLinkPanel branchId={id} />;
	} else if ((!sp.tab || sp.tab === "overview") && canManageBranch) {
		headerAction = <EditBranchButton />;
	}
```

- [ ] **Step 5: check-types**

Run: `bun --cwd apps/web check-types`
Expected: sem erros. (Nota: o `EntityTabs` tem `defaultValue="overview"`; com a aba team ausente, as abas restantes seguem renderizando — sem mudança de contrato.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/branches/[id]/page.tsx
git commit -m "fix: detalhe de filial abre com branches.read; aba Equipe e editar gateadas (destrava estoque p/ admin+user)"
```

> Nota de comportamento: o `StockTab` faz `...OrRedirect` — se o user abrir a aba Estoque de uma filial **fora** do escopo dele, a página inteira redireciona para `/dashboard`. Para o estoqueista operando as próprias filiais (caso comum), funciona. Tratar fora-de-escopo como estado vazio é melhoria futura, fora do escopo deste plano.

---

### Task 5: Sidebar consistente (filtra todos os itens por capability)

**Files:**
- Modify: `apps/web/src/app/dashboard/_components/nav-config.ts:96-126` (itens de Relacionamento)
- Modify: `apps/web/src/app/dashboard/_components/app-sidebar.tsx:20-56`
- Modify: `apps/web/src/app/dashboard/layout.tsx:12,39-42,62-78`

**Interfaces:**
- Consumes: `getUserCapabilities(session)` (retorna `ReadonlySet<Capability>`), `can(session, "users.approve")` (mantido para o grupo Administração + CommandPalette + contagem de pendentes), tipo `Capability`.
- Produces: `AppSidebar` recebe `capabilities: Capability[]` (no lugar de `canUpdateSettings`) e filtra **todo** item por `!item.capability || capSet.has(item.capability)`. Itens de Relacionamento ganham `capability`, sumindo para o `user`.

- [ ] **Step 1: Adicionar `capability` aos itens de Relacionamento em `nav-config.ts`**

No grupo `"Relacionamento"` (linhas 95-126), adicionar o campo `capability` a cada item (exceto Notificações, que segue `disabled`):

```typescript
	{
		label: "Relacionamento",
		items: [
			{
				label: "Clientes",
				href: "/dashboard/customers" as Route,
				icon: Users,
				capability: "customers.read",
			},
			{
				label: "Avaliações",
				href: "/dashboard/reviews" as Route,
				icon: Star,
				badgeKey: "reviews",
				capability: "reviews.read",
			},
			{
				label: "Promoções",
				href: "/dashboard/promotions" as Route,
				icon: Megaphone,
				capability: "promotions.read",
			},
			{
				label: "Banners",
				href: "/dashboard/site/banners" as Route,
				icon: ImageIcon,
				capability: "site.update_banners",
			},
			{
				label: "Notificações",
				href: "/dashboard/site/notifications" as Route,
				icon: Bell,
				disabled: true,
			},
		],
	},
```

- [ ] **Step 2: Generalizar o filtro em `app-sidebar.tsx`**

Trocar a prop `canUpdateSettings: boolean` por `capabilities: Capability[]` na interface e na assinatura, e substituir o objeto `caps` hardcoded por um `Set`. Adicionar o import do tipo.

Import (junto aos demais imports do topo):

```typescript
import type { Capability } from "@/lib/permissions";
```

Interface `AppSidebarProps` (linhas 20-28) — remover `canUpdateSettings`, adicionar `capabilities`:

```typescript
interface AppSidebarProps {
	canManageUsers: boolean;
	capabilities: Capability[];
	orderCount: number;
	pendingCount: number;
	reviewCount: number;
	stockCount: number;
	user: FooterUser | null | undefined;
}
```

Assinatura da função (linhas 30-38) — trocar `canUpdateSettings` por `capabilities`. Filtro (linhas 47-56) — substituir por:

```typescript
	const capSet = new Set(capabilities);

	const groups = NAV_GROUPS.filter(
		(g) => g.label !== "Administração" || canManageUsers
	).map((g) => ({
		...g,
		items: g.items.filter(
			(item) => !item.capability || capSet.has(item.capability)
		),
	}));
```

- [ ] **Step 3: Resolver e passar as capabilities no `layout.tsx`**

Import (linha 12) — adicionar `getUserCapabilities`:

```typescript
import { can, getUserCapabilities } from "@/lib/permissions";
```

Bloco de resolução (linhas 39-42) — manter `canManageUsers` (usado em pendingCount/CommandPalette/grupo Admin) e resolver as capabilities:

```typescript
	const [canManageUsers, capsSet] = await Promise.all([
		can(session, "users.approve"),
		getUserCapabilities(session),
	]);
	const capabilities = [...capsSet];
```

Props do `<AppSidebar>` (linhas 64-66) — trocar `canUpdateSettings={canUpdateSettings}` por:

```typescript
				<AppSidebar
					canManageUsers={canManageUsers}
					capabilities={capabilities}
```

(O restante das props — `orderCount`, `pendingCount`, etc. — permanece.)

- [ ] **Step 4: check-types**

Run: `bun --cwd apps/web check-types`
Expected: sem erros (qualquer referência remanescente a `canUpdateSettings` apareceria aqui).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/_components/nav-config.ts apps/web/src/app/dashboard/_components/app-sidebar.tsx apps/web/src/app/dashboard/layout.tsx
git commit -m "feat: sidebar filtra todo item por capability (user não vê Relacionamento)"
```

---

### Task 6: Página 403 + gates de página com feedback

**Files:**
- Create: `apps/web/src/app/dashboard/sem-acesso/page.tsx`
- Modify: `apps/web/src/app/dashboard/customers/page.tsx:15,41`
- Modify: `apps/web/src/app/dashboard/customers/[id]/page.tsx` (gate `customers.read`)
- Modify: `apps/web/src/app/dashboard/reviews/page.tsx:12,30`
- Modify: `apps/web/src/app/dashboard/reviews/[id]/page.tsx` (gate `reviews.read`)
- Modify: `apps/web/src/app/dashboard/promotions/page.tsx:105`
- Modify: `apps/web/src/app/dashboard/tools/page.tsx:18,~52`

**Interfaces:**
- Consumes: `requireCapabilityOrRedirect(cap, redirectTo)` (já existente). Componentes `Empty*` de `@emach/ui/components/empty` e `PageHeader` de `@/components/page-header` (já usados em customers/reviews).
- Produces: rota `/dashboard/sem-acesso` (403) com `?recurso=<nome>`; páginas que hoje lançam ou não gateiam read passam a redirecionar para ela.

- [ ] **Step 1: Criar a página 403 `/dashboard/sem-acesso`**

Create `apps/web/src/app/dashboard/sem-acesso/page.tsx`:

```typescript
import { buttonVariants } from "@emach/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@emach/ui/components/empty";
import { ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
	title: "Acesso negado",
};

interface PageProps {
	searchParams: Promise<{ recurso?: string }>;
}

export default async function SemAcessoPage({ searchParams }: PageProps) {
	const { recurso } = await searchParams;
	const alvo = recurso ? `a seção "${recurso}"` : "esta seção";

	return (
		<div className="flex flex-col gap-6">
			<Empty>
				<EmptyHeader>
					<ShieldAlert aria-hidden className="size-8 text-muted-foreground" />
					<EmptyTitle>Acesso negado</EmptyTitle>
					<EmptyDescription>
						Você não tem permissão para acessar {alvo}. Se acha que precisa
						desse acesso, fale com um administrador.
					</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					<Link className={buttonVariants({ variant: "outline" })} href="/dashboard">
						Voltar ao painel
					</Link>
				</EmptyContent>
			</Empty>
		</div>
	);
}
```

- [ ] **Step 2: `customers/page.tsx` — gate com redirect para 403**

Linha 15 — trocar `import { can, requireCapability } from "@/lib/permissions";` por `import { can, requireCapabilityOrRedirect } from "@/lib/permissions";`. Linha 41 — trocar `const session = await requireCapability("customers.read");` por:

```typescript
	const session = await requireCapabilityOrRedirect(
		"customers.read",
		"/dashboard/sem-acesso?recurso=Clientes"
	);
```

- [ ] **Step 3: `customers/[id]/page.tsx` — mesmo gate**

Read o arquivo; localizar o `requireCapability("customers.read")` (relatório: ~linha 67) e trocar por `requireCapabilityOrRedirect("customers.read", "/dashboard/sem-acesso?recurso=Clientes")`, ajustando o import como no Step 2. Manter o `notFound()` de cliente inexistente.

- [ ] **Step 4: `reviews/page.tsx` — gate com redirect para 403**

Linha 12 — trocar `import { requireCapability } from "@/lib/permissions";` por `import { requireCapabilityOrRedirect } from "@/lib/permissions";`. Linha 30 — trocar `await requireCapability("reviews.read");` por:

```typescript
	await requireCapabilityOrRedirect(
		"reviews.read",
		"/dashboard/sem-acesso?recurso=Avaliações"
	);
```

- [ ] **Step 5: `reviews/[id]/page.tsx` — mesmo gate**

Read o arquivo; localizar `requireCapability("reviews.read")` (~linha 23) e trocar por `requireCapabilityOrRedirect("reviews.read", "/dashboard/sem-acesso?recurso=Avaliações")`, ajustando o import.

- [ ] **Step 6: `promotions/page.tsx` — adicionar gate de read**

Linha 105 — trocar `const session = await requireCurrentSession();` por:

```typescript
	const session = await requireCapabilityOrRedirect(
		"promotions.read",
		"/dashboard/sem-acesso?recurso=Promoções"
	);
```

Garantir o import de `requireCapabilityOrRedirect` de `@/lib/permissions` (o arquivo já importa `can` de lá; adicionar à mesma linha de import). Se `requireCurrentSession` deixar de ser usado no arquivo, remover seu import para não falhar o lint de import não-usado.

- [ ] **Step 7: `tools/page.tsx` — adicionar gate de read**

Linha 18 importa `requireCurrentSession` de `@/lib/session`; linha 17 importa `can` de `@/lib/permissions`. Trocar o uso de `requireCurrentSession()` (na função `ToolsPage`, ~linha 52) por:

```typescript
	const session = await requireCapabilityOrRedirect(
		"tools.read",
		"/dashboard/sem-acesso?recurso=Ferramentas"
	);
```

Ajustar os imports: adicionar `requireCapabilityOrRedirect` ao import de `@/lib/permissions` e remover `requireCurrentSession` de `@/lib/session` se ficar sem uso.

- [ ] **Step 8: check-types + lint**

Run: `bun --cwd apps/web check-types && bun check`
Expected: sem erros de tipo nem de import não-usado.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/app/dashboard/sem-acesso/page.tsx apps/web/src/app/dashboard/customers/page.tsx "apps/web/src/app/dashboard/customers/[id]/page.tsx" apps/web/src/app/dashboard/reviews/page.tsx "apps/web/src/app/dashboard/reviews/[id]/page.tsx" apps/web/src/app/dashboard/promotions/page.tsx apps/web/src/app/dashboard/tools/page.tsx
git commit -m "feat: página 403 /dashboard/sem-acesso e gates de página com feedback"
```

---

### Task 7: Smoke multi-role no browser (verificação final)

**Files:** nenhum (verificação manual no servidor da porta 3001, já rodando).

**Interfaces:**
- Consumes: as mudanças das Tasks 1-6. Conta `user`: Marcos da Rosa (oquiler@gmail.com), 3 filiais vinculadas.

- [ ] **Step 1: Suíte + tipos + lint completos**

Run: `bun --cwd apps/web check-types && bun --cwd apps/web test && bun check`
Expected: tudo verde.

- [ ] **Step 2: Smoke como `user` (Marcos)**

Na porta 3001 (já logado como `user`), confirmar:
- Sidebar mostra apenas Visão (Dashboard), Operação (Pedidos, Filiais) e Catálogo (Ferramentas, Categorias, Fornecedores, Movimentações). **Sem** grupo Relacionamento.
- Abrir uma filial vinculada → aba "Estoque" abre, **sem** aba "Equipe", **sem** botão "Editar filial"; ajuste de estoque (entrada/saída/ajuste) disponível e funcional.
- `/dashboard/suppliers/new` → formulário acessível; criar fornecedor funciona.
- Acessar por URL `/dashboard/customers`, `/dashboard/reviews`, `/dashboard/promotions`, `/dashboard/site/banners` → cai em `/dashboard/sem-acesso` com a mensagem (não em tela de erro crua). Obs.: banners redireciona porque o item exige `site.update_banners`.

- [ ] **Step 3: Smoke como `admin` (opcional, se houver conta admin à mão)**

- Abrir uma filial → página abre (não redireciona); ajuste de estoque destravado.
- Tentar forçar logout de si mesmo / resetar a própria senha na tela de Usuários → ação bloqueada com mensagem (não executa).

- [ ] **Step 4: Reportar resultado**

Registrar no fechamento o que passou/falhou com evidência (screenshots das telas-chave). Sem novo commit (só verificação).

---

## Self-Review

**Spec coverage:**
- Parte 1 (matriz `user`) → Task 1. ✓
- Parte 2 (fixes de gate: branches/[id], suppliers/new, branches/new) → Tasks 4 e 3. ✓
- Parte 3 (sidebar consistente) → Task 5. ✓
- Parte 4 (feedback de acesso negado / página 403) → Task 6. ✓
- Parte 5 (self-action hardening) → Task 2. ✓
- Verificação (testes + smoke multi-role) → Tasks 1/2 (unit) e Task 7 (smoke). ✓

**Placeholder scan:** sem TBD/TODO; cada step de código traz o código real. Os dois steps que pedem `Read` antes de editar (`customers/[id]`, `reviews/[id]`) trazem a transformação exata e o número de linha aproximado do relatório — não são placeholders, são localizações a confirmar no arquivo.

**Type consistency:** `getUserCapabilities` retorna `ReadonlySet<Capability>` → convertido para `Capability[]` via spread no layout antes de passar à prop `capabilities: Capability[]` da sidebar. `SELF_RESTRICTED` é `readonly Capability[]` — as caps adicionadas são keys válidas do registry. Nomes de capability conferidos contra `capabilities.ts`.
