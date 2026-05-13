# Customers Index Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar header de 2 colunas (`PendingList` + `ActivityFeed`) ao `/dashboard/customers`, espelhando o padrão de `/dashboard/orders`, e ajustar a tabela (−Documento, +Verificado).

**Architecture:** Estender `customers/data.ts` com 2 funções server-side (`getCustomerPendingCounts`, `getRecentCustomerActivity`). Adicionar 3 flags de querystring (`missingDoc`, `openOrderInactive`, `unverifiedNew`) no schema e no WHERE de `listCustomers`. Atualizar `page.tsx` para buscar tudo em `Promise.all` e renderizar a `<section>`. Atualizar `customer-table.tsx` para a nova coluna. Reusar `<PendingList>`/`<ActivityFeed>` de `@/components/*`.

**Tech Stack:** Next 16 RSC, Drizzle ORM 0.45 + node-postgres, Tailwind 4 + shadcn UI, `@emach/db/schema/client` e `@emach/db/schema/orders`.

Spec de referência: `docs/superpowers/specs/2026-05-13-customers-index-redesign-design.md`.

Sem testes unitários novos: lógica de queries é cobertura de smoke em `bun dev:web`. Type-check garante shape.

---

### Task 1: Estender `schema.ts` com 3 flags de querystring

**Files:**
- Modify: `apps/web/src/app/dashboard/customers/schema.ts`

- [ ] **Step 1: Adicionar 3 novos booleans no schema Zod**

Em `customersListFiltersSchema`, adicionar logo após os campos existentes (mantendo o estilo do arquivo):

```ts
missingDoc: z.coerce.boolean().optional(),
openOrderInactive: z.coerce.boolean().optional(),
unverifiedNew: z.coerce.boolean().optional(),
```

Atualizar o tipo exportado `CustomersListFilters` (se for derivado via `z.infer`, nada muda; se for explícito, refletir os 3 campos).

- [ ] **Step 2: Verificar tipos**

Run: `bun --cwd apps/web check-types 2>&1 | grep -E "(customers/schema|customers/data|customer-filters|customers/page)\.tsx?" || echo "OK"`
Expected: `OK` (ou apenas erros pré-existentes em `branches/actions.ts`).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/customers/schema.ts
git commit -m "feat(customers/schema): adiciona flags missingDoc/openOrderInactive/unverifiedNew"
```

---

### Task 2: Implementar `getCustomerPendingCounts` em `data.ts`

**Files:**
- Modify: `apps/web/src/app/dashboard/customers/data.ts`

- [ ] **Step 1: Adicionar a função no final do arquivo**

Adicionar ao final de `data.ts`:

```ts
export interface CustomerPendingCounts {
	blocked: number;
	noDoc: number;
	inactiveWithOpenOrder: number;
	unverifiedNew: number;
}

export async function getCustomerPendingCounts(): Promise<CustomerPendingCounts> {
	const result = await db.execute<{
		blocked: string;
		no_doc: string;
		inactive_with_open_order: string;
		unverified_new: string;
	}>(sql`
		SELECT
			COUNT(*) FILTER (WHERE c.status = 'blocked') AS blocked,
			COUNT(*) FILTER (WHERE c.document IS NULL) AS no_doc,
			COUNT(*) FILTER (
				WHERE c.status = 'inactive'
				AND EXISTS (
					SELECT 1 FROM "order" o
					WHERE o.client_id = c.id
					AND o.status IN ('pending_payment', 'preparing', 'shipped')
				)
			) AS inactive_with_open_order,
			COUNT(*) FILTER (
				WHERE c.email_verified = false
				AND c.created_at > now() - INTERVAL '14 days'
			) AS unverified_new
		FROM client c
	`);

	const row = result.rows[0];
	return {
		blocked: Number(row?.blocked ?? 0),
		noDoc: Number(row?.no_doc ?? 0),
		inactiveWithOpenOrder: Number(row?.inactive_with_open_order ?? 0),
		unverifiedNew: Number(row?.unverified_new ?? 0),
	};
}
```

Imports necessários (verificar se já existem no topo):

```ts
import { sql } from "drizzle-orm";
import { db } from "@emach/db";
```

- [ ] **Step 2: Verificar tipos**

Run: `bun --cwd apps/web check-types 2>&1 | grep -E "customers/data\.ts" || echo "OK"`
Expected: `OK`.

- [ ] **Step 3: Smoke da query (opcional, via psql)**

Se o user tiver psql configurado: `psql $DATABASE_URL -c "SELECT COUNT(*) FROM client"` retorna número. Confirma conexão. Pular se não disponível.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/customers/data.ts
git commit -m "feat(customers/data): getCustomerPendingCounts"
```

---

### Task 3: Implementar `getRecentCustomerActivity` em `data.ts`

**Files:**
- Modify: `apps/web/src/app/dashboard/customers/data.ts`

- [ ] **Step 1: Adicionar a função**

Adicionar logo após `getCustomerPendingCounts`:

```ts
export type RecentClientActivityKind = "new_client" | "login" | "first_order";

export interface RecentClientActivity {
	id: string;
	kind: RecentClientActivityKind;
	at: Date;
	clientId: string;
	clientName: string;
}

export async function getRecentCustomerActivity(
	limit = 8
): Promise<RecentClientActivity[]> {
	const result = await db.execute<{
		id: string;
		kind: RecentClientActivityKind;
		at: string;
		client_id: string;
		client_name: string;
	}>(sql`
		WITH new_clients AS (
			SELECT
				c.id AS id,
				'new_client'::text AS kind,
				c.created_at AS at,
				c.id AS client_id,
				c.name AS client_name
			FROM client c
			ORDER BY c.created_at DESC
			LIMIT ${limit}
		),
		recent_logins AS (
			SELECT
				cs.id AS id,
				'login'::text AS kind,
				max_session.last_at AS at,
				c.id AS client_id,
				c.name AS client_name
			FROM (
				SELECT client_id, MAX(created_at) AS last_at
				FROM client_session
				GROUP BY client_id
				ORDER BY last_at DESC
				LIMIT ${limit}
			) max_session
			JOIN client c ON c.id = max_session.client_id
			JOIN client_session cs ON cs.client_id = c.id AND cs.created_at = max_session.last_at
		),
		first_orders AS (
			SELECT
				o.id AS id,
				'first_order'::text AS kind,
				o.created_at AS at,
				c.id AS client_id,
				c.name AS client_name
			FROM "order" o
			JOIN client c ON c.id = o.client_id
			WHERE o.created_at = (
				SELECT MIN(o2.created_at) FROM "order" o2 WHERE o2.client_id = o.client_id
			)
			AND o.created_at > now() - INTERVAL '7 days'
			ORDER BY o.created_at DESC
			LIMIT ${limit}
		)
		SELECT * FROM new_clients
		UNION ALL SELECT * FROM recent_logins
		UNION ALL SELECT * FROM first_orders
		ORDER BY at DESC
		LIMIT ${limit}
	`);

	return result.rows.map((r) => ({
		id: r.id,
		kind: r.kind,
		at: new Date(r.at),
		clientId: r.client_id,
		clientName: r.client_name,
	}));
}
```

Notas:
- `db.execute` devolve timestamps como string — coerção via `new Date(r.at)` segue a convenção do projeto (ver `packages/db/CLAUDE.md` sobre `toDate`; aqui o `new Date()` direto é suficiente porque é um único campo).
- O UNION ALL com `ORDER BY` final garante o sort cronológico após mesclar as 3 fontes.

- [ ] **Step 2: Verificar tipos**

Run: `bun --cwd apps/web check-types 2>&1 | grep -E "customers/data\.ts" || echo "OK"`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/customers/data.ts
git commit -m "feat(customers/data): getRecentCustomerActivity"
```

---

### Task 4: Aplicar novos flags em `listCustomers`

**Files:**
- Modify: `apps/web/src/app/dashboard/customers/data.ts`

- [ ] **Step 1: Adicionar WHERE conditional aos filtros existentes**

Localizar `listCustomers` (função que monta o WHERE). Dentro do array/expression que combina `and(...)`, adicionar 3 novas conditions:

```ts
filters.missingDoc ? isNull(client.document) : undefined,
filters.openOrderInactive
	? and(
			eq(client.status, "inactive"),
			exists(
				db
					.select({ x: sql`1` })
					.from(order)
					.where(
						and(
							eq(order.clientId, client.id),
							inArray(order.status, [
								"pending_payment",
								"preparing",
								"shipped",
							])
						)
					)
			)
		)
	: undefined,
filters.unverifiedNew
	? and(
			eq(client.emailVerified, false),
			gt(client.createdAt, sql`now() - INTERVAL '14 days'`)
		)
	: undefined,
```

Imports necessários:

```ts
import { and, eq, exists, gt, inArray, isNull, sql } from "drizzle-orm";
import { order } from "@emach/db/schema/orders";
import { client } from "@emach/db/schema/client";
```

(Verificar quais já existem; manter alfabético.)

- [ ] **Step 2: Verificar tipos**

Run: `bun --cwd apps/web check-types 2>&1 | grep -E "customers/data\.ts" || echo "OK"`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/customers/data.ts
git commit -m "feat(customers/data): aplica flags missingDoc/openOrderInactive/unverifiedNew em listCustomers"
```

---

### Task 5: Expor `emailVerified` em `CustomerListItem`

**Files:**
- Modify: `apps/web/src/app/dashboard/customers/data.ts`

- [ ] **Step 1: Adicionar campo ao SELECT**

Localizar a interface `CustomerListItem` e o `.select({...})` da query `listCustomers`. Em ambos:

Na interface:

```ts
emailVerified: boolean;
```

No select:

```ts
emailVerified: client.emailVerified,
```

E no mapping de resultado (se há `.map(row => ({...}))`), incluir `emailVerified: row.emailVerified`.

- [ ] **Step 2: Verificar tipos**

Run: `bun --cwd apps/web check-types 2>&1 | grep -E "customers/data\.ts" || echo "OK"`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/customers/data.ts
git commit -m "feat(customers/data): expõe emailVerified em CustomerListItem"
```

---

### Task 6: Atualizar `customer-table.tsx` — -Documento +Verificado

**Files:**
- Modify: `apps/web/src/app/dashboard/customers/_components/customer-table.tsx`

- [ ] **Step 1: Remover header e cell da coluna "Documento"**

No `<TableHeader>`, remover:

```tsx
<TableHead>Documento</TableHead>
```

No `<TableBody>`, remover o `<TableCell>` que renderiza `formatDocument(item.document)` (atualmente a 2ª célula da linha, ~linhas 133-135). Também remover o import não-utilizado de `formatDocument` se não for usado em outro lugar do arquivo (verificar com grep).

- [ ] **Step 2: Adicionar coluna "Verificado" entre "Tipo" e "LTV"**

No `<TableHeader>`, inserir após o `<TableHead>Tipo</TableHead>`:

```tsx
<TableHead>Verificado</TableHead>
```

No `<TableBody>`, inserir o `<TableCell>` na mesma posição (após a cell de tipo):

```tsx
<TableCell>
	<div
		aria-label={`Email ${item.emailVerified ? "verificado" : "não verificado"}, documento ${item.document ? "presente" : "pendente"}`}
		className="flex items-center gap-1"
	>
		<Badge variant={item.emailVerified ? "success" : "secondary"}>
			{item.emailVerified ? "✓" : "✗"} Email
		</Badge>
		<Badge variant={item.document ? "success" : "secondary"}>
			{item.document ? "✓" : "—"} Doc
		</Badge>
	</div>
</TableCell>
```

Imports necessários (`Badge` já está importado).

- [ ] **Step 3: Verificar tipos**

Run: `bun --cwd apps/web check-types 2>&1 | grep -E "customer-table\.tsx" || echo "OK"`
Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/customers/_components/customer-table.tsx
git commit -m "feat(customers/table): -col Documento, +col Verificado"
```

---

### Task 7: Atualizar `customer-filters.tsx` — TRACKED + `hasFilters`

**Files:**
- Modify: `apps/web/src/app/dashboard/customers/_components/customer-filters.tsx`

- [ ] **Step 1: Adicionar os 3 flags em `TRACKED`**

Localizar a const `TRACKED` (atualmente lista 10 keys). Adicionar:

```ts
const TRACKED = [
	"q",
	"status",
	"clientType",
	"createdFrom",
	"createdTo",
	"lastOrderFrom",
	"lastOrderTo",
	"ltvMin",
	"ltvMax",
	"sort",
	"missingDoc",
	"openOrderInactive",
	"unverifiedNew",
] as const;
```

Isso garante que `clearAll` do `useFilterState` remove esses params junto.

Sem alterações em `<FiltersBar>` — os 3 flags não têm UI no painel.

- [ ] **Step 2: Verificar tipos**

Run: `bun --cwd apps/web check-types 2>&1 | grep -E "customer-filters\.tsx" || echo "OK"`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/customers/_components/customer-filters.tsx
git commit -m "feat(customers/filters): TRACKED inclui novos flags de pending"
```

---

### Task 7.5: Estender `ActivityKind` com `"customer"`

**Files:**
- Modify: `apps/web/src/components/activity-feed.tsx`

- [ ] **Step 1: Adicionar `"customer"` ao tipo e ao KIND_META**

Em `apps/web/src/components/activity-feed.tsx`:

```ts
import { BoxIcon, type LucideIcon, PackageIcon, StarIcon, UserIcon } from "lucide-react";

export type ActivityKind = "order" | "review" | "stock" | "customer";
```

Adicionar entrada em `KIND_META`:

```ts
const KIND_META: Record<ActivityKind, { color: string; icon: LucideIcon }> = {
	stock: { icon: BoxIcon, color: "text-info" },
	order: { icon: PackageIcon, color: "text-warning" },
	review: { icon: StarIcon, color: "text-success" },
	customer: { icon: UserIcon, color: "text-primary" },
};
```

- [ ] **Step 2: Verificar tipos**

Run: `bun --cwd apps/web check-types 2>&1 | grep -E "activity-feed\.tsx" || echo "OK"`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/activity-feed.tsx
git commit -m "feat(activity-feed): adiciona kind=customer"
```

---

### Task 8: Atualizar `page.tsx` — section + Promise.all + hasFilters

**Files:**
- Modify: `apps/web/src/app/dashboard/customers/page.tsx`

- [ ] **Step 1: Trocar `listCustomers` standalone por `Promise.all`**

Substituir o bloco atual:

```ts
const result = await listCustomers({ filters, cursor: null });
```

Por:

```ts
const [counts, recentActivity, result] = await Promise.all([
	getCustomerPendingCounts(),
	getRecentCustomerActivity(),
	listCustomers({ filters, cursor: null }),
]);
```

Adicionar imports:

```ts
import { type ActivityEvent, ActivityFeed } from "@/components/activity-feed";
import { type PendingGroup, PendingList } from "@/components/pending-list";
import {
	getCustomerPendingCounts,
	getRecentCustomerActivity,
	listCustomers,
} from "./data";
```

- [ ] **Step 2: Montar `pendingGroups` e `activityEvents`**

Antes do `return`, adicionar:

```ts
const pendingGroups: PendingGroup[] = [
	{
		title: "Aguardando ação",
		items: [
			{
				label: "Bloqueados",
				count: counts.blocked,
				href: "/dashboard/customers?status=blocked",
				role: "warning",
			},
			{
				label: "Sem documento (CPF/CNPJ)",
				count: counts.noDoc,
				href: "/dashboard/customers?missingDoc=1",
				role: "warning",
			},
		],
	},
	{
		title: "Pendências",
		items: [
			{
				label: "Inativos c/ pedido em aberto",
				count: counts.inactiveWithOpenOrder,
				href: "/dashboard/customers?openOrderInactive=1",
				role: "info",
			},
			{
				label: "Novos sem email verificado",
				count: counts.unverifiedNew,
				href: "/dashboard/customers?unverifiedNew=1",
				role: "info",
			},
		],
	},
];

const activityEvents: ActivityEvent[] = recentActivity.map((row) => {
	const labels: Record<typeof row.kind, string> = {
		new_client: "Novo cadastro",
		login: "Login",
		first_order: "1ª compra",
	};
	return {
		id: row.id,
		kind: "customer" as const,
		at: row.at,
		primary: `${labels[row.kind]} · ${row.clientName}`,
		href: `/dashboard/customers/${row.clientId}`,
	};
});
```

Nota: se `ActivityEvent.kind` não aceitar `"customer"`, usar o kind discriminado equivalente que já existir em `apps/web/src/components/activity-feed.tsx` (verificar antes — provavelmente é `"order" | "customer" | "stock"` ou apenas string).

- [ ] **Step 3: Atualizar `hasFilters`**

```ts
const hasFilters = Boolean(
	filters.q ||
		filters.status ||
		filters.clientType?.length ||
		filters.createdFrom ||
		filters.createdTo ||
		filters.lastOrderFrom ||
		filters.lastOrderTo ||
		filters.ltvMin !== undefined ||
		filters.ltvMax !== undefined ||
		filters.missingDoc ||
		filters.openOrderInactive ||
		filters.unverifiedNew
);
```

- [ ] **Step 4: Inserir `<section>` antes dos `<CustomerFilters>`**

Logo após o `<PageHeader />` e antes de `<CustomerFilters />`:

```tsx
<section className="grid gap-3 lg:grid-cols-2">
	<PendingList
		emptyMessage="Nenhum cliente aguardando ação."
		groups={pendingGroups}
		title="Atenção em clientes"
	/>
	<ActivityFeed
		emptyMessage="Sem atividade recente."
		events={activityEvents}
		title="Atividade recente"
	/>
</section>
```

- [ ] **Step 5: Verificar tipos**

Run: `bun --cwd apps/web check-types 2>&1 | grep -E "customers/page\.tsx" || echo "OK"`
Expected: `OK`. Se houver erro de `kind` em `ActivityEvent`, ler `apps/web/src/components/activity-feed.tsx` e ajustar o discriminante na const `activityEvents`.

- [ ] **Step 6: Smoke**

Run: `bun dev:web`
Visitar: `http://localhost:3001/dashboard/customers`

Expected:
- Acima dos filtros, 2 colunas:
  - `PendingList` com título "Atenção em clientes", 2 grupos, 4 itens — counts batem com `SELECT COUNT(*) FILTER (...) FROM client`.
  - `ActivityFeed` com até 8 eventos (mistura de novos cadastros, logins, 1ª compras), ordenados cronologicamente.
- Clicar em "Bloqueados" → URL `?status=blocked`, tabela filtra; "Limpar filtros" acende e ao clicar volta para base. Repetir para os outros 3.
- Tabela: sem coluna "Documento"; coluna "Verificado" exibindo os 2 badges.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/customers/page.tsx
git commit -m "feat(customers/page): adiciona PendingList + ActivityFeed acima dos filtros"
```

---

### Task 9: Verificação final integrada

- [ ] **Step 1: Type-check completo**

Run: `bun --cwd apps/web check-types 2>&1 | grep -v "branches/actions.ts\|lib/permissions.ts" | tail -10`
Expected: nenhum erro novo. Apenas os Drizzle dupe-version pré-existentes (em `branches/actions.ts` / `lib/permissions.ts`) podem aparecer.

- [ ] **Step 2: Lint/format**

Run: `bun fix`
Expected: nenhum diff manual (hook PostToolUse já formatou).

- [ ] **Step 3: Smoke run-time consolidado**

`bun dev:web` rodando. Visitar em sequência:

1. `/dashboard/customers` — header 2 colunas + filtros + tabela com novas colunas.
2. `/dashboard/customers?status=blocked` — tabela filtra; PendingList mostra count consistente.
3. `/dashboard/customers?missingDoc=1` — tabela mostra apenas clientes sem documento.
4. `/dashboard/customers?openOrderInactive=1` — filtra inativos com pedidos em aberto.
5. `/dashboard/customers?unverifiedNew=1` — filtra novos cadastros não-verificados.
6. Combinar filtros: `/dashboard/customers?status=blocked&q=teste` — ambos aplicam (AND).
7. Botão "Limpar filtros" remove TODOS os params (incluindo os 3 novos) ao clicar.
8. Clicar evento do ActivityFeed → leva para `/dashboard/customers/{clientId}`.
9. `nextjs_call <port> get_errors` retorna vazio.

- [ ] **Step 4: Self-review final**

Antes de declarar pronto:
- Counts no PendingList batem com filtros aplicados (e.g., `?status=blocked` mostra mesma quantidade de linhas na tabela).
- ActivityFeed não duplica eventos do mesmo cliente.

---

## Self-review do plano

- **Cobertura do spec:**
  - Spec §1 (header 2 colunas) → Tasks 2, 3, 8.
  - Spec §2 (tabela) → Tasks 5, 6.
  - Spec §3 (querystring) → Tasks 1, 4, 7, 8.
  - Spec §4 (data layer) → Tasks 2, 3, 5.
  - Spec §5 (page.tsx) → Task 8.
  - Verificação spec §7 → Task 9.
- **Placeholders:** zero `TBD`/"add appropriate"/"similar to". Toda task tem código.
- **Consistência de tipos:**
  - `CustomerPendingCounts` (Task 2) consumido por `pendingGroups` (Task 8) — keys batem (`blocked`, `noDoc`, `inactiveWithOpenOrder`, `unverifiedNew`).
  - `RecentClientActivity` (Task 3) consumido por `activityEvents` mapper (Task 8) — campos `id`, `kind`, `at`, `clientId`, `clientName` consistentes.
  - `emailVerified: boolean` adicionado em `CustomerListItem` (Task 5) e consumido em `customer-table.tsx` (Task 6).
  - 3 flags de querystring adicionados em `schema.ts` (Task 1), aplicados em `listCustomers` (Task 4), trackeados em `customer-filters.tsx` (Task 7), incluídos em `hasFilters` (Task 8) — mesma trinca de nomes (`missingDoc`, `openOrderInactive`, `unverifiedNew`) em todos.
- **Risco residual:** o `kind` discriminante de `ActivityEvent` (Task 8 Step 2) — depende do shape definido em `apps/web/src/components/activity-feed.tsx`. Step 5 instrui ler e ajustar se preciso. Não é placeholder, é uma verificação pontual.
