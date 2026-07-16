# Painel de Produtividade de Separação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 4ª tab "Produtividade" em `/dashboard/separacao` com KPIs agregados (hoje + 7 dias) e tabela por operador, lendo dados de picking que hoje ninguém consulta (issue #324).

**Architecture:** Duas queries agregadas novas em `separacao/data.ts` (server-only, `db.execute` raw, branch-scoped via `branchAndFilter`); barra de tabs extraída para componente compartilhado `SeparacaoTabs` (a fila e o painel usam a mesma); painel é Server Component puro que recebe dados prontos. Zero mudança de schema; queries só rodam quando a tab está ativa (mecanismo `?tab=` server-side já existente).

**Tech Stack:** Next 16 (App Router, Server Components), Drizzle raw SQL (`db.execute`), vitest, `@emach/ui` (Tabs/Card/Table).

**Spec:** `docs/superpowers/specs/2026-07-16-separacao-produtividade-design.md` (aprovado). Issue: `othavi0/emach-dashboard#324`.

## Global Constraints

- **Banco ÚNICO compartilhado dev=prod.** NUNCA seed/truncate/drop/reset/`db:push`. Este plano é 100% leitura no banco. Verificação de dados usa apenas `SELECT`.
- CWD é a RAIZ do monorepo — nunca `cd apps/web`; paths absolutos nos comandos.
- Proibido: `console.*` (usar `logger`), `: any`/`as any`/`@ts-ignore`, `key={index}`, `React.forwardRef`, `useMemo`/`useCallback` manuais (React Compiler ativo), barrel files, nested ternary em JSX.
- `db.execute` devolve timestamps como **string** e colunas em **snake_case** — coercer no boundary (`toDate`/`Number`), alias `AS "camelCase"` quando necessário. Aqui nenhuma query retorna timestamp cru (só agregados numéricos).
- Datas/números de exibição: `toLocaleString("pt-BR")` ok para números; nunca `Intl.DateTimeFormat` cru.
- Commits: Conventional Commits em PT, subject ≤ 50 chars. **ZERO atribuição de AI** em qualquer texto.
- Antes de cada commit: `bun check-types --force && bun check` (o turbo já serviu PASS velho de cache — sempre `--force`). Testes: `bun --cwd apps/web test`.
- Read cada arquivo antes de Edit; se Edit falhar com `string not found`, re-Read antes de re-tentar. O hook PostToolUse roda `bun fix` após Write/Edit e pode reordenar campos — re-ler se um Edit subsequente falhar.

---

### Task 1: Helpers puros de formatação (`_lib/productivity.ts`)

**Files:**
- Create: `apps/web/src/app/dashboard/separacao/_lib/productivity.ts`
- Test: `apps/web/src/app/dashboard/separacao/__tests__/productivity.test.ts`

**Interfaces:**
- Consumes: nada (módulo puro, sem imports server-only).
- Produces (Task 4 consome):
  - `formatSessionDuration(seconds: number | null): string` — "—" | "<1min" | "9min" | "1h 12min" | "2h"
  - `formatExceptionRate(exceptions: number, total: number): string` — "0%" | "4,6%" (1 casa, pt-BR)
  - `exceptionTone(exceptions: number, total: number): ExceptionTone` — `"muted" | "success" | "warning"` (0 → muted; ≥5% → warning; senão success)

- [ ] **Step 1: Escrever os testes (failing)**

Criar `apps/web/src/app/dashboard/separacao/__tests__/productivity.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
	exceptionTone,
	formatExceptionRate,
	formatSessionDuration,
} from "../_lib/productivity";

describe("formatSessionDuration", () => {
	it("null vira travessão (sem sessões na janela)", () => {
		expect(formatSessionDuration(null)).toBe("—");
	});

	it("abaixo de 1 minuto", () => {
		expect(formatSessionDuration(45)).toBe("<1min");
	});

	it("minutos arredondados", () => {
		expect(formatSessionDuration(540)).toBe("9min");
		expect(formatSessionDuration(90)).toBe("2min");
	});

	it("horas com resto de minutos", () => {
		expect(formatSessionDuration(4320)).toBe("1h 12min");
	});

	it("hora exata sem resto", () => {
		expect(formatSessionDuration(7200)).toBe("2h");
	});

	it("59,5min+ carrega para a hora seguinte", () => {
		// 1h59min30s → arredonda p/ 2h, não "1h 60min"
		expect(formatSessionDuration(7170)).toBe("2h");
	});
});

describe("formatExceptionRate", () => {
	it("zero exceções é 0% seco", () => {
		expect(formatExceptionRate(0, 41)).toBe("0%");
	});

	it("denominador zero não divide", () => {
		expect(formatExceptionRate(0, 0)).toBe("0%");
	});

	it("uma casa decimal em pt-BR (vírgula)", () => {
		expect(formatExceptionRate(1, 41)).toBe("2,4%");
		expect(formatExceptionRate(4, 87)).toBe("4,6%");
	});
});

describe("exceptionTone", () => {
	it("zero é muted", () => {
		expect(exceptionTone(0, 41)).toBe("muted");
		expect(exceptionTone(0, 0)).toBe("muted");
	});

	it("abaixo de 5% é success", () => {
		expect(exceptionTone(1, 41)).toBe("success");
	});

	it("5% ou mais é warning", () => {
		expect(exceptionTone(2, 32)).toBe("warning");
	});
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `bun --cwd apps/web test __tests__/productivity`
Expected: FAIL — `Cannot find module '../_lib/productivity'` (ou equivalente).

- [ ] **Step 3: Implementar os helpers**

Criar `apps/web/src/app/dashboard/separacao/_lib/productivity.ts`:

```ts
// Helpers puros da tab Produtividade (issue #324). Sem imports server-only:
// testável em vitest node e importável de Server Component.

const HOUR = 3600;
const MINUTE = 60;

/** Duração de sessão legível: "—" (null), "<1min", "9min", "1h 12min", "2h". */
export function formatSessionDuration(seconds: number | null): string {
	if (seconds === null || Number.isNaN(seconds)) {
		return "—";
	}
	if (seconds < MINUTE) {
		return "<1min";
	}
	if (seconds < HOUR) {
		return `${Math.round(seconds / MINUTE)}min`;
	}
	let hours = Math.floor(seconds / HOUR);
	let minutes = Math.round((seconds % HOUR) / MINUTE);
	if (minutes === MINUTE) {
		hours += 1;
		minutes = 0;
	}
	return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}min`;
}

/** Percentual de exceção com 1 casa em pt-BR ("4,6%"); 0 ou denominador 0 → "0%". */
export function formatExceptionRate(
	exceptions: number,
	total: number
): string {
	if (total === 0 || exceptions === 0) {
		return "0%";
	}
	const pct = (exceptions / total) * 100;
	return `${pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export type ExceptionTone = "muted" | "success" | "warning";

/**
 * Tom da célula de exceções. A taxa mistura qualidade do estoque físico
 * (item sumido da prateleira) com comportamento do operador — o warning é
 * sinal de investigação, não veredito sobre a pessoa.
 */
export function exceptionTone(
	exceptions: number,
	total: number
): ExceptionTone {
	if (total === 0 || exceptions === 0) {
		return "muted";
	}
	return exceptions / total >= 0.05 ? "warning" : "success";
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `bun --cwd apps/web test __tests__/productivity`
Expected: PASS (11 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/separacao/_lib/productivity.ts apps/web/src/app/dashboard/separacao/__tests__/productivity.test.ts
git commit -m "feat: helpers de formatação da produtividade"
```

---

### Task 2: Queries agregadas em `data.ts`

**Files:**
- Modify: `apps/web/src/app/dashboard/separacao/data.ts` (adicionar no fim; ajustar imports do topo)

**Interfaces:**
- Consumes: `BranchScope`, `isBlindScope`, `branchAndFilter` de `@/lib/branch-scope`; `db` e `sql` já importados no arquivo.
- Produces (Task 4 consome):

```ts
interface PickingProductivitySummary {
	completedToday: number;
	completedWeek: number;
	unitsToday: number;
	unitsWeek: number;
	avgSessionSeconds: number | null; // null = sem sessões na janela
}
interface PickingOperatorProductivity {
	operatorKey: string; // picker_user_id ou "name:<picker_name>" (user deletado)
	pickerName: string; // snapshot mais recente
	completedToday: number;
	completedWeek: number;
	avgSessionSeconds: number | null;
	unitsWeek: number;
	exceptionCount: number;
}
fetchPickingProductivitySummary(scope: BranchScope): Promise<PickingProductivitySummary>
fetchPickingProductivityByOperator(scope: BranchScope): Promise<PickingOperatorProductivity[]>
```

**Regras de negócio (do spec — não desviar):**
- "Concluída" = sessão `status IN ('completed','exception')` com `completed_at` na janela. `canceled`/`in_progress` fora de TUDO (nem denominador).
- Unidades = `SUM(qty_picked)` de `order_picking_item` das sessões da janela. **NÃO** contar `order_picking_scan` (re-bipe de item cheio insere scan sem incrementar — superconta).
- Janela: "hoje" = início do dia local `America/Sao_Paulo`; "7 dias" = hoje + 6 dias anteriores (boundary de dia local, não rolling window UTC).
- Branch-scoping direto em `op.branch_id` (sem JOIN com `order`), fail-closed via `isBlindScope`.

- [ ] **Step 1: Ajustar import do branch-scope**

No topo de `apps/web/src/app/dashboard/separacao/data.ts`, o import atual é:

```ts
import {
	type BranchScope,
	isBlindScope,
	orderBranchCondition,
} from "@/lib/branch-scope";
```

Adicionar `branchAndFilter`:

```ts
import {
	branchAndFilter,
	type BranchScope,
	isBlindScope,
	orderBranchCondition,
} from "@/lib/branch-scope";
```

- [ ] **Step 2: Adicionar as duas funções no fim do arquivo**

```ts
// ---------------------------------------------------------------------------
// Produtividade (issue #324) — leituras agregadas, tab "Produtividade".
// Janela: hoje (dia local America/Sao_Paulo) + últimos 7 dias corridos
// (hoje + 6 anteriores). "Concluída" = completed OU exception (sessão
// finalizada); canceled/in_progress ficam fora de tudo.
// ---------------------------------------------------------------------------

export interface PickingProductivitySummary {
	completedToday: number;
	completedWeek: number;
	unitsToday: number;
	unitsWeek: number;
	avgSessionSeconds: number | null;
}

/**
 * KPIs agregados do painel. Unidades = SUM(qty_picked) dos itens das sessões
 * finalizadas na janela — NÃO contar order_picking_scan: re-bipe de item já
 * completo insere scan sem incrementar unidade (registerScan, caso
 * alreadyFull) e supercontaria.
 */
export async function fetchPickingProductivitySummary(
	scope: BranchScope
): Promise<PickingProductivitySummary> {
	if (isBlindScope(scope)) {
		return {
			completedToday: 0,
			completedWeek: 0,
			unitsToday: 0,
			unitsWeek: 0,
			avgSessionSeconds: null,
		};
	}

	const branchFragment = branchAndFilter(scope, sql`op.branch_id`);

	const result = await db.execute<{
		completed_today: number;
		completed_week: number;
		units_today: number;
		units_week: number;
		avg_session_seconds: number | null;
	}>(sql`
		WITH bounds AS (
			SELECT date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo')
				AT TIME ZONE 'America/Sao_Paulo' AS today_start
		)
		SELECT
			COUNT(*) FILTER (WHERE op.completed_at >= b.today_start)::int AS completed_today,
			COUNT(*)::int AS completed_week,
			COALESCE(SUM(items.units) FILTER (WHERE op.completed_at >= b.today_start), 0)::int AS units_today,
			COALESCE(SUM(items.units), 0)::int AS units_week,
			ROUND(AVG(EXTRACT(EPOCH FROM op.completed_at - op.started_at)))::int AS avg_session_seconds
		FROM order_picking op
		CROSS JOIN bounds b
		LEFT JOIN LATERAL (
			SELECT COALESCE(SUM(pi.qty_picked), 0)::int AS units
			FROM order_picking_item pi
			WHERE pi.picking_id = op.id
		) items ON true
		WHERE op.status IN ('completed', 'exception')
			AND op.completed_at >= b.today_start - interval '6 days'
			${branchFragment}
	`);

	const row = result.rows[0];
	return {
		completedToday: Number(row?.completed_today ?? 0),
		completedWeek: Number(row?.completed_week ?? 0),
		unitsToday: Number(row?.units_today ?? 0),
		unitsWeek: Number(row?.units_week ?? 0),
		avgSessionSeconds:
			row?.avg_session_seconds == null ? null : Number(row.avg_session_seconds),
	};
}

export interface PickingOperatorProductivity {
	operatorKey: string;
	pickerName: string;
	completedToday: number;
	completedWeek: number;
	avgSessionSeconds: number | null;
	unitsWeek: number;
	exceptionCount: number;
}

/**
 * Quebra por operador (últimos 7 dias). Agrupa por picker_user_id (picker_name
 * é snapshot da sessão — user renomeado não duplica linha; exibe o nome mais
 * recente). Sessões com picker_user_id nulo (user deletado) agrupam pelo
 * próprio nome, com prefixo "name:" na chave pra não colidir com ids.
 */
export async function fetchPickingProductivityByOperator(
	scope: BranchScope
): Promise<PickingOperatorProductivity[]> {
	if (isBlindScope(scope)) {
		return [];
	}

	const branchFragment = branchAndFilter(scope, sql`op.branch_id`);

	const result = await db.execute<{
		operator_key: string;
		picker_name: string;
		completed_today: number;
		completed_week: number;
		avg_session_seconds: number | null;
		units_week: number;
		exception_count: number;
	}>(sql`
		WITH bounds AS (
			SELECT date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo')
				AT TIME ZONE 'America/Sao_Paulo' AS today_start
		)
		SELECT
			COALESCE(op.picker_user_id, 'name:' || op.picker_name) AS operator_key,
			(array_agg(op.picker_name ORDER BY op.completed_at DESC))[1] AS picker_name,
			COUNT(*) FILTER (WHERE op.completed_at >= b.today_start)::int AS completed_today,
			COUNT(*)::int AS completed_week,
			ROUND(AVG(EXTRACT(EPOCH FROM op.completed_at - op.started_at)))::int AS avg_session_seconds,
			COALESCE(SUM(items.units), 0)::int AS units_week,
			COUNT(*) FILTER (WHERE op.status = 'exception')::int AS exception_count
		FROM order_picking op
		CROSS JOIN bounds b
		LEFT JOIN LATERAL (
			SELECT COALESCE(SUM(pi.qty_picked), 0)::int AS units
			FROM order_picking_item pi
			WHERE pi.picking_id = op.id
		) items ON true
		WHERE op.status IN ('completed', 'exception')
			AND op.completed_at >= b.today_start - interval '6 days'
			${branchFragment}
		GROUP BY COALESCE(op.picker_user_id, 'name:' || op.picker_name)
		ORDER BY completed_week DESC, picker_name ASC
	`);

	return result.rows.map((row) => ({
		operatorKey: row.operator_key,
		pickerName: row.picker_name,
		completedToday: Number(row.completed_today),
		completedWeek: Number(row.completed_week),
		avgSessionSeconds:
			row.avg_session_seconds == null ? null : Number(row.avg_session_seconds),
		unitsWeek: Number(row.units_week),
		exceptionCount: Number(row.exception_count),
	}));
}
```

- [ ] **Step 3: Type-check**

Run: `bun check-types --force`
Expected: PASS (0 erros).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/separacao/data.ts
git commit -m "feat: queries agregadas de produtividade"
```

---

### Task 3: Extrair `SeparacaoTabs` compartilhada (+ trigger Produtividade)

**Files:**
- Create: `apps/web/src/app/dashboard/separacao/_components/separacao-tabs.tsx`
- Modify: `apps/web/src/app/dashboard/separacao/_components/picking-queue.tsx` (linhas 1-30 imports/tipos e 67-117 render do tab row)

**Contexto:** hoje a barra de tabs vive inline no `PickingQueue` (split: fila à esquerda, `SelectionToolbar` + Exceções à direita). A tab Produtividade renderiza um painel no lugar da fila, mas a barra precisa continuar visível — extraí-la é a única mudança estrutural. O visual das 3 tabs existentes NÃO muda.

**Interfaces:**
- Consumes: `PickingQueueCounts` de `../data` (Task anterior não mexeu nesse tipo); componentes `Tabs`/`TabsList`/`TabsTrigger`/`TabsCountBadge` de `@emach/ui/components/tabs`.
- Produces (Task 4 consome): `SeparacaoTabs` (client component) e o tipo `SeparacaoTab`:

```ts
export type SeparacaoTab =
	| "a_separar"
	| "em_separacao"
	| "excecoes"
	| "produtividade";
// props: { activeTab: SeparacaoTab; counts: PickingQueueCounts; toolbar?: ReactNode }
```

- [ ] **Step 1: Criar `separacao-tabs.tsx`**

```tsx
"use client";

import {
	Tabs,
	TabsCountBadge,
	TabsList,
	TabsTrigger,
} from "@emach/ui/components/tabs";
import Link from "next/link";
import type { ReactNode } from "react";

import type { PickingQueueCounts } from "../data";

export type SeparacaoTab =
	| "a_separar"
	| "em_separacao"
	| "excecoes"
	| "produtividade";

const BASE = "/dashboard/separacao";

/**
 * Barra de tabs da Separação, compartilhada entre a fila (PickingQueue) e a
 * tab Produtividade. Split: fluxo do operador à esquerda; toolbar de seleção
 * (slot, só a fila usa) + exceções/análise à direita. Produtividade não tem
 * badge (não é fila).
 */
export function SeparacaoTabs({
	activeTab,
	counts,
	toolbar,
}: {
	activeTab: SeparacaoTab;
	counts: PickingQueueCounts;
	toolbar?: ReactNode;
}) {
	return (
		<div className="mb-4 flex flex-wrap items-center justify-between gap-2">
			<Tabs value={activeTab}>
				<TabsList scrollable>
					<TabsTrigger
						nativeButton={false}
						render={<Link href={`${BASE}?tab=a_separar`} />}
						value="a_separar"
					>
						A separar
						<TabsCountBadge value={counts.a_separar} />
					</TabsTrigger>
					<TabsTrigger
						nativeButton={false}
						render={<Link href={`${BASE}?tab=em_separacao`} />}
						value="em_separacao"
					>
						Separando
						<TabsCountBadge value={counts.em_separacao} />
					</TabsTrigger>
				</TabsList>
			</Tabs>
			<div className="flex items-center gap-2">
				{toolbar}
				<Tabs value={activeTab}>
					<TabsList>
						<TabsTrigger
							nativeButton={false}
							render={<Link href={`${BASE}?tab=excecoes`} />}
							value="excecoes"
						>
							Exceções
							<TabsCountBadge value={counts.excecoes} />
						</TabsTrigger>
						<TabsTrigger
							nativeButton={false}
							render={<Link href={`${BASE}?tab=produtividade`} />}
							value="produtividade"
						>
							Produtividade
						</TabsTrigger>
					</TabsList>
				</Tabs>
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Refatorar `picking-queue.tsx` para consumir a barra**

Ler o arquivo inteiro antes de editar. Mudanças:

(a) Imports — remover os que ficaram sem uso e adicionar a barra:

```tsx
// REMOVER (ficam sem uso após o refactor):
import {
	Tabs,
	TabsCountBadge,
	TabsList,
	TabsTrigger,
} from "@emach/ui/components/tabs";
import Link from "next/link";

// ADICIONAR:
import { SeparacaoTabs } from "./separacao-tabs";
```

(b) Remover a constante `const BASE = "/dashboard/separacao";` (só a barra usava; ela agora vive em `separacao-tabs.tsx`).

(c) Substituir TODO o bloco do tab row (o `<div className="mb-4 flex flex-wrap items-center justify-between gap-2">` até seu fechamento — hoje linhas 70-117, contém os dois `<Tabs>` e a `SelectionToolbar`) por:

```tsx
<SeparacaoTabs
	activeTab={activeTab}
	counts={counts}
	toolbar={
		selectable ? (
			<SelectionToolbar
				active={sel.active}
				allLoadedSelected={sel.allLoadedSelected}
				loadedCount={items.length}
				onCancel={sel.exit}
				onEnter={sel.enter}
				onToggleAll={
					sel.allLoadedSelected ? sel.clear : sel.selectAllLoaded
				}
			/>
		) : undefined
	}
/>
```

Nota: o tipo local `type Tab = "a_separar" | "em_separacao" | "excecoes"` do `PickingQueue` NÃO muda (a fila continua só com as 3 tabs; `SeparacaoTab` da barra é superset e aceita o valor).

- [ ] **Step 3: Type-check + lint**

Run: `bun check-types --force && bun check`
Expected: PASS nos dois. Se `bun check` acusar import sem uso, remover o import apontado.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/separacao/_components/separacao-tabs.tsx apps/web/src/app/dashboard/separacao/_components/picking-queue.tsx
git commit -m "refactor: extrai barra de tabs da separação"
```

---

### Task 4: `ProductivityPanel` + integração na página

**Files:**
- Create: `apps/web/src/app/dashboard/separacao/_components/productivity-panel.tsx`
- Modify: `apps/web/src/app/dashboard/separacao/page.tsx` (arquivo inteiro — reescrever conforme abaixo)

**Interfaces:**
- Consumes:
  - `fetchPickingProductivitySummary`, `fetchPickingProductivityByOperator`, tipos `PickingProductivitySummary`, `PickingOperatorProductivity` (Task 2)
  - `SeparacaoTabs`, `SeparacaoTab` (Task 3)
  - `formatSessionDuration`, `formatExceptionRate`, `exceptionTone`, `ExceptionTone` (Task 1)
  - `getInitials` de `@/lib/format/name` (já existe — NÃO criar helper novo de iniciais)
- Produces: rota final. Nenhuma task posterior consome código desta.

**Decisão de design registrada:** NÃO reusar `KpiCard` de `dashboard/_components/kpi-card.tsx` — ele renderiza o valor via `NumberTicker` (client, animado), que só formata `number | "currency"`; o card de tempo médio exibe string ("1h 12min") e misturar card animado com estático destoa. `StatCard` local estático copia o markup do `KpiCard` (mesmas classes) sem o ticker.

> **Superseded (2026-07-16, pós /code-review):** os dois eixos do review flagaram o fork como Duplicated Code / divergência do spec. Resolução final: `KpiCard` alargado (`value: number | string`, string renderiza estático sem ticker) e o painel reusa `KpiCard` direto; `StatCard` deletado. O spec voltou a valer como escrito.

- [ ] **Step 1: Criar `productivity-panel.tsx`**

Server Component (sem `"use client"`):

```tsx
import { Card, CardContent } from "@emach/ui/components/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";
import { cn } from "@emach/ui/lib/utils";

import { getInitials } from "@/lib/format/name";
import {
	type ExceptionTone,
	exceptionTone,
	formatExceptionRate,
	formatSessionDuration,
} from "../_lib/productivity";
import type {
	PickingOperatorProductivity,
	PickingProductivitySummary,
} from "../data";

const TONE_CLASS: Record<ExceptionTone, string> = {
	muted: "text-muted-foreground",
	success: "text-success",
	warning: "text-warning",
};

function formatCount(n: number): string {
	return n.toLocaleString("pt-BR");
}

// Mesmo markup do KpiCard do dashboard home, sem NumberTicker: o valor aqui
// pode ser string formatada (duração), que o ticker não representa.
function StatCard({
	label,
	value,
	sub,
}: {
	label: string;
	value: string;
	sub?: string;
}) {
	return (
		<Card>
			<CardContent className="flex flex-col gap-1 p-4">
				<p className="text-muted-foreground text-xs uppercase tracking-wide">
					{label}
				</p>
				<p className="font-semibold text-2xl tabular-nums">{value}</p>
				{sub && <p className="text-muted-foreground text-xs">{sub}</p>}
			</CardContent>
		</Card>
	);
}

export function ProductivityPanel({
	summary,
	operators,
}: {
	summary: PickingProductivitySummary;
	operators: PickingOperatorProductivity[];
}) {
	return (
		<div className="flex flex-col gap-6">
			<div className="grid grid-cols-1 gap-3 md:grid-cols-3">
				<StatCard
					label="Concluídas hoje"
					sub={`${formatCount(summary.unitsToday)} unidades separadas`}
					value={formatCount(summary.completedToday)}
				/>
				<StatCard
					label="Concluídas · 7 dias"
					sub={`${formatCount(summary.unitsWeek)} unidades separadas`}
					value={formatCount(summary.completedWeek)}
				/>
				<StatCard
					label="Tempo médio de sessão"
					sub="últimos 7 dias"
					value={formatSessionDuration(summary.avgSessionSeconds)}
				/>
			</div>

			<section>
				<h2 className="mb-2.5 font-medium text-sm">
					Por operador{" "}
					<span className="font-normal text-muted-foreground text-xs">
						· últimos 7 dias
					</span>
				</h2>
				{operators.length === 0 ? (
					<p className="py-10 text-center text-muted-foreground text-sm">
						Nenhuma separação concluída nos últimos 7 dias.
					</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Operador</TableHead>
								<TableHead className="text-right">Hoje</TableHead>
								<TableHead className="text-right">7 dias</TableHead>
								<TableHead className="text-right">Tempo médio</TableHead>
								<TableHead className="text-right">Un. separadas</TableHead>
								<TableHead className="text-right">Exceções</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{operators.map((op) => (
								<TableRow key={op.operatorKey}>
									<TableCell>
										<span className="flex items-center gap-2">
											<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary font-semibold text-[10px]">
												{getInitials(op.pickerName)}
											</span>
											<span className="font-medium">{op.pickerName}</span>
										</span>
									</TableCell>
									<TableCell className="text-right">
										{formatCount(op.completedToday)}
									</TableCell>
									<TableCell className="text-right">
										{formatCount(op.completedWeek)}
									</TableCell>
									<TableCell className="text-right">
										{formatSessionDuration(op.avgSessionSeconds)}
									</TableCell>
									<TableCell className="text-right">
										{formatCount(op.unitsWeek)}
									</TableCell>
									<TableCell
										className={cn(
											"text-right",
											TONE_CLASS[
												exceptionTone(op.exceptionCount, op.completedWeek)
											]
										)}
									>
										{formatExceptionRate(op.exceptionCount, op.completedWeek)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</section>
		</div>
	);
}
```

- [ ] **Step 2: Reescrever `page.tsx`**

Ler o arquivo atual antes. Conteúdo final completo:

```tsx
import { buttonVariants } from "@emach/ui/components/button";
import { PrinterIcon } from "lucide-react";
import type { Metadata } from "next";

import { AutoRefresh } from "@/components/auto-refresh";
import { PageHeader } from "@/components/page-header";
import { getUserBranchScope } from "@/lib/branch-scope";
import { requireCapabilityOrRedirect } from "@/lib/permissions";
import { LateOrdersToast } from "../orders/_components/late-orders-toast";
import { getLateOrdersCount } from "../orders/data";
import { PickingQueue } from "./_components/picking-queue";
import { ProductivityPanel } from "./_components/productivity-panel";
import { ResumeBanner } from "./_components/resume-banner";
import {
	type SeparacaoTab,
	SeparacaoTabs,
} from "./_components/separacao-tabs";
import {
	fetchPickingProductivityByOperator,
	fetchPickingProductivitySummary,
	fetchPickingQueueCounts,
	fetchPickingQueuePage,
	getActivePickingForUser,
} from "./data";

export const metadata: Metadata = {
	title: "Separação",
};

const TABS: SeparacaoTab[] = [
	"a_separar",
	"em_separacao",
	"excecoes",
	"produtividade",
];

function clampTab(raw: string | undefined): SeparacaoTab {
	return TABS.find((t) => t === raw) ?? "a_separar";
}

interface PageProps {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default function SeparacaoPage({ searchParams }: PageProps) {
	return <SeparacaoPageContent searchParams={searchParams} />;
}

async function SeparacaoPageContent({ searchParams }: PageProps) {
	const session = await requireCapabilityOrRedirect("orders.pick");
	const scope = await getUserBranchScope(session);

	const raw = await searchParams;
	const rawTab = Array.isArray(raw.tab) ? raw.tab[0] : raw.tab;
	const activeTab = clampTab(rawTab);

	// Contadores reais (COUNT) das 3 tabs de fila + o dado da tab ativa.
	// Produtividade busca os agregados; tabs de fila buscam a 1ª página.
	const [counts, activePicking, lateCount, queuePage, summary, operators] =
		await Promise.all([
			fetchPickingQueueCounts(scope),
			getActivePickingForUser(session.user.id, scope),
			getLateOrdersCount(scope),
			activeTab === "produtividade"
				? null
				: fetchPickingQueuePage({ cursor: null, scope, tab: activeTab }),
			activeTab === "produtividade"
				? fetchPickingProductivitySummary(scope)
				: null,
			activeTab === "produtividade"
				? fetchPickingProductivityByOperator(scope)
				: null,
		]);

	const showPrint = activeTab === "a_separar" || activeTab === "em_separacao";

	return (
		<>
			<AutoRefresh />
			<LateOrdersToast count={lateCount} />
			<PageHeader
				action={
					<div className="flex items-center gap-6">
						{showPrint && (
							<a
								className={buttonVariants({ size: "sm", variant: "outline" })}
								href={`/dashboard/orders/picking-list?tab=${activeTab}`}
								rel="noopener"
								target="_blank"
							>
								<PrinterIcon aria-hidden className="size-4" />
								Imprimir lista
							</a>
						)}
						<div className="text-right">
							<div className="font-semibold text-2xl tabular-nums">
								{counts.a_separar}
							</div>
							<div className="text-[11px] text-muted-foreground uppercase tracking-widest">
								A separar
							</div>
						</div>
						<div className="text-right">
							<div className="font-semibold text-2xl tabular-nums">
								{counts.em_separacao}
							</div>
							<div className="text-[11px] text-muted-foreground uppercase tracking-widest">
								Separando
							</div>
						</div>
						<div className="text-right">
							<div
								className={`font-semibold text-2xl tabular-nums ${counts.excecoes > 0 ? "text-warning" : ""}`}
							>
								{counts.excecoes}
							</div>
							<div className="text-[11px] text-muted-foreground uppercase tracking-widest">
								Exceções
							</div>
						</div>
					</div>
				}
				description="Fila de pedidos pagos aguardando conferência física"
				title="Separação"
			/>

			{activePicking && <ResumeBanner activePicking={activePicking} />}

			{activeTab === "produtividade" ? (
				<>
					<SeparacaoTabs activeTab="produtividade" counts={counts} />
					{summary && operators && (
						<ProductivityPanel operators={operators} summary={summary} />
					)}
				</>
			) : (
				<PickingQueue
					activeTab={activeTab}
					counts={counts}
					initial={queuePage?.items ?? []}
					initialCursor={queuePage?.nextCursor ?? null}
				/>
			)}
		</>
	);
}
```

Notas para o implementador:
- O tipo local `Tab` do arquivo antigo morre; `SeparacaoTab` vem da barra.
- `activeTab === "produtividade" ? null : fetchPickingQueuePage({ ..., tab: activeTab })` — o narrowing do ternário garante o tipo de 3 valores esperado por `fetchPickingQueuePage`.
- O ternário do render NÃO é nested (um único nível) — permitido.
- `AutoRefresh` fica: na tab Produtividade ele re-busca agregados baratos e mantém o painel atual durante o turno (decisão do spec).

- [ ] **Step 3: Type-check + lint + testes**

Run: `bun check-types --force && bun check && bun --cwd apps/web test`
Expected: PASS nos três (suíte inteira verde — nenhum teste existente depende do shape antigo da página).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/separacao/_components/productivity-panel.tsx apps/web/src/app/dashboard/separacao/page.tsx
git commit -m "feat: tab produtividade na separação (#324)"
```

---

### Task 5: Verificação integrada (gate final)

**Files:** nenhum novo — só verificação. Banco: **SOMENTE SELECT**.

- [ ] **Step 1: Gate estático completo**

Run: `bun verify` (encadeia `check-types && check && test`)
Expected: PASS. `check-types` com cache do turbo pode servir PASS velho — se houver qualquer dúvida, `bun check-types --force`.

- [ ] **Step 2: Smoke run-time (SQL em template string não é pego pelo tsc)**

Run: `bun dev:web` e visitar:
- `/dashboard/separacao` (a_separar) — fila renderiza, tabs com badge, tab Produtividade visível à direita de Exceções
- `/dashboard/separacao?tab=em_separacao` e `?tab=excecoes` — comportamento idêntico ao anterior (refactor da barra não mudou nada visual)
- `/dashboard/separacao?tab=produtividade` — painel renderiza sem erro (se der erro 500, `nextjs_call <port> get_errors` via MCP next-devtools pega o stack)

Expected: 4 tabs navegam; painel mostra KPIs e tabela (ou estado vazio).

- [ ] **Step 3: Validação de dados (critério de aceite da issue)**

Comparar o painel renderizado com SQL manual **read-only** no mesmo banco (via MCP supabase `execute_sql` ou client pg):

```sql
-- Total concluídas + unidades na janela de 7 dias (deve bater com o KPI "7 dias")
WITH bounds AS (
	SELECT date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo')
		AT TIME ZONE 'America/Sao_Paulo' AS today_start
)
SELECT
	COUNT(*) AS sessoes,
	COUNT(*) FILTER (WHERE op.completed_at >= b.today_start) AS hoje,
	(SELECT COALESCE(SUM(pi.qty_picked), 0) FROM order_picking_item pi
		WHERE pi.picking_id IN (
			SELECT op2.id FROM order_picking op2, bounds b2
			WHERE op2.status IN ('completed','exception')
				AND op2.completed_at >= b2.today_start - interval '6 days'
		)) AS unidades
FROM order_picking op CROSS JOIN bounds b
WHERE op.status IN ('completed', 'exception')
	AND op.completed_at >= b.today_start - interval '6 days';
```

Expected: números idênticos aos do painel (como super_admin, escopo `all`). Se houver sessão `canceled` recente, confirmar que ela NÃO aparece em nenhum número.

- [ ] **Step 4: Prova perceptual**

Screenshot da tab Produtividade lado a lado com o mockup aprovado
(`.superpowers/brainstorm/41464-1784202765/content/layout-final-v2.html`) e com uma
tab irmã (a_separar) — tabs pill idênticas, stat-cards com ring sutil, tabela text-xs
sem moldura. Reportar as 3 provas (funcional + perceptual + dados) antes de declarar pronto.

- [ ] **Step 5: Fechamento**

Invocar `superpowers:finishing-a-development-branch` (merge/PR conforme decisão do user; PR referencia `Closes #324`).
