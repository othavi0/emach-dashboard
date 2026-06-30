# Feed unificado de Pendências — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o `PendingPanel` (abas) da `/dashboard` por um feed único priorizado por severidade, corrigindo a contagem de "Pedidos" e modernizando o visual das linhas.

**Architecture:** Uma query `fetchPendingFeed` une as 4 fontes de pendência (estoque, pedidos, reviews, promoções) via UNION ALL normalizado com coluna `severity` + `rank`, ordena por severidade e devolve até 50 itens + contagens por tipo. Um componente client `PendingFeed` renderiza a linha rica (ícone+chip+badge) e filtra por tipo client-side. Substitui o `PendingPanel` na `PendingSection` da `page.tsx`.

**Tech Stack:** Next 16 / React 19 (RSC), Drizzle (`db.execute` raw), `@emach/ui`, vitest.

## Global Constraints

- **Branch base:** `feed-pendencias-unificado` (empilhada sobre `dashboard-graficos-monitoramento`/PR #267 — herda o layout C da `page.tsx`).
- **`UNION ALL` + `ORDER BY` externo:** SEMPRE envolver o union em derived table (`SELECT * FROM (<blocos>) AS feed ORDER BY ...`). Com 1 bloco só (capabilities colapsam) o `ORDER BY` externo colide → `ERROR 42601 multiple ORDER BY`. Ver `packages/db/CLAUDE.md` e o exemplo em `fetchDashboardActivity`.
- **`db.execute` raw:** colunas em snake_case (aliasar `AS snake`); timestamps vêm como string. Aqui `rank` é só para `ORDER BY` no SQL (não lido no JS). Nunca `SELECT *` exceto sobre a derived table do próprio UNION.
- **Capabilities:** reviews só com `reviews.read`, promoções só com `promotions.read` — bloco condicional (espelha `fetchDashboardActivity`). Sem nenhuma capability de pendência → feed vazio (fail-closed).
- **Client Component nunca importa runtime de módulo `server-only`/`@emach/db`** — mas **tipos** podem vir via `import type` (apagado no compile). `PendingFeed` importa `PendingFeedItem`/`FeedType` com `import type`.
- **Anti-patterns banidos:** sem `console.*`, `: any`/`as any`, `key={index}`, `useMemo`/`useCallback` manual (React Compiler), `.forEach` em hot path (usar `for...of`), `<img>` nu. Status = ícone + cor + label (AAA/color-blindness).
- **Gate:** `bun verify` (check-types + check + test) e `bun run build`. Smoke visual na 3008 com dados reais. SQL/componentes não são unit-testáveis no projeto → verificação por check-types + smoke.

---

### Task 1: Corrigir contagem de "Pedidos" (fix isolado do bug)

`fetchDashboardCounts.orders` conta `status = 'paid'` (= 0), divergindo da lista que usa `ACTIVE_ORDER_STATUSES` (= 6). Alinhar.

**Files:**
- Modify: `apps/web/src/app/dashboard/pending-data.ts` (função `fetchDashboardCounts`, ~linha 387)

**Interfaces:**
- Consumes: `ACTIVE_ORDER_STATUSES`, `sqlStatusList` (já importados no arquivo, de `@emach/db/queries/order-status-groups`).
- Produces: `fetchDashboardCounts().orders` passa a contar pedidos ativos.

- [ ] **Step 1: Trocar a expressão de count**

Em `fetchDashboardCounts`, localizar a linha:

```ts
			(SELECT COUNT(*)::int FROM "order" WHERE status = 'paid') AS orders,
```

Trocar por:

```ts
			(SELECT COUNT(*)::int FROM "order" WHERE status IN (${sqlStatusList(ACTIVE_ORDER_STATUSES)})) AS orders,
```

- [ ] **Step 2: Verificar tipos**

Run: `bun check-types`
Expected: PASS.

- [ ] **Step 3: Smoke do count contra o banco**

Run (servidor dev já roda na 3008): abrir `http://localhost:3008/dashboard`. O badge/contador de pedidos pendentes deixa de ser 0 (com os dados atuais, 6).
Expected: badge reflete os pedidos ativos. (Confirma também via SQL: `SELECT COUNT(*) FROM "order" WHERE status IN ('paid','preparing','shipped')`.)

> ⚠️ `fetchDashboardCounts` alimenta também badges na **sidebar** (`countsPromise` em `dashboard-chrome.tsx`). Conferir com `rg "counts.orders|\.orders\b" apps/web/src/app/dashboard` que o novo valor (pedidos ativos) é o desejado na sidebar também. Se a sidebar quiser outra semântica, derivar um campo separado — mas o default é alinhar (a decisão do dono foi alinhar badge↔lista).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/pending-data.ts
git commit -m "fix(dashboard): contagem de pedidos pendentes usa status ativos"
```

---

### Task 2: Query unificada `fetchPendingFeed`

Une as 4 fontes num feed priorizado por severidade + contagens por tipo.

**Files:**
- Modify: `apps/web/src/app/dashboard/pending-data.ts` (adicionar tipos + função no fim)

**Interfaces:**
- Consumes: `db`, `sql`, `can`, `requireCurrentSession`, `cache`, `ACTIVE_ORDER_STATUSES`, `sqlStatusList` (já importados); `PendingRole` (de `@/components/pending-panel`), `StatusIconKey`/`Tone` (de `@/components/status-visual`).
- Produces:
  - `type FeedType = "stock" | "orders" | "reviews" | "promos"`
  - `interface PendingFeedItem { id; feedType: FeedType; primary; secondary?; href; badge: { label: string; role: PendingRole }; iconKey: StatusIconKey; tone: Tone }`
  - `interface PendingFeedCounts { total; stock; orders; reviews; promos }` (todos `number`)
  - `interface PendingFeedResult { items: PendingFeedItem[]; counts: PendingFeedCounts }`
  - `fetchPendingFeed(): Promise<PendingFeedResult>`

- [ ] **Step 1: Adicionar imports de tipo**

No topo de `pending-data.ts`, somar aos imports existentes:

```ts
import type { PendingRole } from "@/components/pending-panel";
import type { StatusIconKey, Tone } from "@/components/status-visual";
```

- [ ] **Step 2: Adicionar tipos + função (no fim do arquivo)**

```ts
export type FeedType = "stock" | "orders" | "reviews" | "promos";

export interface PendingFeedItem {
	badge: { label: string; role: PendingRole };
	feedType: FeedType;
	href: string;
	iconKey: StatusIconKey;
	id: string;
	primary: string;
	secondary?: string;
	tone: Tone;
}

export interface PendingFeedCounts {
	orders: number;
	promos: number;
	reviews: number;
	stock: number;
	total: number;
}

export interface PendingFeedResult {
	counts: PendingFeedCounts;
	items: PendingFeedItem[];
}

// Volume real de pendências é pequeno (dezenas) → teto fixo, sem paginação.
// Se crescer, adicionar cursor/scroll incremental (futuro).
const FEED_LIMIT = 50;

export const fetchPendingFeed = cache(async (): Promise<PendingFeedResult> => {
	const session = await requireCurrentSession();
	const [canStock, canOrders, canReviews, canPromos] = await Promise.all([
		can(session, "stock.read"),
		can(session, "orders.read"),
		can(session, "reviews.read"),
		can(session, "promotions.read"),
	]);

	const blocks: ReturnType<typeof sql>[] = [];

	if (canStock) {
		// severity 1 = ruptura (quantity 0), 4 = estoque baixo. rank = quantity (menor primeiro).
		blocks.push(sql`(
			SELECT 'stock-' || sl.variant_id || ':' || sl.branch_id AS id,
				'stock'::text AS feed_type,
				CASE WHEN sl.quantity = 0 THEN 1 ELSE 4 END AS severity,
				sl.quantity::numeric AS rank,
				COALESCE(tv.sku, t.name) AS primary,
				t.name || ' · ' || b.name AS secondary,
				'/dashboard/stock'::text AS href,
				CASE WHEN sl.quantity = 0 THEN 'Sem estoque' ELSE 'Repor' END AS badge_label,
				CASE WHEN sl.quantity = 0 THEN 'destructive' ELSE 'warning' END AS badge_role,
				'package'::text AS icon_key,
				CASE WHEN sl.quantity = 0 THEN 'destructive' ELSE 'warning' END AS tone
			FROM stock_level sl
			JOIN tool_variant tv ON tv.id = sl.variant_id
			JOIN tool t ON t.id = tv.tool_id
			JOIN branch b ON b.id = sl.branch_id
			WHERE sl.quantity = 0 OR (sl.reorder_point > 0 AND sl.quantity <= sl.reorder_point)
		)`);
	}

	if (canOrders) {
		// severity 2. rank = epoch do created_at (mais antigo primeiro).
		blocks.push(sql`(
			SELECT 'order-' || o.id AS id, 'orders'::text AS feed_type, 2 AS severity,
				EXTRACT(EPOCH FROM o.created_at)::numeric AS rank,
				'#' || o.number || ' · ' || c.name AS primary,
				NULL::text AS secondary,
				'/dashboard/orders/' || o.id AS href,
				CASE o.status WHEN 'paid' THEN 'Pago' WHEN 'preparing' THEN 'Preparando' ELSE 'Enviado' END AS badge_label,
				CASE o.status WHEN 'paid' THEN 'warning' ELSE 'info' END AS badge_role,
				'package'::text AS icon_key,
				CASE o.status WHEN 'paid' THEN 'warning' ELSE 'info' END AS tone
			FROM "order" o
			JOIN client c ON c.id = o.client_id
			WHERE o.status IN (${sqlStatusList(ACTIVE_ORDER_STATUSES)})
		)`);
	}

	if (canReviews) {
		// severity 3. rank = epoch do created_at (mais antigo primeiro).
		blocks.push(sql`(
			SELECT 'review-' || r.id AS id, 'reviews'::text AS feed_type, 3 AS severity,
				EXTRACT(EPOCH FROM r.created_at)::numeric AS rank,
				'Review ' || r.rating || '★' AS primary,
				COALESCE(t.name, 'ferramenta') AS secondary,
				'/dashboard/reviews/' || r.id AS href,
				'Moderar'::text AS badge_label, 'warning'::text AS badge_role,
				'clock'::text AS icon_key, 'warning'::text AS tone
			FROM review r
			LEFT JOIN tool t ON t.id = r.tool_id
			WHERE r.status = 'pending'
		)`);
	}

	if (canPromos) {
		// severity 5. rank = epoch do ends_at (mais perto de expirar primeiro).
		blocks.push(sql`(
			SELECT 'promo-' || p.id AS id, 'promos'::text AS feed_type, 5 AS severity,
				EXTRACT(EPOCH FROM p.ends_at)::numeric AS rank,
				p.title AS primary,
				'expira em ' || CASE
					WHEN EXTRACT(EPOCH FROM (p.ends_at - now())) / 3600 <= 24
						THEN ROUND(EXTRACT(EPOCH FROM (p.ends_at - now())) / 3600) || 'h'
					ELSE ROUND(EXTRACT(EPOCH FROM (p.ends_at - now())) / 86400) || 'd' END AS secondary,
				'/dashboard/promotions/' || p.id AS href,
				CASE WHEN EXTRACT(EPOCH FROM (p.ends_at - now())) / 3600 <= 24 THEN 'Urgente' ELSE 'Expirando' END AS badge_label,
				CASE WHEN EXTRACT(EPOCH FROM (p.ends_at - now())) / 3600 <= 24 THEN 'destructive' ELSE 'warning' END AS badge_role,
				'clock'::text AS icon_key,
				CASE WHEN EXTRACT(EPOCH FROM (p.ends_at - now())) / 3600 <= 24 THEN 'destructive' ELSE 'warning' END AS tone
			FROM promotion p
			WHERE p.active = true AND p.ends_at IS NOT NULL
				AND p.ends_at BETWEEN now() AND now() + INTERVAL '7 days'
		)`);
	}

	if (blocks.length === 0) {
		return {
			items: [],
			counts: { total: 0, stock: 0, orders: 0, reviews: 0, promos: 0 },
		};
	}

	const union = sql.join(blocks, sql` UNION ALL `);
	const result = await db.execute<{
		badge_label: string;
		badge_role: string;
		feed_type: FeedType;
		href: string;
		icon_key: StatusIconKey;
		id: string;
		primary: string;
		secondary: string | null;
		tone: Tone;
	}>(sql`
		SELECT * FROM (${union}) AS feed
		ORDER BY severity ASC, rank ASC, id ASC
		LIMIT ${FEED_LIMIT}
	`);

	const items = result.rows.map(
		(r): PendingFeedItem => ({
			id: r.id,
			feedType: r.feed_type,
			primary: r.primary,
			secondary: r.secondary ?? undefined,
			href: r.href,
			badge: { label: r.badge_label, role: r.badge_role as PendingRole },
			iconKey: r.icon_key,
			tone: r.tone,
		})
	);

	const counts: PendingFeedCounts = {
		total: items.length,
		stock: 0,
		orders: 0,
		reviews: 0,
		promos: 0,
	};
	for (const it of items) {
		counts[it.feedType] += 1;
	}

	return { items, counts };
});
```

> Nota: `counts` é derivado da lista limitada a 50 — exato no volume atual; se um dia passar de 50 itens de um tipo, a contagem fica capada (aceitável, documentado).

- [ ] **Step 3: Verificar tipos**

Run: `bun check-types`
Expected: PASS (a função é nova; nenhum consumer ainda).

- [ ] **Step 4: Smoke da query contra o banco real**

Como SQL não é unit-testável, validar a forma da query rodando-a no banco (via MCP/psql ou um script `bun` descartável que chama `fetchPendingFeed`): deve retornar os 6 pedidos + 2 reviews ordenados por severidade (pedidos antes de reviews), counts `{ orders: 6, reviews: 2, ... }`. **Não commitar o script de teste.**
Expected: itens ordenados por severidade; sem erro 42601 (o wrap em derived table cobre o caso de 1 bloco).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/pending-data.ts
git commit -m "feat(dashboard): query unificada do feed de pendências"
```

---

### Task 3: Componente `PendingFeed`

Linha rica (ícone+título+subtítulo+badge), chips de filtro por tipo (client-side), empty state "Tudo em dia".

**Files:**
- Create: `apps/web/src/app/dashboard/_components/pending-feed.tsx`

**Interfaces:**
- Consumes: `PendingFeedItem`, `FeedType`, `PendingFeedCounts` (Task 2, via `import type`); `STATUS_ICONS`, `TONE_TEXT`, `TONE_TINT_BG` (de `@/components/status-visual`); `Badge` (`@emach/ui/components/badge`); `Card`/`CardHeader`/`CardContent` (`@emach/ui/components/card`).
- Produces: `<PendingFeed items={PendingFeedItem[]} counts={PendingFeedCounts} />`.

- [ ] **Step 1: Criar o componente**

```tsx
// apps/web/src/app/dashboard/_components/pending-feed.tsx
"use client";

import { Badge } from "@emach/ui/components/badge";
import { Card, CardContent, CardHeader } from "@emach/ui/components/card";
import { cn } from "@emach/ui/lib/utils";
import Link from "next/link";
import { useState } from "react";
import {
	STATUS_ICONS,
	TONE_TEXT,
	TONE_TINT_BG,
} from "@/components/status-visual";
import type {
	FeedType,
	PendingFeedCounts,
	PendingFeedItem,
} from "../pending-data";

type Filter = FeedType | "all";

const FILTERS: { id: Filter; label: string }[] = [
	{ id: "all", label: "Tudo" },
	{ id: "stock", label: "Estoque" },
	{ id: "orders", label: "Pedidos" },
	{ id: "reviews", label: "Reviews" },
	{ id: "promos", label: "Promos" },
];

function countFor(counts: PendingFeedCounts, id: Filter): number {
	return id === "all" ? counts.total : counts[id];
}

export function PendingFeed({
	items,
	counts,
}: {
	counts: PendingFeedCounts;
	items: PendingFeedItem[];
}) {
	const [filter, setFilter] = useState<Filter>("all");
	const shown =
		filter === "all" ? items : items.filter((i) => i.feedType === filter);

	return (
		<Card className="flex h-full min-w-0 flex-col">
			<CardHeader className="flex flex-col gap-3 pb-3">
				<div className="flex items-baseline justify-between gap-3">
					<span className="font-semibold text-sm uppercase tracking-wider">
						Precisa de atenção
					</span>
					<span className="font-mono text-muted-foreground text-xs tabular-nums">
						{counts.total} {counts.total === 1 ? "item" : "itens"}
					</span>
				</div>
				<div className="flex flex-wrap gap-1.5">
					{FILTERS.filter(
						(f) => f.id === "all" || countFor(counts, f.id) > 0
					).map((f) => {
						const active = filter === f.id;
						return (
							<button
								className={cn(
									"rounded-full border px-2.5 py-0.5 font-medium text-xs transition-colors",
									active
										? "border-primary/60 bg-primary/15 text-primary"
										: "border-border bg-muted text-muted-foreground hover:text-foreground"
								)}
								key={f.id}
								onClick={() => setFilter(f.id)}
								type="button"
							>
								{f.label}{" "}
								<span className="tabular-nums">{countFor(counts, f.id)}</span>
							</button>
						);
					})}
				</div>
			</CardHeader>
			<CardContent className="flex min-h-0 min-w-0 flex-1 flex-col">
				{shown.length === 0 ? (
					<p className="px-2 py-8 text-center text-muted-foreground text-sm">
						Tudo em dia.
					</p>
				) : (
					<ul className="-mx-2 flex min-h-0 flex-1 flex-col overflow-y-auto">
						{shown.map((item) => {
							const Icon = STATUS_ICONS[item.iconKey];
							return (
								<li key={item.id}>
									<Link
										className="flex w-full min-w-0 items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted"
										href={item.href}
									>
										<span
											className={cn(
												"flex size-7 shrink-0 items-center justify-center rounded-md",
												TONE_TINT_BG[item.tone]
											)}
										>
											<Icon
												aria-hidden
												className={cn("size-4", TONE_TEXT[item.tone])}
											/>
										</span>
										<div className="flex min-w-0 flex-1 flex-col">
											<span className="truncate text-foreground text-sm">
												{item.primary}
											</span>
											{item.secondary && (
												<span className="truncate text-muted-foreground text-xs">
													{item.secondary}
												</span>
											)}
										</div>
										<Badge className="ml-auto shrink-0" variant={item.badge.role}>
											{item.badge.label}
										</Badge>
									</Link>
								</li>
							);
						})}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}
```

> `Badge` aceita `variant` = role (`destructive`/`warning`/`info`/...). `PendingRole` inclui `default`/`secondary`/`success` além desses — todos são variants válidos do `Badge` (ver `DESIGN.md` §4 Badges). Chips de tipo com count 0 são escondidos (o "Tudo" sempre aparece) — atende "repensar abas vazias".

- [ ] **Step 2: Verificar tipos + lint**

Run: `bun check-types && bunx biome check apps/web/src/app/dashboard/_components/pending-feed.tsx`
Expected: PASS. (Confirmar que `import type` de `../pending-data` não arrasta runtime — é type-only, apagado no compile.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/_components/pending-feed.tsx
git commit -m "feat(dashboard): componente PendingFeed (feed unificado)"
```

---

### Task 4: Integrar na página + smoke + gate

Trocar o `PendingPanel` pelo `PendingFeed` na `PendingSection` da `page.tsx`.

**Files:**
- Modify: `apps/web/src/app/dashboard/page.tsx` (função `PendingSection`)

**Interfaces:**
- Consumes: `fetchPendingFeed` (Task 2), `PendingFeed` (Task 3), `ActivityFeed` (existente).

- [ ] **Step 1: Reescrever `PendingSection`**

Substituir a função `PendingSection` inteira (a que monta `tabs` e renderiza `<PendingPanel>`) por:

```tsx
async function PendingSection() {
	const [feed, activity] = await Promise.all([
		fetchPendingFeed(),
		fetchDashboardActivity(null),
	]);
	return (
		<section className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
			<PendingFeed counts={feed.counts} items={feed.items} />
			<div className="relative min-h-[18rem] min-w-0">
				<div className="absolute inset-0">
					<ActivityFeed
						fetchPage={fetchDashboardActivity}
						initialCursor={activity.nextCursor}
						initialEvents={activity.items}
					/>
				</div>
			</div>
		</section>
	);
}
```

Atualizar a chamada de `<PendingSection ... />` no corpo da página: ela não recebe mais `canReadReviews`/`canReadPromotions` (o gating vive dentro de `fetchPendingFeed`). Trocar `<PendingSection canReadPromotions={...} canReadReviews={...} />` por `<PendingSection />`.

- [ ] **Step 2: Ajustar imports da `page.tsx`**

- Adicionar: `import { PendingFeed } from "./_components/pending-feed";` e `import { fetchPendingFeed } from "./pending-data";`
- Remover imports agora não-usados na `page.tsx`: `PendingPanel`/`PendingTab` (de `@/components/pending-panel`), e os `fetchPendingStock/fetchPendingOrders/fetchPendingReviews/fetchExpiringPromotions/fetchDashboardCounts` se nenhuma outra parte da `page.tsx` os usa. Rodar `rg "fetchPendingStock|fetchPendingOrders|fetchPendingReviews|fetchExpiringPromotions|fetchDashboardCounts|PendingPanel|PendingTab" apps/web/src/app/dashboard/page.tsx` e remover os que sobrarem sem uso. `fetchDashboardActivity` permanece (usado na seção).
- **Não** remover `src/components/pending-panel.tsx` — outras rotas usam (`rg "PendingPanel" apps/web/src` para confirmar: orders/customers/users). O `PendingFeed` é adição, não substituição global.

- [ ] **Step 3: check-types + lint**

Run: `bun check-types && bun check`
Expected: PASS (sem import órfão).

- [ ] **Step 4: Smoke visual na 3008**

Abrir `http://localhost:3008/dashboard`. Confirmar:
- Painel "Precisa de atenção" no lugar das abas; ActivityFeed à direita intacto.
- Itens ordenados por severidade: pedidos (6) e reviews (2) com os dados atuais; pedido antes de review.
- Chips: "Tudo 8 · Pedidos 6 · Reviews 2" (Estoque/Promos escondidos quando 0). Clicar num chip filtra.
- Cada linha: ícone colorido + título + badge.
- Contador "8 itens" (soma real) — o bug "Pedidos 0" sumiu.

- [ ] **Step 5: Smoke do caminho de 1 bloco (gotcha 42601)**

Confirmar que um usuário com só uma capability (ex: só `orders.read`) não quebra. Como o dev loga como super_admin (todas as caps), validar a forma: rodar `fetchPendingFeed` reduzido a 1 bloco via script descartável OU revisar que o wrap `SELECT * FROM (union) AS feed` cobre 1 bloco. (O wrap é o mesmo padrão já em produção no `fetchDashboardActivity`.)
Expected: sem `ERROR 42601`.

- [ ] **Step 6: Gate completo**

```bash
bun verify        # check-types + check + test
bun run build     # gate de "use server" / SQL
```
Expected: tudo PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/page.tsx
git commit -m "feat(dashboard): feed de pendências substitui o painel de abas"
```

---

## Notas de verificação cruzada com o spec

- **Feed unificado priorizado** → Tasks 2 (query) + 3 (componente).
- **Severidade fixa** → Task 2 (coluna `severity` 1–5 + `rank`).
- **Linha rica** → Task 3.
- **Filtros por tipo** → Task 3 (chips client-side; vazios escondidos).
- **Empty state "Tudo em dia"** → Task 3.
- **Correção do bug Pedidos** → Task 1 (count) + Task 2 (lista usa ACTIVE).
- **Capabilities** → Task 2 (blocos condicionais).
- **Wrap derived table / gotcha 42601** → Task 2 + Task 4 Step 5.
- **ActivityFeed intocado** → Task 4 (mantido na seção).

## Decisões deixadas ao executor

- **Sidebar count (Task 1):** se o badge da sidebar deve seguir a mesma semântica (pedidos ativos) — default é alinhar; derivar count separado só se o dono pedir.
- **Remoção de `PendingPanel`:** manter (outras rotas usam); confirmar com `rg`.
- **Paginação:** omitida (volume pequeno, `LIMIT 50`); adicionar cursor se o volume crescer.
