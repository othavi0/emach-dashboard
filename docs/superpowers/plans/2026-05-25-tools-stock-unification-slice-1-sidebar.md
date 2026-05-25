# Tools × Stock Unification — Slice 1: Sidebar + badge "a repor"

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover o grupo "Estoque" da sidebar e adicionar um badge "N a repor" no link "Ferramentas" (no grupo Catálogo), com a contagem escopada por `user_branch` para non-`super_admin`.

**Architecture:** Server query `getReporCount(scope)` em `_lib/repor-count.ts` chamada no `dashboard/layout.tsx`. AppSidebar recebe o número como prop e renderiza badge no `/dashboard/tools` se > 0 (mesmo pattern do `pendingCount` em "Usuários"). Mutações de estoque revalidam o layout pra manter o badge fresco.

**Tech Stack:** Next.js 16 App Router (RSC), Drizzle ORM, React `cache`, shadcn/ui sidebar.

**Spec:** `docs/superpowers/specs/2026-05-25-tools-stock-unification-design.md` § Sidebar

---

## Mapa de arquivos

| Arquivo | Status | O que muda |
|---|---|---|
| `apps/web/src/app/dashboard/_lib/repor-count.ts` | **Criar** | Query `getReporCount(scope)` cacheada por request |
| `apps/web/src/app/dashboard/layout.tsx` | **Modificar** | Computa `reporCount` e passa pra AppSidebar |
| `apps/web/src/app/dashboard/_components/app-sidebar.tsx` | **Modificar** | Remove grupo "Estoque"; aceita `reporCount`; renderiza badge em "Ferramentas" |
| `apps/web/src/app/dashboard/stock/actions.ts` | **Modificar** | Adiciona `revalidatePath("/dashboard", "layout")` nas mutações pra refrescar o badge |

**Não muda nesta slice** (vão pras próximas):
- `/dashboard/stock/page.tsx` continua acessível (URL direto). Redirect entra na Slice 6.
- `/dashboard/stock/branches/page.tsx` continua (linkado no `/dashboard/page.tsx`). Cleanup na Slice 6.
- `/dashboard/tools` continua catálogo simples (sem toggle de modo). Toggle entra na Slice 6.

---

## Task 1: Criar `repor-count.ts`

**Files:**
- Create: `apps/web/src/app/dashboard/_lib/repor-count.ts`

### Contexto

Contagem distinta de `tool_id` que tem pelo menos uma combinação `(variante × filial)` com `quantity <= reorderPoint` (e `reorderPoint > 0`). Escopado pela `BranchScope` do usuário (`null` = super_admin vê tudo; array = só as filiais dele).

Usa `react.cache` pra evitar dupla execução numa mesma request (mesmo pattern do `getUserBranchScope`).

- [ ] **Step 1: Verificar que o diretório `_lib` ainda não existe sob `dashboard/`**

Run: `ls apps/web/src/app/dashboard/_lib 2>/dev/null || echo "criar"`
Expected: `criar` (diretório novo). Se já existir, OK — só adicionamos o arquivo.

- [ ] **Step 2: Criar `repor-count.ts` com o conteúdo abaixo**

```typescript
import { db } from "@emach/db";
import { stockLevel } from "@emach/db/schema/inventory";
import { toolVariant } from "@emach/db/schema/tools";
import { and, countDistinct, eq, gt, inArray, lte } from "drizzle-orm";
import { cache } from "react";

import type { BranchScope } from "@/lib/branch-scope";

export const getReporCount = cache(async (scope: BranchScope): Promise<number> => {
	if (scope !== null && scope.length === 0) {
		return 0;
	}

	const whereConditions = [
		gt(stockLevel.reorderPoint, 0),
		lte(stockLevel.quantity, stockLevel.reorderPoint),
	];

	if (scope !== null) {
		whereConditions.push(inArray(stockLevel.branchId, scope));
	}

	const [row] = await db
		.select({ value: countDistinct(toolVariant.toolId) })
		.from(stockLevel)
		.innerJoin(toolVariant, eq(toolVariant.id, stockLevel.variantId))
		.where(and(...whereConditions));

	return Number(row?.value ?? 0);
});
```

- [ ] **Step 3: `bun check-types` no monorepo passa**

Run: `bun check-types`
Expected: sem erros relacionados a `repor-count.ts`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/_lib/repor-count.ts
git commit -m "feat: add getReporCount query for sidebar badge"
```

---

## Task 2: Wire no `dashboard/layout.tsx`

**Files:**
- Modify: `apps/web/src/app/dashboard/layout.tsx`

### Contexto

O layout já computa `pendingCount` quando o user tem `users.approve`. Adicionamos `reporCount` em paralelo (não condicionado a capability — todos os roles que chegam no layout têm `stock.read`, já que o gate de status "pending/suspended" filtra antes). Não bloqueia render — query é < 5ms numa coluna indexada.

- [ ] **Step 1: Adicionar imports no topo do arquivo**

No `apps/web/src/app/dashboard/layout.tsx`, adicionar logo após o import existente de `getUserStatus, requireCurrentSession`:

```typescript
import { getUserBranchScope } from "@/lib/branch-scope";
import { getReporCount } from "./_lib/repor-count";
```

- [ ] **Step 2: Calcular `reporCount` em paralelo com `pendingCount`**

Substituir o bloco:

```typescript
const role = (session.user.role ?? "user") as UserRole;
const canManageUsers = can(role, "users.approve");
let pendingCount = 0;
if (canManageUsers) {
	const [row] = await db
		.select({ value: count() })
		.from(userTable)
		.where(eq(userTable.status, "pending"));
	pendingCount = Number(row?.value ?? 0);
}
```

Por:

```typescript
const role = (session.user.role ?? "user") as UserRole;
const canManageUsers = can(role, "users.approve");
const branchScope = await getUserBranchScope(session);

const [pendingCountRow, reporCount] = await Promise.all([
	canManageUsers
		? db
				.select({ value: count() })
				.from(userTable)
				.where(eq(userTable.status, "pending"))
				.then((rows) => rows[0])
		: Promise.resolve(undefined),
	getReporCount(branchScope),
]);

const pendingCount = Number(pendingCountRow?.value ?? 0);
```

- [ ] **Step 3: Passar `reporCount` pra AppSidebar**

Substituir a linha do `<AppSidebar ... />` por:

```tsx
<AppSidebar
	canManageUsers={canManageUsers}
	pendingCount={pendingCount}
	reporCount={reporCount}
/>
```

- [ ] **Step 4: `bun check-types` passa**

Run: `bun check-types`
Expected: erro só na assinatura da `AppSidebar` (vamos resolver na Task 3). Não commit ainda.

---

## Task 3: Atualizar `AppSidebar`

**Files:**
- Modify: `apps/web/src/app/dashboard/_components/app-sidebar.tsx`

### Contexto

Três mudanças coordenadas: (a) remove o grupo "Estoque" do `NAV_GROUPS`; (b) aceita `reporCount: number` na interface de props; (c) renderiza badge em `/dashboard/tools` espelhando o pattern do `pendingCount` em `/dashboard/users` (já existente nas linhas 283–288).

- [ ] **Step 1: Remover o grupo "Estoque" de `NAV_GROUPS`**

Em `apps/web/src/app/dashboard/_components/app-sidebar.tsx`, deletar este bloco (linhas ~40-49):

```typescript
{
    label: "Estoque",
    items: [
        {
            label: "Estoque Geral",
            href: "/dashboard/stock" as Route,
            exact: true,
        },
    ],
},
```

A constante `NAV_GROUPS` passa a começar direto com o grupo "Vendas".

- [ ] **Step 2: Estender a interface `AppSidebarProps`**

Substituir:

```typescript
interface AppSidebarProps {
	canManageUsers: boolean;
	pendingCount: number;
}

export function AppSidebar({ canManageUsers, pendingCount }: AppSidebarProps) {
```

Por:

```typescript
interface AppSidebarProps {
	canManageUsers: boolean;
	pendingCount: number;
	reporCount: number;
}

export function AppSidebar({
	canManageUsers,
	pendingCount,
	reporCount,
}: AppSidebarProps) {
```

- [ ] **Step 3: Renderizar badge em "/dashboard/tools"**

Localizar o bloco que renderiza o badge de `pendingCount` (procure `pendingCount > 0`). Adicionar logo abaixo do `{...}` desse `Link`:

```tsx
<Link href={item.href}>
	{item.label}
	{item.href === "/dashboard/users" &&
		pendingCount > 0 && (
			<span className="ml-2 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
				{pendingCount}
			</span>
		)}
	{item.href === "/dashboard/tools" && reporCount > 0 && (
		<span className="ml-2 rounded-full bg-primary/10 px-1.5 text-[10px] text-primary">
			{reporCount}
		</span>
	)}
</Link>
```

Note a diferença de paleta com o badge de "Usuários":
- `pendingCount` (urgência humana) → `bg-primary text-primary-foreground` (sólido)
- `reporCount` (urgência operacional, mais recorrente) → `bg-primary/10 text-primary` (tonal), pra não competir com o estado ativo da rota nem com o badge de "Usuários" quando ambos aparecem.

- [ ] **Step 4: `bun check-types` passa**

Run: `bun check-types`
Expected: 0 erros.

- [ ] **Step 5: Commit (Tasks 2 + 3 juntas)**

```bash
git add apps/web/src/app/dashboard/layout.tsx apps/web/src/app/dashboard/_components/app-sidebar.tsx
git commit -m "feat(dashboard): badge 'a repor' em Ferramentas, remove grupo Estoque da sidebar"
```

---

## Task 4: Revalidar layout em mutações de estoque

**Files:**
- Modify: `apps/web/src/app/dashboard/stock/actions.ts`

### Contexto

O badge é computado no `layout.tsx`, então `revalidatePath("/dashboard/...")` em rotas filhas não derruba o cache do layout por default — precisa de `revalidatePath("/dashboard", "layout")`. Sem isso, ajustar quantidade na UI deixa o badge desatualizado até navegação completa.

Aplicamos em todas as mutações que mexem em `stock_level.quantity` ou `reorderPoint` / `minQty`.

- [ ] **Step 1: Localizar as duas funções de mutação**

São `adjustStock(...)` e `updateStockThresholds(...)` em `apps/web/src/app/dashboard/stock/actions.ts`. Cada uma tem hoje um bloco de 4 `revalidatePath(...)` no fim.

- [ ] **Step 2: Adicionar `revalidatePath("/dashboard", "layout")` em ambas**

Em cada uma das duas funções, imediatamente após o bloco existente de `revalidatePath(...)`, acrescentar:

```typescript
revalidatePath("/dashboard", "layout");
```

Isso força o RSC do layout (onde o badge mora) a recomputar `reporCount` na próxima render.

- [ ] **Step 3: `bun check-types` passa**

Run: `bun check-types`
Expected: 0 erros.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/stock/actions.ts
git commit -m "fix(stock): revalida layout do dashboard pra refrescar badge 'a repor'"
```

---

## Task 5: Smoke test em browser

**Files:** (nenhum — verificação manual)

### Contexto

O CLAUDE.md raiz lembra: `bun check-types` não pega SQL inválido em template strings. Smoke é obrigatório após mexer em queries SSR.

- [ ] **Step 1: Subir dev server**

Run em terminal dedicado: `bun dev:web`
Expected: server up em `http://localhost:3001` (ou porta padrão do projeto).

- [ ] **Step 2: Login como super_admin e abrir `/dashboard`**

Verificar visualmente:
- ✅ Sidebar **NÃO** mostra grupo "Estoque" nem link "Estoque Geral".
- ✅ Sidebar **mostra** "Ferramentas" no grupo "Catálogo".
- ✅ Se houver itens com `quantity <= reorderPoint` no banco, badge tonal laranja com a contagem aparece à direita de "Ferramentas".
- ✅ Click em "Ferramentas" navega pra `/dashboard/tools`.

- [ ] **Step 3: Login como manager (com `user_branch` configurado) e repetir**

Verificar:
- ✅ Badge mostra contagem escopada às filiais do usuário (esperado: < ou = à contagem que super_admin viu).
- Se o manager não tem filial atribuída em `user_branch`, badge não aparece (contagem = 0).

- [ ] **Step 4: Disparar um ajuste de estoque que mude o estado**

No `/dashboard/stock/page.tsx` (ainda acessível via URL), clicar em "Gerenciar estoque" de uma ferramenta e ajustar quantidade pra **abaixo** do `reorderPoint`. Voltar pra `/dashboard`.

Verificar:
- ✅ Badge incrementou na sidebar.

Inverso: ajustar pra **acima** do `reorderPoint`. Badge decrementa.

- [ ] **Step 5: Quick check no `next-devtools` MCP (opcional)**

Run via MCP `next-devtools`: `nextjs_call <port> get_errors`
Expected: sem erros novos relacionados a `repor-count`, `layout` ou `app-sidebar`.

- [ ] **Step 6: Final commit (se houve qualquer ajuste durante smoke)**

```bash
git status
# se há ajustes:
git add .
git commit -m "chore: ajustes pós-smoke do slice 1"
```

---

## Definition of done

- ✅ Grupo "Estoque" removido da sidebar.
- ✅ Badge "N a repor" aparece em "Ferramentas" quando há itens com `quantity <= reorderPoint`.
- ✅ Contagem escopada por `user_branch` para não-super_admin.
- ✅ Badge revalida ao ajustar estoque ou limites.
- ✅ `/dashboard/stock` continua acessível por URL direta (redirect entra na Slice 6).
- ✅ `bun check-types` passa em 0 erros.
- ✅ Smoke manual passou em super_admin + manager.

## Próxima slice

**Slice 2** — shell de `/dashboard/tools/[id]` com tabs vazias + tab "Visão geral" (sem mexer em estoque). Plano separado em arquivo próprio.
