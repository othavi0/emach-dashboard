# Guarda de status na moderação individual de review — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar o lost-update de `moderateReview` (issue #313): o `UPDATE` só afeta a avaliação se ela ainda estiver no status que a tela renderizou; caso contrário o moderador vê um conflito, não um sucesso silencioso.

**Architecture:** Espelha o que `bulkModerateReviews` já faz (PR #314). `moderateReviewSchema` ganha `expectedStatus` obrigatório; a action compõe `WHERE and(eq(id), eq(status, expectedStatus))` com `.returning({ id })` e trata zero linhas como conflito. As duas telas que chamam a action (detalhe da review e tabela de avaliações do cliente) passam o status que renderizaram e, em qualquer falha, dão `notify.error` + `reloadTab()` + `router.refresh()`.

**Tech Stack:** Next 16 (App Router, server actions), React 19, Drizzle ORM, Zod, Vitest (`environment: node`), Biome/ultracite.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-14-moderate-review-status-guard-design.md`. Issue: #313. Branch: `fix/313-moderate-review-status-guard` (já criada, spec já commitada).
- CWD é a **raiz do monorepo**. Nunca `cd apps/web`; usar paths absolutos e `bun --cwd apps/web` quando o script for do app.
- Proibido: `console.*`, `: any` / `as any` / `@ts-ignore` / `@ts-expect-error`, `React.forwardRef`, `useMemo`/`useCallback` manuais (React Compiler ativo), `key={index}`.
- Server actions: `"use server"` no topo, `await requireCapability(cap)` no início, retorno `ActionResult<T>`, validação por `safeParse`, `catch` com `getPgError` + `logger.error`.
- Mensagem de conflito, **exata**: `"Esta avaliação já foi moderada por outra pessoa. A tela foi atualizada."`
- Um arquivo `"use server"` só pode exportar `async function` — não mover tipos/consts para `actions.ts`.
- Hook PostToolUse roda `bun fix` após `Write`/`Edit` e pode reordenar campos: se um `Edit` falhar com `string not found`, re-**Read** o arquivo antes de repetir.
- Antes de qualquer `Edit`, **Read** o arquivo nesta sessão (`cat`/`sed` não contam para o harness).
- Gate final: `bun verify` (encadeia `check-types` + `check` + `test`). Rodar `check-types` com cache limpo (`--force`) antes de considerar pronto.
- **Banco único dev = prod.** Nenhum passo deste plano roda `seed`/`truncate`/`db:push`/reset. Nenhum passo escreve no banco sem autorização explícita do usuário nesta sessão.

---

### Task 1: Guarda de status na action (+ callers passando `expectedStatus`)

Entrega a correção do banco de dados e mantém o `tsc` verde: como `expectedStatus` é obrigatório, os dois callers têm que passar o campo no mesmo commit.

**Files:**
- Modify: `apps/web/src/app/dashboard/reviews/schema.ts` (bloco `moderateReviewSchema`)
- Modify: `apps/web/src/app/dashboard/reviews/actions.ts` (função `moderateReview`)
- Modify: `apps/web/src/app/dashboard/customers/data.ts` (interface `CustomerReviewRow`, campo `status`)
- Modify: `apps/web/src/app/dashboard/reviews/_components/moderate-actions.tsx` (chamada de `moderateReview`)
- Modify: `apps/web/src/app/dashboard/customers/_components/customer-reviews-table.tsx` (tipo `PendingAction` + duas chamadas de `moderateReview`)
- Create: `apps/web/src/app/dashboard/reviews/__tests__/moderate-review.test.ts`

**Interfaces:**
- Consumes: `ActionResult` (`@/lib/action-result`), `getPgError` (`@/lib/db-error`), `requireCapability` (`@/lib/permissions`), `logger` (`@/lib/logger`), `review` (`@emach/db/schema/reviews`), `ReviewStatus` (`@emach/db/schema/reviews`).
- Produces:
  - `ModerateReviewInput` ganha `expectedStatus: "pending" | "approved" | "rejected" | "spam"` (obrigatório).
  - `moderateReview(input: ModerateReviewInput): Promise<ActionResult>` — `{ ok: false, error: "Esta avaliação já foi moderada por outra pessoa. A tela foi atualizada." }` quando zero linhas.
  - `CustomerReviewRow.status` passa de `string` para `ReviewStatus`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `apps/web/src/app/dashboard/reviews/__tests__/moderate-review.test.ts` (espelha os mocks hoisted de `bulk-moderate.test.ts`):

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — precisam existir antes das factories de vi.mock
// ---------------------------------------------------------------------------

const {
	mockDbUpdate,
	mockRequireCapability,
	mockLoggerError,
	mockRevalidatePath,
} = vi.hoisted(() => ({
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

import { review } from "@emach/db/schema/reviews";
import { and, eq } from "drizzle-orm";

import { moderateReview } from "../actions";
import type { ModerateReviewInput } from "../schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ID_A = "11111111-1111-4111-8111-111111111111";

/** Captura o objeto passado ao .set() para assertions sobre o payload. */
const setSpy = vi.fn();

/**
 * db.update(review).set({...}).where(...).returning({ id }) → linhas.
 * `rows` vazio = a guarda de status não casou (alguém moderou antes).
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

const CONFLICT_ERROR =
	"Esta avaliação já foi moderada por outra pessoa. A tela foi atualizada.";

beforeEach(() => {
	vi.clearAllMocks();
	setSpy.mockClear();
	mockRequireCapability.mockResolvedValue({
		user: { id: "actor-1", name: "Admin Test", role: "admin" },
	});
});

describe("moderateReview", () => {
	it("modera a avaliação quando o status ainda é o esperado", async () => {
		setupUpdate([{ id: ID_A }]);

		const result = await moderateReview({
			reviewId: ID_A,
			status: "approved",
			expectedStatus: "pending",
		});

		expect(result).toEqual({ ok: true, data: undefined });
		expect(mockRequireCapability).toHaveBeenCalledExactlyOnceWith(
			"reviews.moderate"
		);
		expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard/reviews");
		expect(mockRevalidatePath).toHaveBeenCalledWith(
			`/dashboard/reviews/${ID_A}`
		);
	});

	it("compõe o where com eq(id) e eq(status, expectedStatus)", async () => {
		let capturedWhere: unknown;
		mockDbUpdate.mockReturnValue({
			set: (payload: unknown) => {
				setSpy(payload);
				return {
					where: (whereArg: unknown) => {
						capturedWhere = whereArg;
						return { returning: () => Promise.resolve([{ id: ID_A }]) };
					},
				};
			},
		});

		await moderateReview({
			reviewId: ID_A,
			status: "approved",
			expectedStatus: "pending",
		});

		expect(capturedWhere).toEqual(
			and(eq(review.id, ID_A), eq(review.status, "pending"))
		);
	});

	it("devolve conflito quando nenhuma linha foi afetada, e ainda revalida", async () => {
		setupUpdate([]);

		const result = await moderateReview({
			reviewId: ID_A,
			status: "approved",
			expectedStatus: "pending",
		});

		expect(result).toEqual({ ok: false, error: CONFLICT_ERROR });
		// Revalidar mesmo no conflito: sem isso o router.refresh() do client pode
		// servir de volta o estado velho que causou o conflito.
		expect(mockRevalidatePath).toHaveBeenCalledWith(
			`/dashboard/reviews/${ID_A}`
		);
	});

	it("não sobrescreve a nota existente ao aprovar sem nota", async () => {
		setupUpdate([{ id: ID_A }]);

		await moderateReview({
			reviewId: ID_A,
			status: "approved",
			expectedStatus: "pending",
		});

		expect(setSpy).toHaveBeenCalledWith(
			expect.not.objectContaining({ moderationNote: expect.anything() })
		);
	});

	it("grava a nota (trimada) ao rejeitar", async () => {
		setupUpdate([{ id: ID_A }]);

		const result = await moderateReview({
			reviewId: ID_A,
			status: "rejected",
			moderationNote: "  conteúdo ofensivo  ",
			expectedStatus: "pending",
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

	it("exige nota de moderação ao rejeitar", async () => {
		const result = await moderateReview({
			reviewId: ID_A,
			status: "rejected",
			expectedStatus: "pending",
		});

		expect(result).toEqual({
			ok: false,
			error: "Nota de moderação obrigatória ao rejeitar ou marcar como spam",
		});
		expect(mockDbUpdate).not.toHaveBeenCalled();
	});

	it("rejeita quando expectedStatus está ausente (Zod), sem tocar no banco", async () => {
		// Simula um caller desatualizado (ex: build antigo do client) que ainda
		// não manda `expectedStatus` — o Zod tem que barrar antes do banco.
		const legacyInput = { reviewId: ID_A, status: "approved" } as Omit<
			ModerateReviewInput,
			"expectedStatus"
		>;

		const result = await moderateReview(legacyInput as ModerateReviewInput);

		expect(result.ok).toBe(false);
		expect(mockDbUpdate).not.toHaveBeenCalled();
	});

	it("loga e devolve erro genérico quando o banco falha", async () => {
		setupUpdateThrows(new Error("connection terminated"));

		const result = await moderateReview({
			reviewId: ID_A,
			status: "approved",
			expectedStatus: "pending",
		});

		expect(result).toEqual({ ok: false, error: "Erro ao moderar avaliação" });
		expect(mockLoggerError).toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `bun --cwd apps/web test src/app/dashboard/reviews/__tests__/moderate-review.test.ts`

Expected: FAIL. Os casos de conflito/where/nota falham porque a action atual não tem `expectedStatus`, não usa `.returning()` e grava `moderationNote: null`. (O `tsc` do editor também reclama de `expectedStatus` não existir em `ModerateReviewInput` — é o esperado neste ponto.)

- [ ] **Step 3: Adicionar `expectedStatus` ao schema**

Em `apps/web/src/app/dashboard/reviews/schema.ts`, substituir o `moderateReviewSchema` por:

```ts
export const moderateReviewSchema = z
	.object({
		reviewId: z.string().uuid(),
		/** Status que a tela renderizou. Guarda de concorrência: o UPDATE só afeta
		 *  a linha se ela AINDA estiver nesse status. Obrigatório de propósito —
		 *  opcional reabriria o buraco no primeiro caller que esquecesse de passar. */
		expectedStatus: z.enum(["pending", "approved", "rejected", "spam"]),
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
```

- [ ] **Step 4: Reescrever `moderateReview`**

Em `apps/web/src/app/dashboard/reviews/actions.ts`, o import do drizzle já traz `and` e `eq` (usados pelo bulk) e `getPgError` já está importado. Substituir o corpo do `try` da função `moderateReview` e o `catch`:

```ts
export async function moderateReview(
	input: ModerateReviewInput
): Promise<ActionResult> {
	const parsed = moderateReviewSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "Entrada inválida",
		};
	}

	const session = await requireCapability("reviews.moderate");
	const { reviewId, status, moderationNote, expectedStatus } = parsed.data;
	const note = moderationNote?.trim();

	try {
		const updated = await db
			.update(review)
			.set({
				status,
				moderatedBy: session.user.id,
				moderatedAt: new Date(),
				// Sem nota (caso da aprovação) → a coluna não entra no SET: aprovar não
				// apaga a nota de moderação anterior. Mesma regra do bulk.
				...(note ? { moderationNote: note } : {}),
			})
			.where(
				and(
					eq(review.id, reviewId),
					// Guarda de concorrência: se outra pessoa moderou entre o render e o
					// clique, a linha não casa e o RETURNING volta vazio.
					eq(review.status, expectedStatus)
				)
			)
			.returning({ id: review.id });

		// Revalidar também no conflito, antes do return: senão o router.refresh()
		// do client pode servir de volta o estado velho que causou o conflito.
		revalidatePath(REVIEWS_PATH);
		revalidatePath(`${REVIEWS_PATH}/${reviewId}`);

		if (updated.length === 0) {
			return {
				ok: false,
				error:
					"Esta avaliação já foi moderada por outra pessoa. A tela foi atualizada.",
			};
		}

		return { ok: true, data: undefined };
	} catch (error) {
		const pg = getPgError(error);
		logger.error("moderateReview", { err: error, code: pg?.code });
		return { ok: false, error: "Erro ao moderar avaliação" };
	}
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `bun --cwd apps/web test src/app/dashboard/reviews/__tests__/moderate-review.test.ts`

Expected: PASS (8 testes).

- [ ] **Step 6: Narrow do tipo `CustomerReviewRow.status`**

Em `apps/web/src/app/dashboard/customers/data.ts`: a query drizzle (`status: review.status`) já devolve o enum; só a interface alargava para `string`. Trocar o campo:

```ts
	status: ReviewStatus;
```

e garantir o import de tipo no topo do arquivo (junto dos outros `import type`):

```ts
import type { ReviewStatus } from "@emach/db/schema/reviews";
```

- [ ] **Step 7: Caller 1 — detalhe da review passa o status renderizado**

Em `apps/web/src/app/dashboard/reviews/_components/moderate-actions.tsx`, dentro de `handleModeration`, acrescentar `expectedStatus` à chamada:

```ts
				const result = await moderateReview({
					reviewId: review.id,
					status,
					moderationNote: moderationNote.trim() || undefined,
					// O status que o Server Component renderizou é, literalmente, "o que o
					// moderador tinha na tela quando decidiu".
					expectedStatus: review.status,
				});
```

- [ ] **Step 8: Caller 2 — tabela de avaliações do cliente**

Em `apps/web/src/app/dashboard/customers/_components/customer-reviews-table.tsx`:

1. Importar o tipo do status junto dos outros `import type`:

```ts
import type { ReviewStatus } from "@emach/db/schema/reviews";
```

2. Carregar o status esperado na ação pendente (`PendingAction`), que hoje só guarda id e alvo:

```ts
type PendingAction = {
	reviewId: string;
	status: "rejected" | "spam";
	expectedStatus: ReviewStatus;
} | null;
```

3. `handleApprove` recebe o status esperado e o repassa:

```ts
	function handleApprove(reviewId: string, expectedStatus: ReviewStatus) {
		startTransition(async () => {
			const result = await moderateReview({
				reviewId,
				status: "approved",
				expectedStatus,
			});
			if (result.ok) {
				notify.success("Avaliação aprovada");
				reloadTab();
				router.refresh();
			} else {
				notify.error(result.error);
			}
		});
	}
```

4. `handleNoteSubmit` repassa o status esperado guardado na ação pendente:

```ts
			const result = await moderateReview({
				reviewId: pendingAction.reviewId,
				status: pendingAction.status,
				moderationNote,
				expectedStatus: pendingAction.expectedStatus,
			});
```

5. Os três botões da linha passam `review.status` (o que a linha renderizou):

```tsx
										onClick={() => handleApprove(review.id, review.status)}
```

```tsx
										onClick={() => {
											setPendingAction({
												reviewId: review.id,
												status: "rejected",
												expectedStatus: review.status,
											});
											setNote("");
										}}
```

```tsx
										onClick={() => {
											setPendingAction({
												reviewId: review.id,
												status: "spam",
												expectedStatus: review.status,
											});
											setNote("");
										}}
```

- [ ] **Step 9: Rodar o gate de tipos e a suíte**

Run: `bun check-types --force && bun --cwd apps/web test src/app/dashboard/reviews`

Expected: `check-types` PASS (nenhum caller sem `expectedStatus`); testes de reviews PASS (`moderate-review` + `bulk-moderate`).

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/app/dashboard/reviews/schema.ts \
        apps/web/src/app/dashboard/reviews/actions.ts \
        apps/web/src/app/dashboard/reviews/__tests__/moderate-review.test.ts \
        apps/web/src/app/dashboard/customers/data.ts \
        apps/web/src/app/dashboard/reviews/_components/moderate-actions.tsx \
        apps/web/src/app/dashboard/customers/_components/customer-reviews-table.tsx
git commit -m "fix(reviews): guarda de status na moderação individual"
```

---

### Task 2: UX do conflito nas duas telas

A guarda já impede o lost-update; falta o moderador **ver** a decisão de quem chegou antes. Em qualquer falha, as telas recarregam o estado do servidor.

**Files:**
- Modify: `apps/web/src/app/dashboard/reviews/_components/moderate-actions.tsx` (ramo `!result.ok` de `handleModeration`)
- Modify: `apps/web/src/app/dashboard/customers/_components/customer-reviews-table.tsx` (ramos `else` de `handleApprove` e `handleNoteSubmit`)

**Interfaces:**
- Consumes: `moderateReview` com `expectedStatus` (Task 1), `useLazyTabReload` (`@/components/entity/lazy-tab`), `useRouter` (`next/navigation`), `notify` (`@/lib/notify`).
- Produces: nada consumido por tasks seguintes.

Por que refresh em **qualquer** falha e não só no conflito: `ActionResult` é `{ ok: false; error: string }`, sem discriminante. Alterar esse tipo — compartilhado por todo o app — só para a UI distinguir conflito de erro de validação não se paga; `router.refresh()` é idempotente, preserva o estado do client, e toda falha significa que a visão pode estar velha.

- [ ] **Step 1: Detalhe da review — recarregar no erro**

Em `apps/web/src/app/dashboard/reviews/_components/moderate-actions.tsx`, dentro de `handleModeration`, o ramo de falha:

```ts
				if (!result.ok) {
					notify.error(result.error);
					// Pode ser conflito (outra pessoa moderou antes): recarrega para o
					// moderador ver o status e a nota de quem chegou primeiro — o card de
					// detalhe já renderiza `moderatedByName • moderatedAt` e a nota.
					reloadTab();
					router.refresh();
					return;
				}
```

- [ ] **Step 2: Tabela do cliente — recarregar no erro e fechar o dialog**

Em `apps/web/src/app/dashboard/customers/_components/customer-reviews-table.tsx`, o `else` de `handleApprove`:

```ts
			} else {
				notify.error(result.error);
				reloadTab();
				router.refresh();
			}
```

e o `else` de `handleNoteSubmit` — a decisão pendente não faz mais sentido sobre o estado novo, então o dialog fecha e o campo limpa também no erro:

```ts
			} else {
				notify.error(result.error);
				setPendingAction(null);
				setNote("");
				reloadTab();
				router.refresh();
			}
```

- [ ] **Step 3: Rodar lint + tipos**

Run: `bun check-types --force && bun check`

Expected: ambos PASS. (`bun check` roda o ultracite; `check-types` sozinho não pega regras de lint.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/reviews/_components/moderate-actions.tsx \
        apps/web/src/app/dashboard/customers/_components/customer-reviews-table.tsx
git commit -m "feat(reviews): recarrega a tela no conflito de moderação"
```

---

### Task 3: Gate completo e smoke

**Files:** nenhum (só verificação).

**Interfaces:**
- Consumes: tudo das tasks 1 e 2.
- Produces: evidência de que o gate passa.

- [ ] **Step 1: Rodar o gate encadeado**

Run: `bun verify`

Expected: PASS nos três (`check-types`, `check`, `test`). Se `check-types` acusar erro em cache, repetir com `bun check-types --force`.

- [ ] **Step 2: Build (regra de arquivo `"use server"`)**

Run: `bun run build`

Expected: PASS. `actions.ts` continua exportando só `async function` — o build é o único gate que pega violação dessa regra.

- [ ] **Step 3: Smoke do caminho feliz**

Subir `bun dev:web`, abrir `/dashboard/reviews`, entrar numa avaliação **pendente** e aprovar. Esperado: toast "Moderação salva", status vira Aprovada, e a nota de moderação anterior (se houver) **continua lá** — aprovar não apaga mais a nota.

- [ ] **Step 4: Smoke do conflito — pedir autorização antes**

⚠️ O Supabase deste repo é **banco único dev = prod**. O smoke do conflito escreve numa avaliação real (muda status duas vezes).

Perguntar ao usuário: (a) rodar o smoke num registro que ele indicar, restaurando o status original depois; ou (b) pular e ficar só com os testes unitários + o smoke do caminho feliz. **Não escrever no banco sem a resposta dele.**

Se autorizado: abrir a mesma avaliação pendente em duas abas, moderar numa (Rejeitar, com nota), voltar na outra e clicar em Aprovar. Esperado: toast "Esta avaliação já foi moderada por outra pessoa. A tela foi atualizada.", a tela recarrega mostrando **Rejeitada**, o nome de quem rejeitou e a nota — e o registro **não** foi promovido a `approved`.

- [ ] **Step 5: Relatar**

Reportar as três provas do CLAUDE.md: funcional (`bun verify` + build), perceptual (o que a tela mostrou no conflito) e dados (o status/nota da avaliação depois do smoke). Se o smoke do conflito foi pulado, dizer **"implementado, verificado só por teste unitário"** — nunca "concluído".
