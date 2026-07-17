# Separação por operador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agrupar a fila de Separação por operador (Minhas × Outros) e impedir que role `user` reabra exceção de picking gerada por outro operador (admin/super_admin podem).

**Architecture:** Helpers puros novos em `_lib/picking-logic.ts` (testáveis sem mock, padrão ADR-0019); guard de posse de exceção dentro das transações de `startPicking`/`bulkStartPicking` (backend = fonte da verdade); agrupamento e CTAs por role só no render (zero mudança de schema/query — `pickerUserId` já vem na fila).

**Tech Stack:** Next 16 App Router (Server Components + server actions), Drizzle, vitest (node env), Tailwind v4 com tokens do tema.

**Spec:** `docs/superpowers/specs/2026-07-17-separacao-por-operador-design.md`

## Global Constraints

- Banco Supabase é ÚNICO e COMPARTILHADO (dev=prod). NUNCA seed/truncate/reset. Write pontual de linha pra smoke é OK; reverter ao terminar.
- CWD é a RAIZ do monorepo — nunca `cd apps/web`; caminhos absolutos nos comandos.
- Hook PostToolUse roda `bun fix` após Write/Edit — se um Edit subsequente falhar com "string not found", re-Read o arquivo.
- Proibido: `console.*` (usar `logger`), `: any`/`as any`/`@ts-ignore`, `key={index}` sem justificativa, `React.forwardRef`, `useMemo`/`useCallback` manuais (React Compiler ativo).
- Copy de UI em PT-BR. Commits: Conventional Commits em PT, subject ≤50 chars, ZERO atribuição de AI.
- Gate por task: `bun check-types --force` (turbo já serviu PASS velho) + testes do arquivo tocado. Gate final: `bun verify` + `bun run build` (build pega o que tsc não pega).
- Read cada arquivo antes de Edit; se Edit falhar com `string not found`, re-Read antes de re-tentar.

---

### Task 1: Helpers puros — posse de exceção + split da fila + CTA por role

**Files:**
- Modify: `apps/web/src/app/dashboard/separacao/_lib/picking-logic.ts` (append ao fim)
- Test (create): `apps/web/src/app/dashboard/separacao/__tests__/exception-ownership.test.ts`

**Interfaces:**
- Consumes: `OrderPickingStatus` de `@emach/db/schema/orders`, `isSelfPicker` (já existe no módulo).
- Produces (Tasks 2–4 dependem destas assinaturas exatas):
  - `exceptionResumeDenial(latest: { pickerName: string; pickerUserId: string | null; status: OrderPickingStatus } | null, actor: { id: string; role?: string | null }): string | null`
  - `splitQueueByOwnership<T extends { pickerUserId?: string }>(items: T[], sessionUserId: string): { mine: T[]; others: T[] }`
  - `queueCardCta(tab: "a_separar" | "em_separacao" | "excecoes", isSelf: boolean, canManageOthers: boolean): { kind: "primary" | "warning" | "outline" | "outline-muted"; label: string } | null`
  - `BULK_PICKING_EXCEPTION_OWNER_LABEL = "exceção de outro operador"`

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `apps/web/src/app/dashboard/separacao/__tests__/exception-ownership.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
	exceptionResumeDenial,
	queueCardCta,
	splitQueueByOwnership,
} from "../_lib/picking-logic";

const EXCEPTION_BY_JOAO = {
	pickerName: "João",
	pickerUserId: "usr_joao",
	status: "exception" as const,
};

describe("exceptionResumeDenial (posse de exceção, spec 2026-07-17)", () => {
	it("sem sessão anterior → liberado", () => {
		expect(exceptionResumeDenial(null, { id: "usr_1", role: "user" })).toBeNull();
	});

	it("última sessão canceled → pool geral, liberado pra qualquer role", () => {
		expect(
			exceptionResumeDenial(
				{ ...EXCEPTION_BY_JOAO, status: "canceled" },
				{ id: "usr_1", role: "user" }
			)
		).toBeNull();
	});

	it("exceção do próprio ator → liberado", () => {
		expect(
			exceptionResumeDenial(EXCEPTION_BY_JOAO, { id: "usr_joao", role: "user" })
		).toBeNull();
	});

	it("exceção alheia + role user → negado com nome do dono", () => {
		const denial = exceptionResumeDenial(EXCEPTION_BY_JOAO, {
			id: "usr_other",
			role: "user",
		});
		expect(denial).toMatch(/João/);
		expect(denial).toMatch(/admin/i);
	});

	it("exceção alheia + admin/super_admin → liberado", () => {
		for (const role of ["admin", "super_admin"]) {
			expect(
				exceptionResumeDenial(EXCEPTION_BY_JOAO, { id: "usr_adm", role })
			).toBeNull();
		}
	});

	it("exceção órfã (pickerUserId null, user deletado) → pool, liberado", () => {
		expect(
			exceptionResumeDenial(
				{ ...EXCEPTION_BY_JOAO, pickerUserId: null },
				{ id: "usr_1", role: "user" }
			)
		).toBeNull();
	});

	it("role ausente/nula não é admin → negado", () => {
		expect(
			exceptionResumeDenial(EXCEPTION_BY_JOAO, { id: "usr_other" })
		).not.toBeNull();
	});
});

describe("splitQueueByOwnership", () => {
	const rows = [
		{ orderId: "o1", pickerUserId: "me" },
		{ orderId: "o2", pickerUserId: "other" },
		{ orderId: "o3", pickerUserId: undefined },
		{ orderId: "o4", pickerUserId: "me" },
	];

	it("separa minhas das dos outros preservando a ordem", () => {
		const { mine, others } = splitQueueByOwnership(rows, "me");
		expect(mine.map((r) => r.orderId)).toEqual(["o1", "o4"]);
		expect(others.map((r) => r.orderId)).toEqual(["o2", "o3"]);
	});

	it("sem pickerUserId (linha órfã) cai em others", () => {
		const { others } = splitQueueByOwnership(rows, "me");
		expect(others.some((r) => r.orderId === "o3")).toBe(true);
	});
});

describe("queueCardCta (CTA por role, mockup A 2026-07-17)", () => {
	it("a_separar → Separar primary, independe de role", () => {
		expect(queueCardCta("a_separar", false, false)).toEqual({
			kind: "primary",
			label: "Separar",
		});
	});

	it("em_separacao própria → Retomar separação warning", () => {
		expect(queueCardCta("em_separacao", true, false)).toEqual({
			kind: "warning",
			label: "Retomar separação",
		});
	});

	it("em_separacao alheia: user → Ver andamento; admin → Assumir separação", () => {
		expect(queueCardCta("em_separacao", false, false)).toEqual({
			kind: "outline-muted",
			label: "Ver andamento",
		});
		expect(queueCardCta("em_separacao", false, true)).toEqual({
			kind: "outline",
			label: "Assumir separação",
		});
	});

	it("excecoes: própria ou admin → Resolver; alheia + user → null (sem CTA)", () => {
		expect(queueCardCta("excecoes", true, false)).toEqual({
			kind: "outline",
			label: "Resolver",
		});
		expect(queueCardCta("excecoes", false, true)).toEqual({
			kind: "outline",
			label: "Resolver",
		});
		expect(queueCardCta("excecoes", false, false)).toBeNull();
	});
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun --cwd apps/web test src/app/dashboard/separacao/__tests__/exception-ownership.test.ts`
Expected: FAIL — `exceptionResumeDenial is not exported` (e demais).

- [ ] **Step 3: Implementar os helpers**

Append ao fim de `apps/web/src/app/dashboard/separacao/_lib/picking-logic.ts`:

```ts
// ─── Posse de exceção (spec 2026-07-17) ──────────────────────────────────────
// A última sessão em 'exception' pertence ao pickerUserId dela: role user só
// reabre a própria; admin/super_admin reabrem qualquer uma. Sessão 'canceled'
// (ou pickerUserId null — operador deletado) volta ao pool geral. Puro e
// compartilhado entre startPicking, bulkStartPicking e a UI de reabertura
// ([orderId]/page.tsx) — mesma régua nos três pontos, sem duplicar.

export function exceptionResumeDenial(
	latest: {
		pickerName: string;
		pickerUserId: string | null;
		status: OrderPickingStatus;
	} | null,
	actor: { id: string; role?: string | null }
): string | null {
	if (!latest || latest.status !== "exception") {
		return null;
	}
	if (latest.pickerUserId === null || latest.pickerUserId === actor.id) {
		return null;
	}
	if (actor.role === "admin" || actor.role === "super_admin") {
		return null;
	}
	return `Apenas ${latest.pickerName} ou um admin pode retomar esta exceção`;
}

export const BULK_PICKING_EXCEPTION_OWNER_LABEL = "exceção de outro operador";

// ─── Agrupamento da fila por operador (mockup A, spec 2026-07-17) ────────────

export function splitQueueByOwnership<T extends { pickerUserId?: string }>(
	items: T[],
	sessionUserId: string
): { mine: T[]; others: T[] } {
	const mine: T[] = [];
	const others: T[] = [];
	for (const item of items) {
		if (isSelfPicker(item.pickerUserId, sessionUserId)) {
			mine.push(item);
		} else {
			others.push(item);
		}
	}
	return { mine, others };
}

// ─── CTA do card da fila por role (mockup A, spec 2026-07-17) ────────────────
// null = sem CTA (card alheio em excecoes pra role user; o card inteiro ainda
// navega pro detalhe, que mostra o motivo sem botão de reabrir).

export interface QueueCardCta {
	kind: "primary" | "warning" | "outline" | "outline-muted";
	label: string;
}

export function queueCardCta(
	tab: "a_separar" | "em_separacao" | "excecoes",
	isSelf: boolean,
	canManageOthers: boolean
): QueueCardCta | null {
	if (tab === "a_separar") {
		return { kind: "primary", label: "Separar" };
	}
	if (tab === "em_separacao") {
		if (isSelf) {
			return { kind: "warning", label: "Retomar separação" };
		}
		return canManageOthers
			? { kind: "outline", label: "Assumir separação" }
			: { kind: "outline-muted", label: "Ver andamento" };
	}
	// excecoes
	if (isSelf || canManageOthers) {
		return { kind: "outline", label: "Resolver" };
	}
	return null;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `bun --cwd apps/web test src/app/dashboard/separacao/__tests__/exception-ownership.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/separacao/_lib/picking-logic.ts apps/web/src/app/dashboard/separacao/__tests__/exception-ownership.test.ts
git commit -m "feat: helpers de posse de exceção e fila por operador"
```

---

### Task 2: Guard de posse de exceção em startPicking + bulkStartPicking

**Files:**
- Modify: `apps/web/src/app/dashboard/separacao/actions.ts` (startPicking ~linha 201; bulkStartPicking ~linha 281)
- Test: `apps/web/src/app/dashboard/separacao/__tests__/picking-guards.test.ts` (append ao describe existente)

**Interfaces:**
- Consumes: `exceptionResumeDenial` + `BULK_PICKING_EXCEPTION_OWNER_LABEL` (Task 1); `lockOrderAndAuthorize`, `createPickingSession`, `makeTx`/`sessionAs` (test harness existente).
- Produces: `startPicking` retorna `{ ok: false, error: "Apenas {nome} ou um admin pode retomar esta exceção" }` quando negado; `bulkStartPicking` pula com reason `"exceção de outro operador"`.

- [ ] **Step 1: Escrever os testes (falhando)**

Em `picking-guards.test.ts`: adicionar `startPicking` e `bulkStartPicking` ao import de `../actions` (linha 44-50) e adicionar ao fim do `describe("guards de sessão de separação", ...)`:

```ts
	const LATEST_EXCEPTION = {
		pickerName: "João",
		pickerUserId: OWNER,
		status: "exception",
	};

	it("startPicking sobre exceção alheia por role user → recusado", async () => {
		mockLockOrderAndAuthorize.mockResolvedValue(sessionAs("usr_other", "user"));
		mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
			cb(makeTx([[LATEST_EXCEPTION]]))
		);
		const result = await startPicking("ord_1");
		expect(result.ok).toBe(false);
		expect((result as { ok: false; error: string }).error).toMatch(/João/);
	});

	it("startPicking sobre a própria exceção por role user → ok", async () => {
		mockLockOrderAndAuthorize.mockResolvedValue(sessionAs(OWNER, "user"));
		// selects: [última sessão] e depois [itens do pedido] (createPickingItems)
		mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
			cb(makeTx([[LATEST_EXCEPTION], []]))
		);
		const result = await startPicking("ord_1");
		expect(result.ok).toBe(true);
	});

	it("startPicking sobre exceção alheia por admin → ok", async () => {
		mockLockOrderAndAuthorize.mockResolvedValue(sessionAs("usr_adm", "admin"));
		mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
			cb(makeTx([[LATEST_EXCEPTION], []]))
		);
		const result = await startPicking("ord_1");
		expect(result.ok).toBe(true);
	});

	it("startPicking sobre sessão canceled de outro → ok (pool geral)", async () => {
		mockLockOrderAndAuthorize.mockResolvedValue(sessionAs("usr_other", "user"));
		mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
			cb(makeTx([[{ ...LATEST_EXCEPTION, status: "canceled" }], []]))
		);
		const result = await startPicking("ord_1");
		expect(result.ok).toBe(true);
	});

	it("bulkStartPicking pula exceção alheia com reason, sem derrubar o lote", async () => {
		mockLockOrderAndAuthorize.mockResolvedValue(sessionAs("usr_other", "user"));
		// selects por pedido: [number], [sessão in_progress existente → nenhuma],
		// [última sessão → exceção alheia]
		mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
			cb(makeTx([[{ number: "EM-1" }], [], [LATEST_EXCEPTION]]))
		);
		const result = await bulkStartPicking({
			orderIds: ["3f2b7c1a-9d4e-4f6a-8b2c-1a2b3c4d5e6f"],
		});
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data.moved).toBe(0);
			expect(result.data.skipped).toEqual([
				{ number: "EM-1", reason: "exceção de outro operador" },
			]);
		}
	});
```

Nota: `sessionAs` já retorna `status: "preparing"` (elegível). `requireCapability` já está mockado no topo do arquivo (necessário pro fail-fast do bulk).

- [ ] **Step 2: Rodar e ver falhar**

Run: `bun --cwd apps/web test src/app/dashboard/separacao/__tests__/picking-guards.test.ts`
Expected: FAIL — os 5 testes novos (o guard ainda não existe; os `ok:true` falham porque o 1º select é interpretado como itens).

- [ ] **Step 3: Implementar o guard**

Em `actions.ts`:

(a) Adicionar ao import de `./_lib/picking-logic` (já existe um import desse módulo — `bulkStartPickingSkipReason`, `BULK_PICKING_SKIP_LABEL`): `exceptionResumeDenial`, `BULK_PICKING_EXCEPTION_OWNER_LABEL`. Garantir `desc` no import de `drizzle-orm` (hoje importa `and`, `eq`).

(b) Helper local (perto de `createPickingSession`, ~linha 195):

```ts
/**
 * Última sessão de picking do pedido, dentro da transação — insumo do guard
 * de posse de exceção (exceptionResumeDenial, spec 2026-07-17). Mesma ordenação
 * do LATERAL da fila (started_at DESC, id DESC) pra não divergir da tab.
 */
async function getLatestSessionForGuard(
	tx: Tx,
	orderId: string
): Promise<{
	pickerName: string;
	pickerUserId: string | null;
	status: OrderPickingStatus;
} | null> {
	const [latest] = await tx
		.select({
			pickerName: orderPicking.pickerName,
			pickerUserId: orderPicking.pickerUserId,
			status: orderPicking.status,
		})
		.from(orderPicking)
		.where(eq(orderPicking.orderId, orderId))
		.orderBy(desc(orderPicking.startedAt), desc(orderPicking.id))
		.limit(1);
	return latest ?? null;
}
```

(Se `OrderPickingStatus` não estiver importado em actions.ts, adicionar ao import type de `@emach/db/schema/orders`.)

(c) Em `startPicking`, dentro da transação, logo após o check de `branchId` (linha ~220) e ANTES de `createPickingSession`:

```ts
			const latest = await getLatestSessionForGuard(tx, orderId);
			const denial = exceptionResumeDenial(latest, locked.session.user);
			if (denial) {
				throw new Error(denial);
			}
```

Atenção à ordem dos selects na transação: este select roda ANTES do load de itens de `createPickingItems` — é o contrato que os testes do Step 1 assumem.

(d) Em `bulkStartPicking`, logo após o check de `existingSession` (linha ~360) e ANTES de `createPickingSession`:

```ts
						const latest = await getLatestSessionForGuard(tx, orderId);
						if (exceptionResumeDenial(latest, locked.session.user)) {
							skipped.push({
								number: label,
								reason: BULK_PICKING_EXCEPTION_OWNER_LABEL,
							});
							return;
						}
```

- [ ] **Step 4: Rodar e ver passar (novos + regressão)**

Run: `bun --cwd apps/web test src/app/dashboard/separacao/`
Expected: PASS (arquivo inteiro + os demais testes de separacao intactos).

- [ ] **Step 5: Typecheck + commit**

```bash
bun check-types --force
git add apps/web/src/app/dashboard/separacao/actions.ts apps/web/src/app/dashboard/separacao/__tests__/picking-guards.test.ts
git commit -m "feat: posse de exceção em startPicking e bulk"
```

---

### Task 3: UI de reabertura — esconder botão quando não pode

**Files:**
- Modify: `apps/web/src/app/dashboard/separacao/[orderId]/page.tsx` (bloco `exceptionContext`, ~linhas 112-119)
- Modify: `apps/web/src/app/dashboard/separacao/_components/start-picking.tsx`

**Interfaces:**
- Consumes: `exceptionResumeDenial` (Task 1); `StartPicking` ganha prop nova.
- Produces: `StartPickingProps` passa a ter `canStart: boolean` (obrigatória).

- [ ] **Step 1: Server side — computar canStart**

Em `[orderId]/page.tsx`, substituir o bloco final (a partir de `const exceptionContext =`):

```tsx
	const exceptionContext =
		result?.picking.status === "exception"
			? {
					reason: result.picking.exceptionReason,
					pickerName: result.picking.pickerName,
				}
			: null;
	// Posse de exceção (spec 2026-07-17): user só reabre a própria; admin/super
	// reabrem qualquer uma. Mesma régua do guard de startPicking — a UI esconde
	// o botão, o backend continua sendo a autoridade.
	const canStart =
		exceptionResumeDenial(
			result
				? {
						pickerName: result.picking.pickerName,
						pickerUserId: result.picking.pickerUserId,
						status: result.picking.status,
					}
				: null,
			session.user
		) === null;
	return (
		<StartPicking
			canStart={canStart}
			exceptionContext={exceptionContext}
			orderId={orderId}
		/>
	);
```

Adicionar `exceptionResumeDenial` ao import de `../_lib/picking-logic` (módulo puro, ok em Server Component).

- [ ] **Step 2: Client side — renderizar o estado bloqueado**

Em `start-picking.tsx`: adicionar `canStart: boolean;` a `StartPickingProps`, incluir no destructuring, e substituir o `<Button>` final por:

```tsx
			{canStart ? (
				<Button disabled={isPending} onClick={handleStart} size="lg">
					{getStartLabel(isPending, Boolean(exceptionContext))}
				</Button>
			) : (
				<p className="text-muted-foreground text-sm">
					Somente {exceptionContext?.pickerName ?? "o operador original"} ou um
					admin pode reabrir esta separação.
				</p>
			)}
```

- [ ] **Step 3: Typecheck (pega call sites sem a prop nova) + testes de regressão**

Run: `bun check-types --force && bun --cwd apps/web test src/app/dashboard/separacao/`
Expected: PASS. (Único call site de `StartPicking` é o `[orderId]/page.tsx`.)

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/dashboard/separacao/[orderId]/page.tsx" apps/web/src/app/dashboard/separacao/_components/start-picking.tsx
git commit -m "feat: reabrir exceção só pro dono ou admin na UI"
```

---

### Task 4: Fila agrupada por operador + CTA por role (layout A)

**Files:**
- Modify: `apps/web/src/app/dashboard/separacao/page.tsx` (call site do `PickingQueue`, ~linha 83)
- Modify: `apps/web/src/app/dashboard/separacao/_components/picking-queue.tsx`
- Modify: `apps/web/src/app/dashboard/separacao/_components/picking-order-card.tsx`

**Interfaces:**
- Consumes: `splitQueueByOwnership`, `queueCardCta`, `isSelfPicker` (Task 1).
- Produces: `PickingQueueProps` ganha `canManageOthers: boolean`; `PickingOrderCardProps` ganha `canManageOthers: boolean`.

- [ ] **Step 1: page.tsx — passar canManageOthers**

Em `separacao/page.tsx`, no branch do `PickingQueue`:

```tsx
				<PickingQueue
					activeTab={activeTab}
					canManageOthers={
						session.user.role === "admin" || session.user.role === "super_admin"
					}
					counts={counts}
					initial={queuePage?.items ?? []}
					initialCursor={queuePage?.nextCursor ?? null}
					sessionUserId={session.user.id}
				/>
```

- [ ] **Step 2: picking-order-card.tsx — CTA por role + dim**

(a) Remover os maps `CTA_CLASS` e `CTA_LABEL` (linhas 18-29). Adicionar map de estilo por kind e imports:

```tsx
import {
	isPickingStale,
	isSelfPicker,
	type QueueCardCta,
	queueCardCta,
} from "../_lib/picking-logic";

/** Estilo do CTA por intenção (queueCardCta): primário (claim), warning
 * (retomar própria), outline (ação de admin/resolver), outline-muted
 * (somente-leitura). */
const CTA_KIND_CLASS: Record<QueueCardCta["kind"], string> = {
	primary: "bg-primary text-primary-foreground",
	warning: "bg-warning text-warning-foreground",
	outline: "border border-input text-foreground",
	"outline-muted": "border border-input text-muted-foreground",
};
```

(b) `PickingOrderCardProps`: adicionar `canManageOthers: boolean;` e incluir no destructuring do componente.

(c) No corpo do componente, antes do `return`:

```tsx
	const isSelf = isSelfPicker(row.pickerUserId, sessionUserId);
	const cta = queueCardCta(tab, isSelf, canManageOthers);
	// Cards de outros operadores ficam esmaecidos (mockup A) nas tabs com dono.
	const isForeign = tab !== "a_separar" && !isSelf;
```

(d) No `className` do `<Link>` raiz, prefixar condicionalmente:

```tsx
		<Link
			className={`group flex flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isForeign ? "opacity-60" : ""}`}
			href={`/dashboard/separacao/${row.orderId}`}
		>
```

(e) Substituir o bloco `{/* CTA */}` inteiro (do `<div className="border-border border-t bg-sidebar px-4 py-3">` até seu fechamento) por:

```tsx
			{/* CTA — some quando queueCardCta retorna null (exceção alheia, role
			    user); o Link raiz continua navegando pro detalhe. */}
			{cta && (
				<div className="border-border border-t bg-sidebar px-4 py-3">
					{tab === "a_separar" ? (
						// biome-ignore lint/a11y/useSemanticElements: role="button" aninhado no Link (padrão DESIGN.md §4, não usar <button> em âncora)
						<div
							aria-disabled={isStarting}
							className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-semibold text-[13px] transition-opacity aria-disabled:cursor-not-allowed aria-disabled:opacity-70 ${CTA_KIND_CLASS[cta.kind]}`}
							onClick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								handleStart();
							}}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									e.stopPropagation();
									handleStart();
								}
							}}
							role="button"
							tabIndex={0}
						>
							{isStarting ? "Iniciando…" : cta.label}
							<ArrowRightIcon aria-hidden className="size-4" />
						</div>
					) : (
						<div
							className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-semibold text-[13px] ${CTA_KIND_CLASS[cta.kind]}`}
							// role="none": o <Link> pai já é o elemento interativo
							role="none"
						>
							{cta.label}
						</div>
					)}
				</div>
			)}
```

`CTA_LABEL[tab]` (variável `ctaLabel`, ~linha 114) deixa de existir — remover a declaração.

- [ ] **Step 3: picking-queue.tsx — seções Minhas × Outros**

(a) Imports: adicionar `splitQueueByOwnership` de `../_lib/picking-logic`.

(b) `PickingQueueProps`: adicionar `canManageOthers: boolean;` e incluir no destructuring.

(c) Acima do componente `PickingQueue`, adicionar labels e o header de seção:

```tsx
/** Labels das seções por tab com dono (mockup A, spec 2026-07-17). */
const SECTION_LABELS: Record<
	"em_separacao" | "excecoes",
	{ mine: string; others: string }
> = {
	em_separacao: { mine: "Minhas separações", others: "Outros operadores" },
	excecoes: { mine: "Minhas exceções", others: "De outros operadores" },
};

function QueueSectionHeader({ count, label }: { count: number; label: string }) {
	return (
		<div className="mt-5 mb-2.5 flex items-center gap-2 first:mt-1">
			<span className="font-bold text-[11px] text-muted-foreground uppercase tracking-[0.09em]">
				{label}
			</span>
			<span className="rounded-md bg-secondary px-1.5 font-semibold text-[10px] text-secondary-foreground leading-[17px]">
				{count}
			</span>
			<span aria-hidden className="h-px flex-1 bg-border" />
		</div>
	);
}
```

(d) Extrair o miolo do grid (o `items.map` atual, linhas ~191-204) numa função local `renderGrid` e montar as seções. Substituir o bloco do grid (do `{items.length === 0 ...}` até o fechamento do ternário) por:

```tsx
			{(() => {
				if (items.length === 0 && !pending && !error) {
					return (
						<p className="py-10 text-center text-muted-foreground text-sm">
							{TAB_EMPTY[activeTab]}
						</p>
					);
				}
				const renderGrid = (rows: PickingQueueRow[]) => (
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
						{rows.map((row) => (
							<SelectableItem
								active={selectable && sel.active}
								key={row.orderId}
								onToggle={() => sel.toggle(row.orderId)}
								selected={sel.isSelected(row.orderId)}
							>
								<PickingOrderCard
									canManageOthers={canManageOthers}
									row={row}
									sessionUserId={sessionUserId}
									tab={activeTab}
								/>
							</SelectableItem>
						))}
					</div>
				);
				if (activeTab === "a_separar") {
					return <div aria-live="polite">{renderGrid(items)}</div>;
				}
				// Tabs com dono: seções Minhas × Outros (mockup A). Seção vazia
				// não renderiza; o agrupamento fatia as páginas já carregadas
				// (fila ativa é pequena — aceito na spec).
				const labels = SECTION_LABELS[activeTab];
				const { mine, others } = splitQueueByOwnership(items, sessionUserId);
				return (
					<div aria-live="polite">
						{mine.length > 0 && (
							<>
								<QueueSectionHeader count={mine.length} label={labels.mine} />
								{renderGrid(mine)}
							</>
						)}
						{others.length > 0 && (
							<>
								<QueueSectionHeader
									count={others.length}
									label={labels.others}
								/>
								{renderGrid(others)}
							</>
						)}
					</div>
				);
			})()}
```

Nota: `aria-live="polite"` sobe do grid pro wrapper das seções (um único live region por tab, como antes).

- [ ] **Step 4: Typecheck + lint + testes**

Run: `bun check-types --force && bun check && bun --cwd apps/web test src/app/dashboard/separacao/`
Expected: PASS nos três. (`bun check` pega regra de lint que tsc não vê.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/separacao/page.tsx apps/web/src/app/dashboard/separacao/_components/picking-queue.tsx apps/web/src/app/dashboard/separacao/_components/picking-order-card.tsx
git commit -m "feat: fila de separação agrupada por operador"
```

---

### Task 5: Gate integrado + smoke visual multi-role

**Files:**
- Nenhum novo — verificação e ajustes pontuais que o smoke apontar.

**Interfaces:**
- Consumes: tudo das Tasks 1-4.
- Produces: branch pronta pra PR com evidência funcional + perceptual + de dados.

- [ ] **Step 1: Gate integrado completo**

Run: `bun verify && bun run build`
Expected: check-types + check + testes (todos os arquivos, não só separacao) + build EXIT 0. O build é obrigatório: mexemos em arquivos consumidos por `"use server"` e o tsc sozinho não cobre (lição do incidente #348/#349).

- [ ] **Step 2: Smoke visual multi-role (agent-browser, porta 3009)**

1. Subir o dev server: `bun dev:web` (porta 3009 — conferir `--port` do script; se o padrão for 3001, subir com `PORT=3009`).
2. Abrir via skill `agent-browser` (primeira run da sessão: `agent-browser skills get core`) um Brave novo em `http://localhost:3009/dashboard/separacao` e **pedir ao user pra logar** (combinado: ele loga).
3. Com sessão **admin/super_admin**: aba "Separando" mostra seções "Minhas separações"/"Outros operadores" (a que existir), cards alheios esmaecidos com CTA "Assumir separação"; aba "Exceções" com CTA "Resolver" em qualquer card.
4. Com sessão **user** (user loga na outra conta, ou usar a conta de teste que ele indicar): CTA alheio vira "Ver andamento"; exceção alheia sem CTA e detalhe sem botão de reabrir (mensagem "Somente {nome} ou um admin…").
5. Dados reais: conferir que a contagem dos chips das seções soma o total da tab e que nenhum pedido aparece em duas seções.
6. Se precisar fabricar estado (ex: exceção de outro operador), write pontual é permitido (CLAUDE.md raiz) — guardar os ids criados e **reverter ao final**.
7. Screenshots lado a lado (user × admin) pra evidência perceptual.

- [ ] **Step 3: Commit final (se o smoke gerou ajustes) e encerrar**

```bash
git add -A && git commit -m "fix: ajustes do smoke da fila por operador"
```

Ao fechar a última task, invocar `superpowers:finishing-a-development-branch` (regra do CLAUDE.md global).
