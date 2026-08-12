# Exclusão e arquivamento de ferramentas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o sistema explicar por que uma ferramenta não pode ser excluída, fechar os dois furos do `deleteTool` (estoque e avaliações) e oferecer arquivar como saída quando a exclusão é impossível.

**Architecture:** Uma função pura (`resolveToolDeletion`) recebe os fatos (pedidos, avaliações, estoque) e devolve a decisão de bloqueio com a mensagem. O servidor busca os fatos uma vez (`fetchToolDeletionFacts`), aplica a decisão no `deleteTool` e entrega os mesmos fatos ao detalhe da ferramenta; o cliente recalcula a decisão com a mesma função pura. Arquivar é uma action nova que marca `status='discontinued'` + `visibleOnSite=false`, e a listagem passa a esconder arquivadas por padrão.

**Tech Stack:** Next 16 (App Router, Server Actions), React 19 + React Compiler, Drizzle ORM (Postgres/Supabase), Vitest (`environment: node`), Biome/ultracite, base-ui (`@emach/ui`).

**Spec:** `docs/superpowers/specs/2026-08-11-exclusao-arquivamento-ferramentas-design.md`

## Global Constraints

Regras do repositório que valem em **todas** as tasks (fonte: `CLAUDE.md` da raiz e `apps/web/CLAUDE.md`):

- **Banco único dev = prod = e-commerce.** NUNCA `seed`/`truncate`/`drop`/reset/`db:push` destrutivo sem autorização explícita do usuário nesta sessão. Write pontual de poucas linhas (INSERT/UPDATE/DELETE) é permitido para fabricar estado de smoke — **guardar o id e reverter ao terminar**.
- CWD é a **raiz do monorepo**. Nunca `cd apps/web`; usar caminhos absolutos ou `bun --cwd apps/web`.
- Proibido: `console.log/warn/error` (usar `logger` de `apps/web/src/lib/logger.ts`), `: any`, `as any`, `@ts-ignore`, `@ts-expect-error`, `React.forwardRef`, `useMemo`/`useCallback` manuais (React Compiler ativo), `key={index}` em `.map()`.
- **React Compiler:** proibido `try { } finally { }` e `throw` dentro do corpo do `try` — o compiler baila no componente inteiro. Cleanup no fim do `try` + repetido no `catch (err) { cleanup(); throw err; }`.
- Server actions: `"use server"` no topo, `await requireCapability(cap)` como primeira coisa, retorno `ActionResult<T>` (`{ ok: true; data } | { ok: false; error }`), `revalidatePath` após mutação, `logger.error` no catch.
- Erro de banco em `catch`: nunca detectar por `e.message.includes(...)`. Usar `getPgError(e)` / `actionErrorMessage(e)`.
- IDs: `crypto.randomUUID()` no caller.
- Commits: **Conventional Commits em português**, subject ≤ 50 caracteres. **Zero atribuição de AI** em qualquer texto escrito (commit, PR, issue, comentário).
- Testes: `bun --cwd apps/web test`. Gate completo antes de PR: `bun verify` (= `bun check-types && bun check && bun --cwd apps/web test`).
- O hook `PostToolUse` roda `bun fix` após `Write`/`Edit` e pode reordenar campos — se um `Edit` seguinte falhar por `old_string`, re-ler o arquivo.
- Mensagens de UI em **pt-BR** com acentuação correta.

---

### Task 1: Helper puro de decisão de exclusão

**Files:**
- Create: `apps/web/src/app/dashboard/tools/_lib/tool-deletion.ts`
- Test: `apps/web/src/app/dashboard/tools/_lib/__tests__/tool-deletion.test.ts`

**Interfaces:**
- Consumes: nada (primeira task).
- Produces:
  - `interface ToolDeletionInput { orderCount: number; reviewCount: number; stockQty: number }`
  - `type ToolDeletionDecision = { allowed: true } | { allowed: false; reason: string; suggestArchive: boolean }`
  - `function resolveToolDeletion(input: ToolDeletionInput): ToolDeletionDecision`

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/web/src/app/dashboard/tools/_lib/__tests__/tool-deletion.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveToolDeletion } from "../tool-deletion";

const facts = (over: Partial<Parameters<typeof resolveToolDeletion>[0]> = {}) => ({
	orderCount: 0,
	reviewCount: 0,
	stockQty: 0,
	...over,
});

describe("resolveToolDeletion", () => {
	it("permite quando não há pedidos, avaliações nem estoque", () => {
		expect(resolveToolDeletion(facts())).toEqual({ allowed: true });
	});

	it("bloqueia por pedidos e sugere arquivar", () => {
		const r = resolveToolDeletion(facts({ orderCount: 4 }));
		expect(r.allowed).toBe(false);
		if (!r.allowed) {
			expect(r.reason).toContain("4 pedidos");
			expect(r.suggestArchive).toBe(true);
		}
	});

	it("usa singular com um pedido só", () => {
		const r = resolveToolDeletion(facts({ orderCount: 1 }));
		expect(r.allowed).toBe(false);
		if (!r.allowed) {
			expect(r.reason).toContain("1 pedido ");
		}
	});

	it("bloqueia por avaliações", () => {
		const r = resolveToolDeletion(facts({ reviewCount: 2 }));
		expect(r.allowed).toBe(false);
		if (!r.allowed) {
			expect(r.reason).toContain("2 avaliações");
		}
	});

	it("bloqueia por estoque", () => {
		const r = resolveToolDeletion(facts({ stockQty: 90 }));
		expect(r.allowed).toBe(false);
		if (!r.allowed) {
			expect(r.reason).toContain("90 un");
		}
	});

	it("pedidos têm precedência sobre avaliações e estoque", () => {
		const r = resolveToolDeletion(
			facts({ orderCount: 4, reviewCount: 2, stockQty: 90 })
		);
		expect(r.allowed).toBe(false);
		if (!r.allowed) {
			expect(r.reason).toContain("pedido");
		}
	});

	it("avaliações têm precedência sobre estoque", () => {
		const r = resolveToolDeletion(facts({ reviewCount: 1, stockQty: 90 }));
		expect(r.allowed).toBe(false);
		if (!r.allowed) {
			expect(r.reason).toContain("avaliação");
		}
	});
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `bun --cwd apps/web test tool-deletion`
Expected: FAIL — `Failed to resolve import "../tool-deletion"`.

- [ ] **Step 3: Implementar o helper**

Criar `apps/web/src/app/dashboard/tools/_lib/tool-deletion.ts`:

```ts
export interface ToolDeletionInput {
	orderCount: number;
	reviewCount: number;
	stockQty: number;
}

export type ToolDeletionDecision =
	| { allowed: true }
	| { allowed: false; reason: string; suggestArchive: boolean };

/**
 * Decide se uma ferramenta pode ser excluída e, se não, por quê. Pura — quem
 * chama faz o IO (`fetchToolDeletionFacts`). Server (`deleteTool`) e UI
 * (`variants-tab`) consomem esta mesma função, então a frase que o usuário lê é
 * a frase que o servidor aplica.
 *
 * Precedência: pedidos > avaliações > estoque, do imutável ao acionável — o
 * usuário vê primeiro o bloqueio que não tem saída, e só depois o que ele
 * consegue resolver sozinho.
 */
export function resolveToolDeletion({
	orderCount,
	reviewCount,
	stockQty,
}: ToolDeletionInput): ToolDeletionDecision {
	if (orderCount > 0) {
		const plural = orderCount > 1 ? "pedidos" : "pedido";
		return {
			allowed: false,
			reason: `Esta ferramenta tem ${orderCount} ${plural} e não pode ser excluída — o histórico do pedido depende dela.`,
			suggestArchive: true,
		};
	}
	if (reviewCount > 0) {
		const plural = reviewCount > 1 ? "avaliações" : "avaliação";
		return {
			allowed: false,
			reason: `Esta ferramenta tem ${reviewCount} ${plural} de cliente e não pode ser excluída.`,
			suggestArchive: true,
		};
	}
	if (stockQty > 0) {
		return {
			allowed: false,
			reason: `Esta ferramenta tem ${stockQty} un em estoque. Zere o estoque nas filiais antes de excluir.`,
			suggestArchive: true,
		};
	}
	return { allowed: true };
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `bun --cwd apps/web test tool-deletion`
Expected: PASS — 7 testes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/tools/_lib/tool-deletion.ts apps/web/src/app/dashboard/tools/_lib/__tests__/tool-deletion.test.ts
git commit -m "feat(tools): helper de decisão de exclusão"
```

---

### Task 2: Fatos de exclusão no servidor + `deleteTool` consumindo o helper

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/data.ts` (adicionar `fetchToolDeletionFacts` ao fim do arquivo)
- Modify: `apps/web/src/app/dashboard/tools/actions.ts:479-539` (corpo do `deleteTool`)
- Test: `apps/web/src/app/dashboard/tools/__tests__/delete-tool-action.test.ts` (criar)

**Interfaces:**
- Consumes: `resolveToolDeletion`, `ToolDeletionInput` (Task 1).
- Produces:
  - `interface ToolDeletionFacts { orderCount: number; reviewCount: number; stockBranchCount: number; stockQty: number }`
  - `async function fetchToolDeletionFacts(toolId: string): Promise<ToolDeletionFacts>` (exportada de `tools/data.ts`)

`ToolDeletionFacts` é mais largo que `ToolDeletionInput` de propósito: `stockBranchCount` só serve para a mensagem de arquivamento na UI e não entra na decisão.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/web/src/app/dashboard/tools/__tests__/delete-tool-action.test.ts`. O mock de `./data` isola a action da montagem de queries do Drizzle — o que este teste prova é a regra (bloqueia/permite e qual mensagem), não o SQL:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFetchFacts, mockDbDelete, mockDbSelect } = vi.hoisted(() => ({
	mockFetchFacts: vi.fn(),
	mockDbDelete: vi.fn(),
	mockDbSelect: vi.fn(),
}));

vi.mock("@emach/db", () => ({
	db: { delete: mockDbDelete, select: mockDbSelect },
}));

vi.mock("../data", () => ({
	fetchToolDeletionFacts: mockFetchFacts,
	fetchToolsPage: vi.fn(),
	currentPrimaryCategoryId: vi.fn(),
	fetchDefinitionsBySlug: vi.fn(),
	primaryCategoryIncompleteError: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
	requireCapability: vi.fn().mockResolvedValue({
		user: { id: "actor-1", name: "Admin Test", role: "super_admin" },
	}),
}));

vi.mock("@/lib/activity", () => ({
	logUserActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/logger", () => ({
	logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("next/cache", () => ({
	revalidatePath: vi.fn(),
	revalidateTag: vi.fn(),
}));

vi.mock("../_components/image-actions", () => ({
	deleteToolImage: vi.fn().mockResolvedValue(undefined),
	uploadToolImage: vi.fn(),
}));

vi.mock("../_components/video-actions", () => ({
	deleteToolVideoObject: vi.fn().mockResolvedValue(undefined),
}));

import { deleteTool } from "../actions";

/** db.select(...).from(...).where(...) → linhas; usado p/ nome, imagens e vídeo. */
function setupSelect(rows: Record<string, unknown>[]) {
	mockDbSelect.mockReturnValue({
		from: () => ({
			where: () => ({
				limit: () => Promise.resolve(rows),
				then: (resolve: (r: unknown) => unknown) => resolve(rows),
			}),
		}),
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	setupSelect([{ name: "Ferramenta de teste", url: null, poster: null }]);
	mockDbDelete.mockReturnValue({ where: () => Promise.resolve(undefined) });
});

describe("deleteTool", () => {
	it("bloqueia quando a ferramenta tem pedidos", async () => {
		mockFetchFacts.mockResolvedValue({
			orderCount: 4,
			reviewCount: 0,
			stockBranchCount: 0,
			stockQty: 0,
		});

		const result = await deleteTool("tool-1");

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("4 pedidos");
		}
		expect(mockDbDelete).not.toHaveBeenCalled();
	});

	it("bloqueia quando a ferramenta tem avaliações", async () => {
		mockFetchFacts.mockResolvedValue({
			orderCount: 0,
			reviewCount: 1,
			stockBranchCount: 0,
			stockQty: 0,
		});

		const result = await deleteTool("tool-1");

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("avaliação");
		}
		expect(mockDbDelete).not.toHaveBeenCalled();
	});

	it("bloqueia quando ainda há estoque em filial", async () => {
		mockFetchFacts.mockResolvedValue({
			orderCount: 0,
			reviewCount: 0,
			stockBranchCount: 1,
			stockQty: 90,
		});

		const result = await deleteTool("tool-1");

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("90 un");
		}
		expect(mockDbDelete).not.toHaveBeenCalled();
	});

	it("exclui quando não há pedido, avaliação nem estoque", async () => {
		mockFetchFacts.mockResolvedValue({
			orderCount: 0,
			reviewCount: 0,
			stockBranchCount: 0,
			stockQty: 0,
		});

		const result = await deleteTool("tool-1");

		expect(result.ok).toBe(true);
		expect(mockDbDelete).toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `bun --cwd apps/web test delete-tool-action`
Expected: FAIL — `fetchToolDeletionFacts` não existe em `../data`, e o teste "bloqueia por avaliações" falha porque hoje só pedidos bloqueiam.

- [ ] **Step 3: Implementar `fetchToolDeletionFacts` em `data.ts`**

Acrescentar ao fim de `apps/web/src/app/dashboard/tools/data.ts` (e completar os imports do topo com `review` de `@emach/db/schema/reviews`, `orderItem` de `@emach/db/schema/orders`, `stockLevel` de `@emach/db/schema/inventory` e `toolVariant` de `@emach/db/schema/tools`):

```ts
export interface ToolDeletionFacts {
	orderCount: number;
	reviewCount: number;
	stockBranchCount: number;
	stockQty: number;
}

/**
 * Fatos que governam a exclusão de uma ferramenta. SEM branch-scope de
 * propósito: o bloqueio do servidor é global (mesma razão documentada em
 * `[id]/_lib/tool-detail-data.ts` para `stockedVariantIds`) — escopar aqui faria
 * a UI prometer uma exclusão que o servidor recusa.
 */
export async function fetchToolDeletionFacts(
	toolId: string
): Promise<ToolDeletionFacts> {
	const [orders, reviews, stock] = await Promise.all([
		db
			.select({ n: sql<number>`count(*)::int` })
			.from(orderItem)
			.innerJoin(toolVariant, eq(toolVariant.id, orderItem.variantId))
			.where(eq(toolVariant.toolId, toolId)),
		db
			.select({ n: sql<number>`count(*)::int` })
			.from(review)
			.where(eq(review.toolId, toolId)),
		db
			.select({
				qty: sql<number>`coalesce(sum(${stockLevel.quantity}), 0)::int`,
				branches: sql<number>`count(distinct ${stockLevel.branchId}) filter (where ${stockLevel.quantity} > 0)::int`,
			})
			.from(stockLevel)
			.innerJoin(toolVariant, eq(toolVariant.id, stockLevel.variantId))
			.where(eq(toolVariant.toolId, toolId)),
	]);

	return {
		orderCount: orders[0]?.n ?? 0,
		reviewCount: reviews[0]?.n ?? 0,
		stockQty: stock[0]?.qty ?? 0,
		stockBranchCount: stock[0]?.branches ?? 0,
	};
}
```

- [ ] **Step 4: Reescrever o guard do `deleteTool`**

Em `apps/web/src/app/dashboard/tools/actions.ts`, adicionar aos imports existentes:

```ts
import { resolveToolDeletion } from "./_lib/tool-deletion";
```

e ao bloco que já importa de `./data`:

```ts
	fetchToolDeletionFacts,
```

Substituir o trecho de `actions.ts:498-509` (o `const [orderedForTool] = ...` inteiro, incluindo o `if` que devolve a mensagem de pedidos) por:

```ts
	const decision = resolveToolDeletion(await fetchToolDeletionFacts(id));
	if (!decision.allowed) {
		return { ok: false, error: decision.reason };
	}
```

O resto do corpo (`db.delete`, limpeza de imagens/vídeo, `logUserActivity`, `revalidatePath`) fica intacto. Remover do arquivo o import de `orderItem` **somente se** nenhuma outra função o usar — conferir com `grep -n "orderItem" apps/web/src/app/dashboard/tools/actions.ts` antes de mexer (o `deleteToolVariant` também usa).

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `bun --cwd apps/web test delete-tool-action`
Expected: PASS — 4 testes.

Run: `bun check-types`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/dashboard/tools/data.ts apps/web/src/app/dashboard/tools/actions.ts apps/web/src/app/dashboard/tools/__tests__/delete-tool-action.test.ts
git commit -m "fix(tools): bloquear exclusão com estoque ou review"
```

---

### Task 3: Detalhe da ferramenta entrega os fatos de exclusão

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/[id]/_lib/tool-detail-data.ts` (interface `ToolDetail` em `:92-108`, `Promise.all` em `:138-252`, retorno em `:256-277`)
- Modify: `apps/web/src/app/dashboard/tools/[id]/page.tsx:83-93` (props do `VariantsTab`)
- Modify: `apps/web/src/app/dashboard/tools/[id]/_components/variants-tab.tsx:43-52, 79-88` (props)

**Interfaces:**
- Consumes: `fetchToolDeletionFacts`, `ToolDeletionFacts` (Task 2).
- Produces: `ToolDetail.deletionFacts: ToolDeletionFacts` — o cliente calcula a decisão com `resolveToolDeletion` (Task 1), então servidor e UI nunca divergem.

- [ ] **Step 1: Adicionar o campo à interface `ToolDetail`**

Em `tool-detail-data.ts`, importar o tipo e a função:

```ts
import {
	fetchToolDeletionFacts,
	type ToolDeletionFacts,
} from "../../data";
```

e acrescentar o campo à interface `ToolDetail` (ordem alfabética, como o resto do arquivo — entre `categories` e `images`):

```ts
	deletionFacts: ToolDeletionFacts;
```

- [ ] **Step 2: Buscar os fatos junto do resto**

No `Promise.all` de `tool-detail-data.ts:148`, acrescentar como último item do array:

```ts
			fetchToolDeletionFacts(id),
```

e no destructuring de `:138-147`, acrescentar `deletionFacts` como último nome:

```ts
		const [
			categories,
			images,
			variants,
			attributes,
			stockRows,
			orderedRows,
			cartRows,
			stockedRows,
			branches,
			deletionFacts,
		] = await Promise.all([
```

No objeto de retorno (`:256`), acrescentar:

```ts
			deletionFacts,
```

- [ ] **Step 3: Passar para a aba de variantes**

Em `[id]/page.tsx`, no `<VariantsTab .../>` (`:83-92`), acrescentar as props (mantendo a ordem alfabética que o arquivo já segue):

```tsx
						deletionFacts={detail.deletionFacts}
						isArchived={detail.tool.status === "discontinued"}
```

Em `variants-tab.tsx`, acrescentar à interface `VariantsTabProps` e ao destructuring do componente:

```ts
	deletionFacts: ToolDeletionFacts;
	isArchived: boolean;
```

com o import de tipo:

```ts
import type { ToolDeletionFacts } from "../../data";
```

> `import type` de módulo `server-only` é seguro em Client Component — o tipo é apagado na compilação (regra documentada em `apps/web/CLAUDE.md`). Importar o **valor** `fetchToolDeletionFacts` aqui quebraria o build.

- [ ] **Step 4: Verificar tipos**

Run: `bun check-types`
Expected: sem erros. As props novas ainda não são usadas — o consumo entra na Task 5.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/tools/\[id\]/
git commit -m "feat(tools): expor fatos de exclusão no detalhe"
```

---

### Task 4: Action `archiveTool`

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/actions.ts` (nova action após `deleteTool`)
- Test: `apps/web/src/app/dashboard/tools/__tests__/archive-tool-action.test.ts` (criar)

**Interfaces:**
- Consumes: nada das tasks anteriores.
- Produces: `async function archiveTool(id: string): Promise<ActionResult>` — usada pelo dialog na Task 5.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/web/src/app/dashboard/tools/__tests__/archive-tool-action.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDbUpdate, mockLogActivity, mockSet, mockWhere } = vi.hoisted(() => {
	const mockWhere = vi.fn().mockResolvedValue(undefined);
	const mockSet = vi.fn(() => ({ where: mockWhere }));
	return {
		mockDbUpdate: vi.fn(() => ({ set: mockSet })),
		mockLogActivity: vi.fn().mockResolvedValue(undefined),
		mockSet,
		mockWhere,
	};
});

vi.mock("@emach/db", () => ({
	db: { update: mockDbUpdate, select: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/lib/permissions", () => ({
	requireCapability: vi.fn().mockResolvedValue({
		user: { id: "actor-1", name: "Admin Test", role: "admin" },
	}),
}));

vi.mock("@/lib/activity", () => ({ logUserActivity: mockLogActivity }));

vi.mock("@/lib/logger", () => ({
	logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("next/cache", () => ({
	revalidatePath: vi.fn(),
	revalidateTag: vi.fn(),
}));

vi.mock("../data", () => ({
	fetchToolDeletionFacts: vi.fn(),
	fetchToolsPage: vi.fn(),
	currentPrimaryCategoryId: vi.fn(),
	fetchDefinitionsBySlug: vi.fn(),
	primaryCategoryIncompleteError: vi.fn(),
}));

vi.mock("../_components/image-actions", () => ({
	deleteToolImage: vi.fn(),
	uploadToolImage: vi.fn(),
}));

vi.mock("../_components/video-actions", () => ({
	deleteToolVideoObject: vi.fn(),
}));

import { archiveTool } from "../actions";

beforeEach(() => {
	vi.clearAllMocks();
	mockWhere.mockResolvedValue(undefined);
});

describe("archiveTool", () => {
	it("marca discontinued e tira do site", async () => {
		const result = await archiveTool("tool-1");

		expect(result.ok).toBe(true);
		expect(mockSet).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "discontinued",
				visibleOnSite: false,
			})
		);
	});

	it("audita a ação", async () => {
		await archiveTool("tool-1");

		expect(mockLogActivity).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "tool.archived",
				actorUserId: "actor-1",
				targetId: "tool-1",
				targetType: "tool",
			})
		);
	});

	it("devolve erro amigável quando o banco falha", async () => {
		mockWhere.mockRejectedValueOnce(new Error("boom"));

		const result = await archiveTool("tool-1");

		expect(result.ok).toBe(false);
	});
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `bun --cwd apps/web test archive-tool-action`
Expected: FAIL — `archiveTool` não é exportada de `../actions`.

- [ ] **Step 3: Implementar a action**

Em `apps/web/src/app/dashboard/tools/actions.ts`, logo após o fim de `deleteTool`:

```ts
/**
 * Arquiva a ferramenta: sai do catálogo ativo e da vitrine, mas nada é
 * destruído. É a saída oferecida quando a exclusão está bloqueada (pedido,
 * avaliação ou estoque). Guardada por `tools.update` e não `tools.delete`
 * porque não destrói dado — `admin` também arquiva.
 *
 * NÃO mexe em estoque: quantidade é dado físico e zerar sem movimento de ajuste
 * deixaria buraco no ledger (mesma razão do guard de exclusão de variante, #335).
 */
export async function archiveTool(id: string): Promise<ActionResult> {
	const session = await requireCapability("tools.update");

	try {
		await db
			.update(tool)
			.set({
				status: "discontinued",
				visibleOnSite: false,
				updatedAt: new Date(),
			})
			.where(eq(tool.id, id));
	} catch (error) {
		logger.error("archiveTool falhou", error);
		return { ok: false, error: actionErrorMessage(error) };
	}

	await logUserActivity({
		actorUserId: session.user.id,
		action: "tool.archived",
		targetId: id,
		targetType: "tool",
	});
	revalidatePath(TOOLS_PATH);
	revalidatePath(`${TOOLS_PATH}/${id}`);
	return { ok: true, data: undefined };
}
```

Conferir antes de salvar: `tool` já está importado de `@emach/db/schema/tools` (`actions.ts:11`), `eq` de `drizzle-orm` (`:12`), `logUserActivity` (`:18`), `logger` (`:21`), `actionErrorMessage` (`:16`) e `TOOLS_PATH` (constante já usada por `deleteTool`). Se `tool.updatedAt` não existir no schema, remover a linha — checar com `grep -n "updatedAt" packages/db/src/schema/tools.ts`.

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `bun --cwd apps/web test archive-tool-action`
Expected: PASS — 3 testes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/tools/actions.ts apps/web/src/app/dashboard/tools/__tests__/archive-tool-action.test.ts
git commit -m "feat(tools): action de arquivar ferramenta"
```

---

### Task 5: Dialog de exclusão que explica o bloqueio

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/_components/delete-tool-dialog.tsx` (reescrita do componente)
- Modify: `apps/web/src/app/dashboard/tools/[id]/_components/variants-tab.tsx:141-165` (uso do dialog)

**Interfaces:**
- Consumes: `resolveToolDeletion`, `ToolDeletionDecision` (Task 1); `ToolDeletionFacts` via props (Task 3); `archiveTool` (Task 4); `deleteTool` (Task 2).
- Produces: `DeleteToolDialog` com as props `{ facts: ToolDeletionFacts; isArchived: boolean; toolId: string; toolName: string }` — a prop `disabledReason` deixa de existir.

Este é o conserto do defeito principal: hoje o motivo mora num `TooltipContent` cujo trigger é `<Button disabled>`, e elemento desabilitado não emite eventos de ponteiro — o tooltip nunca abre.

- [ ] **Step 1: Reescrever o dialog**

Substituir o conteúdo inteiro de `apps/web/src/app/dashboard/tools/_components/delete-tool-dialog.tsx` por:

```tsx
"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@emach/ui/components/alert-dialog";
import { Button } from "@emach/ui/components/button";
import { Spinner } from "@emach/ui/components/spinner";
import { Archive, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { notify } from "@/lib/notify";

import type { ToolDeletionFacts } from "../data";
import { archiveTool, deleteTool } from "../actions";
import { resolveToolDeletion } from "../_lib/tool-deletion";

interface DeleteToolDialogProps {
	facts: ToolDeletionFacts;
	isArchived: boolean;
	toolId: string;
	toolName: string;
}

export function DeleteToolDialog({
	facts,
	isArchived,
	toolId,
	toolName,
}: DeleteToolDialogProps) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [isPending, startTransition] = useTransition();
	const decision = resolveToolDeletion(facts);

	function handleDelete() {
		startTransition(async () => {
			const result = await deleteTool(toolId);
			if (result.ok) {
				notify.success("Ferramenta removida");
				setOpen(false);
				router.push("/dashboard/tools");
				router.refresh();
				return;
			}
			notify.error(result.error);
		});
	}

	function handleArchive() {
		startTransition(async () => {
			const result = await archiveTool(toolId);
			if (result.ok) {
				notify.success("Ferramenta arquivada");
				setOpen(false);
				router.refresh();
				return;
			}
			notify.error(result.error);
		});
	}

	const stockNote =
		facts.stockQty > 0
			? `Ainda há ${facts.stockQty} un em ${facts.stockBranchCount} ${
					facts.stockBranchCount > 1 ? "filiais" : "filial"
				} — o estoque não será alterado.`
			: null;

	return (
		<AlertDialog onOpenChange={setOpen} open={open}>
			<AlertDialogTrigger
				aria-label={`Excluir ferramenta ${toolName}`}
				render={<Button size="sm" variant="outline" />}
			>
				<Trash2 aria-hidden className="mr-1.5 size-3.5" />
				Excluir ferramenta
			</AlertDialogTrigger>
			<AlertDialogContent>
				{decision.allowed ? (
					<>
						<AlertDialogHeader>
							<AlertDialogTitle>Remover ferramenta?</AlertDialogTitle>
							<AlertDialogDescription>
								Esta ação não pode ser desfeita. A ferramenta{" "}
								<strong>{toolName}</strong> será removida permanentemente do
								sistema.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
							<AlertDialogAction
								disabled={isPending}
								onClick={(e) => {
									e.preventDefault();
									handleDelete();
								}}
							>
								{isPending ? (
									<>
										<Spinner /> Removendo…
									</>
								) : (
									"Remover"
								)}
							</AlertDialogAction>
						</AlertDialogFooter>
					</>
				) : (
					<>
						<AlertDialogHeader>
							<AlertDialogTitle>Não é possível excluir</AlertDialogTitle>
							<AlertDialogDescription>
								{decision.reason}
								{isArchived
									? " Esta ferramenta já está arquivada."
									: " Você pode arquivá-la: ela sai da listagem e do site, e nada é perdido."}
								{stockNote ? ` ${stockNote}` : ""}
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel disabled={isPending}>Fechar</AlertDialogCancel>
							{decision.suggestArchive && !isArchived ? (
								<AlertDialogAction
									disabled={isPending}
									onClick={(e) => {
										e.preventDefault();
										handleArchive();
									}}
								>
									{isPending ? (
										<>
											<Spinner /> Arquivando…
										</>
									) : (
										<>
											<Archive aria-hidden className="mr-1.5 size-3.5" />
											Arquivar ferramenta
										</>
									)}
								</AlertDialogAction>
							) : null}
						</AlertDialogFooter>
					</>
				)}
			</AlertDialogContent>
		</AlertDialog>
	);
}
```

Duas notas sobre esse arquivo:

- **React Compiler:** os dois handlers não têm `try/finally` nem `throw` no corpo — manter assim, senão o compiler baila no componente inteiro.
- **`import type { ToolDeletionFacts } from "../data"` precisa continuar sendo `import type`.** `data.ts` é `server-only` e puxa o driver do Postgres; importar um **valor** de lá num Client Component arrasta `pg` para o bundle do browser e quebra o build com `Can't resolve 'net'/'tls'` — e o `check-types` não pega isso, só o `next build`.

- [ ] **Step 2: Atualizar o uso na aba de variantes**

Em `variants-tab.tsx`, substituir o bloco `:141-165` (a "zona de perigo") por:

```tsx
				{canDelete && (
					<div className="rounded-[10px] border border-destructive/40 bg-destructive/5 p-4">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div>
								<p className="font-medium text-destructive text-sm">
									Excluir ferramenta
								</p>
								<p className="text-muted-foreground text-xs">
									Remove a ferramenta e todas as variantes. Não pode ser
									desfeito.
								</p>
							</div>
							<DeleteToolDialog
								facts={deletionFacts}
								isArchived={isArchived}
								toolId={toolId}
								toolName={toolName}
							/>
						</div>
					</div>
				)}
```

A variável local `toolHasOrders` (`:108`) deixa de ser usada pelo dialog — removê-la se nenhum outro trecho a consumir (`grep -n "toolHasOrders" apps/web/src/app/dashboard/tools/\[id\]/_components/variants-tab.tsx`).

A frase "e seus estoques por filial também" saiu do texto de confirmação de propósito: com a Task 2, estoque > 0 bloqueia a exclusão, então a frase virou mentira.

- [ ] **Step 3: Verificar tipos e lint**

Run: `bun check-types && bun check`
Expected: sem erros. Se o `bun check` reclamar de `useAwait` ou nested ternary no JSX, revisar — a régua do CI é o `bun check`, não só o `tsc`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/tools/_components/delete-tool-dialog.tsx apps/web/src/app/dashboard/tools/\[id\]/_components/variants-tab.tsx
git commit -m "fix(tools): dialog explica bloqueio de exclusão"
```

---

### Task 6: Cadeado de variante com motivo alcançável

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/[id]/_components/variants-tab.tsx:392-405` (`DisabledDeleteIcon`)

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: nada consumido por tasks posteriores.

Mesmo defeito do dialog, um nível abaixo: o `TooltipTrigger` renderiza um `<Button disabled>` e o motivo do cadeado nunca aparece no hover. A correção mínima é envolver o botão desabilitado num `<span>` que recebe o trigger — o span emite eventos de ponteiro normalmente e, com `tabIndex={0}`, o motivo também fica alcançável por teclado.

- [ ] **Step 1: Trocar o trigger do tooltip**

Substituir a função `DisabledDeleteIcon` por:

```tsx
function DisabledDeleteIcon({ reason }: { reason: string }) {
	return (
		<Tooltip>
			{/* O trigger é o <span>, não o botão: elemento `disabled` não emite
			    eventos de ponteiro e o tooltip nunca abriria. */}
			<TooltipTrigger
				render={
					<span
						aria-label={reason}
						className="inline-flex"
						role="note"
						tabIndex={0}
					/>
				}
			>
				<Button disabled size="icon-sm" variant="ghost">
					<Lock aria-hidden className="size-3.5 text-muted-foreground" />
				</Button>
			</TooltipTrigger>
			<TooltipContent>{reason}</TooltipContent>
		</Tooltip>
	);
}
```

- [ ] **Step 2: Verificar tipos e lint**

Run: `bun check-types && bun check`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/tools/\[id\]/_components/variants-tab.tsx
git commit -m "fix(tools): mostrar motivo do cadeado de variante"
```

> A prova de que o tooltip realmente abre é manual (hover) — está na Task 8, passo 3.

---

### Task 7: Listagem esconde arquivadas por padrão

**Files:**
- Modify: `apps/web/src/app/dashboard/tools/_lib/tool-query-helpers.ts` (acrescentar helper puro ao fim)
- Modify: `apps/web/src/app/dashboard/tools/data.ts:122-131` (bloco do filtro de status)
- Modify: `apps/web/src/app/dashboard/tools/_components/tool-filters.tsx:169-200` (opções do Select)
- Test: `apps/web/src/app/dashboard/tools/_lib/__tests__/tool-status-filter.test.ts` (criar)

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces:
  - `const ARCHIVED_TOOL_STATUS = "discontinued"`
  - `type ToolStatusFilter = { kind: "in"; statuses: string[] } | { kind: "exclude-archived" }`
  - `function resolveToolStatusFilter(raw?: string): ToolStatusFilter`

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/web/src/app/dashboard/tools/_lib/__tests__/tool-status-filter.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveToolStatusFilter } from "../tool-query-helpers";

describe("resolveToolStatusFilter", () => {
	it("sem filtro, exclui as arquivadas", () => {
		expect(resolveToolStatusFilter(undefined)).toEqual({
			kind: "exclude-archived",
		});
	});

	it("string vazia conta como sem filtro", () => {
		expect(resolveToolStatusFilter("")).toEqual({ kind: "exclude-archived" });
	});

	it("um status explícito é respeitado", () => {
		expect(resolveToolStatusFilter("draft")).toEqual({
			kind: "in",
			statuses: ["draft"],
		});
	});

	it("lista separada por vírgula traz todos, inclusive arquivadas", () => {
		expect(resolveToolStatusFilter("active,draft,discontinued")).toEqual({
			kind: "in",
			statuses: ["active", "draft", "discontinued"],
		});
	});

	it("ignora espaços e itens vazios", () => {
		expect(resolveToolStatusFilter(" active , ,draft ")).toEqual({
			kind: "in",
			statuses: ["active", "draft"],
		});
	});
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `bun --cwd apps/web test tool-status-filter`
Expected: FAIL — `resolveToolStatusFilter` não é exportada.

- [ ] **Step 3: Implementar o helper**

Acrescentar ao fim de `apps/web/src/app/dashboard/tools/_lib/tool-query-helpers.ts`:

```ts
/** Status que representa "arquivada" no catálogo (ver ADR do design 2026-08-11). */
export const ARCHIVED_TOOL_STATUS = "discontinued";

export type ToolStatusFilter =
	| { kind: "in"; statuses: string[] }
	| { kind: "exclude-archived" };

/**
 * Sem filtro explícito de status, a listagem esconde as arquivadas — é o que
 * torna "arquivar" uma saída de verdade para ferramenta que não pode ser
 * excluída. Com filtro, o usuário mandou e o filtro vale como escrito.
 */
export function resolveToolStatusFilter(raw?: string): ToolStatusFilter {
	const statuses = (raw ?? "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	if (statuses.length === 0) {
		return { kind: "exclude-archived" };
	}
	return { kind: "in", statuses };
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `bun --cwd apps/web test tool-status-filter`
Expected: PASS — 5 testes.

- [ ] **Step 5: Usar o helper na query da listagem**

Em `apps/web/src/app/dashboard/tools/data.ts`, importar do helper:

```ts
import {
	ARCHIVED_TOOL_STATUS,
	resolveToolStatusFilter,
} from "./_lib/tool-query-helpers";
```

e substituir o bloco `:122-131` inteiro por:

```ts
	const statusFilter = resolveToolStatusFilter(filters.status);
	if (statusFilter.kind === "in") {
		const placeholders = sql.join(
			statusFilter.statuses.map((s) => sql`${s}`),
			sql`, `
		);
		whereParts.push(sql`t.status IN (${placeholders})`);
	} else {
		whereParts.push(sql`t.status <> ${ARCHIVED_TOOL_STATUS}`);
	}
```

- [ ] **Step 6: Ajustar as opções do filtro na UI**

Em `apps/web/src/app/dashboard/tools/_components/tool-filters.tsx`, acrescentar perto das constantes do topo (`:31-46`):

```ts
const ALL_WITH_ARCHIVED = "active,draft,discontinued";
```

e substituir o `<SelectValue>` + `<SelectGroup>` do bloco de status (`:178-199`) por:

```tsx
						<SelectValue>
							{(v: string) => {
								if (v === ALL) {
									return "Ativas e rascunhos";
								}
								if (v === ALL_WITH_ARCHIVED) {
									return "Todas (com arquivadas)";
								}
								return (
									TOOL_STATUS_LABELS[
										v as (typeof TOOL_STATUS_OPTIONS)[number]
									] ?? v
								);
							}}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							<SelectItem value={ALL}>Ativas e rascunhos</SelectItem>
							<SelectItem value={ALL_WITH_ARCHIVED}>
								Todas (com arquivadas)
							</SelectItem>
							{TOOL_STATUS_OPTIONS.map((s) => (
								<SelectItem key={s} value={s}>
									{TOOL_STATUS_LABELS[s]}
								</SelectItem>
							))}
						</SelectGroup>
```

O rótulo do valor padrão deixa de ser "Todos" porque ele passou a esconder as arquivadas — chamá-lo de "Todos" seria mentir para o usuário.

- [ ] **Step 7: Rodar a suíte e os tipos**

Run: `bun --cwd apps/web test && bun check-types && bun check`
Expected: tudo verde.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/dashboard/tools/_lib/tool-query-helpers.ts apps/web/src/app/dashboard/tools/_lib/__tests__/tool-status-filter.test.ts apps/web/src/app/dashboard/tools/data.ts apps/web/src/app/dashboard/tools/_components/tool-filters.tsx
git commit -m "feat(tools): esconder arquivadas da listagem"
```

---

### Task 8: Smoke run-time e prova perceptual

**Files:** nenhum arquivo de produção alterado — esta task é o gate de "pronto" do `CLAUDE.md` (funcional + perceptual + dados).

**Interfaces:**
- Consumes: tudo das Tasks 1-7.
- Produces: nada.

> ⚠️ **Restrições de banco — leia antes de qualquer query** (o executor desta task pode ser um subagente que não herda o `CLAUDE.md`):
> 1. O Supabase deste repo é **único e compartilhado (dev = prod = e-commerce)**. NUNCA `seed`/`truncate`/`drop`/reset/`db:push` destrutivo sem autorização explícita do usuário nesta sessão.
> 2. Write pontual de poucas linhas é permitido para fabricar estado de smoke — **guardar o id e reverter ao terminar** (deletar o que criou).

- [ ] **Step 1: Subir o servidor**

Run: `bun dev:web` (ou reaproveitar o servidor já rodando na porta desta sessão) e abrir `/dashboard/tools`.
Expected: a listagem carrega sem erro no log.

- [ ] **Step 2: Provar o caminho bloqueado (dados reais, sem escrever nada)**

Abrir `/dashboard/tools/b9bbf9b0-7771-4e4a-a745-f82de4b94fbc?tab=variantes` — a "Ferramenta de teste" tem 4 pedidos (`EM-TEST-9102` a `9105`) e 90 un de estoque.
Clicar em **Excluir ferramenta**.
Expected: o dialog abre (o botão não fica mais inerte) e o texto nomeia os **4 pedidos**, oferecendo **Arquivar ferramenta**.

- [ ] **Step 3: Provar o cadeado da variante**

Na mesma aba, passar o mouse sobre o cadeado 🔒 de uma das linhas.
Expected: aparece "Tem estoque em filial — zere o estoque antes de excluir." Antes desta mudança o tooltip não abria.

- [ ] **Step 4: Provar o arquivamento**

No dialog, clicar em **Arquivar ferramenta**.
Expected: toast "Ferramenta arquivada"; o header passa a mostrar o badge **Descontinuada**; em `/dashboard/tools` sem filtro a ferramenta **não aparece**; com o filtro Status = "Todas (com arquivadas)" ela **aparece**.

- [ ] **Step 5: Reverter o estado do dado**

A ferramenta era `active` + visível. Devolver ao estado original pelo próprio app (editar → Status "Ativo" + visível no site) ou, se preferir SQL, uma única linha:

```sql
UPDATE tool SET status = 'active', visible_on_site = true
WHERE id = 'b9bbf9b0-7771-4e4a-a745-f82de4b94fbc';
```

Expected: a ferramenta volta a aparecer na listagem padrão.

- [ ] **Step 6: Provar o caminho livre (exclusão de verdade)**

Criar pela UI (`/dashboard/tools/new`) uma ferramenta `draft` descartável — sem estoque, sem pedido, sem avaliação — e excluí-la pela zona de perigo.
Expected: dialog "Remover ferramenta?" (sem a frase sobre estoques), toast "Ferramenta removida", redirect para `/dashboard/tools`, e a ferramenta some. Isso também limpa o que foi criado, sem sobra.

- [ ] **Step 7: Screenshots (prova perceptual)**

Capturar dois screenshots do dialog: o bloqueado (com o motivo e o botão de arquivar) e o livre (confirmação). Comparar com um dialog destrutivo irmão já existente (ex: `users/_components/destructive-action-dialog.tsx`) para conferir consistência visual.

- [ ] **Step 8: Gate final**

Run: `bun verify`
Expected: `check-types`, `check` e a suíte de testes verdes.

- [ ] **Step 9: Commit**

Nada de produção mudou nesta task; se algum ajuste de UI saiu do smoke, commitar junto com mensagem própria — por exemplo:

```bash
git add -A
git commit -m "fix(tools): ajustes do smoke de exclusão"
```

---

## Cobertura do spec

| Requisito do spec | Task |
|---|---|
| D1 — arquivar reusa `discontinued` | 4, 7 |
| D2 — arquivar não altera estoque | 4 (comentário + ausência de write em estoque), 5 (aviso no dialog) |
| D3 — excluir com estoque passa a bloquear | 1, 2 |
| D4 — fonte única da decisão (`resolveToolDeletion`) | 1, 2, 3, 5 |
| D5 — `archiveTool` sob `tools.update`, seta status + `visibleOnSite` | 4 |
| D6 — listagem esconde arquivadas, filtro traz de volta | 7 |
| Problema 1 — bloqueio mudo (ferramenta) | 5 |
| Problema 1 — bloqueio mudo (variante) | 6 |
| Problema 2 — assimetria de estoque | 1, 2 |
| Problema 3 — review estourando FK crua | 1, 2 |
| Problema 4 — não existe arquivar | 4, 5, 7 |
| Verificação (testes, smoke, prova perceptual) | 1, 2, 4, 7, 8 |
