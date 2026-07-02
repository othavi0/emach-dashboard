# Métricas de carrinho por ferramenta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exibir no dashboard quantas vezes cada ferramenta foi adicionada ao carrinho do ecommerce nas janelas de 15/30/90 dias (listagem + detalhe), com tabela compartilhada `cart_event` alimentada pelo ecommerce.

**Architecture:** Tabela nova `cart_event` (eventos brutos, INSERT-only pelo ecommerce via banco compartilhado — ADR-0004/0009); dashboard calcula janelas na leitura com `COUNT(*) FILTER`; cron diário expurga eventos >180d. Spec aprovado: `docs/superpowers/specs/2026-07-01-cart-metrics-design.md`.

**Tech Stack:** Drizzle 0.45 (push-only, `bun db:sync`), Next 16 App Router (Server Components), Supabase Postgres, Vercel Cron.

## Global Constraints

- **NUNCA rodar `bun db:seed-demo`** — trunca 28+ tabelas do banco COMPARTILHADO com produção. Dados de smoke entram por INSERT direto (Task 5), aditivo na tabela nova.
- `logger` de `apps/web/src/lib/logger.ts` — nunca `console.*`.
- Proibido `: any` / `as any` / `@ts-ignore`.
- Timestamps sempre `timestamp("x", { withTimezone: true })`.
- IDs: `crypto.randomUUID()` no caller — sem nanoid.
- Em `db.execute` raw, alias de coluna `AS "camelCase"` quando o tipo declarado for camelCase (o mapper é bypassado); snake_case cru só se o tipo declarar snake_case.
- Arquivos em `packages/db/src/schema/` não podem importar de fora da superfície de sync (`schema/`, `queries/`, `sql/`).
- Hook PostToolUse roda `bun fix` após Write/Edit — se um Edit subsequente falhar com "string not found", re-Read o arquivo antes de tentar de novo.
- `bun db:sync` pede confirmação TTY — rodar interativo, nunca em subshell scriptado.
- Commits: Conventional Commits em PT, subject ≤50 chars. lefthook roda `bun fix` + `git add -u` no commit.
- Gate final: `bun verify` (check-types + check + test) + smoke visual (tsc não pega SQL inválido em template string).

---

### Task 1: Schema `cart_event` + RLS + contrato de integração

**Files:**
- Create: `packages/db/src/schema/cart-events.ts`
- Modify: `packages/db/src/schema/index.ts` (barrel — 1 linha)
- Modify: `packages/db/src/sql/rls.sql` (1 linha)
- Modify: `docs/integration/admin-ecommerce.md` (linha de ownership + seção curta)

**Interfaces:**
- Consumes: `tool`, `toolVariant` de `./tools`; `client` de `./client` (exports existentes).
- Produces: tabela `cartEvent` + tipos `CartEvent`/`NewCartEvent`, importáveis de `@emach/db/schema/cart-events`. Tasks 2–5 dependem.

- [ ] **Step 1: Criar o schema**

Criar `packages/db/src/schema/cart-events.ts`:

```ts
import { relations, sql } from "drizzle-orm";
import {
	check,
	index,
	integer,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { client } from "./client";
import { tool, toolVariant } from "./tools";

// Evento bruto de "adicionar ao carrinho" no ecommerce (1 linha por clique).
// INSERT-only pelo app ecommerce; dashboard lê (janelas 15/30/90) e expurga
// >180d via cron. Sem colunas de actor — escrita é sempre system-side.
export const cartEvent = pgTable(
	"cart_event",
	{
		id: text("id").primaryKey(),
		toolId: text("tool_id")
			.notNull()
			.references(() => tool.id, { onDelete: "cascade" }),
		// set null: deletar variante preserva o histórico de demanda do tool.
		variantId: text("variant_id").references(() => toolVariant.id, {
			onDelete: "set null",
		}),
		clientId: text("client_id").references(() => client.id, {
			onDelete: "set null",
		}),
		sessionId: text("session_id").notNull(),
		quantity: integer("quantity").notNull().default(1),
		createdAt: timestamp("created_at", { withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("cart_event_tool_created_idx").on(
			table.toolId,
			table.createdAt.desc()
		),
		index("cart_event_created_idx").on(table.createdAt),
		check("cart_event_quantity_positive", sql`${table.quantity} > 0`),
	]
);

export const cartEventRelations = relations(cartEvent, ({ one }) => ({
	tool: one(tool, { fields: [cartEvent.toolId], references: [tool.id] }),
}));

export type CartEvent = typeof cartEvent.$inferSelect;
export type NewCartEvent = typeof cartEvent.$inferInsert;
```

- [ ] **Step 2: Exportar no barrel**

Em `packages/db/src/schema/index.ts`, adicionar em ordem alfabética (após `./banner`):

```ts
export * from "./cart-events";
```

- [ ] **Step 3: RLS deny-all**

Em `packages/db/src/sql/rls.sql`, adicionar junto ao bloco de `ALTER TABLE` existente:

```sql
ALTER TABLE public.cart_event ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 4: Atualizar o contrato de integração**

Em `docs/integration/admin-ecommerce.md`:

1. Nova linha na tabela de ownership (ordem: perto de `order_item`):

```markdown
| `cart_event`          | E-commerce       | Dashboard   | Evento bruto de "adicionar ao carrinho" (1 linha por clique). E-commerce só INSERE (fire-and-forget); dashboard lê janelas 15/30/90 e expurga >180d via cron. |
```

2. Seção curta após a tabela de ownership (mesmo padrão das outras seções):

```markdown
## Métricas de carrinho (`cart_event`)

O storefront insere 1 linha por clique de "adicionar ao carrinho":
`{ id: crypto.randomUUID(), toolId, variantId, clientId (se logado, senão null), sessionId (id de visitante/sessão do carrinho), quantity }`.
`created_at` tem default `now()` — não enviar.

Regras: INSERT-only e fire-and-forget (try/catch com log — falha na métrica
jamais quebra o fluxo de carrinho). E-commerce não lê nem deleta; o expurgo
(>180 dias) é do dashboard (`/api/cron/prune-cart-events`). Janelas exibidas
no admin: 15/30/90 dias, contagem bruta de eventos.
```

- [ ] **Step 5: Aplicar no banco**

Rodar interativo (TTY):

```bash
bun db:sync
```

Expected: `drizzle-kit push` cria `cart_event` + 2 índices + CHECK; `db:apply-sql` reaplica triggers + rls (idempotente) incluindo a linha nova.

- [ ] **Step 6: Verificar no banco**

```bash
psql "$DATABASE_URL" -c "\d cart_event"
```

(ou `mcp__supabase__execute_sql` com `SELECT indexname FROM pg_indexes WHERE tablename='cart_event'`).
Expected: colunas id/tool_id/variant_id/client_id/session_id/quantity/created_at; índices `cart_event_tool_created_idx`, `cart_event_created_idx`; `rowsecurity = true` em `SELECT relrowsecurity FROM pg_class WHERE relname='cart_event'`.

- [ ] **Step 7: check-types + commit**

```bash
bun check-types
git add packages/db/src/schema/cart-events.ts packages/db/src/schema/index.ts packages/db/src/sql/rls.sql docs/integration/admin-ecommerce.md
git commit -m "feat(db): tabela cart_event p/ métricas de carrinho"
```

---

### Task 2: Listagem — query `cart_adds_30d` + coluna no ToolCard

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/data.ts` (interface `ToolPageRow`, SQL de `fetchToolsPage`, mapping)
- Modify: `apps/web/src/app/dashboard/_components/tool-card.tsx` (interface + footer)

**Interfaces:**
- Consumes: tabela `cart_event` (Task 1).
- Produces: `ToolCardData.cartAdds30d: number` (campo novo); `ToolCardData.branches` e `ToolCardBranchSummary` REMOVIDOS (verificado: `ToolCard` só é consumido por `tools-infinite.tsx`/`tool-card-grid.tsx`; suppliers usa tipo próprio).

- [ ] **Step 1: Atualizar `ToolPageRow` e o SQL em `tools/data.ts`**

Na interface `ToolPageRow` (linha ~36): **remover** o campo `branches_breakdown` e **adicionar**:

```ts
	cart_adds_30d: number;
```

Em `fetchToolsPage`: **remover** a declaração de `branchStockFilter2` (linhas ~228-229) — só era usada pelo breakdown.

No SQL (linha ~231): **remover** o bloco inteiro da subquery `branches_breakdown` (o `COALESCE((SELECT json_agg(...)...), '[]'::json) AS branches_breakdown`) e **adicionar** no lugar:

```sql
				COALESCE((SELECT COUNT(*)::int FROM cart_event ce
					WHERE ce.tool_id = t.id AND ce.created_at >= now() - interval '30 days'), 0) AS cart_adds_30d,
```

- [ ] **Step 2: Atualizar o mapping do `paginate`**

No callback de mapping (linha ~263): **remover** o bloco `branches: (r.branches_breakdown ?? []).map(...)` e **adicionar**:

```ts
				cartAdds30d: Number(r.cart_adds_30d ?? 0),
```

- [ ] **Step 3: Atualizar `tool-card.tsx`**

1. **Remover** a interface `ToolCardBranchSummary` e o campo `branches: ToolCardBranchSummary[]` de `ToolCardData`; **adicionar** `cartAdds30d: number;`.
2. Substituir a terceira célula do footer (a que mostra `{tool.branches.length}` / label "Filiais") por:

```tsx
				<div className="flex flex-col items-center py-2.5">
					<span className="font-bold text-[18px] text-primary tabular-nums">
						{tool.cartAdds30d}
					</span>
					<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
						Carrinho 30d
					</span>
				</div>
```

(Zero aparece como `0` — zero é informação. Coral `text-primary` conforme mockup aprovado.)

- [ ] **Step 4: Caçar referências órfãs**

```bash
rg -n "ToolCardBranchSummary|branches_breakdown" apps/web/src packages
```

Expected: nenhuma ocorrência. Se `tools-infinite.tsx` ou outro arquivo referenciar `.branches` de `ToolCardData`, remover a referência (o campo não existe mais).

- [ ] **Step 5: Gate de tipos + testes existentes**

```bash
bun check-types && bun --cwd apps/web test
```

Expected: PASS (os testes de `tool-query-helpers`/`tool-schema` não tocam esses campos).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/tools/data.ts apps/web/src/app/dashboard/_components/tool-card.tsx
git commit -m "feat(tools): coluna Carrinho 30d no card da listagem"
```

---

### Task 3: Detalhe — `cartSummary` + SectionCard "Carrinho (ecommerce)"

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/[id]/_lib/tool-detail-data.ts`
- Modify: `apps/web/src/app/dashboard/tools/[id]/_components/overview-tab.tsx`
- Modify: `apps/web/src/app/dashboard/tools/[id]/page.tsx`

**Interfaces:**
- Consumes: tabela `cart_event` (Task 1); `getToolDetail`/`ToolDetail` existentes.
- Produces: `ToolCartSummary { d15: number; d30: number; d90: number }` e campo `ToolDetail.cartSummary: ToolCartSummary`; prop `cartSummary` no `OverviewTab`.

- [ ] **Step 1: Query no `tool-detail-data.ts`**

1. Adicionar `sql` ao import de `drizzle-orm` (linha 11: `import { and, asc, eq, inArray, sql } from "drizzle-orm";`).
2. Nova interface junto às demais:

```ts
export interface ToolCartSummary {
	d15: number;
	d30: number;
	d90: number;
}
```

3. Em `ToolDetail`, adicionar o campo:

```ts
	cartSummary: ToolCartSummary;
```

4. No `Promise.all` de `getToolDetail`, adicionar como 7º item (após `orderedRows`):

```ts
				db.execute<{ d15: number; d30: number; d90: number }>(sql`
					SELECT
						COUNT(*) FILTER (WHERE created_at >= now() - interval '15 days')::int AS "d15",
						COUNT(*) FILTER (WHERE created_at >= now() - interval '30 days')::int AS "d30",
						COUNT(*) FILTER (WHERE created_at >= now() - interval '90 days')::int AS "d90"
					FROM cart_event
					WHERE tool_id = ${id}
				`),
```

Desestruturar como `cartRows` na lista do `Promise.all` (`[categories, images, variants, attributes, stockRows, orderedRows, cartRows]`).

5. No objeto de retorno:

```ts
			cartSummary: {
				d15: Number(cartRows.rows[0]?.d15 ?? 0),
				d30: Number(cartRows.rows[0]?.d30 ?? 0),
				d90: Number(cartRows.rows[0]?.d90 ?? 0),
			},
```

(Alias `AS "d15"` entre aspas por causa do bypass do column mapper em `db.execute` — regra do `packages/db/CLAUDE.md`. `COUNT(...)::int` volta como number no node-postgres; o `Number()` é cinto de segurança barato.)

- [ ] **Step 2: SectionCard no `overview-tab.tsx`**

1. Adicionar import do tipo: `ToolCartSummary` no import de `../_lib/tool-detail-data`.
2. Em `OverviewTabProps` e na desestruturação do componente, adicionar `cartSummary: ToolCartSummary;`.
3. Inserir entre o `SectionCard` "Estoque" (fecha na linha ~96) e o `SectionCard` "Logística & metadados":

```tsx
					<SectionCard title="Carrinho (ecommerce)">
						<div className="grid grid-cols-3 text-center">
							<CartWindow label="15 dias" value={cartSummary.d15} withBorder />
							<CartWindow label="30 dias" value={cartSummary.d30} withBorder />
							<CartWindow label="90 dias" value={cartSummary.d90} />
						</div>
					</SectionCard>
```

4. Componente auxiliar no fim do arquivo (junto de `MetaRow`):

```tsx
function CartWindow({
	label,
	value,
	withBorder = false,
}: {
	label: string;
	value: number;
	withBorder?: boolean;
}) {
	return (
		<div className={withBorder ? "border-border border-r" : undefined}>
			<p className="font-semibold text-2xl text-primary tabular-nums">
				{value}
			</p>
			<p className="text-[10px] text-muted-foreground uppercase tracking-wider">
				{label}
			</p>
		</div>
	);
}
```

- [ ] **Step 3: Passar a prop no `page.tsx`**

No `<OverviewTab ...>` (linha ~66), adicionar:

```tsx
					cartSummary={detail.cartSummary}
```

- [ ] **Step 4: Gate de tipos**

```bash
bun check-types
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/dashboard/tools/[id]/_lib/tool-detail-data.ts" "apps/web/src/app/dashboard/tools/[id]/_components/overview-tab.tsx" "apps/web/src/app/dashboard/tools/[id]/page.tsx"
git commit -m "feat(tools): janelas 15/30/90 de carrinho no detalhe"
```

---

### Task 4: Cron de expurgo `/api/cron/prune-cart-events`

**Files:**
- Create: `apps/web/src/app/api/cron/prune-cart-events/route.ts`
- Modify: `apps/web/vercel.json`

**Interfaces:**
- Consumes: tabela `cart_event` (Task 1); `env.CRON_SECRET`; `logger`.
- Produces: endpoint GET autenticado por Bearer; resposta `{ ok: true, deleted: number }`.

- [ ] **Step 1: Route handler**

Criar `apps/web/src/app/api/cron/prune-cart-events/route.ts`:

```ts
import { db } from "@emach/db";
import { env } from "@emach/env/server";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Retenção 180d = 2× a maior janela exibida (90d) — margem p/ análise retroativa.
const RETENTION = sql`interval '180 days'`;

export async function GET(request: Request) {
	const authHeader = request.headers.get("authorization");
	if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		const result = await db.execute(
			sql`DELETE FROM cart_event WHERE created_at < now() - ${RETENTION}`
		);
		return NextResponse.json({ ok: true, deleted: result.rowCount ?? 0 });
	} catch (err) {
		logger.error("pruneCartEventsCron", err);
		return NextResponse.json(
			{ ok: false, error: "Internal error" },
			{ status: 500 }
		);
	}
}
```

- [ ] **Step 2: Registrar o cron**

`apps/web/vercel.json` — adicionar entrada (30 min após o cancel-stale-orders):

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {
      "path": "/api/cron/cancel-stale-orders",
      "schedule": "0 4 * * *"
    },
    {
      "path": "/api/cron/prune-cart-events",
      "schedule": "30 4 * * *"
    }
  ]
}
```

- [ ] **Step 3: Testar o handler em dev**

Com o dev server rodando (Task 6 sobe na 3006; se ainda não estiver de pé, subir agora via `/dev-up 3006`):

```bash
source apps/web/.env 2>/dev/null || true
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3006/api/cron/prune-cart-events
curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3006/api/cron/prune-cart-events
```

Expected: primeira chamada `401`; segunda `{"ok":true,"deleted":0}` (nenhum evento >180d ainda).

- [ ] **Step 4: Gate + commit**

```bash
bun check-types
git add apps/web/src/app/api/cron/prune-cart-events/route.ts apps/web/vercel.json
git commit -m "feat(cron): expurgo de cart_event >180 dias"
```

---

### Task 5: Seed module + dados de smoke

**Files:**
- Create: `packages/db/scripts/seed/cart-events.ts`
- Modify: `packages/db/scripts/seed-demo.ts` (import + chamada + contagem no guard)
- Modify: `packages/db/scripts/seed/truncate.ts` (tabela na lista + comentário)

**Interfaces:**
- Consumes: `cartEvent` (Task 1); `SeedContext`/`Tx` de `./context`; `pick`/`randInt`/`rng` de `./random`.
- Produces: `seedCartEvents(tx, ctx)` no pipeline do seed; dados de smoke REAIS inseridos por SQL direto (sem rodar o seed).

- [ ] **Step 1: Módulo de seed**

Criar `packages/db/scripts/seed/cart-events.ts`:

```ts
// packages/db/scripts/seed/cart-events.ts
import { cartEvent } from "../../src/schema/cart-events";
import type { SeedContext, Tx } from "./context";
import { pick, randInt, rng } from "./random";

const DAY_MS = 86_400_000;

// Eventos sintéticos de "adicionar ao carrinho": ~80% das tools com volume
// 3–45 espalhado nos últimos 100 dias (janelas 15/30/90 ganham valores
// distintos); ~20% ficam com 0 — zero também é estado a exibir.
export async function seedCartEvents(
	tx: Tx,
	ctx: SeedContext
): Promise<void> {
	const rows: (typeof cartEvent.$inferInsert)[] = [];
	for (const toolId of ctx.toolIds) {
		if (rng() < 0.2) {
			continue;
		}
		const variants = ctx.variantIdsByTool[toolId] ?? [];
		const volume = randInt(3, 45);
		for (let i = 0; i < volume; i++) {
			rows.push({
				id: crypto.randomUUID(),
				toolId,
				variantId: variants.length > 0 ? pick(variants) : null,
				clientId:
					ctx.clientIds.length > 0 && rng() < 0.3
						? pick(ctx.clientIds)
						: null,
				sessionId: crypto.randomUUID(),
				quantity: randInt(1, 2),
				createdAt: new Date(
					Date.now() - randInt(0, 100) * DAY_MS - randInt(0, DAY_MS - 1)
				),
			});
		}
	}
	if (rows.length > 0) {
		await tx.insert(cartEvent).values(rows);
	}
}
```

- [ ] **Step 2: Fiar no pipeline**

Em `packages/db/scripts/seed-demo.ts`:

1. Import (ordem alfabética): `import { seedCartEvents } from "./seed/cart-events";`
2. Chamada após `seedSales(tx, ctx);`:

```ts
		await seedCartEvents(tx, ctx);
```

3. Atualizar as duas menções "28 tabelas" do guard (comentário linha 17 e mensagem linha 27) para "29 tabelas".

Em `packages/db/scripts/seed/truncate.ts`:

1. Adicionar `"cart_event",` à lista `DEMO_TABLES` (após `"promotion_tool"`).
2. Atualizar o comentário `// 28 tabelas demo` para `// 29 tabelas demo`.

**NÃO rodar o seed** (trunca o banco compartilhado). A validação do módulo é o `check-types`.

- [ ] **Step 3: Inserir dados de smoke (aditivo, direto no banco)**

Via `mcp__supabase__execute_sql` ou `psql "$DATABASE_URL"`:

```sql
INSERT INTO cart_event (id, tool_id, variant_id, session_id, quantity, created_at)
SELECT gen_random_uuid()::text,
       t.id,
       (SELECT tv.id FROM tool_variant tv WHERE tv.tool_id = t.id ORDER BY tv.sort_order LIMIT 1),
       gen_random_uuid()::text,
       1,
       now() - (random() * interval '100 days')
FROM tool t
CROSS JOIN generate_series(1, 25) g
WHERE random() < 0.75;
```

Expected: ~19 linhas × nº de tools. Guardar a saída de:

```sql
SELECT tool_id,
       COUNT(*) FILTER (WHERE created_at >= now() - interval '15 days') AS d15,
       COUNT(*) FILTER (WHERE created_at >= now() - interval '30 days') AS d30,
       COUNT(*) FILTER (WHERE created_at >= now() - interval '90 days') AS d90
FROM cart_event GROUP BY tool_id ORDER BY d30 DESC LIMIT 5;
```

(esses números são o gabarito do smoke visual da Task 6).

- [ ] **Step 4: Gate + commit**

```bash
bun check-types
git add packages/db/scripts/seed/cart-events.ts packages/db/scripts/seed-demo.ts packages/db/scripts/seed/truncate.ts
git commit -m "feat(seed): eventos de carrinho no seed demo"
```

---

### Task 6: Verificação integrada (smoke visual + bun verify)

**Files:** nenhum novo — verificação.

**Interfaces:**
- Consumes: tudo das Tasks 1–5; gabarito SQL da Task 5 Step 3.

- [ ] **Step 1: Subir o dev server**

Invocar a skill `/dev-up 3006` (pin de porta + tab + error watcher). Se já estiver de pé desde a Task 4, reusar.

- [ ] **Step 2: Smoke da listagem**

Visitar `http://localhost:3006/dashboard/tools`. Verificar:

- Footer dos cards mostra **Estoque · Variantes · Carrinho 30d** (sem "Filiais").
- O número de "Carrinho 30d" do card de um tool do gabarito **bate com o `d30` do SQL** (não só "renderiza": conferir o valor — card em fallback esconde null).
- Tool com 0 eventos mostra `0` (não vazio).

- [ ] **Step 3: Smoke do detalhe**

Abrir o detalhe de um tool do gabarito (`/dashboard/tools/<id>`). Verificar:

- Card "Carrinho (ecommerce)" entre "Estoque" e "Logística & metadados" na coluna direita.
- Trio 15/30/90 bate com `d15`/`d30`/`d90` do gabarito.
- Sem erros no console/error watcher (`nextjs_call 3006 get_errors` se necessário).

- [ ] **Step 4: Gate completo**

```bash
bun verify
```

Expected: check-types PASS, `bun check` (ultracite) PASS, testes PASS. Corrigir qualquer aviso novo introduzido pelas tasks (warnings pré-existentes do código canônico ficam).

- [ ] **Step 5: Commit de eventuais fixes**

```bash
git status --short
```

Se houver correções do verify: `git add <arquivos> && git commit -m "fix: ajustes do verify em cart metrics"`. Se limpo, nada a fazer.

---

### Task 7: Issue cross-repo no ecommerce

**Files:**
- Create: `/tmp/claude-1000/-home-othavio-Projects-emach-emach-dashboard/8f657acd-09e6-4742-8bfb-e2b1f3883383/scratchpad/issue-cart-event.md` (corpo da issue — fora do repo)

**Interfaces:**
- Consumes: contrato documentado na Task 1 (`docs/integration/admin-ecommerce.md`).
- Produces: issue aberta em `othavi0/emach-ecommerce` (repo confirmado via `gh repo view`).

- [ ] **Step 1: Escrever o corpo da issue**

Criar o arquivo do scratchpad com este conteúdo:

```markdown
## Contexto

O dashboard admin passou a exibir, por ferramenta, quantas vezes ela foi
adicionada ao carrinho nas janelas de 15/30/90 dias (pedido de reunião de
junho/2026). A tabela `cart_event` já existe no banco compartilhado e o
schema TS chega neste repo pelo PR automático de sync (ADR-0009 do dashboard).
Falta o storefront **emitir os eventos** — sem isso o admin mostra zeros.

## O que implementar

No ponto de "adicionar ao carrinho" (server action / handler do carrinho),
inserir 1 linha em `cart_event` por clique:

​```ts
import { cartEvent } from "@emach/db/schema/cart-events";

await db.insert(cartEvent).values({
  id: crypto.randomUUID(),
  toolId,          // produto-pai (derivar da variante adicionada)
  variantId,       // variante adicionada
  clientId,        // se cliente logado; senão null
  sessionId,       // id de sessão/visitante que o carrinho já usa
  quantity,        // quantidade adicionada nesse clique
});
// created_at tem default now() — não enviar.
​```

## Regras (contrato — docs/integration/admin-ecommerce.md do dashboard)

- **Fire-and-forget:** envolver em try/catch com log. Falha na métrica JAMAIS
  quebra o fluxo de carrinho do cliente. Sem retry, sem fila.
- **INSERT-only:** o ecommerce não lê nem deleta `cart_event`. O expurgo
  (>180 dias) é cron do dashboard.
- Contagem exibida no admin é bruta (cada clique = 1 evento) — não deduplicar
  no client; a `session_id` permite dedup analítica futura do lado admin.
- Adições repetidas do mesmo produto na mesma sessão CONTAM (decisão de
  produto). Incremento de quantidade de item já no carrinho: emitir evento
  com a quantidade adicional.

## Aceite

- [ ] Todo clique de "adicionar ao carrinho" (anônimo ou logado) insere 1 linha em `cart_event`
- [ ] Falha no INSERT não afeta o add-to-cart (teste desligando a rede/derrubando a query)
- [ ] `clientId` preenchido quando logado; `sessionId` sempre preenchido
```

(Nota: remover os `​` de escape dos code fences ao gravar o arquivo.)

- [ ] **Step 2: Abrir a issue**

```bash
gh issue create -R othavi0/emach-ecommerce \
  --title "Emitir cart_event no add-to-cart (métricas de demanda no admin)" \
  --body-file <scratchpad>/issue-cart-event.md
```

Expected: URL da issue criada.
**Fallback:** `gh` write cross-repo pode ser barrado pelo classifier do modo auto. Se a permissão for negada, imprimir o comando completo e o caminho do body-file para o usuário rodar manualmente — não insistir em loop.

- [ ] **Step 3: Registrar a issue no spec**

Editar `docs/superpowers/specs/2026-07-01-cart-metrics-design.md`, seção "5. Lado ecommerce": acrescentar a URL da issue criada ao final do primeiro parágrafo. Commit:

```bash
git add docs/superpowers/specs/2026-07-01-cart-metrics-design.md
git commit -m "docs: linka issue do ecommerce no spec de cart metrics"
```
