# Moderação de reviews em lote — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir aprovar / rejeitar / marcar como spam N avaliações de uma vez na listagem `/dashboard/reviews`, sem abrir cada uma.

**Architecture:** Uma server action nova (`bulkModerateReviews`) executa **um único** `UPDATE ... WHERE id IN (...) RETURNING id` — reviews são globais (sem branch-scoping), então basta um `requireCapability("reviews.moderate")` antes da query. A listagem ganha a infra de seleção que já existe e roda em Clientes/Pedidos (`useBulkSelection` + `SelectableItem` + `SelectionToolbar` + `BulkActionBar`), mais um dialog de confirmação que coleta a nota de moderação quando o status exige.

**Tech Stack:** Next 16 / React 19 (Server Actions), Drizzle ORM, Zod, Vitest (`environment: node`), Base UI (`@emach/ui`), sonner (`notify`).

**Spec:** `docs/superpowers/specs/2026-07-14-bulk-moderate-reviews-design.md`. **Issue:** [#308](https://github.com/othavi0/emach-dashboard/issues/308).

## Global Constraints

Valem para **todas** as tasks. Fonte: `CLAUDE.md` (raiz) e `apps/web/CLAUDE.md`.

- **CWD é a RAIZ do monorepo** (turbo/bun). Nunca `cd apps/web`; usar paths absolutos.
- **NÃO tocar no banco.** O Supabase deste repo é único e compartilhado (dev = prod = e-commerce). Nenhum `seed`/`truncate`/`drop`/`db:push`/`db:sync` — este plano não altera schema de banco.
- **`Read` cada arquivo antes de `Edit`** (`cat`/`sed`/`head` não contam para o harness). Se um `Edit` falhar com `string not found`, re-`Read` antes de re-tentar — o hook PostToolUse roda `bun fix` e pode reformatar o arquivo.
- **Proibido:** `console.log/warn/error` (usar `logger` de `@/lib/logger`), `: any`/`as any`/`@ts-ignore`, `key={index}`, `useMemo`/`useCallback` manuais (React Compiler ativo), `.forEach()` em hot path, `React.forwardRef`.
- **React Compiler:** nunca `try { } finally { }` num handler — o compiler baila. Cleanup no fim do `try` + duplicado no `catch`.
- **Erro de validação em form:** `aria-invalid` no controle + `<FieldError>` de `@/components/field-error`. **Nunca** `<p className="text-destructive">{errors.x}</p>` cru — a regra ast-grep `raw-validation-error` falha o CI (`bun guard:forms`).
- **Arquivo `"use server"` só pode exportar async function.** Tipos e constantes vão para `schema.ts` (não é `"use server"`). Isso **não** é pego por `check-types`/lint — só pelo `build`.
- **Toda server action** começa com `await requireCapability(cap)` e devolve `ActionResult<T>` (`{ ok: true; data } | { ok: false; error }`), com `safeParse` do Zod na entrada.
- Commits: Conventional Commits **em PT**, subject ≤50 chars. **Zero atribuição de AI** em qualquer texto (commit, PR, comentário).
- Branch: `feat/308-bulk-moderate-reviews`. Não pushar nem abrir PR sem instrução explícita.

**Comandos:**

| Propósito | Comando | Esperado |
|---|---|---|
| Typecheck | `bun check-types` | exit 0 |
| Lint | `bun check` | exit 0 |
| Testes | `bun --cwd apps/web test` | exit 0 |
| Os três acima | `bun verify` | exit 0 |
| Guard de forms | `bun guard:forms` | exit 0 |
| Build (gate após mexer em `"use server"`) | `bun run --cwd apps/web build` | exit 0 |
| Smoke | `bun dev:web` + `/dashboard/reviews` | sem erro de runtime |

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `apps/web/src/app/dashboard/reviews/schema.ts` (modificar) | `BULK_MODERATE_LIMIT`, `bulkModerateReviewsSchema`, tipos `BulkModerateReviewsInput`, `BulkModerateStatus`, `BulkModerateResult` |
| `apps/web/src/app/dashboard/reviews/actions.ts` (modificar) | Server action `bulkModerateReviews` |
| `apps/web/src/app/dashboard/reviews/__tests__/bulk-moderate.test.ts` (criar) | Testes unitários da action |
| `apps/web/src/app/dashboard/reviews/_components/bulk-moderate-dialog.tsx` (criar) | Dialog de confirmação + nota + toasts |
| `apps/web/src/app/dashboard/reviews/_components/reviews-infinite.tsx` (modificar) | Fiação: seleção, barra de ações, remoção otimista dos cards moderados |
| `apps/web/src/app/dashboard/orders/actions.ts` (modificar) | Comentário de design de `bulkAssignBranch` (sem código) |

---

### Task 1: Schema + server action `bulkModerateReviews`

**Files:**
- Modify: `apps/web/src/app/dashboard/reviews/schema.ts` (append ao final)
- Modify: `apps/web/src/app/dashboard/reviews/actions.ts` (imports + append ao final)
- Test: `apps/web/src/app/dashboard/reviews/__tests__/bulk-moderate.test.ts` (criar)

**Interfaces:**
- Consumes: `requireCapability` (`@/lib/permissions`), `getPgError` (`@/lib/db-error`), `logger` (`@/lib/logger`), `db` (`@emach/db`), `review` (`@emach/db/schema/reviews`), `ActionResult` (`@/lib/action-result`).
- Produces (usado pelas Tasks 2 e 3):
  - `BULK_MODERATE_LIMIT: 50` — de `./schema`
  - `type BulkModerateStatus = "approved" | "rejected" | "spam"` — de `./schema`
  - `type BulkModerateReviewsInput = { reviewIds: string[]; status: BulkModerateStatus; moderationNote?: string }` — de `./schema`
  - `interface BulkModerateResult { moderatedIds: string[]; stale: number; succeeded: number }` — de `./schema`
  - `bulkModerateReviews(input: BulkModerateReviewsInput): Promise<ActionResult<BulkModerateResult>>` — de `./actions`

> **Por que `BulkModerateResult` mora em `schema.ts` e não em `actions.ts`:** `actions.ts` é `"use server"` e só pode exportar async functions. Exportar interface/const de lá quebra o `build` (e nem `check-types` nem `bun check` pegam isso).

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/web/src/app/dashboard/reviews/__tests__/bulk-moderate.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — precisam existir antes das factories de vi.mock
// ---------------------------------------------------------------------------

const { mockDbUpdate, mockRequireCapability, mockLoggerError, mockRevalidatePath } =
	vi.hoisted(() => ({
		mockDbUpdate: vi.fn(),
		mockRequireCapability: vi.fn(),
		mockLoggerError: vi.fn(),
		mockRevalidatePath: vi.fn(),
	}));

vi.mock("@emach/db", () => ({
	db: { update: mockDbUpdate },
}));

vi.mock("@/lib/permissions", () => ({
	requireCapability: mockRequireCapability,
}));

vi.mock("@/lib/logger", () => ({
	logger: { error: mockLoggerError, info: vi.fn(), warn: vi.fn() },
}));

vi.mock("next/cache", () => ({
	revalidatePath: mockRevalidatePath,
	revalidateTag: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import depois dos mocks
// ---------------------------------------------------------------------------

import { bulkModerateReviews } from "../actions";
import { BULK_MODERATE_LIMIT } from "../schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";
const ID_C = "33333333-3333-4333-8333-333333333333";

/** Captura o objeto passado ao .set() para assertions sobre o payload. */
const setSpy = vi.fn();

/**
 * db.update(review).set({...}).where(...).returning({ id }) → linhas.
 * `rows` são as linhas que o RETURNING devolve (o que foi de fato moderado).
 */
function setupUpdate(rows: Array<{ id: string }>) {
	mockDbUpdate.mockReturnValue({
		set: (payload: unknown) => {
			setSpy(payload);
			return {
				where: () => ({
					returning: () => Promise.resolve(rows),
				}),
			};
		},
	});
}

/** db.update lança — simula erro de banco. */
function setupUpdateThrows(error: unknown) {
	mockDbUpdate.mockReturnValue({
		set: () => ({
			where: () => ({
				returning: () => Promise.reject(error),
			}),
		}),
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	setSpy.mockClear();
	mockRequireCapability.mockResolvedValue({
		user: { id: "actor-1", name: "Admin Test", role: "admin" },
	});
});

describe("bulkModerateReviews", () => {
	it("modera o lote inteiro e reporta succeeded sem stale", async () => {
		setupUpdate([{ id: ID_A }, { id: ID_B }, { id: ID_C }]);

		const result = await bulkModerateReviews({
			reviewIds: [ID_A, ID_B, ID_C],
			status: "approved",
		});

		expect(result).toEqual({
			ok: true,
			data: {
				moderatedIds: [ID_A, ID_B, ID_C],
				stale: 0,
				succeeded: 3,
			},
		});
		expect(mockRequireCapability).toHaveBeenCalledExactlyOnceWith(
			"reviews.moderate"
		);
		expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard/reviews");
	});

	it("exige nota de moderação ao rejeitar", async () => {
		const result = await bulkModerateReviews({
			reviewIds: [ID_A],
			status: "rejected",
		});

		expect(result).toEqual({
			ok: false,
			error: "Nota de moderação obrigatória ao rejeitar ou marcar como spam",
		});
		expect(mockDbUpdate).not.toHaveBeenCalled();
	});

	it("exige nota de moderação ao marcar como spam", async () => {
		const result = await bulkModerateReviews({
			reviewIds: [ID_A],
			status: "spam",
			moderationNote: "   ",
		});

		expect(result.ok).toBe(false);
		expect(mockDbUpdate).not.toHaveBeenCalled();
	});

	it("aceita rejeição com nota e grava a nota no set", async () => {
		setupUpdate([{ id: ID_A }]);

		const result = await bulkModerateReviews({
			reviewIds: [ID_A],
			status: "rejected",
			moderationNote: "  conteúdo ofensivo  ",
		});

		expect(result.ok).toBe(true);
		expect(setSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				status: "rejected",
				moderatedBy: "actor-1",
				moderationNote: "conteúdo ofensivo",
			})
		);
	});

	it("não sobrescreve a nota existente ao aprovar sem nota", async () => {
		setupUpdate([{ id: ID_A }]);

		await bulkModerateReviews({ reviewIds: [ID_A], status: "approved" });

		expect(setSpy).toHaveBeenCalledWith(
			expect.not.objectContaining({ moderationNote: expect.anything() })
		);
	});

	it("rejeita lote vazio", async () => {
		const result = await bulkModerateReviews({
			reviewIds: [],
			status: "approved",
		});

		expect(result).toEqual({
			ok: false,
			error: "Selecione ao menos 1 avaliação",
		});
		expect(mockDbUpdate).not.toHaveBeenCalled();
	});

	it("rejeita lote acima do limite", async () => {
		const tooMany = Array.from(
			{ length: BULK_MODERATE_LIMIT + 1 },
			(_unused, i) => `44444444-4444-4444-8444-${String(i).padStart(12, "0")}`
		);

		const result = await bulkModerateReviews({
			reviewIds: tooMany,
			status: "approved",
		});

		expect(result).toEqual({
			ok: false,
			error: `Limite de ${BULK_MODERATE_LIMIT} avaliações por operação`,
		});
		expect(mockDbUpdate).not.toHaveBeenCalled();
	});

	it("reporta stale quando o RETURNING devolve menos linhas que o pedido", async () => {
		setupUpdate([{ id: ID_A }]);

		const result = await bulkModerateReviews({
			reviewIds: [ID_A, ID_B, ID_C],
			status: "approved",
		});

		expect(result).toEqual({
			ok: true,
			data: { moderatedIds: [ID_A], stale: 2, succeeded: 1 },
		});
	});

	it("falha quando nenhuma linha foi afetada", async () => {
		setupUpdate([]);

		const result = await bulkModerateReviews({
			reviewIds: [ID_A],
			status: "approved",
		});

		expect(result).toEqual({
			ok: false,
			error: "Nenhuma avaliação foi moderada",
		});
	});

	it("loga e devolve erro genérico quando o banco falha", async () => {
		setupUpdateThrows(new Error("connection terminated"));

		const result = await bulkModerateReviews({
			reviewIds: [ID_A],
			status: "approved",
		});

		expect(result).toEqual({
			ok: false,
			error: "Erro ao moderar avaliações",
		});
		expect(mockLoggerError).toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
bun --cwd apps/web test bulk-moderate
```

Esperado: FAIL — `bulkModerateReviews` / `BULK_MODERATE_LIMIT` não existem (erro de import/transform).

- [ ] **Step 3: Adicionar schema, limite e tipos em `schema.ts`**

`Read` o arquivo, depois **anexar ao final** de `apps/web/src/app/dashboard/reviews/schema.ts`:

```ts
/**
 * Teto de itens por lote. BATCH_SIZE da listagem é 20 (`src/lib/infinite.ts`),
 * então "selecionar todos os carregados" cresce de 20 em 20 — 50 cobre 2 páginas
 * cheias e mantém a payload da server action trivial (~1,8 KB de UUIDs).
 */
export const BULK_MODERATE_LIMIT = 50;

export const bulkModerateReviewsSchema = z
	.object({
		reviewIds: z
			.array(z.string().uuid())
			.min(1, "Selecione ao menos 1 avaliação")
			.max(
				BULK_MODERATE_LIMIT,
				`Limite de ${BULK_MODERATE_LIMIT} avaliações por operação`
			),
		status: z.enum(["approved", "rejected", "spam"]),
		moderationNote: z.string().max(1000).optional(),
	})
	.superRefine((data, ctx) => {
		if (
			(data.status === "rejected" || data.status === "spam") &&
			!data.moderationNote?.trim()
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message:
					"Nota de moderação obrigatória ao rejeitar ou marcar como spam",
				path: ["moderationNote"],
			});
		}
	});

export type BulkModerateReviewsInput = z.infer<typeof bulkModerateReviewsSchema>;
export type BulkModerateStatus = BulkModerateReviewsInput["status"];

/**
 * Resultado do lote. `stale` = IDs selecionados que o UPDATE não afetou (a
 * avaliação sumiu ou mudou entre a seleção e o submit). Mora aqui, e não em
 * `actions.ts`, porque arquivo "use server" só pode exportar async function.
 */
export interface BulkModerateResult {
	moderatedIds: string[];
	stale: number;
	succeeded: number;
}
```

- [ ] **Step 4: Escrever a action em `actions.ts`**

`Read` o arquivo. Trocar o bloco de imports do topo por:

```ts
"use server";

import { db } from "@emach/db";
import { review } from "@emach/db/schema/reviews";
import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/lib/action-result";
import { getPgError } from "@/lib/db-error";
import type { InfiniteResult } from "@/lib/infinite";
import { logger } from "@/lib/logger";
import { requireCapability } from "@/lib/permissions";
import { listReviews, type ReviewListItem } from "./data";
import {
	type BulkModerateReviewsInput,
	type BulkModerateResult,
	bulkModerateReviewsSchema,
	type ModerateReviewInput,
	moderateReviewSchema,
	type ReviewsListFiltersParsed,
} from "./schema";
import { REVIEW_TABS } from "./status-meta";
```

E **anexar ao final** do arquivo:

```ts
/**
 * Modera N avaliações num único UPDATE ... WHERE id IN (...) RETURNING id.
 * Reviews são globais (sem branch-scoping): um requireCapability antes da query
 * basta — não há autorização por item a fazer. As linhas devolvidas pelo
 * RETURNING são a verdade sobre o que foi moderado; o que não voltou é `stale`.
 */
export async function bulkModerateReviews(
	input: BulkModerateReviewsInput
): Promise<ActionResult<BulkModerateResult>> {
	const parsed = bulkModerateReviewsSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "Entrada inválida",
		};
	}

	const session = await requireCapability("reviews.moderate");
	const { reviewIds, status, moderationNote } = parsed.data;
	const note = moderationNote?.trim();

	try {
		const moderated = await db
			.update(review)
			.set({
				status,
				moderatedBy: session.user.id,
				moderatedAt: new Date(),
				// Sem nota (caso da aprovação) → a coluna não entra no SET: aprovar em
				// lote não apaga a nota de moderação anterior.
				...(note ? { moderationNote: note } : {}),
			})
			.where(inArray(review.id, reviewIds))
			.returning({ id: review.id });

		revalidatePath(REVIEWS_PATH);

		if (moderated.length === 0) {
			return { ok: false, error: "Nenhuma avaliação foi moderada" };
		}

		return {
			ok: true,
			data: {
				moderatedIds: moderated.map((row) => row.id),
				stale: reviewIds.length - moderated.length,
				succeeded: moderated.length,
			},
		};
	} catch (error) {
		const pg = getPgError(error);
		logger.error("bulkModerateReviews", { err: error, code: pg?.code });
		return { ok: false, error: "Erro ao moderar avaliações" };
	}
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

```bash
bun --cwd apps/web test bulk-moderate
```

Esperado: PASS — 10 testes verdes.

- [ ] **Step 6: Typecheck + lint + build**

```bash
bun check-types --force
bun check
bun run --cwd apps/web build
```

Esperado: os três exit 0. O `build` é o **único** gate que pega export não-async em arquivo `"use server"` — não pular.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/dashboard/reviews/schema.ts \
        apps/web/src/app/dashboard/reviews/actions.ts \
        apps/web/src/app/dashboard/reviews/__tests__/bulk-moderate.test.ts
git commit -m "feat(reviews): modera avaliações em lote"
```

---

### Task 2: Dialog de confirmação `BulkModerateDialog`

**Files:**
- Create: `apps/web/src/app/dashboard/reviews/_components/bulk-moderate-dialog.tsx`

**Interfaces:**
- Consumes: `bulkModerateReviews` (`../actions`), `BulkModerateStatus` (`../schema`), `FieldError` (`@/components/field-error`), `notify` (`@/lib/notify`), `Dialog*`/`Button`/`Textarea`/`Spinner` (`@emach/ui`).
- Produces (usado pela Task 3):
  ```ts
  interface BulkModerateDialogProps {
    count: number;
    onClose: () => void;
    onSuccess: (moderatedIds: string[]) => void;
    reviewIds: string[];
    status: BulkModerateStatus;
  }
  export function BulkModerateDialog(props: BulkModerateDialogProps): JSX.Element
  ```
  O dialog é renderizado só quando aberto (a Task 3 monta/desmonta), então não há prop `open` — internamente ele passa `open` fixo ao `Dialog` e chama `onClose` no `onOpenChange(false)`.

Não há teste automatizado desta task (é UI; a suíte roda `environment: node`, sem testing-library). A verificação é o smoke da Task 3 mais `check-types`/`check`/`guard:forms`.

- [ ] **Step 1: Criar o componente**

Criar `apps/web/src/app/dashboard/reviews/_components/bulk-moderate-dialog.tsx`:

```tsx
"use client";

import { Button } from "@emach/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@emach/ui/components/dialog";
import { Spinner } from "@emach/ui/components/spinner";
import { Textarea } from "@emach/ui/components/textarea";
import { useState, useTransition } from "react";

import { FieldError } from "@/components/field-error";
import { notify } from "@/lib/notify";

import { bulkModerateReviews } from "../actions";
import type { BulkModerateStatus } from "../schema";

interface BulkModerateDialogProps {
	count: number;
	onClose: () => void;
	onSuccess: (moderatedIds: string[]) => void;
	reviewIds: string[];
	status: BulkModerateStatus;
}

const ACTION_LABELS: Record<BulkModerateStatus, string> = {
	approved: "Aprovar",
	rejected: "Rejeitar",
	spam: "Marcar como spam",
};

function isNoteRequired(status: BulkModerateStatus) {
	return status === "rejected" || status === "spam";
}

function plural(count: number) {
	return count === 1 ? "avaliação" : "avaliações";
}

export function BulkModerateDialog({
	count,
	onClose,
	onSuccess,
	reviewIds,
	status,
}: BulkModerateDialogProps) {
	const [note, setNote] = useState("");
	const [noteError, setNoteError] = useState<string | undefined>(undefined);
	const [isPending, startTransition] = useTransition();

	const noteRequired = isNoteRequired(status);

	function handleConfirm() {
		const trimmed = note.trim();
		if (noteRequired && !trimmed) {
			setNoteError("Informe a nota ao rejeitar ou marcar como spam");
			return;
		}
		setNoteError(undefined);

		startTransition(async () => {
			const result = await bulkModerateReviews({
				reviewIds,
				status,
				moderationNote: trimmed || undefined,
			});

			if (!result.ok) {
				// Dialog segue aberto: o usuário pode corrigir e tentar de novo.
				notify.error(result.error);
				return;
			}

			const { moderatedIds, stale, succeeded } = result.data;
			if (stale > 0) {
				notify.warning(
					`${succeeded} ${plural(succeeded)} moderada(s); ${stale} já não estava(m) disponível(is)`
				);
			} else {
				notify.success(`${succeeded} ${plural(succeeded)} moderada(s)`);
			}
			onSuccess(moderatedIds);
		});
	}

	return (
		<Dialog onOpenChange={(value) => !value && onClose()} open>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{ACTION_LABELS[status]} {count} {plural(count)}?
					</DialogTitle>
					<DialogDescription>
						A ação será aplicada a todas as avaliações selecionadas.
					</DialogDescription>
				</DialogHeader>

				{noteRequired ? (
					<div className="space-y-1">
						<label
							className="text-muted-foreground text-xs"
							htmlFor="bulk-moderation-note"
						>
							Nota de moderação (obrigatória)
						</label>
						<Textarea
							aria-invalid={noteError ? true : undefined}
							id="bulk-moderation-note"
							onChange={(event) => setNote(event.target.value)}
							placeholder="Explique a decisão para registro interno…"
							value={note}
						/>
						<FieldError>{noteError}</FieldError>
					</div>
				) : null}

				<DialogFooter>
					<Button disabled={isPending} onClick={onClose} variant="ghost">
						Cancelar
					</Button>
					<Button
						disabled={isPending}
						onClick={handleConfirm}
						variant={status === "approved" ? "default" : "destructive"}
					>
						{isPending ? (
							<>
								<Spinner /> Moderando…
							</>
						) : (
							`${ACTION_LABELS[status]} (${count})`
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
```

- [ ] **Step 2: Typecheck, lint e guard de forms**

```bash
bun check-types --force
bun check
bun guard:forms
```

Esperado: os três exit 0. `guard:forms` confirma que o erro da nota está dentro de `<FieldError>`, não num `<p>` cru.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/reviews/_components/bulk-moderate-dialog.tsx
git commit -m "feat(reviews): dialog de moderação em lote"
```

---

### Task 3: Fiar seleção em lote em `reviews-infinite.tsx`

**Files:**
- Modify: `apps/web/src/app/dashboard/reviews/_components/reviews-infinite.tsx`

**Interfaces:**
- Consumes: `BulkModerateDialog` (Task 2), `useBulkSelection` (`@/lib/use-bulk-selection`), `SelectionToolbar`/`SelectableItem`/`BulkActionBar` (`@/components/bulk/*`), `useInfiniteList` (`@/lib/use-infinite-list` — expõe `removeItem(predicate)`), `BulkModerateStatus` (`../schema`).
- Produces: nada (folha da árvore).

**O ponto crítico desta task:** `useInfiniteList` guarda `items` em `useState` e **não** ressincroniza com uma nova prop `initialItems` — só reseta quando o `resetKey` (os filtros) muda. Então `revalidatePath` + `router.refresh()` **não** tiram os cards moderados da tela. A remoção é feita no cliente via `removeItem`.

A regra é exata porque cada aba **é** um status (`REVIEW_TABS`: `pending`/`approved`/`rejected`/`spam`), logo todo card visível tem o status da aba:
- novo status **≠** `filters.tab` → o item tem que sair da lista → `removeItem`.
- novo status **=** `filters.tab` → nada muda visualmente → nada a fazer.

O `router.refresh()` continua sendo chamado, mas por outro motivo: atualizar as contagens das abas (server-rendered em `ReviewsFilters`) e fazer `page.tsx` renderizar o `<Empty>` se a aba esvaziou.

- [ ] **Step 1: Reescrever o componente**

`Read` o arquivo, depois substituir o conteúdo inteiro de `apps/web/src/app/dashboard/reviews/_components/reviews-infinite.tsx` por:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BulkActionBar } from "@/components/bulk/bulk-action-bar";
import { SelectableItem } from "@/components/bulk/selectable-item";
import { SelectionToolbar } from "@/components/bulk/selection-toolbar";
import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useBulkSelection } from "@/lib/use-bulk-selection";
import { useInfiniteList } from "@/lib/use-infinite-list";

import { fetchReviewsPage } from "../actions";
import type { ReviewListItem } from "../data";
import type { BulkModerateStatus, ReviewsListFiltersParsed } from "../schema";
import { BulkModerateDialog } from "./bulk-moderate-dialog";
import { ReviewCard } from "./review-card";

interface ReviewsInfiniteProps {
	filters: ReviewsListFiltersParsed;
	initial: ReviewListItem[];
	initialCursor: string | null;
}

const BULK_ACTIONS: {
	label: string;
	status: BulkModerateStatus;
	variant: "default" | "destructive" | "secondary";
}[] = [
	{ label: "Aprovar", status: "approved", variant: "default" },
	{ label: "Rejeitar", status: "rejected", variant: "secondary" },
	{ label: "Spam", status: "spam", variant: "destructive" },
];

export function ReviewsInfinite({
	initial,
	initialCursor,
	filters,
}: ReviewsInfiniteProps) {
	const router = useRouter();
	const resetKey = JSON.stringify(filters);
	const { items, hasMore, loadMore, pending, error, removeItem } =
		useInfiniteList({
			initialItems: initial,
			initialCursor,
			fetchPage: (cursor) => fetchReviewsPage({ filters, cursor }),
			resetKey,
		});
	const sel = useBulkSelection({ items, getId: (item) => item.id, resetKey });
	const [bulkStatus, setBulkStatus] = useState<BulkModerateStatus | null>(null);

	// A ação cujo status é o da aba atual não faz nada (todo card visível já tem
	// esse status) — não mostrar o botão.
	const actions = BULK_ACTIONS.filter((action) => action.status !== filters.tab);

	function handleBulkSuccess(moderatedIds: string[]) {
		// useInfiniteList não ressincroniza com initialItems: os cards moderados
		// saem da lista aqui, não pelo revalidatePath do servidor.
		if (bulkStatus !== filters.tab) {
			removeItem((item) => moderatedIds.includes(item.id));
		}
		setBulkStatus(null);
		sel.exit();
		// Atualiza as contagens das abas e o <Empty> quando a aba esvazia.
		router.refresh();
	}

	return (
		<div aria-live="polite">
			<div className="mb-3 flex justify-end">
				<SelectionToolbar
					active={sel.active}
					allLoadedSelected={sel.allLoadedSelected}
					loadedCount={items.length}
					onCancel={sel.exit}
					onEnter={sel.enter}
					onToggleAll={sel.allLoadedSelected ? sel.clear : sel.selectAllLoaded}
				/>
			</div>
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{items.map((review) => (
					<SelectableItem
						active={sel.active}
						key={review.id}
						onToggle={() => sel.toggle(review.id)}
						selected={sel.isSelected(review.id)}
					>
						<ReviewCard review={review} />
					</SelectableItem>
				))}
			</div>
			<InfiniteSentinel
				error={error}
				hasMore={hasMore}
				onLoadMore={loadMore}
				pending={pending}
			/>
			{sel.count > 0 ? (
				<BulkActionBar
					actions={actions.map((action) => ({
						label: action.label,
						run: () => setBulkStatus(action.status),
						variant: action.variant,
					}))}
					onClear={sel.clear}
					selectedIds={sel.selectedIds}
				/>
			) : null}
			{bulkStatus ? (
				<BulkModerateDialog
					count={sel.count}
					onClose={() => setBulkStatus(null)}
					onSuccess={handleBulkSuccess}
					reviewIds={sel.selectedIds}
					status={bulkStatus}
				/>
			) : null}
		</div>
	);
}
```

- [ ] **Step 2: Typecheck + lint + testes**

```bash
bun verify
```

Esperado: exit 0 (`check-types` + `check` + `test`).

- [ ] **Step 3: Smoke visual — caminho feliz**

```bash
bun dev:web
```

Abrir `/dashboard/reviews` (aba **Pendentes**, a default) logado como `admin` ou `super_admin` e verificar, na ordem:

1. Botão **Selecionar** aparece acima do grid, à direita.
2. Clicar em **Selecionar** → checkbox sobre cada card; clicar num card **seleciona** (não navega para o detalhe).
3. Com ≥1 selecionado, a `BulkActionBar` surge no rodapé com **Aprovar**, **Rejeitar** e **Spam** (nesta aba as três aparecem, pois nenhuma é `pending`).
4. **Aprovar** → dialog sem campo de nota → confirmar → toast de sucesso, dialog fecha, seleção sai do modo ativo, **os cards aprovados somem da aba Pendentes** e a contagem da aba cai.
5. Ir para a aba **Aprovadas** → as avaliações estão lá, com o status novo.
6. Na aba **Aprovadas**, entrar em modo de seleção → a barra mostra só **Rejeitar** e **Spam** (o botão Aprovar some).

Sem erro de runtime: `nextjs_call <port> get_errors` (MCP `next-devtools`).

- [ ] **Step 4: Smoke visual — validação e erro**

1. Aba **Pendentes**, selecionar ≥1 → **Rejeitar** → confirmar com o campo de nota vazio → mensagem de erro aparece **abaixo do Textarea** (`<FieldError>`), o dialog **não** fecha e nada é moderado.
2. Preencher a nota → confirmar → toast de sucesso, cards somem da aba.
3. Abrir a avaliação rejeitada no detalhe (`/dashboard/reviews/[id]`) → a nota de moderação gravada é a do lote.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dashboard/reviews/_components/reviews-infinite.tsx
git commit -m "feat(reviews): fia seleção em lote na listagem"
```

---

### Task 4: Contrato de `bulkAssignBranch` em Orders (só documentação)

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/actions.ts` (comentário após a função `assignBranch`)

**Interfaces:**
- Consumes: nada. Produces: nada. É comentário — **nenhum código executável**.

Motivo de existir: Pedidos são branch-scoped, e o contrato de auth do lote é o oposto do de Reviews. Sem esse registro, a próxima pessoa copia o padrão de Reviews (uma autorização antes do lote) e abre um buraco de segurança.

- [ ] **Step 1: Adicionar o comentário de design**

`Read` `apps/web/src/app/dashboard/orders/actions.ts`, localizar o fim da função `assignBranch` e inserir logo depois:

```ts
// ── DESIGN: bulkAssignBranch (não implementado — issue #308 ficou só em Reviews) ──
//
// Assinatura proposta:
//
//   export async function bulkAssignBranch(
//     input: { branchId: string; orderIds: string[] }
//   ): Promise<ActionResult<{ failed: Array<{ id: string; error: string }>; succeeded: number }>>
//
// Contrato de autorização — o INVERSO do de reviews. Reviews são globais: um
// requireCapability antes de um único UPDATE ... IN (...) basta. Pedidos são
// branch-scoped, então:
//
//   1. requireCapabilityWithContext("orders.update_status", { targetBranchIds: [branchId] })
//      uma vez antes do loop — o ator precisa de acesso à filial de DESTINO.
//   2. Por item: db.transaction((tx) => lockOrderAndAuthorize(tx, "orders.update_status", orderId)).
//      O branchId ATUAL do pedido pode mudar entre a checagem global e a mutação
//      (race de reatribuição), e pedido na triagem (branchId = null) só admin/super_admin
//      move. NÃO autorizar o lote inteiro de uma vez.
//   3. Loop for...of com transações independentes: falha de um item não aborta o lote.
//   4. BULK_ASSIGN_LIMIT = 20 (1 página; a triagem é o caso de uso).
//   5. revalidatePath(ORDERS_PATH) uma vez, após o loop.
//
// Fiação: uma entrada no array `actions` do BulkActionBar já existente em
// orders-infinite.tsx, abrindo um BranchPickerDialog que coleta o branchId.
// ─────────────────────────────────────────────────────────────────────────────
```

- [ ] **Step 2: Verificação final completa**

```bash
bun verify
bun guard:forms
bun run --cwd apps/web build
git diff --name-only main
```

Esperado: `bun verify`, `guard:forms` e `build` exit 0. O `git diff --name-only main` deve listar **apenas**:

```
apps/web/src/app/dashboard/orders/actions.ts
apps/web/src/app/dashboard/reviews/__tests__/bulk-moderate.test.ts
apps/web/src/app/dashboard/reviews/_components/bulk-moderate-dialog.tsx
apps/web/src/app/dashboard/reviews/_components/reviews-infinite.tsx
apps/web/src/app/dashboard/reviews/actions.ts
apps/web/src/app/dashboard/reviews/schema.ts
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/dashboard/orders/actions.ts
git commit -m "docs(orders): contrato de bulkAssignBranch"
```

---

## Critérios de pronto (todo o plano)

- [ ] `bun verify` exit 0
- [ ] `bun guard:forms` exit 0
- [ ] `bun run --cwd apps/web build` exit 0
- [ ] Os 10 testes de `bulk-moderate.test.ts` passam
- [ ] Smoke da Task 3 (steps 3 e 4) completo, sem erro de runtime
- [ ] `git diff --name-only main` lista só os 6 arquivos acima
