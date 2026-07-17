# Redesign do fluxo Pedidos → Separação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar as 13 decisões (D1–D13) do spec `docs/superpowers/specs/2026-07-16-fluxo-pedidos-separacao-redesign-design.md` (commit 791b4833): envio pra separação com filial integrada, PDF só na fila de Separação, claim em lote ("Separar e imprimir"), card que inicia a sessão direto, e limpezas decorrentes.

**Architecture:** Backend primeiro (duas server actions com transação por pedido + lock, testadas com vitest/mocks), depois as superfícies de UI que as consomem, depois limpezas dependentes. Nenhuma mudança de schema de banco — só código de app.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), Drizzle/Postgres (Supabase), vitest, zod, Tailwind + shadcn sobre @base-ui.

## Global Constraints

Valem pra TODA task (o prompt de cada subagente DEVE colar as 3 primeiras verbatim):

- **Banco único dev=prod (incidente 2026-07):** NUNCA `seed`/`truncate`/`drop`/reset/`db:push` destrutivo. Write pontual de linha pra smoke é OK (`EM-TEST-*`), guardando o id e revertendo ao terminar.
- **Read cada arquivo antes de Edit** (`cat`/`sed` não contam); Edit falhou com `string not found` → re-Read antes de re-tentar (o hook PostToolUse roda `bun fix` e pode reordenar o arquivo). CWD é a RAIZ do monorepo — nunca `cd apps/web`; paths absolutos.
- **Antes de todo commit:** `bun check-types --force` (turbo já serviu PASS velho) e `bun check`. Conventional Commits em PT, subject ≤50 chars, ZERO menção a AI (sem Co-Authored-By, sem emoji).
- Anti-patterns proibidos: `console.*` (usar `logger` de `apps/web/src/lib/logger.ts`), `any`/`@ts-ignore`, `key={index}`, `React.forwardRef`, `useMemo`/`useCallback` manuais (React Compiler), `try`+`finally` (baila o Compiler — cleanup no fim do try + duplicado no catch).
- Server actions: `"use server"` + `requireCapability*` no início; retorno `ActionResult<T>`; erro de banco via `getPgError` (nunca `e.message.includes`); `revalidatePath` após mutação.
- Testes: `bun --cwd apps/web test <path>` da raiz; mocks de `@emach/db` via `vi.hoisted` + `vi.mock`.
- UI segue DESIGN.md (tokens, nunca hex hardcoded; badge/botão por role; interativo aninhado em card = `div role="button"`, nunca `<button>` em âncora).

## Ordem de execução e dependências

`1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11`

- Task 3 depende da Task 2 (assinatura `branchId?`). Task 6 depende da Task 1 (`bulkStartPicking`) e da Task 5 (mesmos arquivos). Task 10 depende das Tasks 5/6 (remove o último caller de `?tab=`). Tasks 4, 8, 9 são independentes entre si mas mantêm a ordem por simplicidade (execução sequencial, sem paralelismo — vários tocam os mesmos arquivos).
- **Nota de contexto pro reviewer:** o filtro de triagem em `orders/schema.ts` tem bug pré-existente (zod rejeita a sentinela `__none__` de `branchId`, resetando filtros) — descoberto no planejamento, FORA do escopo deste plano; abrir issue à parte.

---

### Task 1: action bulkStartPicking + testes

**Files:**

- Modify: `apps/web/src/app/dashboard/separacao/_lib/picking-logic.ts`
- Modify: `apps/web/src/app/dashboard/separacao/_lib/__tests__/picking-logic.test.ts`
- Modify: `apps/web/src/app/dashboard/separacao/schema.ts`
- Modify: `apps/web/src/app/dashboard/separacao/actions.ts`
- Modify (testes): `apps/web/src/app/dashboard/separacao/__tests__/picking-actions.test.ts`

**Interfaces:**

- Consumes: `lockOrderAndAuthorize(tx: OrderTx, cap: Capability, orderId: string): Promise<LockedOrderAuth | null>` de `../orders/actions` (já existe, inalterado).
- Consumes: `bulkSkipReasonFromError(error: unknown): string | null` de `../orders/_lib/bulk-eligibility` (já existe, inalterado — classifica erro `Forbidden:`/escopo como skip "fora do seu escopo").
- Consumes: `getPgError(error: unknown): PgError | null` de `@/lib/db-error` (já existe, inalterado).
- Produces (novo, `apps/web/src/app/dashboard/separacao/_lib/picking-logic.ts`): `export type BulkPickingSkipReason = "sem_filial" | "status_diferente"`; `export function bulkStartPickingSkipReason(locked: { branchId: string | null; status: string }): BulkPickingSkipReason | null`; `export const BULK_PICKING_SKIP_LABEL: Record<BulkPickingSkipReason, string>`.
- Produces (novo, `apps/web/src/app/dashboard/separacao/schema.ts`): `export const bulkStartPickingSchema = z.object({ orderIds: z.array(z.string().uuid()).min(1).max(20, {...}) })`; `export type BulkStartPickingInput = z.infer<typeof bulkStartPickingSchema>`.
- Produces (novo, `apps/web/src/app/dashboard/separacao/actions.ts`): `export interface BulkStartPickingResult { moved: number; movedIds: string[]; skipped: { number: string; reason: string }[] }`; `export async function bulkStartPicking(input: { orderIds: string[] }): Promise<ActionResult<BulkStartPickingResult>>`.
- Produces (novo, interno não-exportado, `actions.ts`): `async function createPickingSession(tx: Tx, orderId: string, branchId: string, status: string, user: SessionUser): Promise<string>` — miolo extraído de `startPicking` (insere a sessão, copia itens, transiciona paid→preparing com history). `startPicking` passa a chamá-lo; comportamento observável de `startPicking` não muda (mesma sequência de selects/inserts, mesmos testes existentes continuam passando sem alteração).

**Riscos:**

- O hook PostToolUse (`bun fix`) roda após todo `Write`/`Edit` e pode reordenar imports/campos — se um `Edit` subsequente falhar com "string not found", re-`Read` o arquivo antes de tentar de novo (o conteúdo pode ter mudado).
- A extração de `createPickingSession` é um refactor comportamento-preservado de `startPicking`; se o teste existente "cria picking com status paid e transiciona para preparing" (em `picking-actions.test.ts`, describe `startPicking`) quebrar, é sinal de que a extração mudou a ordem de selects/inserts — NÃO ajustar o teste existente, corrigir a extração.
- `mockRequireCapabilityWithContext` é compartilhado por todo o arquivo de teste (module-level). O valor default (`{ user: { id: "usr_1", name: "Picker" } }`) precisa permanecer idêntico ao anterior — várias suites existentes (`scanItem`, `completePicking`, `confirmItemManually`, `cancelPicking`, guard tests) dependem de `pickerUserId: "usr_1"` bater com esse default para os asserts de `assertOwner` passarem. Não alterar esse valor.
- `mockRequireCapabilityWithContext.mockRejectedValueOnce(...)` (usado no teste de branch-scope) consome exatamente UMA chamada futura — o teste que o usa deve garantir que exatamente as chamadas esperadas ocorrem antes de outro teste rodar, senão a rejeição "vaza" pro teste seguinte. Os testes abaixo já foram desenhados pra consumir exatamente o que enfileiram.

---

- [ ] **Passo 1 — escrever teste falho para `bulkStartPickingSkipReason`/`BULK_PICKING_SKIP_LABEL`.**

  Re-`Read` `apps/web/src/app/dashboard/separacao/_lib/__tests__/picking-logic.test.ts` se necessário, depois aplique este `Edit`:

  old_string:
  ```ts
  import { describe, expect, it } from "vitest";
  import {
  	canScanMore,
  	isPickingComplete,
  	matchPickItem,
  	type PickItem,
  	summarizePicking,
  } from "../picking-logic";
  ```

  new_string:
  ```ts
  import { describe, expect, it } from "vitest";
  import {
  	BULK_PICKING_SKIP_LABEL,
  	bulkStartPickingSkipReason,
  	canScanMore,
  	isPickingComplete,
  	matchPickItem,
  	type PickItem,
  	summarizePicking,
  } from "../picking-logic";
  ```

  Depois, outro `Edit` no mesmo arquivo pra acrescentar o describe no final:

  old_string:
  ```ts
  describe("summarizePicking", () => {
  	it("soma unidades e conta exceções", () => {
  		expect(
  			summarizePicking([
  				item({ qtyExpected: 2, qtyPicked: 2 }),
  				item({ qtyExpected: 3, qtyPicked: 1, notFound: true }),
  			])
  		).toEqual({ totalUnits: 5, pickedUnits: 3, exceptions: 1 });
  	});
  });
  ```

  new_string:
  ```ts
  describe("summarizePicking", () => {
  	it("soma unidades e conta exceções", () => {
  		expect(
  			summarizePicking([
  				item({ qtyExpected: 2, qtyPicked: 2 }),
  				item({ qtyExpected: 3, qtyPicked: 1, notFound: true }),
  			])
  		).toEqual({ totalUnits: 5, pickedUnits: 3, exceptions: 1 });
  	});
  });

  describe("bulkStartPickingSkipReason", () => {
  	it("paid com filial é elegível", () => {
  		expect(
  			bulkStartPickingSkipReason({ status: "paid", branchId: "b1" })
  		).toBeNull();
  	});

  	it("preparing com filial é elegível (retomada de fila)", () => {
  		expect(
  			bulkStartPickingSkipReason({ status: "preparing", branchId: "b1" })
  		).toBeNull();
  	});

  	it("status fora de paid/preparing é pulado", () => {
  		expect(
  			bulkStartPickingSkipReason({ status: "shipped", branchId: "b1" })
  		).toBe("status_diferente");
  		expect(
  			bulkStartPickingSkipReason({ status: "canceled", branchId: "b1" })
  		).toBe("status_diferente");
  	});

  	it("sem filial é pulado mesmo com status elegível", () => {
  		expect(
  			bulkStartPickingSkipReason({ status: "paid", branchId: null })
  		).toBe("sem_filial");
  		expect(
  			bulkStartPickingSkipReason({ status: "preparing", branchId: null })
  		).toBe("sem_filial");
  	});

  	it("labels de toast existem para todo reason", () => {
  		expect(BULK_PICKING_SKIP_LABEL.sem_filial).toBe("sem filial");
  		expect(BULK_PICKING_SKIP_LABEL.status_diferente).toBe(
  			"não está mais na fila"
  		);
  	});
  });
  ```

- [ ] **Passo 2 — rodar e ver falhar.**

  ```
  bun --cwd apps/web test src/app/dashboard/separacao/_lib/__tests__/picking-logic.test.ts
  ```

  Output esperado: falha de import/compilação — `bulkStartPickingSkipReason`/`BULK_PICKING_SKIP_LABEL` não existem em `../picking-logic` (`SyntaxError`/`TypeError: bulkStartPickingSkipReason is not a function` ou erro do vitest ao resolver o módulo).

- [ ] **Passo 3 — implementar `bulkStartPickingSkipReason` + `BULK_PICKING_SKIP_LABEL`.**

  Re-`Read` `apps/web/src/app/dashboard/separacao/_lib/picking-logic.ts` se necessário, depois `Edit`:

  old_string:
  ```ts
  export function isPickingStale(args: {
  	lastScannedAt: Date | null;
  	now?: Date;
  	startedAt: Date;
  }): boolean {
  	const reference = args.lastScannedAt ?? args.startedAt;
  	const now = args.now ?? new Date();
  	return now.getTime() - reference.getTime() > STALE_PICKING_MS;
  }
  ```

  new_string:
  ```ts
  export function isPickingStale(args: {
  	lastScannedAt: Date | null;
  	now?: Date;
  	startedAt: Date;
  }): boolean {
  	const reference = args.lastScannedAt ?? args.startedAt;
  	const now = args.now ?? new Date();
  	return now.getTime() - reference.getTime() > STALE_PICKING_MS;
  }

  // ─── Elegibilidade do claim em lote (D12, spec 2026-07-16) ──────────────────
  // Espelha bulkStartSeparationSkipReason (orders/_lib/bulk-eligibility.ts):
  // puro e testável, fora do "use server", chamado por bulkStartPicking sem
  // duplicar a régua individual de startPicking (paid/preparing + branchId).

  export type BulkPickingSkipReason = "sem_filial" | "status_diferente";

  export function bulkStartPickingSkipReason(locked: {
  	branchId: string | null;
  	status: string;
  }): BulkPickingSkipReason | null {
  	if (locked.status !== "paid" && locked.status !== "preparing") {
  		return "status_diferente";
  	}
  	if (!locked.branchId) {
  		return "sem_filial";
  	}
  	return null;
  }

  export const BULK_PICKING_SKIP_LABEL: Record<BulkPickingSkipReason, string> = {
  	sem_filial: "sem filial",
  	status_diferente: "não está mais na fila",
  };
  ```

- [ ] **Passo 4 — rodar e ver passar.**

  ```
  bun --cwd apps/web test src/app/dashboard/separacao/_lib/__tests__/picking-logic.test.ts
  ```

  Output esperado: todos os testes do arquivo em verde, incluindo os 5 novos de `bulkStartPickingSkipReason` (`Tests  N passed`, 0 failed).

- [ ] **Passo 5 — adicionar `bulkStartPickingSchema` em `schema.ts`.**

  Re-`Read` `apps/web/src/app/dashboard/separacao/schema.ts` se necessário, depois dois `Edit`s:

  Edit 5a — old_string:
  ```ts
  export const cancelPickingSchema = z.object({
  	pickingId: z.string().uuid(),
  	reason: z.string().trim().max(500).optional(),
  });

  export type StartPickingInput = z.infer<typeof startPickingSchema>;
  ```

  new_string:
  ```ts
  export const cancelPickingSchema = z.object({
  	pickingId: z.string().uuid(),
  	reason: z.string().trim().max(500).optional(),
  });
  export const bulkStartPickingSchema = z.object({
  	orderIds: z
  		.array(z.string().uuid())
  		.min(1)
  		.max(20, { message: "Selecione no máximo 20 pedidos por vez." }),
  });

  export type StartPickingInput = z.infer<typeof startPickingSchema>;
  ```

  Edit 5b — old_string:
  ```ts
  export type CancelPickingInput = z.infer<typeof cancelPickingSchema>;

  export type ScanResult =
  ```

  new_string:
  ```ts
  export type CancelPickingInput = z.infer<typeof cancelPickingSchema>;
  export type BulkStartPickingInput = z.infer<typeof bulkStartPickingSchema>;

  export type ScanResult =
  ```

- [ ] **Passo 6 — ajustar o scaffolding de mocks de `picking-actions.test.ts` pra expor `mockRequireCapabilityWithContext`.**

  Re-`Read` `apps/web/src/app/dashboard/separacao/__tests__/picking-actions.test.ts` se necessário, depois `Edit`:

  old_string:
  ```ts
  const { mockTransaction, mockRequireCapability } = vi.hoisted(() => ({
  	mockTransaction: vi.fn(),
  	mockRequireCapability: vi.fn(),
  }));

  // Mock @emach/db — only needs db.transaction for actions
  vi.mock("@emach/db", () => ({
  	db: { transaction: mockTransaction },
  	createDb: vi.fn(() => ({})),
  }));

  // Mock @/lib/permissions
  vi.mock("@/lib/permissions", () => ({
  	requireCapability: mockRequireCapability,
  	requireCapabilityWithContext: vi
  		.fn()
  		.mockResolvedValue({ user: { id: "usr_1", name: "Picker" } }),
  	getUserCapabilities: vi.fn().mockResolvedValue([]),
  	roleHasCapability: vi.fn().mockReturnValue(true),
  	can: vi.fn().mockResolvedValue(true),
  }));
  ```

  new_string:
  ```ts
  const {
  	mockTransaction,
  	mockRequireCapability,
  	mockRequireCapabilityWithContext,
  } = vi.hoisted(() => ({
  	mockTransaction: vi.fn(),
  	mockRequireCapability: vi.fn(),
  	mockRequireCapabilityWithContext: vi.fn(),
  }));

  // Mock @emach/db — only needs db.transaction for actions
  vi.mock("@emach/db", () => ({
  	db: { transaction: mockTransaction },
  	createDb: vi.fn(() => ({})),
  }));

  // Mock @/lib/permissions
  vi.mock("@/lib/permissions", () => {
  	// Default idêntico ao anterior — vários describes existentes (scanItem,
  	// completePicking, confirmItemManually, cancelPicking, guard tests)
  	// dependem de pickerUserId "usr_1" bater com este default nos asserts de
  	// assertOwner. NÃO alterar este valor.
  	mockRequireCapabilityWithContext.mockResolvedValue({
  		user: { id: "usr_1", name: "Picker" },
  	});
  	return {
  		requireCapability: mockRequireCapability,
  		requireCapabilityWithContext: mockRequireCapabilityWithContext,
  		getUserCapabilities: vi.fn().mockResolvedValue([]),
  		roleHasCapability: vi.fn().mockReturnValue(true),
  		can: vi.fn().mockResolvedValue(true),
  	};
  });
  ```

- [ ] **Passo 7 — escrever os 5 testes falhos de `bulkStartPicking`.**

  No mesmo arquivo (`picking-actions.test.ts`), `Edit` o import das actions:

  old_string:
  ```ts
  import {
  	cancelPicking,
  	completePicking,
  	confirmItemManually,
  	reportMissing,
  	scanItem,
  	startPicking,
  } from "../actions";
  ```

  new_string:
  ```ts
  import {
  	bulkStartPicking,
  	cancelPicking,
  	completePicking,
  	confirmItemManually,
  	reportMissing,
  	scanItem,
  	startPicking,
  } from "../actions";
  ```

  Depois, outro `Edit` acrescentando o describe no final do arquivo:

  old_string:
  ```ts
  	it("cancelPicking SEGUE permitido com pedido cancelado", async () => {
  		armTx([[OWNED_PICKING], [CANCELED_LOCK]]);
  		const result = await cancelPicking(PICKING_ID, "limpeza");
  		expect(result).toMatchObject({ ok: true });
  	});
  });
  ```

  new_string:
  ```ts
  	it("cancelPicking SEGUE permitido com pedido cancelado", async () => {
  		armTx([[OWNED_PICKING], [CANCELED_LOCK]]);
  		const result = await cancelPicking(PICKING_ID, "limpeza");
  		expect(result).toMatchObject({ ok: true });
  	});
  });

  // ---------------------------------------------------------------------------
  // Tests: bulkStartPicking
  // ---------------------------------------------------------------------------

  describe("bulkStartPicking", () => {
  	beforeEach(() => {
  		vi.clearAllMocks();
  		mockRequireCapability.mockResolvedValue(mockSession);
  	});

  	it("rejeita lote com mais de 20 pedidos (zod)", async () => {
  		const orderIds = Array.from(
  			{ length: 21 },
  			(_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`
  		);

  		const result = await bulkStartPicking({ orderIds });

  		expect(result).toMatchObject({ ok: false });
  		expect((result as { ok: false; error: string }).error).toContain("20");
  		expect(mockTransaction).not.toHaveBeenCalled();
  	});

  	it("pula pedido com corrida no unique constraint (23505) e segue ok", async () => {
  		const pgError = Object.assign(new Error("violates unique constraint"), {
  			cause: {
  				code: "23505",
  				constraint: "order_picking_one_active",
  				message: "violates unique constraint",
  			},
  		});

  		mockTransaction.mockImplementationOnce(
  			(cb: (tx: ReturnType<typeof makeMockTx>) => unknown) => {
  				const tx = makeMockTx([
  					[{ status: "preparing", branchId: BRANCH_ID }], // lockOrderAndAuthorize
  					[{ number: "EM-2026-0001" }], // order.number (label)
  					[], // existingSession pré-check — nenhuma
  				]);
  				tx._insertValues.mockRejectedValueOnce(pgError);
  				return cb(tx);
  			}
  		);

  		const result = await bulkStartPicking({ orderIds: [ORDER_ID] });

  		expect(result).toMatchObject({ ok: true });
  		if (result.ok) {
  			expect(result.data.moved).toBe(0);
  			expect(result.data.movedIds).toEqual([]);
  			expect(result.data.skipped).toEqual([
  				{ number: ORDER_ID.slice(0, 8), reason: "já em separação" },
  			]);
  		}
  	});

  	it("transiciona paid→preparing e grava history ao criar a sessão", async () => {
  		const captured: Record<string, unknown>[] = [];
  		let tx: ReturnType<typeof makeMockTx> | undefined;

  		mockTransaction.mockImplementationOnce(
  			(cb: (t: ReturnType<typeof makeMockTx>) => unknown) => {
  				tx = makeMockTx([
  					[{ status: "paid", branchId: BRANCH_ID }], // lockOrderAndAuthorize
  					[{ number: "EM-2026-0002" }], // order.number (label)
  					[], // existingSession — nenhuma sessão ativa
  					[
  						{
  							id: "item-1",
  							variantId: "variant-1",
  							quantity: 2,
  							sku: "SKU-001",
  							name: "Furadeira",
  							barcode: "12345",
  							voltage: "220V",
  						},
  					], // createPickingItems: orderItem[]
  				]);
  				tx._insertValues.mockImplementation((vals: Record<string, unknown>) => {
  					captured.push(vals);
  					return Promise.resolve(undefined);
  				});
  				return cb(tx);
  			}
  		);

  		const result = await bulkStartPicking({ orderIds: [ORDER_ID] });

  		expect(result).toMatchObject({ ok: true });
  		if (result.ok) {
  			expect(result.data.moved).toBe(1);
  			expect(result.data.movedIds).toEqual([ORDER_ID]);
  			expect(result.data.skipped).toEqual([]);
  		}

  		const updateChain = tx?.update.mock.results[0]?.value as
  			| { set: ReturnType<typeof vi.fn> }
  			| undefined;
  		expect(updateChain?.set).toHaveBeenCalledWith(
  			expect.objectContaining({ status: "preparing" })
  		);

  		expect(captured).toContainEqual(
  			expect.objectContaining({
  				orderId: ORDER_ID,
  				fromStatus: "paid",
  				toStatus: "preparing",
  				actorType: "user",
  			})
  		);
  	});

  	it("processa múltiplos pedidos e agrega moved/movedIds", async () => {
  		const ORDER_ID_2 = "a1eac10b-58cc-4372-a567-0e02b2c3d480";

  		mockTransaction.mockImplementationOnce(
  			(cb: (tx: ReturnType<typeof makeMockTx>) => unknown) =>
  				cb(
  					makeMockTx([
  						[{ status: "preparing", branchId: BRANCH_ID }],
  						[{ number: "EM-2026-0003" }],
  						[],
  						[],
  					])
  				)
  		);
  		mockTransaction.mockImplementationOnce(
  			(cb: (tx: ReturnType<typeof makeMockTx>) => unknown) =>
  				cb(
  					makeMockTx([
  						[{ status: "preparing", branchId: BRANCH_ID }],
  						[{ number: "EM-2026-0004" }],
  						[],
  						[],
  					])
  				)
  		);

  		const result = await bulkStartPicking({
  			orderIds: [ORDER_ID, ORDER_ID_2],
  		});

  		expect(result).toMatchObject({ ok: true });
  		if (result.ok) {
  			expect(result.data.moved).toBe(2);
  			expect(result.data.movedIds).toEqual([ORDER_ID, ORDER_ID_2]);
  			expect(result.data.skipped).toEqual([]);
  		}
  		expect(mockTransaction).toHaveBeenCalledTimes(2);
  	});

  	it("pedido fora do escopo de filial é pulado sem abortar o lote", async () => {
  		const ORDER_ID_2 = "a1eac10b-58cc-4372-a567-0e02b2c3d480";

  		mockRequireCapabilityWithContext.mockRejectedValueOnce(
  			new Error("Forbidden: filial fora do escopo do ator")
  		);

  		mockTransaction.mockImplementationOnce(
  			(cb: (tx: ReturnType<typeof makeMockTx>) => unknown) =>
  				cb(makeMockTx([[{ status: "preparing", branchId: BRANCH_ID }]]))
  		);
  		mockTransaction.mockImplementationOnce(
  			(cb: (tx: ReturnType<typeof makeMockTx>) => unknown) =>
  				cb(
  					makeMockTx([
  						[{ status: "preparing", branchId: BRANCH_ID }],
  						[{ number: "EM-2026-0005" }],
  						[],
  						[],
  					])
  				)
  		);

  		const result = await bulkStartPicking({
  			orderIds: [ORDER_ID, ORDER_ID_2],
  		});

  		expect(result).toMatchObject({ ok: true });
  		if (result.ok) {
  			expect(result.data.moved).toBe(1);
  			expect(result.data.movedIds).toEqual([ORDER_ID_2]);
  			expect(result.data.skipped).toEqual([
  				{ number: ORDER_ID.slice(0, 8), reason: "fora do seu escopo" },
  			]);
  		}
  	});
  });
  ```

- [ ] **Passo 8 — rodar e ver falhar.**

  ```
  bun --cwd apps/web test src/app/dashboard/separacao/__tests__/picking-actions.test.ts
  ```

  Output esperado: erro de import — `bulkStartPicking` não é exportado por `../actions` (`SyntaxError: Named export 'bulkStartPicking' not found` ou `TypeError: bulkStartPicking is not a function`), suíte inteira do arquivo falha por causa do import quebrado no topo.

- [ ] **Passo 9 — implementar `createPickingSession` (extraído de `startPicking`) em `actions.ts`.**

  Re-`Read` `apps/web/src/app/dashboard/separacao/actions.ts` se necessário. Primeiro `Edit` — insere o helper entre `createPickingItems` e `startPicking`:

  old_string:
  ```ts
  	for (const item of items) {
  		await tx.insert(orderPickingItem).values({
  			id: crypto.randomUUID(),
  			pickingId,
  			orderItemId: item.id,
  			variantId: item.variantId,
  			variantSnapshot: {
  				sku: item.sku ?? null,
  				name: item.name,
  				// COALESCE: preferir barcode do snapshot do pedido; fallback para barcode atual da variante
  				barcode: item.barcode ?? item.variantBarcode ?? null,
  				voltage: item.voltage ?? null,
  			},
  			qtyExpected: item.quantity,
  			qtyPicked: 0,
  			notFound: false,
  		});
  	}
  }

  // ---------------------------------------------------------------------------
  // startPicking
  // ---------------------------------------------------------------------------

  export async function startPicking(
  	orderId: string
  ): Promise<ActionResult<{ pickingId: string }>> {
  ```

  new_string:
  ```ts
  	for (const item of items) {
  		await tx.insert(orderPickingItem).values({
  			id: crypto.randomUUID(),
  			pickingId,
  			orderItemId: item.id,
  			variantId: item.variantId,
  			variantSnapshot: {
  				sku: item.sku ?? null,
  				name: item.name,
  				// COALESCE: preferir barcode do snapshot do pedido; fallback para barcode atual da variante
  				barcode: item.barcode ?? item.variantBarcode ?? null,
  				voltage: item.voltage ?? null,
  			},
  			qtyExpected: item.quantity,
  			qtyPicked: 0,
  			notFound: false,
  		});
  	}
  }

  /**
   * Miolo compartilhado de criação de sessão (startPicking + bulkStartPicking):
   * insere a sessão in_progress no nome do ator, copia os itens do pedido e,
   * quando o pedido ainda está "paid", transiciona pra "preparing" com history.
   * O caller já validou status (paid/preparing) e branchId (non-null) antes de
   * chamar — esta função não repete essas checagens.
   */
  async function createPickingSession(
  	tx: Tx,
  	orderId: string,
  	branchId: string,
  	status: string,
  	user: SessionUser
  ): Promise<string> {
  	const newPickingId = crypto.randomUUID();

  	await tx.insert(orderPicking).values({
  		id: newPickingId,
  		orderId,
  		branchId,
  		status: "in_progress",
  		pickerUserId: user.id,
  		pickerName: user.name ?? user.id,
  	});

  	await createPickingItems(tx, newPickingId, orderId);

  	// If paid → transition to preparing
  	if (status === "paid") {
  		await tx
  			.update(order)
  			.set({ status: "preparing", preparingAt: new Date() })
  			.where(eq(order.id, orderId));

  		await tx.insert(orderStatusHistory).values({
  			id: crypto.randomUUID(),
  			orderId,
  			fromStatus: "paid",
  			toStatus: "preparing",
  			actorType: "user",
  			actorUserId: user.id,
  		});
  	}

  	return newPickingId;
  }

  // ---------------------------------------------------------------------------
  // startPicking
  // ---------------------------------------------------------------------------

  export async function startPicking(
  	orderId: string
  ): Promise<ActionResult<{ pickingId: string }>> {
  ```

  Segundo `Edit` no mesmo arquivo — refatora o corpo de `startPicking` pra usar o helper (comportamento idêntico):

  old_string:
  ```ts
  	try {
  		const pickingId = await db.transaction(async (tx: Tx) => {
  			const locked = await lockOrderAndAuthorize(tx, "orders.pick", orderId);

  			if (!locked) {
  				throw new Error("Pedido não encontrado");
  			}

  			if (locked.status !== "paid" && locked.status !== "preparing") {
  				throw new Error(
  					`Não é possível iniciar separação com status "${locked.status}". Permitido: paid ou preparing.`
  				);
  			}

  			if (!locked.branchId) {
  				throw new Error("Pedido sem filial associada");
  			}

  			const { session } = locked;
  			const newPickingId = crypto.randomUUID();

  			await tx.insert(orderPicking).values({
  				id: newPickingId,
  				orderId,
  				branchId: locked.branchId,
  				status: "in_progress",
  				pickerUserId: session.user.id,
  				pickerName: session.user.name ?? session.user.id,
  			});

  			await createPickingItems(tx, newPickingId, orderId);

  			// If paid → transition to preparing
  			if (locked.status === "paid") {
  				await tx
  					.update(order)
  					.set({ status: "preparing", preparingAt: new Date() })
  					.where(eq(order.id, orderId));

  				await tx.insert(orderStatusHistory).values({
  					id: crypto.randomUUID(),
  					orderId,
  					fromStatus: "paid",
  					toStatus: "preparing",
  					actorType: "user",
  					actorUserId: session.user.id,
  				});
  			}

  			return newPickingId;
  		});
  ```

  new_string:
  ```ts
  	try {
  		const pickingId = await db.transaction(async (tx: Tx) => {
  			const locked = await lockOrderAndAuthorize(tx, "orders.pick", orderId);

  			if (!locked) {
  				throw new Error("Pedido não encontrado");
  			}

  			if (locked.status !== "paid" && locked.status !== "preparing") {
  				throw new Error(
  					`Não é possível iniciar separação com status "${locked.status}". Permitido: paid ou preparing.`
  				);
  			}

  			if (!locked.branchId) {
  				throw new Error("Pedido sem filial associada");
  			}

  			return await createPickingSession(
  				tx,
  				orderId,
  				locked.branchId,
  				locked.status,
  				locked.session.user
  			);
  		});
  ```

- [ ] **Passo 10 — rodar e ver o teste de `startPicking` continuar passando (refactor comportamento-preservado).**

  ```
  bun --cwd apps/web test src/app/dashboard/separacao/__tests__/picking-actions.test.ts -t startPicking
  ```

  Output esperado: os 5 testes do describe `startPicking` em verde (nenhuma mudança de comportamento). Os testes de `bulkStartPicking` ainda falham nesta rodada (função não existe) — esperado, tratado no próximo passo.

- [ ] **Passo 11 — implementar `bulkStartPicking`.**

  No mesmo arquivo, primeiro `Edit` os imports do topo:

  old_string:
  ```ts
  "use server";

  import { db } from "@emach/db";
  import {
  	order,
  	orderItem,
  	orderPicking,
  	orderPickingItem,
  	orderPickingScan,
  	orderStatusHistory,
  } from "@emach/db/schema/orders";
  import { toolVariant } from "@emach/db/schema/tools";
  import { eq } from "drizzle-orm";
  import { revalidatePath } from "next/cache";
  import { isCapabilityError } from "@/lib/action-error";
  import type { ActionResult } from "@/lib/action-result";
  import { getUserBranchScope, orderInScope } from "@/lib/branch-scope";
  import { getPgError } from "@/lib/db-error";
  import { logger } from "@/lib/logger";
  import { requireCapability } from "@/lib/permissions";
  import { lockOrderAndAuthorize } from "../orders/actions";
  import { canFinalizePicking, matchPickItem } from "./_lib/picking-logic";
  import {
  	fetchPickingQueuePage,
  	getActivePickingForUser,
  	getOrderBranchId,
  	getPickingForOrder,
  } from "./data";
  import type { ScanResult } from "./schema";
  ```

  new_string:
  ```ts
  "use server";

  import { db } from "@emach/db";
  import {
  	order,
  	orderItem,
  	orderPicking,
  	orderPickingItem,
  	orderPickingScan,
  	orderStatusHistory,
  } from "@emach/db/schema/orders";
  import { toolVariant } from "@emach/db/schema/tools";
  import { and, eq } from "drizzle-orm";
  import { revalidatePath } from "next/cache";
  import { isCapabilityError } from "@/lib/action-error";
  import type { ActionResult } from "@/lib/action-result";
  import { getUserBranchScope, orderInScope } from "@/lib/branch-scope";
  import { getPgError } from "@/lib/db-error";
  import { logger } from "@/lib/logger";
  import { requireCapability } from "@/lib/permissions";
  import { bulkSkipReasonFromError } from "../orders/_lib/bulk-eligibility";
  import { lockOrderAndAuthorize } from "../orders/actions";
  import {
  	BULK_PICKING_SKIP_LABEL,
  	bulkStartPickingSkipReason,
  	canFinalizePicking,
  	matchPickItem,
  } from "./_lib/picking-logic";
  import {
  	fetchPickingQueuePage,
  	getActivePickingForUser,
  	getOrderBranchId,
  	getPickingForOrder,
  } from "./data";
  import { bulkStartPickingSchema, type ScanResult } from "./schema";
  ```

  Segundo `Edit` no mesmo arquivo — insere `bulkStartPicking` entre o fim de `startPicking` e o comentário de `scanItem`:

  old_string:
  ```ts
  	} catch (error) {
  		logger.error("startPicking", error);

  		const pgErr = getPgError(error);
  		if (
  			pgErr?.code === "23505" &&
  			pgErr.constraint === "order_picking_one_active"
  		) {
  			return {
  				ok: false,
  				error: "Já existe uma separação em andamento para este pedido",
  			};
  		}

  		if (isCapabilityError(error)) {
  			return { ok: false, error: "Sem permissão para iniciar separação." };
  		}

  		return {
  			ok: false,
  			error:
  				error instanceof Error ? error.message : "Erro ao iniciar separação",
  		};
  	}
  }

  // ---------------------------------------------------------------------------
  // scanItem
  // ---------------------------------------------------------------------------
  ```

  new_string:
  ```ts
  	} catch (error) {
  		logger.error("startPicking", error);

  		const pgErr = getPgError(error);
  		if (
  			pgErr?.code === "23505" &&
  			pgErr.constraint === "order_picking_one_active"
  		) {
  			return {
  				ok: false,
  				error: "Já existe uma separação em andamento para este pedido",
  			};
  		}

  		if (isCapabilityError(error)) {
  			return { ok: false, error: "Sem permissão para iniciar separação." };
  		}

  		return {
  			ok: false,
  			error:
  				error instanceof Error ? error.message : "Erro ao iniciar separação",
  		};
  	}
  }

  // ---------------------------------------------------------------------------
  // bulkStartPicking
  // ---------------------------------------------------------------------------

  export interface BulkStartPickingResult {
  	moved: number;
  	movedIds: string[];
  	skipped: { number: string; reason: string }[];
  }

  const BULK_PICKING_GENERIC_ERROR = "Erro ao iniciar separação em lote.";

  /**
   * Claim em lote da tab "A separar" (D7/D12, spec 2026-07-16): cria uma sessão
   * de picking in_progress no nome do ator para cada pedido, uma transação por
   * pedido (lock + capability branch-scoped via lockOrderAndAuthorize). Reusa o
   * miolo de startPicking (createPickingSession) e a régua de elegibilidade via
   * bulkStartPickingSkipReason — pedido inelegível é pulado, nunca derruba o
   * lote (padrão de bulkStartSeparation). A corrida contra outro claim (D12) é
   * coberta duas vezes: pré-check de sessão in_progress existente (caminho
   * comum) e catch do 23505 de order_picking_one_active (última defesa).
   */
  export async function bulkStartPicking(
  	input: { orderIds: string[] }
  ): Promise<ActionResult<BulkStartPickingResult>> {
  	const parsed = bulkStartPickingSchema.safeParse(input);
  	if (!parsed.success) {
  		return {
  			ok: false,
  			error: parsed.error.issues[0]?.message ?? "Entrada inválida",
  		};
  	}

  	const orderIds = Array.from(new Set(parsed.data.orderIds));
  	let moved = 0;
  	const movedIds: string[] = [];
  	const skipped: { number: string; reason: string }[] = [];

  	try {
  		// Fail-fast global: sem a capability nem adianta iterar (padrão de
  		// bulkStartSeparation). A autorização por pedido/filial roda de novo
  		// dentro de lockOrderAndAuthorize — este check só evita processar o
  		// lote inteiro quando o ator não tem a capability de forma alguma.
  		await requireCapability("orders.pick");

  		try {
  			for (const orderId of orderIds) {
  				const fallbackLabel = orderId.slice(0, 8);
  				try {
  					await db.transaction(async (tx: Tx) => {
  						const locked = await lockOrderAndAuthorize(
  							tx,
  							"orders.pick",
  							orderId
  						);
  						if (!locked) {
  							skipped.push({ number: fallbackLabel, reason: "não encontrado" });
  							return;
  						}

  						const [row] = await tx
  							.select({ number: order.number })
  							.from(order)
  							.where(eq(order.id, orderId))
  							.limit(1);
  						const label = row?.number ?? fallbackLabel;

  						const reason = bulkStartPickingSkipReason(locked);
  						if (reason) {
  							skipped.push({
  								number: label,
  								reason: BULK_PICKING_SKIP_LABEL[reason],
  							});
  							return;
  						}

  						if (!locked.branchId) {
  							// Inatingível: bulkStartPickingSkipReason já retornou
  							// "sem_filial" acima quando branchId é null. Mantido só
  							// para o TypeScript estreitar `string | null` → `string`.
  							skipped.push({
  								number: label,
  								reason: BULK_PICKING_SKIP_LABEL.sem_filial,
  							});
  							return;
  						}
  						const branchId = locked.branchId;

  						const [existingSession] = await tx
  							.select({ id: orderPicking.id })
  							.from(orderPicking)
  							.where(
  								and(
  									eq(orderPicking.orderId, orderId),
  									eq(orderPicking.status, "in_progress")
  								)
  							)
  							.limit(1);
  						if (existingSession) {
  							skipped.push({ number: label, reason: "já em separação" });
  							return;
  						}

  						await createPickingSession(
  							tx,
  							orderId,
  							branchId,
  							locked.status,
  							locked.session.user
  						);

  						moved += 1;
  						movedIds.push(orderId);
  					});
  				} catch (error) {
  					const pgErr = getPgError(error);
  					if (
  						pgErr?.code === "23505" &&
  						pgErr.constraint === "order_picking_one_active"
  					) {
  						skipped.push({ number: fallbackLabel, reason: "já em separação" });
  						continue;
  					}
  					const skipReason = bulkSkipReasonFromError(error);
  					if (skipReason) {
  						skipped.push({ number: fallbackLabel, reason: skipReason });
  						continue;
  					}
  					throw error;
  				}
  			}
  		} finally {
  			// Escritas parciais já commitadas por pedido processado antes de um
  			// abort no meio do lote (erro de infra) precisam refletir no cache,
  			// mesmo quando o retorno abaixo é {ok:false} (padrão de bulkStartSeparation).
  			for (const id of movedIds) {
  				revalidatePickingPaths(id);
  			}
  		}

  		return { ok: true, data: { moved, movedIds, skipped } };
  	} catch (error) {
  		logger.error("bulkStartPicking", error);

  		if (isCapabilityError(error)) {
  			return { ok: false, error: "Sem permissão para iniciar separação." };
  		}

  		return { ok: false, error: BULK_PICKING_GENERIC_ERROR };
  	}
  }

  // ---------------------------------------------------------------------------
  // scanItem
  // ---------------------------------------------------------------------------
  ```

- [ ] **Passo 12 — rodar e ver passar.**

  ```
  bun --cwd apps/web test src/app/dashboard/separacao/__tests__/picking-actions.test.ts
  ```

  Output esperado: suíte inteira do arquivo em verde (todos os describes anteriores + `bulkStartPicking` com os 5 testes novos), 0 failed.

- [ ] **Passo 13 — rodar a suíte completa de `apps/web` com cache limpo.**

  ```
  bun --cwd apps/web test
  bun check-types --force
  bun check
  ```

  Output esperado: as três em verde/PASS — nenhum teste quebrado nas outras suítes, `tsc --noEmit` sem erros, `ultracite check` sem violações (nada de `console.*`, `any`, barrel file, etc. introduzido).

- [ ] **Passo 14 — commit.**

  ```
  git add apps/web/src/app/dashboard/separacao/_lib/picking-logic.ts \
    apps/web/src/app/dashboard/separacao/_lib/__tests__/picking-logic.test.ts \
    apps/web/src/app/dashboard/separacao/schema.ts \
    apps/web/src/app/dashboard/separacao/actions.ts \
    apps/web/src/app/dashboard/separacao/__tests__/picking-actions.test.ts
  git commit -m "feat: adiciona bulkStartPicking na separação"
  ```

  Output esperado: commit criado, `git status` limpo pros arquivos listados.

### Task 2: `bulkStartSeparation` ganha `branchId` opcional + testes (D1 backend)

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/schema.ts`
- Modify: `apps/web/src/app/dashboard/orders/actions.ts`
- Test: `apps/web/src/app/dashboard/orders/__tests__/bulk-start-separation.test.ts` (novo)

**Interfaces:**

Consumes (já existentes, assinaturas inalteradas — reusadas dentro da nova lógica):
```ts
// apps/web/src/app/dashboard/orders/actions.ts
export async function lockOrderAndAuthorize(
	tx: OrderTx,
	cap: Capability,
	orderId: string
): Promise<LockedOrderAuth | null>

function buildOrderStatusUpdate(
	toStatus: OrderStatus,
	trackingCode: string | undefined,
	branchId: string | undefined
): Record<string, unknown>

async function insertOrderEvent(
	tx: OrderTx,
	args: {
		orderId: string;
		eventType: "tracking_set" | "branch_assigned" | "shipping_reviewed" | "ship_forced";
		metadata: Record<string, unknown>;
		actorUserId: string | null;
	}
): Promise<void>

// apps/web/src/app/dashboard/orders/_lib/bulk-eligibility.ts
export function bulkStartSeparationSkipReason(locked: {
	branchId: string | null;
	status: string;
}): BulkSkipReason | null

// @/lib/permissions
export async function requireCapability(cap: Capability): Promise<DashboardSession>
export async function requireCapabilityWithContext(
	cap: Capability,
	ctx: CapabilityContext = {}
): Promise<DashboardSession>
```

Produces (contrato alterado — só o **input** ganha campo; o retorno não muda):
```ts
// apps/web/src/app/dashboard/orders/schema.ts
export const bulkStartSeparationSchema = z.object({
	orderIds: z.array(z.string().uuid()).min(1).max(100),
	branchId: z.string().uuid().optional(),
});
export type BulkStartSeparationInput = z.infer<typeof bulkStartSeparationSchema>;
// => { orderIds: string[]; branchId?: string }

// apps/web/src/app/dashboard/orders/actions.ts (assinatura pública inalterada)
export interface BulkStartSeparationResult {
	moved: number;
	movedIds: string[];
	skipped: { number: string; reason: string }[];
}
export async function bulkStartSeparation(
	input: BulkStartSeparationInput
): Promise<ActionResult<BulkStartSeparationResult>>
```

**Steps:**

- [ ] 1. Ler `apps/web/src/app/dashboard/orders/schema.ts` e `apps/web/src/app/dashboard/orders/actions.ts` com a tool Read (obrigatório antes de qualquer Edit nesta sessão — se já leu antes de outro agente ter tocado o arquivo, re-leia).

- [ ] 2. Escrever o teste falhando. Criar `apps/web/src/app/dashboard/orders/__tests__/bulk-start-separation.test.ts` com o conteúdo abaixo (arquivo novo — usar Write):

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks — definidos antes dos vi.mock (padrão assign-branch.test.ts)
// ---------------------------------------------------------------------------

const {
	mockTransaction,
	mockDbSelect,
	mockRequireCapability,
	mockRequireCapabilityWithContext,
	mockGetUserBranchScope,
} = vi.hoisted(() => ({
	mockTransaction: vi.fn(),
	mockDbSelect: vi.fn(),
	mockRequireCapability: vi.fn(),
	mockRequireCapabilityWithContext: vi.fn(),
	mockGetUserBranchScope: vi.fn(),
}));

// Mock @emach/db — bulkStartSeparation usa db.transaction (por pedido) e
// db.select (nome da filial de destino, lido uma vez fora do loop).
vi.mock("@emach/db", () => ({
	db: { transaction: mockTransaction, select: mockDbSelect },
	createDb: vi.fn(() => ({})),
}));

// Mock @/lib/permissions — requireCapability/requireCapabilityWithContext são
// os gates checados (fail-fast fora do loop + dentro de lockOrderAndAuthorize).
vi.mock("@/lib/permissions", () => ({
	requireCapability: mockRequireCapability,
	requireCapabilityWithContext: mockRequireCapabilityWithContext,
	getUserCapabilities: vi.fn().mockResolvedValue([]),
	roleHasCapability: vi.fn().mockReturnValue(true),
	can: vi.fn().mockResolvedValue(true),
}));

// Mock @/lib/branch-scope — usado dentro de lockOrderAndAuthorize pro caminho
// de pedido em triagem (branchId null).
vi.mock("@/lib/branch-scope", () => ({
	getUserBranchScope: mockGetUserBranchScope,
	inScope: vi.fn().mockReturnValue(true),
	isBlindScope: vi.fn().mockReturnValue(false),
}));

// Mock next/cache — bulkStartSeparation chama revalidatePath E revalidateTag.
vi.mock("next/cache", () => ({
	revalidatePath: vi.fn(),
	revalidateTag: vi.fn(),
}));

// Mock logger — evita ruído de console.
vi.mock("@/lib/logger", () => ({
	logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

// Mock módulos de leitura que dependem de conexão real com @emach/db.
vi.mock("../data", () => ({
	fetchOrdersPage: vi.fn(),
}));

vi.mock("../pending-data", () => ({
	fetchOrderActivityPage: vi.fn(),
	fetchPendingOrdersPage: vi.fn(),
}));

// Mock @/lib/session — usado transitivamente por @emach/auth/dashboard.
vi.mock("@/lib/session", () => ({
	requireCurrentSession: vi.fn(),
	ROLE_WEIGHT: { super_admin: 3, admin: 2, user: 1 },
}));

// ---------------------------------------------------------------------------
// Import depois dos mocks
// ---------------------------------------------------------------------------

import { bulkStartSeparation } from "../actions";
import { bulkStartSeparationSchema } from "../schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ORDER_A = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const ORDER_B = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";
const BRANCH_ID = "550e8400-e29b-41d4-a716-446655440000";
const OWN_BRANCH_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const USER_ID = "usr_42";

function makeSelectChain(result: unknown[]) {
	const chain: Record<string, unknown> = {};
	chain.from = vi.fn(() => chain);
	chain.where = vi.fn(() => chain);
	chain.for = vi.fn(() => chain);
	chain.limit = vi.fn(() => Promise.resolve(result));
	return chain;
}

/**
 * Tx mockada de UM pedido. `selectResults` são os resultados, em ordem, dos
 * `tx.select(...)` disparados por esse pedido: [0] = lock (status+branchId),
 * [1] = número do pedido. Update/insert são capturados p/ asserção.
 */
function makeMockTx(selectResults: unknown[][]) {
	let selectCallIdx = 0;
	const insertedRows: Record<string, unknown>[] = [];
	const updateSets: Record<string, unknown>[] = [];

	const makeUpdateChain = () => {
		const chain: Record<string, unknown> = {};
		chain.set = vi.fn((vals: Record<string, unknown>) => {
			updateSets.push(vals);
			return chain;
		});
		chain.where = vi.fn(() => Promise.resolve({ rowCount: 1 }));
		return chain;
	};

	const makeInsertChain = () => ({
		values: vi.fn((vals: Record<string, unknown>) => {
			insertedRows.push(vals);
			return Promise.resolve(undefined);
		}),
	});

	return {
		select: vi.fn(() => {
			const result = selectResults[selectCallIdx++] ?? [];
			return makeSelectChain(result);
		}),
		update: vi.fn(() => makeUpdateChain()),
		insert: vi.fn(() => makeInsertChain()),
		_insertedRows: insertedRows,
		_updateSets: updateSets,
	};
}

/** Encadeia uma tx mockada por pedido, na ordem em que orderIds é iterado. */
function queueTransactions(txs: Array<ReturnType<typeof makeMockTx>>) {
	let callIdx = 0;
	mockTransaction.mockImplementation(
		async (cb: (tx: ReturnType<typeof makeMockTx>) => unknown) =>
			cb(txs[callIdx++])
	);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("bulkStartSeparationSchema", () => {
	it("aceita orderIds sem branchId (comportamento atual)", () => {
		const result = bulkStartSeparationSchema.safeParse({ orderIds: [ORDER_A] });
		expect(result.success).toBe(true);
	});

	it("aceita branchId opcional junto de orderIds", () => {
		const result = bulkStartSeparationSchema.safeParse({
			orderIds: [ORDER_A],
			branchId: BRANCH_ID,
		});
		expect(result.success).toBe(true);
	});

	it("rejeita branchId em formato inválido", () => {
		const result = bulkStartSeparationSchema.safeParse({
			orderIds: [ORDER_A],
			branchId: "não-é-uuid",
		});
		expect(result.success).toBe(false);
	});
});

describe("bulkStartSeparation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireCapability.mockResolvedValue({ user: { id: USER_ID } });
		mockRequireCapabilityWithContext.mockResolvedValue({
			user: { id: USER_ID },
		});
		mockGetUserBranchScope.mockResolvedValue({ kind: "all" });
		mockDbSelect.mockReturnValue(makeSelectChain([{ name: "Filial Destino" }]));
	});

	it("(a) sem branchId — pedido pago sem filial própria é pulado com 'sem filial' (comportamento atual intacto)", async () => {
		const tx = makeMockTx([
			[{ status: "paid", branchId: null }],
			[{ number: "EM-2026-0001" }],
		]);
		queueTransactions([tx]);

		const result = await bulkStartSeparation({ orderIds: [ORDER_A] });

		expect(result).toEqual({
			ok: true,
			data: {
				moved: 0,
				movedIds: [],
				skipped: [{ number: "EM-2026-0001", reason: "sem filial" }],
			},
		});
		expect(mockRequireCapability).toHaveBeenCalledWith("orders.update_status");
		expect(mockRequireCapabilityWithContext).not.toHaveBeenCalled();
		expect(tx._updateSets).toHaveLength(0);
	});

	it("(b) com branchId — aplica ao pedido sem filial própria e grava orderEvent branch_assigned", async () => {
		const tx = makeMockTx([
			[{ status: "paid", branchId: null }],
			[{ number: "EM-2026-0002" }],
		]);
		queueTransactions([tx]);

		const result = await bulkStartSeparation({
			orderIds: [ORDER_A],
			branchId: BRANCH_ID,
		});

		expect(result).toEqual({
			ok: true,
			data: { moved: 1, movedIds: [ORDER_A], skipped: [] },
		});

		// Fail-fast: capability checada contra a filial de DESTINO antes do loop.
		expect(mockRequireCapabilityWithContext).toHaveBeenCalledWith(
			"orders.update_status",
			{ targetBranchIds: [BRANCH_ID] }
		);

		// UPDATE aplica a filial informada junto da transição de status.
		expect(tx._updateSets).toHaveLength(1);
		expect(tx._updateSets[0]).toMatchObject({
			status: "preparing",
			branchId: BRANCH_ID,
		});

		// orderEvent branch_assigned auditado, igual ao assignBranch singular.
		const branchEvent = tx._insertedRows.find(
			(row) => row.eventType === "branch_assigned"
		);
		expect(branchEvent).toMatchObject({
			orderId: ORDER_A,
			eventType: "branch_assigned",
			metadata: { branchId: BRANCH_ID, branchName: "Filial Destino" },
			actorType: "user",
			actorUserId: USER_ID,
		});
	});

	it("(c) com branchId — pedido que já tem filial mantém a sua (não sobrescreve, sem orderEvent)", async () => {
		const tx = makeMockTx([
			[{ status: "paid", branchId: OWN_BRANCH_ID }],
			[{ number: "EM-2026-0003" }],
		]);
		queueTransactions([tx]);

		const result = await bulkStartSeparation({
			orderIds: [ORDER_A],
			branchId: BRANCH_ID,
		});

		expect(result).toEqual({
			ok: true,
			data: { moved: 1, movedIds: [ORDER_A], skipped: [] },
		});

		expect(tx._updateSets).toHaveLength(1);
		expect(tx._updateSets[0]).toMatchObject({ status: "preparing" });
		expect(tx._updateSets[0].branchId).toBeUndefined();

		const branchEvent = tx._insertedRows.find(
			(row) => row.eventType === "branch_assigned"
		);
		expect(branchEvent).toBeUndefined();
	});

	it("(d) com branchId — sem escopo na filial de destino aborta o lote antes do loop (nenhuma transação aberta)", async () => {
		mockRequireCapabilityWithContext.mockRejectedValueOnce(
			new Error("Forbidden: sem acesso à filial de destino")
		);

		const result = await bulkStartSeparation({
			orderIds: [ORDER_A],
			branchId: BRANCH_ID,
		});

		expect(result).toEqual({
			ok: false,
			error: "Sem permissão para alterar pedidos.",
		});
		expect(mockTransaction).not.toHaveBeenCalled();
	});

	it("(e) com branchId inexistente — retorna 'Filial não encontrada' sem iterar o lote", async () => {
		mockDbSelect.mockReturnValue(makeSelectChain([]));

		const result = await bulkStartSeparation({
			orderIds: [ORDER_A],
			branchId: BRANCH_ID,
		});

		expect(result).toEqual({ ok: false, error: "Filial não encontrada" });
		expect(mockTransaction).not.toHaveBeenCalled();
	});

	it("(f) lote misto: um pedido é movido e outro é pulado por status diferente de paid", async () => {
		const txA = makeMockTx([
			[{ status: "paid", branchId: null }],
			[{ number: "EM-2026-0004" }],
		]);
		const txB = makeMockTx([
			[{ status: "preparing", branchId: OWN_BRANCH_ID }],
			[{ number: "EM-2026-0005" }],
		]);
		queueTransactions([txA, txB]);

		const result = await bulkStartSeparation({
			orderIds: [ORDER_A, ORDER_B],
			branchId: BRANCH_ID,
		});

		expect(result).toEqual({
			ok: true,
			data: {
				moved: 1,
				movedIds: [ORDER_A],
				skipped: [{ number: "EM-2026-0005", reason: "não está mais em Pago" }],
			},
		});
	});
});
```

- [ ] 3. Rodar o teste novo e ver falhar (o schema ainda não aceita `branchId` e a action ainda não implementa a lógica — falha esperada em `bulkStartSeparationSchema` rejeitando `branchId` como campo desconhecido só se `strict()`, então a falha real vem das asserções de comportamento em `bulkStartSeparation`, ex.: teste (b) vai falhar porque hoje o pedido sem filial é sempre pulado como "sem filial", nunca recebe `branchId`):

```
bun --cwd apps/web test src/app/dashboard/orders/__tests__/bulk-start-separation.test.ts
```

Output esperado: FAIL, com pelo menos os testes `(b)`, `(c)`, `(d)`, `(e)` falhando (o input `branchId` é ignorado pelo parse atual — `z.object` sem `strict()` aceita chave extra silenciosamente, mas a lógica de `bulkStartSeparation` não lê `parsed.data.branchId`, então o pedido sem filial cai em skip "sem filial" em vez de ser movido).

- [ ] 4. Editar `apps/web/src/app/dashboard/orders/schema.ts` — adicionar `branchId` opcional ao schema do bulk. Usar Edit:

old_string:
```ts
export const bulkStartSeparationSchema = z.object({
	orderIds: z.array(z.string().uuid()).min(1).max(100),
});

export type BulkStartSeparationInput = z.infer<
	typeof bulkStartSeparationSchema
>;
```

new_string:
```ts
export const bulkStartSeparationSchema = z.object({
	orderIds: z.array(z.string().uuid()).min(1).max(100),
	// Dialog "Enviar para separação" (D1, spec 2026-07-16): quando informada,
	// aplica-se SÓ aos pedidos do lote sem filial própria — nunca sobrescreve.
	branchId: z.string().uuid().optional(),
});

export type BulkStartSeparationInput = z.infer<
	typeof bulkStartSeparationSchema
>;
```

Se o Edit falhar com "string not found" (o hook `bun fix` pode ter reformatado o arquivo após o Read), re-Read `apps/web/src/app/dashboard/orders/schema.ts` e repetir o Edit com o texto atualizado.

- [ ] 5. Editar `apps/web/src/app/dashboard/orders/actions.ts` — substituir o corpo de `bulkStartSeparation` para ler `branchId`, checar a capability contra a filial de destino fail-fast, e aplicar/auditar a filial só nos pedidos sem filial própria. Usar Edit:

old_string:
```ts
/**
 * Bulk pago→separação (spec 2026-07-11). Cada pedido roda em transação
 * própria com lock + capability branch-scoped; inelegíveis são pulados e
 * reportados — um pedido problemático não derruba o lote.
 */
export async function bulkStartSeparation(
	input: BulkStartSeparationInput
): Promise<ActionResult<BulkStartSeparationResult>> {
	const parsed = bulkStartSeparationSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "Entrada inválida",
		};
	}

	const orderIds = Array.from(new Set(parsed.data.orderIds));
	let moved = 0;
	const movedIds: string[] = [];
	const skipped: { number: string; reason: string }[] = [];

	try {
		// Fail-fast global: sem a capability nem adianta iterar.
		await requireCapability("orders.update_status");

		try {
			for (const orderId of orderIds) {
				// Placeholder até a autorização passar — o número real só é lido
				// (dentro da tx, já travado) depois do lock+capability check, pra
				// não vazar número de pedido fora do escopo do ator (skip reports
				// pré-autorização usam só o id truncado).
				const fallbackLabel = orderId.slice(0, 8);
				try {
					await db.transaction(async (tx) => {
						const locked = await lockOrderAndAuthorize(
							tx,
							"orders.update_status",
							orderId
						);
						if (!locked) {
							skipped.push({ number: fallbackLabel, reason: "não encontrado" });
							return;
						}
						const [row] = await tx
							.select({ number: order.number })
							.from(order)
							.where(eq(order.id, orderId))
							.limit(1);
						const label = row?.number ?? fallbackLabel;

						const reason = bulkStartSeparationSkipReason(locked);
						if (reason) {
							skipped.push({ number: label, reason: BULK_SKIP_LABEL[reason] });
							return;
						}
						await tx
							.update(order)
							.set(buildOrderStatusUpdate("preparing", undefined, undefined))
							.where(eq(order.id, orderId));
						await tx.insert(orderStatusHistory).values({
							id: crypto.randomUUID(),
							orderId,
							fromStatus: "paid",
							toStatus: "preparing",
							actorType: "user",
							actorUserId: locked.session.user.id,
							reason: null,
						});
						moved += 1;
						movedIds.push(orderId);
					});
				} catch (error) {
					const skipReason = bulkSkipReasonFromError(error);
					if (skipReason) {
						skipped.push({ number: fallbackLabel, reason: skipReason });
					} else {
						throw error;
					}
				}
			}
		} finally {
			// Escritas parciais já commitadas por pedido processado antes de um
			// abort no meio do lote (erro de infra) precisam refletir no cache,
			// mesmo quando o retorno abaixo é {ok:false}.
			revalidatePath(ORDERS_PATH);
			revalidateTag(ORDERS_COUNTS_TAG, "max");
		}

		return { ok: true, data: { moved, movedIds, skipped } };
	} catch (error) {
		logger.error("bulkStartSeparation", { err: error });
		if (isCapabilityError(error)) {
			return { ok: false, error: "Sem permissão para alterar pedidos." };
		}
		// Erro de banco: mapear SQLSTATE p/ mensagem amigável. NUNCA devolver
		// error.message (o toast exibe o retorno cru — vazaria SQL do drizzle).
		const pgErr = getPgError(error);
		if (pgErr) {
			return { ok: false, error: pgErrorMessage(pgErr) };
		}
		return { ok: false, error: BULK_GENERIC_ERROR };
	}
}
```

new_string:
```ts
/**
 * Bulk pago→separação (spec 2026-07-11, D1 do redesign 2026-07-16). Cada
 * pedido roda em transação própria com lock + capability branch-scoped;
 * inelegíveis são pulados e reportados — um pedido problemático não derruba
 * o lote. Quando `branchId` é informado (novo dialog "Enviar para
 * separação"), aplica-se SÓ aos pedidos SEM filial própria (nunca
 * sobrescreve quem já tem) e a filial de destino é auditada via orderEvent
 * "branch_assigned", igual ao `assignBranch` singular.
 */
export async function bulkStartSeparation(
	input: BulkStartSeparationInput
): Promise<ActionResult<BulkStartSeparationResult>> {
	const parsed = bulkStartSeparationSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "Entrada inválida",
		};
	}

	const { branchId } = parsed.data;
	const orderIds = Array.from(new Set(parsed.data.orderIds));
	let moved = 0;
	const movedIds: string[] = [];
	const skipped: { number: string; reason: string }[] = [];

	try {
		// Fail-fast: com filial informada, checa a capability contra a filial de
		// DESTINO uma vez (padrão bulkAssignBranch) — sem isso nem adianta
		// iterar. Sem filial, mantém o check genérico de sempre (intacto).
		let destBranchName: string | undefined;
		if (branchId) {
			await requireCapabilityWithContext("orders.update_status", {
				targetBranchIds: [branchId],
			});
			const [destBranch] = await db
				.select({ name: branch.name })
				.from(branch)
				.where(eq(branch.id, branchId))
				.limit(1);
			if (!destBranch) {
				return { ok: false, error: "Filial não encontrada" };
			}
			destBranchName = destBranch.name;
		} else {
			await requireCapability("orders.update_status");
		}

		try {
			for (const orderId of orderIds) {
				// Placeholder até a autorização passar — o número real só é lido
				// (dentro da tx, já travado) depois do lock+capability check, pra
				// não vazar número de pedido fora do escopo do ator (skip reports
				// pré-autorização usam só o id truncado).
				const fallbackLabel = orderId.slice(0, 8);
				try {
					await db.transaction(async (tx) => {
						const locked = await lockOrderAndAuthorize(
							tx,
							"orders.update_status",
							orderId
						);
						if (!locked) {
							skipped.push({ number: fallbackLabel, reason: "não encontrado" });
							return;
						}
						const [row] = await tx
							.select({ number: order.number })
							.from(order)
							.where(eq(order.id, orderId))
							.limit(1);
						const label = row?.number ?? fallbackLabel;

						// Pedido sem filial própria herda a informada no lote — a
						// elegibilidade usa essa filial efetiva pra decidir se ainda
						// falta filial (nunca sobrescreve quem já tem uma).
						const effectiveBranchId = locked.branchId ?? branchId ?? null;
						const reason = bulkStartSeparationSkipReason({
							status: locked.status,
							branchId: effectiveBranchId,
						});
						if (reason) {
							skipped.push({ number: label, reason: BULK_SKIP_LABEL[reason] });
							return;
						}

						const branchIdToApply =
							locked.branchId === null ? branchId : undefined;

						await tx
							.update(order)
							.set(
								buildOrderStatusUpdate("preparing", undefined, branchIdToApply)
							)
							.where(eq(order.id, orderId));
						await tx.insert(orderStatusHistory).values({
							id: crypto.randomUUID(),
							orderId,
							fromStatus: "paid",
							toStatus: "preparing",
							actorType: "user",
							actorUserId: locked.session.user.id,
							reason: null,
						});

						if (branchIdToApply) {
							await insertOrderEvent(tx, {
								orderId,
								eventType: "branch_assigned",
								metadata: {
									branchId: branchIdToApply,
									branchName: destBranchName ?? branchIdToApply,
								},
								actorUserId: locked.session.user.id,
							});
						}

						moved += 1;
						movedIds.push(orderId);
					});
				} catch (error) {
					const skipReason = bulkSkipReasonFromError(error);
					if (skipReason) {
						skipped.push({ number: fallbackLabel, reason: skipReason });
					} else {
						throw error;
					}
				}
			}
		} finally {
			// Escritas parciais já commitadas por pedido processado antes de um
			// abort no meio do lote (erro de infra) precisam refletir no cache,
			// mesmo quando o retorno abaixo é {ok:false}.
			revalidatePath(ORDERS_PATH);
			revalidateTag(ORDERS_COUNTS_TAG, "max");
		}

		return { ok: true, data: { moved, movedIds, skipped } };
	} catch (error) {
		logger.error("bulkStartSeparation", { err: error });
		if (isCapabilityError(error)) {
			return { ok: false, error: "Sem permissão para alterar pedidos." };
		}
		// Erro de banco: mapear SQLSTATE p/ mensagem amigável. NUNCA devolver
		// error.message (o toast exibe o retorno cru — vazaria SQL do drizzle).
		const pgErr = getPgError(error);
		if (pgErr) {
			return { ok: false, error: pgErrorMessage(pgErr) };
		}
		return { ok: false, error: BULK_GENERIC_ERROR };
	}
}
```

Se o Edit falhar com "string not found", re-Read `apps/web/src/app/dashboard/orders/actions.ts` (o hook `bun fix` pode ter reformatado após o Write do passo 4) e repetir com o texto atualizado.

- [ ] 6. Rodar o teste e ver passar:

```
bun --cwd apps/web test src/app/dashboard/orders/__tests__/bulk-start-separation.test.ts
```

Output esperado: `PASS`, 9 testes (3 do schema + 6 de `bulkStartSeparation`), 0 falhas.

- [ ] 7. Rodar a suíte inteira de orders pra garantir que `assignBranch`/`bulkAssignBranch`/`bulk-eligibility` (que compartilham `lockOrderAndAuthorize`/`insertOrderEvent`/`buildOrderStatusUpdate`) continuam intactos:

```
bun --cwd apps/web test src/app/dashboard/orders
```

Output esperado: `PASS` em todos os arquivos do diretório (`assign-branch.test.ts`, `bulk-eligibility.test.ts`, `bulk-start-separation.test.ts`, `display-state.test.ts`, `lateness.test.ts`, `orders-filters-schema.test.ts`, `orders-read-guards.test.ts`, `ship-gating.test.ts`, `status-meta.test.ts`), 0 falhas.

- [ ] 8. Rodar `bun check-types` com cache limpo (o turbo pode servir um PASS velho):

```
bun check-types --force
```

Output esperado: sem erros em `apps/web/src/app/dashboard/orders/schema.ts`, `actions.ts` nem no novo teste.

- [ ] 9. Rodar `bun check` (ultracite — pega regras de lint que `check-types` não pega):

```
bun check
```

Output esperado: sem novos warnings/erros nos 3 arquivos tocados.

- [ ] 10. Commit:

```
git add apps/web/src/app/dashboard/orders/schema.ts apps/web/src/app/dashboard/orders/actions.ts apps/web/src/app/dashboard/orders/__tests__/bulk-start-separation.test.ts
git commit -m "feat(orders): bulkStartSeparation aceita filial opcional"
```

### Task 3: SendToSeparationDialog + rewiring do orders-view (D1/D2/D3)

**Contexto:** implementa as decisões D1 (um botão só, dialog com Select de filial),
D2 (remove "Atribuir filial" avulso da seleção de pagos, mantém só no contexto de
triagem) e D3 (zero PDF/toast-com-ação na tela de Pedidos) do spec
`docs/superpowers/specs/2026-07-16-fluxo-pedidos-separacao-redesign-design.md`.

**Depende da Task 2:** `bulkStartSeparation` precisa aceitar `branchId?: string` no
input (aplicado só a pedidos com `branch_id IS NULL`, nunca sobrescreve os que já
têm filial). Este plano consome essa assinatura; se a Task 2 ainda não tiver
mudado `actions.ts`, `bun check-types` no passo 8 vai falhar em
`bulkStartSeparation({ orderIds: selectedPaidIds, branchId: branchId ?? undefined })`
com erro de excesso de propriedade — nesse caso, aguardar a Task 2 antes de seguir.

**Descoberta importante (não é escopo desta task, só registro):** `withoutBranchCount`
não precisa de campo novo em `OrderListItem` — `branchName: string | null` já é
`null` exatamente quando `branch_id IS NULL` (o `LEFT JOIN branch b ON b.id =
o.branch_id` em `apps/web/src/app/dashboard/orders/data.ts` linha 405; a projeção
`branchName: row.branch_name` na linha 450). Não adicionar `branchId` a
`OrderListItem`.

**Files:**
- Create: `apps/web/src/app/dashboard/orders/_components/send-to-separation-dialog.tsx`
- Modify: `apps/web/src/app/dashboard/orders/_components/orders-view.tsx`
- Test: nenhum (UI-only, sem lógica de servidor nova; verificação = check-types + smoke manual, conforme escopo da task)

**Interfaces:**

Consumes (já existentes, não mudam nesta task):
```ts
// apps/web/src/app/dashboard/orders/data.ts
export interface BranchOption {
	cepRanges: Array<{ from: string; to: string }> | null;
	id: string;
	name: string;
}
export interface OrderListItem {
	branchName: string | null; // null === sem filial (triagem)
	// ...demais campos inalterados
	id: string;
	status: OrderStatus;
	// ...
}
```
```ts
// apps/web/src/app/dashboard/orders/status-meta.ts
export const BRANCH_NONE = "__none__";
```
Consumes (produzida pela Task 2 — assinatura alvo, não implementada aqui):
```ts
// apps/web/src/app/dashboard/orders/actions.ts
export async function bulkStartSeparation(
	input: { orderIds: string[]; branchId?: string }
): Promise<ActionResult<BulkStartSeparationResult>>;
// BulkStartSeparationResult inalterado: { moved: number; movedIds: string[]; skipped: { number: string; reason: string }[] }
```

Produces (novo componente desta task):
```ts
// apps/web/src/app/dashboard/orders/_components/send-to-separation-dialog.tsx
interface SendToSeparationDialogProps {
	branches: BranchOption[];
	onConfirm: (branchId: string | null) => void;
	onOpenChange: (open: boolean) => void;
	open: boolean;
	orderCount: number;
	pending: boolean;
	withoutBranchCount: number;
}
export function SendToSeparationDialog(props: SendToSeparationDialogProps): JSX.Element;
```

---

- [ ] **Passo 1 — Ler os arquivos-fonte antes de editar.**
  Ler (`Read`, não `cat`/`grep`) os três arquivos que este plano toca ou espelha:
  - `apps/web/src/app/dashboard/orders/_components/branch-picker-dialog.tsx` (esqueleto a espelhar)
  - `apps/web/src/app/dashboard/orders/_components/orders-view.tsx` (arquivo a editar)
  - `apps/web/src/app/dashboard/orders/status-meta.ts` (constantes `BRANCH_NONE`/`BULK_ASSIGN_LIMIT`)
  Sem isso o `Edit` do passo 3 falha (`Edit` exige um `Read` prévio no arquivo).

- [ ] **Passo 2 — Criar `send-to-separation-dialog.tsx`.**
  Criar o arquivo com o conteúdo abaixo (mesmo esqueleto do `BranchPickerDialog`:
  sentinela `__none__` no Select, reset in-render no abrir/fechar — aqui também
  pré-seleciona quando há 1 filial só; sem Select quando `withoutBranchCount===0`,
  conforme D1/D2 da spec):

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
  import {
  	Select,
  	SelectContent,
  	SelectGroup,
  	SelectItem,
  	SelectTrigger,
  	SelectValue,
  } from "@emach/ui/components/select";
  import { Spinner } from "@emach/ui/components/spinner";
  import { useState } from "react";
  import type { BranchOption } from "../data";

  interface SendToSeparationDialogProps {
  	branches: BranchOption[];
  	onConfirm: (branchId: string | null) => void;
  	onOpenChange: (open: boolean) => void;
  	open: boolean;
  	orderCount: number;
  	pending: boolean;
  	withoutBranchCount: number;
  }

  function pluralSuffix(count: number): string {
  	return count === 1 ? "" : "s";
  }

  // Pedidos que já têm filial nunca são sobrescritos (bulkStartSeparation aplica
  // branchId só onde branch_id IS NULL) — a descrição deixa isso explícito (D1).
  function buildDescription(
  	orderCount: number,
  	withoutBranchCount: number
  ): string {
  	const withBranchCount = orderCount - withoutBranchCount;
  	if (withoutBranchCount === 0) {
  		return `Todos os ${orderCount} pedido${pluralSuffix(orderCount)} selecionado${pluralSuffix(orderCount)} já ${orderCount === 1 ? "tem" : "têm"} filial.`;
  	}
  	if (withBranchCount === 0) {
  		return `Nenhum dos ${orderCount} pedido${pluralSuffix(orderCount)} selecionado${pluralSuffix(orderCount)} tem filial. Escolha a filial que vai separar.`;
  	}
  	return `${withBranchCount} já ${withBranchCount === 1 ? "tem" : "têm"} filial (mantida); ${withoutBranchCount} sem filial ${withoutBranchCount === 1 ? "vai" : "vão"} para a escolhida.`;
  }

  // Controlado pelo BulkActionBar (sem DialogTrigger próprio). D1: um botão só na
  // listagem de Pedidos, decidindo a filial junto do envio. Quando todos os
  // selecionados já têm filial, o Select some e o dialog vira confirmação simples
  // (withoutBranchCount === 0).
  export function SendToSeparationDialog({
  	branches,
  	onConfirm,
  	onOpenChange,
  	open,
  	orderCount,
  	pending,
  	withoutBranchCount,
  }: SendToSeparationDialogProps) {
  	const [branchId, setBranchId] = useState(
  		branches.length === 1 ? branches[0].id : ""
  	);
  	// Reset (e re-pré-seleção) da escolha quando o dialog abre/fecha — padrão
  	// in-render (React Compiler ativo; evita useEffect de reset). Canônico:
  	// user-edit-sheet / BranchPickerDialog.
  	const [lastOpen, setLastOpen] = useState(open);
  	if (open !== lastOpen) {
  		setLastOpen(open);
  		setBranchId(branches.length === 1 ? branches[0].id : "");
  	}

  	const needsBranch = withoutBranchCount > 0;
  	const canConfirm = !pending && (!needsBranch || Boolean(branchId));

  	const handleConfirm = () => {
  		onConfirm(needsBranch ? branchId : null);
  	};

  	return (
  		<Dialog onOpenChange={onOpenChange} open={open}>
  			<DialogContent className="sm:max-w-md">
  				<DialogHeader>
  					<DialogTitle>Enviar para separação</DialogTitle>
  					<DialogDescription>
  						{buildDescription(orderCount, withoutBranchCount)}
  					</DialogDescription>
  				</DialogHeader>

  				{needsBranch && (
  					<div className="space-y-1">
  						<label
  							className="text-muted-foreground text-xs"
  							htmlFor="send-to-separation-branch"
  						>
  							Filial responsável pelos pedidos sem filial
  						</label>
  						<Select
  							onValueChange={(v) =>
  								setBranchId(!v || v === "__none__" ? "" : v)
  							}
  							value={branchId || "__none__"}
  						>
  							<SelectTrigger id="send-to-separation-branch">
  								<SelectValue>
  									{(v: string) =>
  										v === "__none__"
  											? "Selecionar filial"
  											: (branches.find((b) => b.id === v)?.name ??
  												"Selecionar filial")
  									}
  								</SelectValue>
  							</SelectTrigger>
  							<SelectContent>
  								<SelectGroup>
  									<SelectItem value="__none__">Selecionar filial</SelectItem>
  									{branches.map((branch) => (
  										<SelectItem key={branch.id} value={branch.id}>
  											{branch.name}
  										</SelectItem>
  									))}
  								</SelectGroup>
  							</SelectContent>
  						</Select>
  					</div>
  				)}

  				<DialogFooter>
  					<Button
  						onClick={() => onOpenChange(false)}
  						type="button"
  						variant="ghost"
  					>
  						Cancelar
  					</Button>
  					<Button disabled={!canConfirm} onClick={handleConfirm} type="button">
  						{pending ? (
  							<>
  								<Spinner /> Enviando…
  							</>
  						) : (
  							`Enviar ${orderCount} pedido${pluralSuffix(orderCount)}`
  						)}
  					</Button>
  				</DialogFooter>
  			</DialogContent>
  		</Dialog>
  	);
  }
  ```

- [ ] **Passo 3 — Rodar `bun check-types` e ver o novo arquivo passar isolado.**
  ```
  bun check-types
  ```
  Esperado: sem erros novos atribuíveis a `send-to-separation-dialog.tsx` (o
  arquivo ainda não é importado por ninguém, então só valida sintaxe/tipos
  próprios — erros pré-existentes em outros pacotes não são deste passo).

- [ ] **Passo 4 — Editar os imports de `orders-view.tsx`.**
  Old string (linhas 36-37 do arquivo lido no Passo 1):
  ```tsx
  import { BranchPickerDialog } from "./branch-picker-dialog";
  import { OrderCardGrid } from "./order-card-grid";
  ```
  New string:
  ```tsx
  import { BranchPickerDialog } from "./branch-picker-dialog";
  import { OrderCardGrid } from "./order-card-grid";
  import { SendToSeparationDialog } from "./send-to-separation-dialog";
  ```
  E, no bloco de import de `status-meta` — **este import ainda não existe no
  arquivo** (orders-view.tsx hoje não importa nada de `../status-meta`); adicionar
  uma linha nova de import logo abaixo do bloco de imports de `../data` (old
  string é o fechamento desse bloco):
  ```tsx
  import type {
  	BranchOption,
  	OrderListItem,
  	OrdersPageFiltersInput,
  } from "../data";
  import { BranchPickerDialog } from "./branch-picker-dialog";
  ```
  New string:
  ```tsx
  import type {
  	BranchOption,
  	OrderListItem,
  	OrdersPageFiltersInput,
  } from "../data";
  import { BRANCH_NONE } from "../status-meta";
  import { BranchPickerDialog } from "./branch-picker-dialog";
  ```
  (Aplicar os dois `Edit` acima — se o hook de auto-format reordenar e o segundo
  falhar com "string not found", re-`Read` o arquivo e reaplicar sobre o conteúdo
  atual.)

- [ ] **Passo 5 — Substituir o bloco de estado + `paidById`/`selectedPaidIds` + `runBulkSeparation`.**
  Old string (verbatim do arquivo lido no Passo 1, linhas 121-175):
  ```tsx
  	const router = useRouter();
  	// Bump força o useInfiniteList a re-sincronizar com o initial revalidado
  	// após uma mutação em massa (router.refresh não reseta client state).
  	const [refreshTick, setRefreshTick] = useState(0);
  	const resetKey = `${JSON.stringify(filters)}:${refreshTick}`;
  	const [bulkPending, startBulk] = useTransition();
  	const [assignPending, startAssign] = useTransition();
  	const [assignOpen, setAssignOpen] = useState(false);
  	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
  		initialItems: initial,
  		initialCursor,
  		fetchPage: (cursor) => fetchOrdersPage({ filters, cursor }),
  		resetKey,
  	});
  	const sel = useBulkSelection({
  		items,
  		getId: (o) => o.id,
  		resetKey,
  	});

  	const paidById = new Map(items.map((o) => [o.id, o.status === "paid"]));
  	const selectedPaidIds = sel.selectedIds.filter((id) => paidById.get(id));

  	const runBulkSeparation = () => {
  		startBulk(async () => {
  			const result = await bulkStartSeparation({ orderIds: selectedPaidIds });
  			// Refresh SEMPRE: cada pedido é uma transação própria, então um lote que
  			// retorna {ok:false} pode ter movido parte deles antes de abortar — sem
  			// isso, a lista seguiria mostrando "Pago" para pedido já em separação.
  			setRefreshTick((t) => t + 1);
  			router.refresh();
  			if (!result.ok) {
  				notify.error(result.error);
  				return;
  			}
  			const { kind, message } = buildBulkSeparationToast(
  				result.data.moved,
  				result.data.skipped
  			);
  			if (result.data.movedIds.length > 0) {
  				const pdfUrl = `/dashboard/orders/picking-list?ids=${result.data.movedIds.join(",")}`;
  				// Abre o PDF do lote; se o popup blocker engolir, o botão do toast cobre.
  				window.open(pdfUrl, "_blank", "noopener");
  				notify[kind](message, {
  					action: {
  						label: "Imprimir lista",
  						onClick: () => window.open(pdfUrl, "_blank", "noopener"),
  					},
  				});
  			} else {
  				notify[kind](message);
  			}
  			sel.exit();
  		});
  	};
  ```
  New string:
  ```tsx
  	const router = useRouter();
  	// Bump força o useInfiniteList a re-sincronizar com o initial revalidado
  	// após uma mutação em massa (router.refresh não reseta client state).
  	const [refreshTick, setRefreshTick] = useState(0);
  	const resetKey = `${JSON.stringify(filters)}:${refreshTick}`;
  	const [bulkPending, startBulk] = useTransition();
  	const [assignPending, startAssign] = useTransition();
  	const [assignOpen, setAssignOpen] = useState(false);
  	const [sendOpen, setSendOpen] = useState(false);
  	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
  		initialItems: initial,
  		initialCursor,
  		fetchPage: (cursor) => fetchOrdersPage({ filters, cursor }),
  		resetKey,
  	});
  	const sel = useBulkSelection({
  		items,
  		getId: (o) => o.id,
  		resetKey,
  	});

  	// branchName null === sem filial (mesmo dado que alimenta a triagem); não
  	// precisa de branchId no OrderListItem (ver nota no topo do plano).
  	const paidById = new Map(
  		items.map((o) => [
  			o.id,
  			{ paid: o.status === "paid", withoutBranch: o.branchName === null },
  		])
  	);
  	const selectedPaidIds = sel.selectedIds.filter(
  		(id) => paidById.get(id)?.paid
  	);
  	const selectedWithoutBranchCount = selectedPaidIds.filter(
  		(id) => paidById.get(id)?.withoutBranch
  	).length;

  	// D1: a filial é decidida no dialog (SendToSeparationDialog), não mais no
  	// próprio clique do bulk action — branchId vem do onConfirm do dialog.
  	// D3: zero PDF/toast-com-ação aqui; o papel nasce na fila de Separação.
  	const runBulkSeparation = (branchId: string | null) => {
  		startBulk(async () => {
  			const result = await bulkStartSeparation({
  				orderIds: selectedPaidIds,
  				branchId: branchId ?? undefined,
  			});
  			// Refresh SEMPRE: cada pedido é uma transação própria, então um lote que
  			// retorna {ok:false} pode ter movido parte deles antes de abortar — sem
  			// isso, a lista seguiria mostrando "Pago" para pedido já em separação.
  			setRefreshTick((t) => t + 1);
  			router.refresh();
  			if (!result.ok) {
  				notify.error(result.error);
  				return;
  			}
  			const { kind, message } = buildBulkSeparationToast(
  				result.data.moved,
  				result.data.skipped
  			);
  			notify[kind](message);
  			setSendOpen(false);
  			sel.exit();
  		});
  	};
  ```

- [ ] **Passo 6 — Editar o array `bulkActions`.**
  Old string (verbatim, linhas 210-228):
  ```tsx
  	// Ações do BulkActionBar: separação (pagos selecionados) + atribuir filial
  	// (triagem) + dados de envio (tab "Pronto para enviar"). Array vazio esconde
  	// a barra.
  	const bulkActions: BulkAction[] = [];
  	if (selectedPaidIds.length > 0) {
  		bulkActions.push({
  			label: bulkPending
  				? "Enviando…"
  				: `Enviar para separação (${selectedPaidIds.length})`,
  			run: runBulkSeparation,
  		});
  	}
  	if (canAssignBranch) {
  		bulkActions.push({
  			label: assignPending ? "Atribuindo…" : `Atribuir filial (${sel.count})`,
  			run: () => setAssignOpen(true),
  			variant: "outline",
  		});
  	}
  ```
  New string:
  ```tsx
  	// Ações do BulkActionBar: separação (pagos selecionados) + atribuir filial
  	// (só no contexto de triagem, filtro Filial = "Na triagem" — D2: fora dela o
  	// botão avulso sai da seleção de pagos) + dados de envio (tab "Pronto para
  	// enviar"). Array vazio esconde a barra.
  	const bulkActions: BulkAction[] = [];
  	if (selectedPaidIds.length > 0) {
  		bulkActions.push({
  			label: bulkPending
  				? "Enviando…"
  				: `Enviar para separação (${selectedPaidIds.length})`,
  			run: () => setSendOpen(true),
  		});
  	}
  	if (canAssignBranch && filters.branchId === BRANCH_NONE) {
  		bulkActions.push({
  			label: assignPending ? "Atribuindo…" : `Atribuir filial (${sel.count})`,
  			run: () => setAssignOpen(true),
  			variant: "outline",
  		});
  	}
  ```

- [ ] **Passo 7 — Renderizar o `SendToSeparationDialog`.**
  Old string (verbatim, fim do arquivo):
  ```tsx
  			{canAssignBranch && (
  				<BranchPickerDialog
  					branches={branches}
  					onConfirm={runBulkAssign}
  					onOpenChange={setAssignOpen}
  					open={assignOpen}
  					orderCount={sel.count}
  					pending={assignPending}
  				/>
  			)}
  		</>
  	);
  }
  ```
  New string:
  ```tsx
  			{canAssignBranch && (
  				<BranchPickerDialog
  					branches={branches}
  					onConfirm={runBulkAssign}
  					onOpenChange={setAssignOpen}
  					open={assignOpen}
  					orderCount={sel.count}
  					pending={assignPending}
  				/>
  			)}

  			<SendToSeparationDialog
  				branches={branches}
  				onConfirm={runBulkSeparation}
  				onOpenChange={setSendOpen}
  				open={sendOpen}
  				orderCount={selectedPaidIds.length}
  				pending={bulkPending}
  				withoutBranchCount={selectedWithoutBranchCount}
  			/>
  		</>
  	);
  }
  ```

- [ ] **Passo 8 — Rodar `bun check-types` e ver passar.**
  ```
  bun check-types
  ```
  Esperado: PASS sem erros em `orders-view.tsx` nem em
  `send-to-separation-dialog.tsx`. Se `bulkStartSeparation({ ..., branchId })`
  estourar erro de propriedade excedente/inexistente, a Task 2 ainda não landou
  (ver seção "Depende da Task 2" no topo) — parar e sinalizar, não inventar cast.
  Rodar com cache limpo se o resultado parecer stale: `bun check-types --force`.

- [ ] **Passo 9 — Rodar `bun check` (ultracite) e ver passar.**
  ```
  bun check
  ```
  Esperado: PASS. Prestar atenção a `noUnusedImports` (se `BranchPickerDialog`
  ficar sem uso em algum ramo futuro) e ao teto de complexidade cognitiva nas
  funções tocadas — nenhuma delas deveria estourar aqui (mudanças são
  substituições 1:1 de corpo, sem ramificação nova pesada).

- [ ] **Passo 10 — Smoke manual (sem TDD de UI; esta é a verificação de "pronto" funcional).**
  `bun dev:web`, abrir `/dashboard/orders` (tab "Pago") logado como `admin`/`super_admin`:
  1. Selecionar pedidos pagos com filial já atribuída + pedidos sem filial (se
     existir massa de teste com ambos) e clicar "Enviar para separação (N)" —
     confirmar que abre o `SendToSeparationDialog` (não dispara ação direto).
  2. Se algum selecionado está sem filial: confirmar que o Select aparece, o
     botão "Enviar N pedidos" fica desabilitado até escolher, e a descrição
     mostra a contagem "X já têm filial (mantida); Y sem filial vão para a
     escolhida" (ou a variante "Nenhum..." se todos estiverem sem filial).
  3. Selecionar só pedidos que já têm filial: confirmar que o Select **não**
     aparece e o dialog é confirmação simples.
  4. Confirmar o envio: nenhuma aba/PDF nova abre (D3); toast mostra só
     sucesso/skips, sem botão "Imprimir lista".
  5. Trocar o filtro Filial para "Na triagem" (`?branchId=__none__`): registrar
     no relatório se o botão "Atribuir filial" aparece — **atenção**: há um bug
     pré-existente e fora do escopo desta task (`ordersListFiltersSchema.branchId`
     em `schema.ts` usa `z.string().uuid().optional()`, que rejeita a sentinela
     `"__none__"` e reseta todos os filtros da página; confirmado isoladamente
     rodando o schema via `bun` — ver seção de riscos). Se o botão não aparecer
     por causa disso, **não é uma regressão desta task** — é o filtro de triagem
     que já não chegava a `"__none__"` no server antes desta mudança também.
     Reportar o achado, não tentar corrigir `schema.ts` aqui (fora do escopo do
     plano; a spec marca esse filtro como "não muda").
  Registrar prova perceptual: screenshot do dialog nos 3 estados (com Select,
  sem Select, confirmação de todos-já-têm-filial) para comparar contra os
  mockups aprovados no companheiro visual do brainstorming.

- [ ] **Passo 11 — Commit.**
  ```
  git add apps/web/src/app/dashboard/orders/_components/send-to-separation-dialog.tsx apps/web/src/app/dashboard/orders/_components/orders-view.tsx
  git commit -m "feat(pedidos): dialog unico de envio para separacao"
  ```
  Esperado: commit criado, subject ≤50 chars, sem menção a AI/Claude no corpo.

---

**Nota sobre D2 fora deste arquivo:** a spec também define D2 para o detalhe do
pedido (`orders/[id]/_components/order-action-column.tsx` — remover o par
Select+"Salvar" avulso) e D5-D13 (fila de Separação). Nenhum desses é tocado por
esta task — são de outras tasks do plano.

### Task 4: Detalhe do pedido — remover "Salvar" avulso e renomear botão primário (D4)

**Files:**

- Modify: `apps/web/src/app/dashboard/orders/[id]/_components/order-action-column.tsx`
- Test: nenhum arquivo de teste dedicado a este componente existe hoje (confirmado por busca — `grep -rn "assignBranch" apps/web/src` só retorna `order-action-column.tsx`, `orders/actions.ts`, `orders/schema.ts` e `orders/__tests__/assign-branch.test.ts`, este último cobre a *action* `assignBranch`, não o componente). Este componente é `"use client"` e não tem suíte própria — a verificação desta task é `check-types` + smoke manual no browser (sem teste novo a escrever).

**Interfaces:**

- Consumes (inalterado): `updateOrderStatus` de `../../actions` — assinatura já existente `updateOrderStatus(input: { orderId: string; toStatus: OrderStatus; reason?: string; trackingCode?: string; branchId?: string }): Promise<ActionResult<...>>`.
- Consumes (removido deste arquivo, action continua existindo em `../../actions` para outros callers): `assignBranch(input: { orderId: string; branchId: string }): Promise<ActionResult<...>>`.
- Produces (função pura nova, top-level, não exportada): `primaryActionLabel(nextStatus: OrderStatus): string`.
- Nenhuma prop pública de `OrderActionColumn` muda (`OrderActionColumnProps` permanece idêntica).

---

#### Step 1: Ler o arquivo atual e confirmar estado antes de editar

- [ ] Rodar `Read` em `/home/othavio/Projects/emach/emach-dashboard-2/emach-dashboard/apps/web/src/app/dashboard/orders/[id]/_components/order-action-column.tsx` (obrigatório antes de qualquer `Edit` — o hook `PostToolUse` roda `bun fix` após `Write`/`Edit` e pode reordenar campos; se um `Edit` abaixo falhar com `string not found`, re-`Read` o arquivo e reconferir o trecho antes de tentar de novo).

Trecho atual (import, linhas 31–37 — código verbatim da fonte):

```tsx
import {
	addOrderNote,
	assignBranch,
	markShippingReviewed,
	updateOrderStatus,
	updateTrackingCode,
} from "../../actions";
```

Trecho atual (função `runAssignBranch`, linhas 59–71 — código verbatim da fonte):

```tsx
async function runAssignBranch(
	orderId: string,
	branchId: string,
	refresh: Refresh
) {
	const result = await assignBranch({ orderId, branchId });
	if (!result.ok) {
		notify.error(result.error);
		return;
	}
	notify.success("Filial atribuída");
	refresh();
}
```

Trecho atual (bloco Select+Salvar dentro de `PrimaryActionContent`, linhas 260–305 — código verbatim da fonte):

```tsx
			{order.status === "paid" && (
				<div className="space-y-1">
					<label
						className="text-muted-foreground text-xs"
						htmlFor="branch-assign"
					>
						Filial responsável
					</label>
					<div className="flex gap-2">
						<Select
							onValueChange={(v) =>
								setBranchId(!v || v === "__none__" ? "" : v)
							}
							value={branchId || "__none__"}
						>
							<SelectTrigger id="branch-assign">
								<SelectValue>
									{(v: string) =>
										v === "__none__"
											? "Selecionar filial"
											: (branches.find((b) => b.id === v)?.name ??
												"Selecionar filial")
									}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									<SelectItem value="__none__">Selecionar filial</SelectItem>
									{branches.map((branch) => (
										<SelectItem key={branch.id} value={branch.id}>
											{branch.name}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
						<Button
							disabled={isPending || !branchId}
							onClick={onAssignBranch}
							variant="outline"
						>
							Salvar
						</Button>
					</div>
				</div>
			)}
```

Trecho atual (botão primário dentro de `PrimaryActionContent`, linhas 333–345 — código verbatim da fonte):

```tsx
			<Button
				disabled={isPending || !canDoPrimaryTransition}
				onClick={onPrimaryStatusUpdate}
				variant="default"
			>
				{isPending ? (
					<>
						<Spinner /> Salvando…
					</>
				) : (
					`Marcar como ${ORDER_STATUS_LABELS[nextStatus]}`
				)}
			</Button>
```

Trecho atual (`PrimaryActionContentProps` e desestruturação, linhas 194–232 — código verbatim da fonte):

```tsx
interface PrimaryActionContentProps {
	branches: BranchOption[];
	branchId: string;
	canDoPrimaryTransition: boolean;
	forceShipSlot: React.ReactNode;
	isPending: boolean;
	isTerminal: boolean;
	nextStatus: OrderStatus | undefined;
	onAssignBranch: () => void;
	onPrimaryStatusUpdate: () => void;
	onTrackingUpdate: () => void;
	order: OrderDetail;
	setBranchId: (v: string) => void;
	setStatusReason: (v: string) => void;
	setTrackingCode: (v: string) => void;
	shipBlockedLabel: string | null;
	statusReason: string;
	trackingCode: string;
}

function PrimaryActionContent({
	branches,
	branchId,
	canDoPrimaryTransition,
	forceShipSlot,
	isPending,
	isTerminal,
	nextStatus,
	order,
	onAssignBranch,
	onPrimaryStatusUpdate,
	onTrackingUpdate,
	setBranchId,
	setStatusReason,
	setTrackingCode,
	shipBlockedLabel,
	statusReason,
	trackingCode,
}: PrimaryActionContentProps) {
```

Trecho atual (`handleAssignBranch` e a chamada em `PrimaryActionContent`, linhas 426–432 e 541 — código verbatim da fonte):

```tsx
	function handleAssignBranch() {
		if (!branchId) {
			notify.error("Selecione uma filial");
			return;
		}
		startTransition(() => runAssignBranch(order.id, branchId, router.refresh));
	}
```

```tsx
						onAssignBranch={handleAssignBranch}
```

#### Step 2: Remover o import de `assignBranch`

- [ ] `Edit` no import (bloco de `../../actions`):

old_string:
```tsx
import {
	addOrderNote,
	assignBranch,
	markShippingReviewed,
	updateOrderStatus,
	updateTrackingCode,
} from "../../actions";
```

new_string:
```tsx
import {
	addOrderNote,
	markShippingReviewed,
	updateOrderStatus,
	updateTrackingCode,
} from "../../actions";
```

#### Step 3: Remover a função `runAssignBranch`

- [ ] `Edit`:

old_string:
```tsx
async function runAssignBranch(
	orderId: string,
	branchId: string,
	refresh: Refresh
) {
	const result = await assignBranch({ orderId, branchId });
	if (!result.ok) {
		notify.error(result.error);
		return;
	}
	notify.success("Filial atribuída");
	refresh();
}

async function runTrackingUpdate(
```

new_string:
```tsx
async function runTrackingUpdate(
```

(Isso remove o bloco inteiro de `runAssignBranch`, mantendo a função seguinte `runTrackingUpdate` intacta — o `old_string` inclui a assinatura de `runTrackingUpdate(` só como âncora única, sem alterá-la.)

#### Step 4: Adicionar `primaryActionLabel` e trocar o label do botão primário

- [ ] `Edit` — insere a função pura logo depois do map `PRIMARY_TRANSITION` (unifica o verbo com a listagem de Pedidos, D4/D1):

old_string:
```tsx
const PRIMARY_TRANSITION: Partial<Record<OrderStatus, OrderStatus>> = {
	pending_payment: "canceled",
	payment_failed: "canceled",
	paid: "preparing",
	preparing: "shipped",
	shipped: "delivered",
};

type Refresh = () => void;
```

new_string:
```tsx
const PRIMARY_TRANSITION: Partial<Record<OrderStatus, OrderStatus>> = {
	pending_payment: "canceled",
	payment_failed: "canceled",
	paid: "preparing",
	preparing: "shipped",
	shipped: "delivered",
};

/**
 * Label do botão primário. `paid → preparing` é o único caminho pra
 * "preparing" no mapa acima — renomeado pra unificar o verbo com a listagem
 * de Pedidos (D4/D1 do redesign de separação: "Enviar para separação").
 * Demais transições mantêm o padrão genérico "Marcar como X".
 */
function primaryActionLabel(nextStatus: OrderStatus): string {
	if (nextStatus === "preparing") {
		return "Enviar para separação";
	}
	return `Marcar como ${ORDER_STATUS_LABELS[nextStatus]}`;
}

type Refresh = () => void;
```

- [ ] `Edit` — troca o texto do botão primário para usar a função nova:

old_string:
```tsx
				{isPending ? (
					<>
						<Spinner /> Salvando…
					</>
				) : (
					`Marcar como ${ORDER_STATUS_LABELS[nextStatus]}`
				)}
			</Button>
```

new_string:
```tsx
				{isPending ? (
					<>
						<Spinner /> Salvando…
					</>
				) : (
					primaryActionLabel(nextStatus)
				)}
			</Button>
```

#### Step 5: Remover o botão "Salvar" avulso, mantendo o Select

- [ ] `Edit`:

old_string:
```tsx
			{order.status === "paid" && (
				<div className="space-y-1">
					<label
						className="text-muted-foreground text-xs"
						htmlFor="branch-assign"
					>
						Filial responsável
					</label>
					<div className="flex gap-2">
						<Select
							onValueChange={(v) =>
								setBranchId(!v || v === "__none__" ? "" : v)
							}
							value={branchId || "__none__"}
						>
							<SelectTrigger id="branch-assign">
								<SelectValue>
									{(v: string) =>
										v === "__none__"
											? "Selecionar filial"
											: (branches.find((b) => b.id === v)?.name ??
												"Selecionar filial")
									}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									<SelectItem value="__none__">Selecionar filial</SelectItem>
									{branches.map((branch) => (
										<SelectItem key={branch.id} value={branch.id}>
											{branch.name}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
						<Button
							disabled={isPending || !branchId}
							onClick={onAssignBranch}
							variant="outline"
						>
							Salvar
						</Button>
					</div>
				</div>
			)}
```

new_string:
```tsx
			{order.status === "paid" && (
				<div className="space-y-1">
					<label
						className="text-muted-foreground text-xs"
						htmlFor="branch-assign"
					>
						Filial responsável
					</label>
					<Select
						onValueChange={(v) => setBranchId(!v || v === "__none__" ? "" : v)}
						value={branchId || "__none__"}
					>
						<SelectTrigger id="branch-assign">
							<SelectValue>
								{(v: string) =>
									v === "__none__"
										? "Selecionar filial"
										: (branches.find((b) => b.id === v)?.name ??
											"Selecionar filial")
								}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								<SelectItem value="__none__">Selecionar filial</SelectItem>
								{branches.map((branch) => (
									<SelectItem key={branch.id} value={branch.id}>
										{branch.name}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
				</div>
			)}
```

#### Step 6: Remover `onAssignBranch` da interface e da desestruturação de `PrimaryActionContent`

- [ ] `Edit`:

old_string:
```tsx
interface PrimaryActionContentProps {
	branches: BranchOption[];
	branchId: string;
	canDoPrimaryTransition: boolean;
	forceShipSlot: React.ReactNode;
	isPending: boolean;
	isTerminal: boolean;
	nextStatus: OrderStatus | undefined;
	onAssignBranch: () => void;
	onPrimaryStatusUpdate: () => void;
	onTrackingUpdate: () => void;
	order: OrderDetail;
	setBranchId: (v: string) => void;
	setStatusReason: (v: string) => void;
	setTrackingCode: (v: string) => void;
	shipBlockedLabel: string | null;
	statusReason: string;
	trackingCode: string;
}

function PrimaryActionContent({
	branches,
	branchId,
	canDoPrimaryTransition,
	forceShipSlot,
	isPending,
	isTerminal,
	nextStatus,
	order,
	onAssignBranch,
	onPrimaryStatusUpdate,
	onTrackingUpdate,
	setBranchId,
	setStatusReason,
	setTrackingCode,
	shipBlockedLabel,
	statusReason,
	trackingCode,
}: PrimaryActionContentProps) {
```

new_string:
```tsx
interface PrimaryActionContentProps {
	branches: BranchOption[];
	branchId: string;
	canDoPrimaryTransition: boolean;
	forceShipSlot: React.ReactNode;
	isPending: boolean;
	isTerminal: boolean;
	nextStatus: OrderStatus | undefined;
	onPrimaryStatusUpdate: () => void;
	onTrackingUpdate: () => void;
	order: OrderDetail;
	setBranchId: (v: string) => void;
	setStatusReason: (v: string) => void;
	setTrackingCode: (v: string) => void;
	shipBlockedLabel: string | null;
	statusReason: string;
	trackingCode: string;
}

function PrimaryActionContent({
	branches,
	branchId,
	canDoPrimaryTransition,
	forceShipSlot,
	isPending,
	isTerminal,
	nextStatus,
	order,
	onPrimaryStatusUpdate,
	onTrackingUpdate,
	setBranchId,
	setStatusReason,
	setTrackingCode,
	shipBlockedLabel,
	statusReason,
	trackingCode,
}: PrimaryActionContentProps) {
```

#### Step 7: Remover `handleAssignBranch` e a prop passada em `OrderActionColumn`

- [ ] `Edit`:

old_string:
```tsx
	function handleAssignBranch() {
		if (!branchId) {
			notify.error("Selecione uma filial");
			return;
		}
		startTransition(() => runAssignBranch(order.id, branchId, router.refresh));
	}

	function handleTrackingUpdate() {
```

new_string:
```tsx
	function handleTrackingUpdate() {
```

- [ ] `Edit`:

old_string:
```tsx
						nextStatus={nextStatus}
						onAssignBranch={handleAssignBranch}
						onPrimaryStatusUpdate={handlePrimaryStatusUpdate}
```

new_string:
```tsx
						nextStatus={nextStatus}
						onPrimaryStatusUpdate={handlePrimaryStatusUpdate}
```

#### Step 8: Verificar que nada mais no arquivo referencia o handler removido

- [ ] Rodar (da RAIZ do monorepo, sem `cd`):

```bash
grep -n "assignBranch\|onAssignBranch\|handleAssignBranch\|runAssignBranch" "/home/othavio/Projects/emach/emach-dashboard-2/emach-dashboard/apps/web/src/app/dashboard/orders/[id]/_components/order-action-column.tsx"
```

Output esperado: **nenhuma linha** (grep sem match, exit code 1). Se aparecer alguma linha, o Step correspondente falhou ou ficou pendente — voltar e reconferir com `Read`.

#### Step 9: `check-types` com cache limpo

- [ ] Rodar (da RAIZ do monorepo):

```bash
bun check-types --force
```

Output esperado: `Tasks: N successful, N total` sem erros em `apps/web` (0 erros TypeScript). Se `assignBranch` continuar importado em algum lugar sem uso, o próprio `check-types`/lint acusaria import não utilizado — o Step 8 já garante que isso não ocorre.

#### Step 10: Smoke manual no browser

- [ ] Rodar `bun dev:web` (da raiz) e abrir no browser o detalhe de um pedido com `status = "paid"` (`/dashboard/orders/{id}`).
- [ ] Confirmar visualmente: o card "Próxima ação" mostra só o Select "Filial responsável" (sem botão "Salvar" ao lado) e o botão primário abaixo lê **"Enviar para separação"** (não mais "Marcar como Em separação").
- [ ] Selecionar uma filial no Select e clicar no botão primário — confirmar que o pedido transiciona pra `preparing` com a filial aplicada (mesmo comportamento de `updateOrderStatus` que já existia, só o label mudou) e o toast de sucesso aparece.
- [ ] Abrir o detalhe de um pedido em outro status (ex: `preparing`) e confirmar que o botão primário permanece "Marcar como Enviado" (rótulo genérico intacto para as demais transições).
- [ ] Registrar no relatório de verificação: "implementado, smoke manual ok" — só marcar "concluído" após esse smoke (nunca antes, mesmo com `check-types` verde).

#### Step 11: Commit

- [ ] Rodar `git status` e revisar o diff (`git diff`) antes de adicionar — confirmar que só `order-action-column.tsx` mudou.
- [ ] `git add apps/web/src/app/dashboard/orders/[id]/_components/order-action-column.tsx`
- [ ] Commit com Conventional Commits em PT, subject ≤50 chars, zero menção a AI:

```bash
git commit -m "refactor(orders): remove salvar avulso do detalhe"
```

## Tasks 5 e 6 — Header da fila limpo + bulk actions por tab (D5/D7/D8)

Contexto: spec `docs/superpowers/specs/2026-07-16-fluxo-pedidos-separacao-redesign-design.md`.
Task 5 remove os 3 contadores + `<a>` "Imprimir lista" do header da fila e move o botão
**Selecionar** para o `PageHeader`, renderizado pelo `PickingQueue` (client) — espelhando
`orders-view.tsx` (PR #316). Task 6 troca a ação única do `BulkActionBar` por um conjunto por
tab (D7 em `a_separar`, D8 em `em_separacao`), o que exige criar a action `bulkStartPicking`
(claim em lote, D12: teto de 20).

---

### Task 5: Header da fila sem contadores — `PageHeader` com "Selecionar" no client

**Files:**

- Modify: `apps/web/src/app/dashboard/separacao/page.tsx`
- Modify: `apps/web/src/app/dashboard/separacao/_components/picking-queue.tsx`
- Modify: `apps/web/src/app/dashboard/separacao/_components/separacao-tabs.tsx`

**Interfaces:**

Consumes (sem mudança de assinatura):

- `PageHeader({ action?: ReactNode; description?: ReactNode; title: ReactNode })` — `@/components/page-header`
- `SelectionToolbar({ active, allLoadedSelected, loadedCount, onCancel, onEnter, onToggleAll })` — `@/components/bulk/selection-toolbar`

Produces (mudam de assinatura):

- `PickingQueue({ activeTab, counts, initial, initialCursor })` — assinatura inalterada; agora renderiza o próprio `PageHeader` com `action` = `SelectionToolbar` (quando `selectable`). O `ResumeBanner` não é mais renderizado por ninguém nesta task (Task 7 remove o componente em definitivo — D10); sem prop novo pra ele.
- `SeparacaoTabs({ activeTab, counts })` — perde o prop `toolbar?: ReactNode` (só o `PickingQueue` o usava; ação "Selecionar" saiu daqui).

---

#### Passo 1 — Ler os 3 arquivos antes de editar

Re-leia os três arquivos que serão tocados (o estado abaixo é o verbatim já confirmado):

- `apps/web/src/app/dashboard/separacao/page.tsx`
- `apps/web/src/app/dashboard/separacao/_components/picking-queue.tsx`
- `apps/web/src/app/dashboard/separacao/_components/separacao-tabs.tsx`

Use a tool `Read` nos três, um por um, antes de qualquer `Edit`. Se um `Edit` abaixo falhar com
`string not found`, é porque o hook `PostToolUse` (`bun fix`) reformatou o arquivo depois de um
`Edit` anterior — re-`Read` o arquivo e reaplique o `old_string`/`new_string` ajustado ao que
está no disco.

#### Passo 2 — `page.tsx`: remover imports que ficarão órfãos

O banner some nesta task (D10 é execução completa só na Task 7) — como nenhum branch volta a
renderizar `<ResumeBanner>`, o import do componente e o import de `getActivePickingForUser` (que
só alimentava o banner) ficam órfãos também. Removê-los agora evita import não usado
(`ultracite`/biome reprovaria no `bun check`); a Task 7 mais tarde apaga o arquivo do componente e
a própria função `getActivePickingForUser` em `data.ts`.

`old_string`:

```
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
import { type SeparacaoTab, SeparacaoTabs } from "./_components/separacao-tabs";
import {
	fetchPickingProductivityByOperator,
	fetchPickingProductivitySummary,
	fetchPickingQueueCounts,
	fetchPickingQueuePage,
	getActivePickingForUser,
} from "./data";
```

`new_string`:

```
import type { Metadata } from "next";

import { AutoRefresh } from "@/components/auto-refresh";
import { PageHeader } from "@/components/page-header";
import { getUserBranchScope } from "@/lib/branch-scope";
import { requireCapabilityOrRedirect } from "@/lib/permissions";
import { LateOrdersToast } from "../orders/_components/late-orders-toast";
import { getLateOrdersCount } from "../orders/data";
import { PickingQueue } from "./_components/picking-queue";
import { ProductivityPanel } from "./_components/productivity-panel";
import { type SeparacaoTab, SeparacaoTabs } from "./_components/separacao-tabs";
import {
	fetchPickingProductivityByOperator,
	fetchPickingProductivitySummary,
	fetchPickingQueueCounts,
	fetchPickingQueuePage,
} from "./data";
```

#### Passo 3 — `page.tsx`: remover contadores/impressão do header, `activePicking`/banner e header some pra tab certa

`old_string` (bloco final da função, do comentário do `Promise.all` até o fechamento da função):

```
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

`new_string`:

```
	// Contadores reais (COUNT) das 3 tabs de fila + o dado da tab ativa.
	// Produtividade busca os agregados; tabs de fila buscam a 1ª página.
	// O banner some aqui (nenhum branch abaixo renderiza <ResumeBanner> mais) —
	// a Task 7 apaga o componente e getActivePickingForUser em definitivo.
	const [counts, lateCount, queuePage, summary, operators] =
		await Promise.all([
			fetchPickingQueueCounts(scope),
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

	return (
		<>
			<AutoRefresh />
			<LateOrdersToast count={lateCount} />

			{activeTab === "produtividade" ? (
				<>
					<PageHeader
						description="Fila de pedidos pagos aguardando conferência física"
						title="Separação"
					/>
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

Note: a tab `produtividade` não passa por `PickingQueue` — ganha o `PageHeader` direto do
`page.tsx`, sem `action` (D5: "Selecionar" só faz sentido na fila). `excecoes` passa por
`PickingQueue`, que decide sozinha (via `selectable`) se mostra o botão — ver Passo 5. O
`<ResumeBanner>` deixa de ser renderizado em qualquer aba a partir desta task (Task 7 remove o
componente em definitivo — D10).

#### Passo 4 — `picking-queue.tsx`: import de `PageHeader`

`old_string`:

```
"use client";

import { BulkActionBar } from "@/components/bulk/bulk-action-bar";
import { SelectableItem } from "@/components/bulk/selectable-item";
import { SelectionToolbar } from "@/components/bulk/selection-toolbar";
import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useBulkSelection } from "@/lib/use-bulk-selection";
import { useInfiniteList } from "@/lib/use-infinite-list";
import { fetchPickingQueuePageAction } from "../actions";
import type { PickingQueueRow } from "../data";
import { PickingOrderCard } from "./picking-order-card";
import { SeparacaoTabs } from "./separacao-tabs";
```

`new_string`:

```
"use client";

import { BulkActionBar } from "@/components/bulk/bulk-action-bar";
import { SelectableItem } from "@/components/bulk/selectable-item";
import { SelectionToolbar } from "@/components/bulk/selection-toolbar";
import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { PageHeader } from "@/components/page-header";
import { useBulkSelection } from "@/lib/use-bulk-selection";
import { useInfiniteList } from "@/lib/use-infinite-list";
import { fetchPickingQueuePageAction } from "../actions";
import type { PickingQueueRow } from "../data";
import { PickingOrderCard } from "./picking-order-card";
import { SeparacaoTabs } from "./separacao-tabs";
```

Nota: `PickingQueueProps` e a assinatura de `PickingQueue` NÃO ganham prop novo nesta task — o
`ResumeBanner` não é mais renderizado por nada a partir da Task 5 (ver Passo 3 do `page.tsx` e
Passo 5 abaixo), então não há slot pra repassar.

#### Passo 5 — `picking-queue.tsx`: `PageHeader` com "Selecionar" no lugar do `toolbar` da tabs

`old_string`:

```
	return (
		<div>
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

`new_string`:

```
	return (
		<div>
			<PageHeader
				action={
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
				description="Fila de pedidos pagos aguardando conferência física"
				title="Separação"
			/>

			<SeparacaoTabs activeTab={activeTab} counts={counts} />
```

#### Passo 6 — `separacao-tabs.tsx`: remover o import órfão de `ReactNode`

`old_string`:

```
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
```

`new_string`:

```
"use client";

import {
	Tabs,
	TabsCountBadge,
	TabsList,
	TabsTrigger,
} from "@emach/ui/components/tabs";
import Link from "next/link";

import type { PickingQueueCounts } from "../data";
```

#### Passo 7 — `separacao-tabs.tsx`: remover o prop `toolbar` e seu slot

`old_string`:

```
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

`new_string`:

```
/**
 * Barra de tabs da Separação, compartilhada entre a fila (PickingQueue) e a
 * tab Produtividade. Split: fluxo do operador à esquerda; exceções/análise à
 * direita. Produtividade não tem badge (não é fila). A ação "Selecionar"
 * mora no PageHeader (PickingQueue), espelhando orders-view — não é mais
 * slot desta barra.
 */
export function SeparacaoTabs({
	activeTab,
	counts,
}: {
	activeTab: SeparacaoTab;
	counts: PickingQueueCounts;
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
	);
}
```

#### Passo 8 — `check-types`

Rodar da raiz do monorepo (nunca `cd apps/web`):

```
bun check-types
```

Saída esperada: sem erros TS nos 3 arquivos tocados (o pipeline turbo termina com `Tasks: N successful, N total` e sem `error TS`). Se aparecer erro de prop faltante/prop desconhecida em `SeparacaoTabs`/`PickingQueue`, é sinal de um call site não atualizado — confira se sobrou algum `toolbar={...}` ou se o `page.tsx` ainda referencia `showPrint`/`buttonVariants`/`PrinterIcon`.

#### Passo 9 — Smoke visual (sem RTL/vitest — estes 3 arquivos não têm suíte de componente; o padrão do projeto pra client component de página é smoke no browser)

```
bun dev:web
```

Visitar (autenticado como usuário com capability `orders.pick`):

- `/dashboard/separacao?tab=a_separar` — esperado: header "Separação" com o botão **Selecionar** no canto superior direito (sem os 3 contadores, sem "Imprimir lista" de aba inteira); clicar em Selecionar troca pro modo seleção (checkbox nos cards + "Selecionar todos (N)"/"Cancelar" no lugar do botão).
- `/dashboard/separacao?tab=em_separacao` — mesmo comportamento do header.
- `/dashboard/separacao?tab=excecoes` — header SEM o botão Selecionar (seleção desabilitada nessa tab via `selectable`).
- `/dashboard/separacao?tab=produtividade` — header sem nenhuma `action` (nem Selecionar, nem impressão); painel de produtividade renderiza normalmente.
- O banner de retomada não aparece mais em nenhuma aba (removido em definitivo na Task 7) — mesmo com uma separação em andamento do próprio usuário, nada é renderizado entre o header e as tabs.

Reportar como "implementado, não verificado" se o smoke visual não puder ser executado nesta sessão (ex.: sem navegador disponível) — não declarar "concluído" sem essa prova perceptual.

#### Passo 10 — Commit

```
git add apps/web/src/app/dashboard/separacao/page.tsx apps/web/src/app/dashboard/separacao/_components/picking-queue.tsx apps/web/src/app/dashboard/separacao/_components/separacao-tabs.tsx
git commit -m "refactor(separacao): move header pra fila client"
```

---

### Task 6: Bulk actions por tab — `bulkStartPicking` (claim em lote) + `BulkActionBar`

**Files:**

- Modify: `apps/web/src/app/dashboard/separacao/_components/picking-queue.tsx` (estado pós-Task 5 — reler antes de editar)

**Interfaces:**

Consumes:

- `notify.success/warning/error(message: string, opts?: ExternalToast): void` — `@/lib/notify`
- `BulkActionBar({ actions: BulkAction[]; selectedIds: string[] })`, `type BulkAction = { icon?: ReactNode; label: string; run: (ids: string[]) => void; variant?: "default"|"destructive"|"outline"|"secondary" }` — `@/components/bulk/bulk-action-bar`
- `bulkStartPicking(input: { orderIds: string[] }): Promise<ActionResult<{ moved: number; movedIds: string[]; skipped: { number: string; reason: string }[] }>>` — produzida pela Task 1 em `separacao/actions.ts`.

Produces (novos):

- `PickingQueue` (mesma assinatura da Task 5) — ganha `runBulkPick`/`bulkActions` internos; nenhum prop novo.

---

> **Nota do assembler:** os Passos 1–9 originais (criação de `bulkStartPicking`, schema e
> elegibilidade) foram removidos — esse backend é produzido pela **Task 1**, que DEVE estar
> concluída antes desta. Esta task apenas consome: `bulkStartPicking` de `../actions`, e
> `BULK_PICKING_SKIP_LABEL`/`bulkStartPickingSkipReason` de
> `apps/web/src/app/dashboard/separacao/_lib/picking-logic.ts` (uso indireto — esses dois só são
> chamados dentro de `bulkStartPicking`, que já devolve `skipped[].reason` resolvido; esta task
> não precisa importá-los diretamente). A numeração dos passos abaixo foi mantida (10–18).

#### Passo 10 — Ler `picking-queue.tsx` (estado pós-Task 5) antes de editar

Re-`Read` `apps/web/src/app/dashboard/separacao/_components/picking-queue.tsx`. Se este plano
está sendo executado numa sessão que já rodou a Task 5, o arquivo em disco já tem o `PageHeader`
no lugar do `toolbar` de `SeparacaoTabs`, sem nenhum slot pro banner de retomada (o `ResumeBanner`
simplesmente não é mais renderizado por ninguém desde a Task 5) — os `old_string` abaixo assumem
esse estado (não o arquivo original pré-Task 5). Se a leitura mostrar o arquivo ainda no estado
pré-Task 5 (com `<SeparacaoTabs toolbar={...}>`), pare e aplique a Task 5 primeiro — Task 6
depende dela.

#### Passo 11 — `picking-queue.tsx`: imports (adicionar router, transição, notify, `bulkStartPicking`)

`old_string`:

```
"use client";

import { BulkActionBar } from "@/components/bulk/bulk-action-bar";
import { SelectableItem } from "@/components/bulk/selectable-item";
import { SelectionToolbar } from "@/components/bulk/selection-toolbar";
import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { PageHeader } from "@/components/page-header";
import { useBulkSelection } from "@/lib/use-bulk-selection";
import { useInfiniteList } from "@/lib/use-infinite-list";
import { fetchPickingQueuePageAction } from "../actions";
import type { PickingQueueRow } from "../data";
import { PickingOrderCard } from "./picking-order-card";
import { SeparacaoTabs } from "./separacao-tabs";
```

`new_string`:

```
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
	type BulkAction,
	BulkActionBar,
} from "@/components/bulk/bulk-action-bar";
import { SelectableItem } from "@/components/bulk/selectable-item";
import { SelectionToolbar } from "@/components/bulk/selection-toolbar";
import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { PageHeader } from "@/components/page-header";
import { notify } from "@/lib/notify";
import { useBulkSelection } from "@/lib/use-bulk-selection";
import { useInfiniteList } from "@/lib/use-infinite-list";
import { bulkStartPicking, fetchPickingQueuePageAction } from "../actions";
import type { PickingQueueRow } from "../data";
import { PickingOrderCard } from "./picking-order-card";
import { SeparacaoTabs } from "./separacao-tabs";
```

#### Passo 12 — `picking-queue.tsx`: helpers de toast (espelha `buildBulkSeparationToast` de `orders-view.tsx`)

`old_string`:

```
const TAB_EMPTY: Record<Tab, string> = {
	a_separar: "Nenhum pedido aguardando separação.",
	em_separacao: "Nenhum pedido sendo separado no momento.",
	excecoes: "Sem exceções no momento.",
};

interface PickingQueueProps {
```

`new_string`:

```
const TAB_EMPTY: Record<Tab, string> = {
	a_separar: "Nenhum pedido aguardando separação.",
	em_separacao: "Nenhum pedido sendo separado no momento.",
	excecoes: "Sem exceções no momento.",
};

function pluralSuffix(count: number): string {
	return count === 1 ? "" : "s";
}

/**
 * Extraído do callback de `runBulkPick` para ficar sob o teto de complexidade
 * cognitiva do ultracite — espelha `buildBulkSeparationToast` (orders-view.tsx).
 */
function buildBulkPickToast(
	moved: number,
	skipped: { number: string; reason: string }[]
): { kind: "success" | "warning"; message: string } {
	if (skipped.length === 0) {
		return {
			kind: "success",
			message: `${moved} pedido${pluralSuffix(moved)} em separação`,
		};
	}
	const detail = skipped.map((s) => `${s.number} (${s.reason})`).join(", ");
	return {
		kind: "warning",
		message: `${moved} em separação · ${skipped.length} pulado${pluralSuffix(skipped.length)}: ${detail}`,
	};
}

interface PickingQueueProps {
```

#### Passo 13 — `picking-queue.tsx`: `refreshTick`/`runBulkPick`/`bulkActions`

`old_string`:

```
export function PickingQueue({
	activeTab,
	counts,
	initial,
	initialCursor,
}: PickingQueueProps) {
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: initial,
		initialCursor,
		fetchPage: (cursor) =>
			fetchPickingQueuePageAction({ cursor, tab: activeTab }),
		resetKey: activeTab,
	});
	const sel = useBulkSelection({
		items,
		getId: (row) => row.orderId,
		resetKey: activeTab,
	});
	// Exceções não imprimem (spec): sem modo seleção nessa tab.
	const selectable = activeTab !== "excecoes";

	const printSelected = (ids: string[]) => {
		window.open(
			`/dashboard/orders/picking-list?ids=${ids.join(",")}`,
			"_blank",
			"noopener"
		);
	};

	return (
```

`new_string`:

```
export function PickingQueue({
	activeTab,
	counts,
	initial,
	initialCursor,
}: PickingQueueProps) {
	const router = useRouter();
	// Bump força o useInfiniteList/useBulkSelection a re-sincronizar com o
	// initial revalidado após uma mutação em massa (router.refresh não reseta
	// client state) — mesmo padrão do refreshTick em orders-view.tsx.
	const [refreshTick, setRefreshTick] = useState(0);
	const resetKey = `${activeTab}:${refreshTick}`;
	const [pickPending, startPick] = useTransition();
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: initial,
		initialCursor,
		fetchPage: (cursor) =>
			fetchPickingQueuePageAction({ cursor, tab: activeTab }),
		resetKey,
	});
	const sel = useBulkSelection({
		items,
		getId: (row) => row.orderId,
		resetKey,
	});
	// Exceções não imprimem (spec): sem modo seleção nessa tab.
	const selectable = activeTab !== "excecoes";

	const printSelected = (ids: string[]) => {
		window.open(
			`/dashboard/orders/picking-list?ids=${ids.join(",")}`,
			"_blank",
			"noopener"
		);
	};

	// Bulk "Separar e imprimir" (tab A separar, D7): claim em lote + abre o PDF
	// dos movidos. Refresh sempre — cada pedido é transação própria, então um
	// lote parcial (alguns puladas) ainda precisa refletir na lista.
	const runBulkPick = (ids: string[]) => {
		startPick(async () => {
			const result = await bulkStartPicking({ orderIds: ids });
			setRefreshTick((t) => t + 1);
			router.refresh();
			if (!result.ok) {
				notify.error(result.error);
				return;
			}
			const { kind, message } = buildBulkPickToast(
				result.data.moved,
				result.data.skipped
			);
			if (result.data.movedIds.length > 0) {
				const pdfUrl = `/dashboard/orders/picking-list?ids=${result.data.movedIds.join(",")}`;
				// Abre o PDF do lote; se o popup blocker engolir, o botão do toast cobre.
				window.open(pdfUrl, "_blank", "noopener");
				notify[kind](message, {
					action: {
						label: "Imprimir lista",
						onClick: () => window.open(pdfUrl, "_blank", "noopener"),
					},
				});
			} else {
				notify[kind](message);
			}
			sel.exit();
		});
	};

	// Ações do BulkActionBar por tab (D7/D8): A separar ganha o claim em lote +
	// a reimpressão sem claim; Separando só reimprime (nunca muda dono).
	const bulkActions: BulkAction[] =
		activeTab === "a_separar"
			? [
					{
						label: pickPending
							? "Separando…"
							: `Separar e imprimir (${sel.count})`,
						run: runBulkPick,
						variant: "default",
					},
					{
						label: `Imprimir lista (${sel.count})`,
						run: printSelected,
						variant: "outline",
					},
				]
			: [
					{
						label: `Imprimir lista (${sel.count})`,
						run: printSelected,
					},
				];

	return (
```

#### Passo 14 — `picking-queue.tsx`: `BulkActionBar` consome `bulkActions`

`old_string`:

```
			{selectable && sel.count > 0 && (
				<BulkActionBar
					actions={[
						{
							label: `Imprimir lista (${sel.count})`,
							run: printSelected,
						},
					]}
					selectedIds={sel.selectedIds}
				/>
			)}
```

`new_string`:

```
			{selectable && sel.count > 0 && (
				<BulkActionBar actions={bulkActions} selectedIds={sel.selectedIds} />
			)}
```

#### Passo 15 — `check-types`

```
bun check-types
```

Saída esperada: sem erros. Pontos a conferir se falhar: `BulkAction` importado como `type`
(não como valor — `import { type BulkAction, BulkActionBar } from ...`); `result.data.moved`
só é acessível depois do `if (!result.ok) return;` (narrowing do `ActionResult`).

#### Passo 16 — Rodar toda a suíte de testes do módulo (regressão ampla)

```
bun --cwd apps/web test src/app/dashboard/separacao
```

Saída esperada: todos os arquivos de teste existentes em `separacao/` (incluindo
`picking-actions.test.ts`, `picking-guards.test.ts`, `productivity.test.ts`,
`fulfillment-meta.test.ts`, `fulfillment-state.test.ts` e `_lib/__tests__/picking-logic.test.ts`,
este último já com os testes de `bulkStartPickingSkipReason` da Task 1) continuam verdes —
nenhum deles foi tocado por esta task, então uma quebra aqui indica um import circular ou erro de
sintaxe introduzido em `picking-queue.tsx`.

#### Passo 17 — Smoke com dado real (banco único dev=prod — ver regra abaixo)

```
bun dev:web
```

Em `/dashboard/separacao?tab=a_separar`, com pelo menos 2 pedidos elegíveis (`paid` ou
`preparing` sem sessão ativa, com filial):

1. Clicar **Selecionar**, marcar 2 pedidos.
2. Confirmar que aparecem os dois botões na barra flutuante: **"Separar e imprimir (2)"**
   (esquerda) e **"Imprimir lista (2)"** outline (direita).
3. Clicar **"Imprimir lista (2)"** — abre o PDF numa nova aba, sem mudar o dono/status dos
   pedidos (a lista continua mostrando os mesmos 2 na tab A separar).
4. Clicar **"Separar e imprimir (2)"** — abre o PDF automaticamente numa nova aba, os 2 pedidos
   saem da tab A separar e aparecem em `?tab=em_separacao` com `pickerName` = o usuário logado,
   e o toast de sucesso aparece ("2 pedidos em separação").
5. Repetir o passo 4 simulando corrida: com 2 sessões/abas logadas como usuários diferentes,
   selecionar o MESMO pedido nas duas e disparar quase simultaneamente — uma tem que conseguir
   (toast de sucesso) e a outra tem que reportar o pedido como pulado com a razão "já em
   separação por {nome do primeiro}" no toast de warning.
6. Em `?tab=em_separacao`, selecionar pedidos e confirmar que só existe **"Imprimir lista (N)"**
   na barra (sem opção de claim).

Regra do banco único (CLAUDE.md raiz): qualquer pedido fabricado pontualmente para este smoke
(`EM-TEST-*`) deve ser revertido ao final (`cancelPicking` da sessão criada + qualquer INSERT
avulso) — guardar os ids criados durante o smoke e desfazer, não deixar o fluxo "resolver pra
frente" como histórico permanente. Não truncar/seedar em massa.

Se o smoke não puder ser executado nesta sessão, reportar "implementado, não verificado" — não
declarar a task concluída sem essa prova funcional + de dados (contagem/estado real pós-claim).

#### Passo 18 — Commit

```
git add apps/web/src/app/dashboard/separacao/_components/picking-queue.tsx
git commit -m "feat(separacao): bulk separar e imprimir por tab"
```

### Task 7: card Separar inicia sessão + badge "Você" + remover ResumeBanner (D9/D10)

**Files:**

- Create: nenhum.
- Modify:
  - `apps/web/src/app/dashboard/separacao/_lib/picking-logic.ts` (nova função `isSelfPicker`)
  - `apps/web/src/app/dashboard/separacao/data.ts` (`PickingQueueRow` + query `em_separacao`/`excecoes` ganham `pickerUserId`; remover `getActivePickingForUser`)
  - `apps/web/src/app/dashboard/separacao/_components/picking-order-card.tsx` (prop `sessionUserId`, CTA vira `div role="button"` aninhado no `Link` na tab `a_separar`, badge "Você")
  - `apps/web/src/app/dashboard/separacao/_components/picking-queue.tsx` (prop `sessionUserId` passthrough)
  - `apps/web/src/app/dashboard/separacao/page.tsx` (remove `ResumeBanner` + `getActivePickingForUser`; passa `sessionUserId`)
  - `apps/web/src/app/dashboard/separacao/actions.ts` (remove `getActivePickingForUserAction`, órfã sem o data helper)
- Delete: `apps/web/src/app/dashboard/separacao/_components/resume-banner.tsx`
- Test: `apps/web/src/app/dashboard/separacao/_lib/__tests__/picking-logic.test.ts` (adiciona `describe("isSelfPicker", ...)`)

**Interfaces:**

- Consumes: `startPicking(orderId: string): Promise<ActionResult<{ pickingId: string }>>` (`apps/web/src/app/dashboard/separacao/actions.ts`, já existente — verbatim, sem mudança de assinatura).
- Consumes: `notify.error(message: string, opts?: ExternalToast): string | number` (`apps/web/src/lib/notify.ts`, já existente).
- Produces: `isSelfPicker(pickerUserId: string | null | undefined, sessionUserId: string): boolean` (`_lib/picking-logic.ts`, novo).
- Produces: `PickingOrderCardProps { row: PickingQueueRow; sessionUserId: string; tab: Tab }` (prop nova `sessionUserId`).
- Produces: `PickingQueueProps` ganha `sessionUserId: string` (novo campo obrigatório).
- Produces: `PickingQueueRow.pickerUserId?: string` (novo campo opcional em `data.ts`).
- Remove: `getActivePickingForUser(userId: string, scope: BranchScope): Promise<{...} | null>` (`data.ts`) e seu wrapper `getActivePickingForUserAction()` (`actions.ts`) — confirmado sem outros callers (grep abaixo).

**Risks:**

- CTA da tab `a_separar` é um `div role="button" tabIndex={0}` aninhado no `<Link>` do card —
  segue o padrão canônico do `DESIGN.md` §4 (interativo aninhado usa `div role="button"`, nunca
  `<button>` em âncora). `onClick`/`onKeyDown` cortam propagação antes de chamar `handleStart`,
  então o resto do card continua navegando pro fallback de detalhe mesmo sem clicar no CTA.
- `picking-order-card.tsx` não tem `"use client"` próprio (usa `useState` hoje sem a diretiva, herdando o boundary client de `picking-queue.tsx`). Mantido o padrão existente ao adicionar `useRouter`/`useTransition` — se o build reclamar, adicionar `"use client"` no topo do arquivo.
- `getActivePickingForUserAction` em `actions.ts` não tinha nenhum caller antes desta task (só `getActivePickingForUser` de `data.ts` como caller do data-layer) — removida junto por ficar órfã ao apagar `getActivePickingForUser`; confirmar que nenhuma outra task do plano depende dela.

---

#### Passo 1 — Ler os arquivos-fonte (obrigatório antes de qualquer Edit)

- [ ] `Read` `apps/web/src/app/dashboard/separacao/_lib/picking-logic.ts`
- [ ] `Read` `apps/web/src/app/dashboard/separacao/_lib/__tests__/picking-logic.test.ts`
- [ ] `Read` `apps/web/src/app/dashboard/separacao/data.ts`
- [ ] `Read` `apps/web/src/app/dashboard/separacao/_components/picking-order-card.tsx`
- [ ] `Read` `apps/web/src/app/dashboard/separacao/_components/picking-queue.tsx`
- [ ] `Read` `apps/web/src/app/dashboard/separacao/page.tsx`
- [ ] `Read` `apps/web/src/app/dashboard/separacao/actions.ts`
- [ ] `Read` `apps/web/src/app/dashboard/separacao/_components/resume-banner.tsx`

> Se qualquer Edit abaixo falhar com "string not found", **re-Read o arquivo** (o hook PostToolUse roda `bun fix` após Write/Edit e pode reordenar campos) antes de tentar de novo.

---

#### Passo 2 — Teste falhando: `isSelfPicker`

- [ ] Editar `apps/web/src/app/dashboard/separacao/_lib/__tests__/picking-logic.test.ts`: trocar o import e adicionar o `describe` novo no final do arquivo.

  old_string:
  ```ts
  import { describe, expect, it } from "vitest";
  import {
  	canScanMore,
  	isPickingComplete,
  	matchPickItem,
  	type PickItem,
  	summarizePicking,
  } from "../picking-logic";
  ```

  new_string:
  ```ts
  import { describe, expect, it } from "vitest";
  import {
  	canScanMore,
  	isPickingComplete,
  	isSelfPicker,
  	matchPickItem,
  	type PickItem,
  	summarizePicking,
  } from "../picking-logic";
  ```

  old_string:
  ```ts
  describe("summarizePicking", () => {
  	it("soma unidades e conta exceções", () => {
  		expect(
  			summarizePicking([
  				item({ qtyExpected: 2, qtyPicked: 2 }),
  				item({ qtyExpected: 3, qtyPicked: 1, notFound: true }),
  			])
  		).toEqual({ totalUnits: 5, pickedUnits: 3, exceptions: 1 });
  	});
  });
  ```

  new_string:
  ```ts
  describe("summarizePicking", () => {
  	it("soma unidades e conta exceções", () => {
  		expect(
  			summarizePicking([
  				item({ qtyExpected: 2, qtyPicked: 2 }),
  				item({ qtyExpected: 3, qtyPicked: 1, notFound: true }),
  			])
  		).toEqual({ totalUnits: 5, pickedUnits: 3, exceptions: 1 });
  	});
  });

  describe("isSelfPicker", () => {
  	it("true quando pickerUserId bate com o usuário da sessão", () => {
  		expect(isSelfPicker("usr_1", "usr_1")).toBe(true);
  	});
  	it("false quando pickerUserId é de outro usuário", () => {
  		expect(isSelfPicker("usr_2", "usr_1")).toBe(false);
  	});
  	it("false quando pickerUserId é null", () => {
  		expect(isSelfPicker(null, "usr_1")).toBe(false);
  	});
  	it("false quando pickerUserId é undefined (tab sem sessão ativa)", () => {
  		expect(isSelfPicker(undefined, "usr_1")).toBe(false);
  	});
  });
  ```

- [ ] Rodar da RAIZ do monorepo: `bun --cwd apps/web test src/app/dashboard/separacao/_lib/__tests__/picking-logic.test.ts`
  Output esperado: falha de import/typecheck — `isSelfPicker` não existe em `../picking-logic` (`Module '"../picking-logic"' has no exported member 'isSelfPicker'` ou os 4 `it()` novos falham com `isSelfPicker is not a function`).

---

#### Passo 3 — Implementar `isSelfPicker`

- [ ] Editar `apps/web/src/app/dashboard/separacao/_lib/picking-logic.ts`.

  old_string:
  ```ts
  /** Sessão sem bipagem há mais de 1h é destacada como parada (só alerta). */
  export const STALE_PICKING_MS = 60 * 60 * 1000;

  export function isPickingStale(args: {
  	lastScannedAt: Date | null;
  	now?: Date;
  	startedAt: Date;
  }): boolean {
  	const reference = args.lastScannedAt ?? args.startedAt;
  	const now = args.now ?? new Date();
  	return now.getTime() - reference.getTime() > STALE_PICKING_MS;
  }
  ```

  new_string:
  ```ts
  /** Sessão sem bipagem há mais de 1h é destacada como parada (só alerta). */
  export const STALE_PICKING_MS = 60 * 60 * 1000;

  export function isPickingStale(args: {
  	lastScannedAt: Date | null;
  	now?: Date;
  	startedAt: Date;
  }): boolean {
  	const reference = args.lastScannedAt ?? args.startedAt;
  	const now = args.now ?? new Date();
  	return now.getTime() - reference.getTime() > STALE_PICKING_MS;
  }

  /**
   * Dono da sessão de picking é o próprio ator logado? Usado no badge
   * "Separando · Você" da tab em_separacao (spec 2026-07-16, D10) — distingue
   * tom primary (própria sessão) de warning (colega).
   */
  export function isSelfPicker(
  	pickerUserId: string | null | undefined,
  	sessionUserId: string
  ): boolean {
  	return pickerUserId != null && pickerUserId === sessionUserId;
  }
  ```

- [ ] Rodar: `bun --cwd apps/web test src/app/dashboard/separacao/_lib/__tests__/picking-logic.test.ts`
  Output esperado: todos os testes passam, incluindo os 4 novos de `isSelfPicker` (suite total sem falhas).

---

#### Passo 4 — `data.ts`: expor `pickerUserId` na fila (`em_separacao` e `excecoes`)

- [ ] Editar `apps/web/src/app/dashboard/separacao/data.ts` — adicionar o campo à interface pública `PickingQueueRow`.

  old_string:
  ```ts
  	pickedUnits?: number;
  	pickerName?: string;
  	// Present only for "em_separacao" and "excecoes" tabs
  	pickingId?: string;
  ```

  new_string:
  ```ts
  	pickedUnits?: number;
  	pickerName?: string;
  	// Present only for "em_separacao" tab (badge "Você", D10); populado também
  	// em "excecoes" por paridade de shape com a mesma sessão, mas não usado lá.
  	pickerUserId?: string;
  	// Present only for "em_separacao" and "excecoes" tabs
  	pickingId?: string;
  ```

- [ ] Adicionar a coluna à interface interna `QueueRaw` (shape do raw SQL).

  old_string:
  ```ts
  	interface QueueRaw extends Record<string, unknown> {
  		branch_id: string | null;
  		branch_name: string | null;
  		client_name: string;
  		exception_reason: string | null;
  		item_count: string;
  		last_scanned_at: string | null;
  		number: string;
  		order_id: string;
  		order_status: OrderStatus;
  		paid_at: string;
  		picked_units: string | null;
  		picker_name: string | null;
  		picking_id: string | null;
  		picking_started_at: string | null;
  		unit_count: string;
  	}
  ```

  new_string:
  ```ts
  	interface QueueRaw extends Record<string, unknown> {
  		branch_id: string | null;
  		branch_name: string | null;
  		client_name: string;
  		exception_reason: string | null;
  		item_count: string;
  		last_scanned_at: string | null;
  		number: string;
  		order_id: string;
  		order_status: OrderStatus;
  		paid_at: string;
  		picked_units: string | null;
  		picker_name: string | null;
  		picker_user_id: string | null;
  		picking_id: string | null;
  		picking_started_at: string | null;
  		unit_count: string;
  	}
  ```

- [ ] Adicionar `NULL::text AS picker_user_id` ao branch SQL da tab `a_separar` (nunca tem picker).

  old_string:
  ```ts
  				NULL::text AS picking_id,
  				NULL::text AS picker_name,
  				NULL::int AS picked_units,
  				NULL::timestamptz AS picking_started_at,
  				NULL::timestamptz AS last_scanned_at,
  				NULL::text AS exception_reason
  			FROM "order" o
  			JOIN client c ON c.id = o.client_id
  			LEFT JOIN branch b ON b.id = o.branch_id
  			LEFT JOIN LATERAL (
  				SELECT op.status FROM order_picking op
  				WHERE op.order_id = o.id
  				ORDER BY op.started_at DESC, op.id DESC LIMIT 1
  			) lp ON true
  ```

  new_string:
  ```ts
  				NULL::text AS picking_id,
  				NULL::text AS picker_name,
  				NULL::text AS picker_user_id,
  				NULL::int AS picked_units,
  				NULL::timestamptz AS picking_started_at,
  				NULL::timestamptz AS last_scanned_at,
  				NULL::text AS exception_reason
  			FROM "order" o
  			JOIN client c ON c.id = o.client_id
  			LEFT JOIN branch b ON b.id = o.branch_id
  			LEFT JOIN LATERAL (
  				SELECT op.status FROM order_picking op
  				WHERE op.order_id = o.id
  				ORDER BY op.started_at DESC, op.id DESC LIMIT 1
  			) lp ON true
  ```

- [ ] Adicionar `op.picker_user_id` ao branch SQL da tab `em_separacao` (valor real — é a fonte do badge "Você").

  old_string:
  ```ts
  				(SELECT COALESCE(SUM(oi.quantity), 0)::int FROM order_item oi WHERE oi.order_id = o.id) AS unit_count,
  				op.id AS picking_id,
  				op.picker_name,
  				(
  					SELECT COALESCE(SUM(pi.qty_picked), 0)::int
  					FROM order_picking_item pi
  					WHERE pi.picking_id = op.id
  				) AS picked_units,
  				op.started_at AS picking_started_at,
  				(SELECT MAX(pi.last_scanned_at) FROM order_picking_item pi
  					WHERE pi.picking_id = op.id) AS last_scanned_at,
  				NULL::text AS exception_reason
  			FROM "order" o
  			JOIN client c ON c.id = o.client_id
  			LEFT JOIN branch b ON b.id = o.branch_id
  			JOIN order_picking op ON op.order_id = o.id AND op.status = 'in_progress'
  ```

  new_string:
  ```ts
  				(SELECT COALESCE(SUM(oi.quantity), 0)::int FROM order_item oi WHERE oi.order_id = o.id) AS unit_count,
  				op.id AS picking_id,
  				op.picker_name,
  				op.picker_user_id,
  				(
  					SELECT COALESCE(SUM(pi.qty_picked), 0)::int
  					FROM order_picking_item pi
  					WHERE pi.picking_id = op.id
  				) AS picked_units,
  				op.started_at AS picking_started_at,
  				(SELECT MAX(pi.last_scanned_at) FROM order_picking_item pi
  					WHERE pi.picking_id = op.id) AS last_scanned_at,
  				NULL::text AS exception_reason
  			FROM "order" o
  			JOIN client c ON c.id = o.client_id
  			LEFT JOIN branch b ON b.id = o.branch_id
  			JOIN order_picking op ON op.order_id = o.id AND op.status = 'in_progress'
  ```

- [ ] Adicionar `op.picker_user_id` (LATERAL interna e SELECT externo) ao branch SQL da tab `excecoes` (paridade de shape).

  old_string:
  ```ts
  				(SELECT COALESCE(SUM(oi.quantity), 0)::int FROM order_item oi WHERE oi.order_id = o.id) AS unit_count,
  				op.id AS picking_id,
  				op.picker_name,
  				(
  					SELECT COALESCE(SUM(pi.qty_picked), 0)::int
  					FROM order_picking_item pi
  					WHERE pi.picking_id = op.id
  				) AS picked_units,
  				NULL::timestamptz AS picking_started_at,
  				NULL::timestamptz AS last_scanned_at,
  				op.exception_reason AS exception_reason
  			FROM "order" o
  			JOIN client c ON c.id = o.client_id
  			LEFT JOIN branch b ON b.id = o.branch_id
  			JOIN LATERAL (
  				SELECT op.id, op.picker_name, op.status, op.exception_reason
  				FROM order_picking op
  				WHERE op.order_id = o.id
  				ORDER BY op.started_at DESC, op.id DESC LIMIT 1
  			) op ON op.status = 'exception'
  ```

  new_string:
  ```ts
  				(SELECT COALESCE(SUM(oi.quantity), 0)::int FROM order_item oi WHERE oi.order_id = o.id) AS unit_count,
  				op.id AS picking_id,
  				op.picker_name,
  				op.picker_user_id,
  				(
  					SELECT COALESCE(SUM(pi.qty_picked), 0)::int
  					FROM order_picking_item pi
  					WHERE pi.picking_id = op.id
  				) AS picked_units,
  				NULL::timestamptz AS picking_started_at,
  				NULL::timestamptz AS last_scanned_at,
  				op.exception_reason AS exception_reason
  			FROM "order" o
  			JOIN client c ON c.id = o.client_id
  			LEFT JOIN branch b ON b.id = o.branch_id
  			JOIN LATERAL (
  				SELECT op.id, op.picker_name, op.picker_user_id, op.status, op.exception_reason
  				FROM order_picking op
  				WHERE op.order_id = o.id
  				ORDER BY op.started_at DESC, op.id DESC LIMIT 1
  			) op ON op.status = 'exception'
  ```

- [ ] Popular o campo novo no mapeamento `paginate(...)`.

  old_string:
  ```ts
  			...(row.picking_id !== null && {
  				pickingId: row.picking_id,
  				pickerName: row.picker_name ?? undefined,
  				pickedUnits: row.picked_units === null ? 0 : Number(row.picked_units),
  			}),
  ```

  new_string:
  ```ts
  			...(row.picking_id !== null && {
  				pickingId: row.picking_id,
  				pickerName: row.picker_name ?? undefined,
  				pickerUserId: row.picker_user_id ?? undefined,
  				pickedUnits: row.picked_units === null ? 0 : Number(row.picked_units),
  			}),
  ```

---

#### Passo 5 — Remover `getActivePickingForUser` de `data.ts`

- [ ] Confirmar que não há outros callers antes de apagar (já rodado nesta sessão de planejamento — resultado: só `page.tsx` (render) e `actions.ts` (`getActivePickingForUserAction`, também sem callers próprios). Reconfirmar no momento da implementação:

  ```bash
  rg -n "getActivePickingForUser\b" --glob '!**/data.ts' apps/web
  ```

  Output esperado (antes de qualquer edição desta task): 2 ocorrências de uso real — `page.tsx:59` (`getActivePickingForUser(session.user.id, scope)`) e `actions.ts:25`/`actions.ts:922` (import + `getActivePickingForUserAction`). Nenhuma em `getActivePickingForUserAction` (o wrapper) fora da própria definição — confirma órfã segura para remover junto (Passo 8).

- [ ] Editar `apps/web/src/app/dashboard/separacao/data.ts` — apagar a função inteira.

  old_string:
  ```ts
  /**
   * Sessão in_progress do próprio usuário — dados para o banner de retomada.
   */
  export async function getActivePickingForUser(
  	userId: string,
  	scope: BranchScope
  ): Promise<{
  	orderId: string;
  	number: string;
  	clientName: string;
  	pickedUnits: number;
  	totalUnits: number;
  } | null> {
  	if (isBlindScope(scope)) {
  		return null;
  	}

  	const branchCondition = orderBranchCondition(scope);
  	const branchFragment = branchCondition ? sql` AND ${branchCondition}` : sql``;

  	const result = await db.execute<{
  		order_id: string;
  		number: string;
  		client_name: string;
  		picking_id: string;
  		picked_units: string;
  		total_units: string;
  	}>(sql`
  		SELECT
  			o.id AS order_id,
  			o.number,
  			c.name AS client_name,
  			op.id AS picking_id,
  			(
  				SELECT COALESCE(SUM(pi.qty_picked), 0)::int
  				FROM order_picking_item pi
  				WHERE pi.picking_id = op.id
  			) AS picked_units,
  			(
  				SELECT COALESCE(SUM(pi.qty_expected), 0)::int
  				FROM order_picking_item pi
  				WHERE pi.picking_id = op.id
  			) AS total_units
  		FROM order_picking op
  		JOIN "order" o ON o.id = op.order_id
  		JOIN client c ON c.id = o.client_id
  		WHERE op.picker_user_id = ${userId}
  			AND op.status = 'in_progress'
  			${branchFragment}
  		ORDER BY op.started_at DESC
  		LIMIT 1
  	`);

  	const row = result.rows[0];
  	if (!row) {
  		return null;
  	}

  	return {
  		orderId: row.order_id,
  		number: row.number,
  		clientName: row.client_name,
  		pickedUnits: Number(row.picked_units),
  		totalUnits: Number(row.total_units),
  	};
  }

  // ---------------------------------------------------------------------------
  // Produtividade (issue #324) — leituras agregadas, tab "Produtividade".
  ```

  new_string:
  ```ts
  // ---------------------------------------------------------------------------
  // Produtividade (issue #324) — leituras agregadas, tab "Produtividade".
  ```

---

#### Passo 6 — `check-types` intermediário (data.ts sozinho)

- [ ] Rodar da RAIZ: `bun check-types --force`
  Output esperado neste ponto: **erros** em `page.tsx` e `actions.ts` (`Cannot find name 'getActivePickingForUser'` / `Module '"./data"' has no exported member 'getActivePickingForUser'`) — esperado, ainda não foram editados. Confirma que o Passo 5 de fato removeu a função (se não houver erro nenhum, releia `data.ts` — a remoção pode não ter colado).

---

#### Passo 7 — `picking-order-card.tsx`: prop `sessionUserId`, CTA interativo na tab `a_separar`, badge "Você"

- [ ] Editar os imports do topo do arquivo.

  old_string:
  ```tsx
  import { ArrowRightIcon, ClockIcon, MapPinIcon } from "lucide-react";
  import Link from "next/link";
  import { useState } from "react";

  import { formatRelative } from "@/lib/format/datetime";
  import { isPickingStale } from "../_lib/picking-logic";
  import type { PickingQueueRow } from "../data";
  import { fulfillmentBadgeLabel } from "../fulfillment-meta";
  ```

  new_string:
  ```tsx
  import { ArrowRightIcon, ClockIcon, MapPinIcon } from "lucide-react";
  import Link from "next/link";
  import { useRouter } from "next/navigation";
  import { useState, useTransition } from "react";

  import { formatRelative } from "@/lib/format/datetime";
  import { notify } from "@/lib/notify";
  import { isPickingStale, isSelfPicker } from "../_lib/picking-logic";
  import { startPicking } from "../actions";
  import type { PickingQueueRow } from "../data";
  import { fulfillmentBadgeLabel } from "../fulfillment-meta";
  ```

- [ ] Atualizar a assinatura de `StatusBadge` pra receber `sessionUserId` e ramificar o badge de `em_separacao`.

  old_string:
  ```tsx
  function StatusBadge({ row, tab }: { row: PickingQueueRow; tab: Tab }) {
  	// Mesmo racional do PaidAge: congela o "agora" por instância.
  	const [now] = useState(() => Date.now());
  	if (tab === "excecoes") {
  		return (
  			<span className="inline-flex items-center rounded-md bg-destructive/15 px-2 py-0.5 font-semibold text-[10px] text-destructive">
  				{fulfillmentBadgeLabel("picking_exception", row.pickerName ?? null)}
  			</span>
  		);
  	}
  	if (tab === "em_separacao") {
  		// O nome do responsável vive no badge (spec 2026-07-11, mockup B).
  		return (
  			<span className="inline-flex items-center rounded-md bg-warning/15 px-2 py-0.5 font-semibold text-[10px] text-warning">
  				{fulfillmentBadgeLabel("picking_in_progress", row.pickerName ?? null)}
  			</span>
  		);
  	}
  	// a_separar
  	const isUrgent =
  		row.paidAt != null && now - row.paidAt.getTime() > URGENCY_THRESHOLD_MS;
  	return isUrgent ? (
  		<span className="inline-flex items-center rounded-md bg-warning/15 px-2 py-0.5 font-semibold text-[10px] text-warning">
  			Urgente
  		</span>
  	) : (
  		<span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 font-semibold text-[10px] text-secondary-foreground">
  			A separar
  		</span>
  	);
  }
  ```

  new_string:
  ```tsx
  function StatusBadge({
  	row,
  	sessionUserId,
  	tab,
  }: {
  	row: PickingQueueRow;
  	sessionUserId: string;
  	tab: Tab;
  }) {
  	// Mesmo racional do PaidAge: congela o "agora" por instância.
  	const [now] = useState(() => Date.now());
  	if (tab === "excecoes") {
  		return (
  			<span className="inline-flex items-center rounded-md bg-destructive/15 px-2 py-0.5 font-semibold text-[10px] text-destructive">
  				{fulfillmentBadgeLabel("picking_exception", row.pickerName ?? null)}
  			</span>
  		);
  	}
  	if (tab === "em_separacao") {
  		// Dono do ator ganha tom primary + "Você" (D10); colega mantém o warning
  		// com o nome (spec 2026-07-11, mockup B).
  		if (isSelfPicker(row.pickerUserId, sessionUserId)) {
  			return (
  				<span className="inline-flex items-center rounded-md bg-primary/18 px-2 py-0.5 font-semibold text-[10px] text-primary">
  					Separando · Você
  				</span>
  			);
  		}
  		return (
  			<span className="inline-flex items-center rounded-md bg-warning/15 px-2 py-0.5 font-semibold text-[10px] text-warning">
  				{fulfillmentBadgeLabel("picking_in_progress", row.pickerName ?? null)}
  			</span>
  		);
  	}
  	// a_separar
  	const isUrgent =
  		row.paidAt != null && now - row.paidAt.getTime() > URGENCY_THRESHOLD_MS;
  	return isUrgent ? (
  		<span className="inline-flex items-center rounded-md bg-warning/15 px-2 py-0.5 font-semibold text-[10px] text-warning">
  			Urgente
  		</span>
  	) : (
  		<span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 font-semibold text-[10px] text-secondary-foreground">
  			A separar
  		</span>
  	);
  }
  ```

- [ ] Atualizar a prop interface do componente principal.

  old_string:
  ```tsx
  interface PickingOrderCardProps {
  	row: PickingQueueRow;
  	tab: Tab;
  }
  ```

  new_string:
  ```tsx
  interface PickingOrderCardProps {
  	row: PickingQueueRow;
  	sessionUserId: string;
  	tab: Tab;
  }
  ```

- [ ] Atualizar a assinatura da função + adicionar `router`/`useTransition`/handler, e repassar `sessionUserId` pro `StatusBadge`.

  old_string:
  ```tsx
  export function PickingOrderCard({ row, tab }: PickingOrderCardProps) {
  	const progressPct =
  		tab === "em_separacao" && row.pickedUnits !== undefined && row.unitCount > 0
  			? Math.round((row.pickedUnits / row.unitCount) * 100)
  			: null;

  	const ctaLabel = CTA_LABEL[tab];

  	return (
  		<Link
  			className="group flex flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  			href={`/dashboard/separacao/${row.orderId}`}
  		>
  			{/* Header */}
  			<div className="flex items-start justify-between gap-3 px-4 pt-4 pb-1">
  				<div className="min-w-0">
  					<p className="truncate font-semibold text-base leading-tight tracking-tight">
  						{row.number}
  					</p>
  					<p className="truncate text-[13px] text-muted-foreground">
  						{row.clientName}
  					</p>
  				</div>
  				<StatusBadge row={row} tab={tab} />
  			</div>
  ```

  new_string:
  ```tsx
  export function PickingOrderCard({
  	row,
  	sessionUserId,
  	tab,
  }: PickingOrderCardProps) {
  	const progressPct =
  		tab === "em_separacao" && row.pickedUnits !== undefined && row.unitCount > 0
  			? Math.round((row.pickedUnits / row.unitCount) * 100)
  			: null;

  	const ctaLabel = CTA_LABEL[tab];
  	const router = useRouter();
  	const [isStarting, startTransition] = useTransition();

  	// Card-Link continua navegando pro fallback (deep-link/reabertura, D9); o
  	// CTA é um role="button" aninhado no Link (DESIGN.md §4 — nunca <button>
  	// em âncora) cujo onClick/onKeyDown já cortam propagação antes de chamar
  	// handleStart, que claima a sessão antes de navegar — corrida com outro
  	// operador vira toast, sem navegar (startPicking já resolve "já é de
  	// Fulano" via 23505).
  	function handleStart() {
  		if (isStarting) {
  			return;
  		}
  		startTransition(async () => {
  			const result = await startPicking(row.orderId);
  			if (result.ok) {
  				router.push(`/dashboard/separacao/${row.orderId}`);
  			} else {
  				notify.error(result.error);
  			}
  		});
  	}

  	return (
  		<Link
  			className="group flex flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  			href={`/dashboard/separacao/${row.orderId}`}
  		>
  			{/* Header */}
  			<div className="flex items-start justify-between gap-3 px-4 pt-4 pb-1">
  				<div className="min-w-0">
  					<p className="truncate font-semibold text-base leading-tight tracking-tight">
  						{row.number}
  					</p>
  					<p className="truncate text-[13px] text-muted-foreground">
  						{row.clientName}
  					</p>
  				</div>
  				<StatusBadge row={row} sessionUserId={sessionUserId} tab={tab} />
  			</div>
  ```

- [ ] Trocar o bloco de CTA final: `a_separar` vira `div role="button"` aninhado no `Link`
      (DESIGN.md §4 — nunca `<button>` real dentro de âncora); as outras tabs mantêm o
      `<div role="none">` decorativo.

  old_string:
  ```tsx
  			{/* CTA */}
  			<div className="border-border border-t bg-sidebar px-4 py-3">
  				<div
  					className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-semibold text-[13px] ${CTA_CLASS[tab]}`}
  					// role="none": o <Link> pai já é o elemento interativo
  					role="none"
  				>
  					{ctaLabel}
  					{tab === "a_separar" && (
  						<ArrowRightIcon aria-hidden className="size-4" />
  					)}
  				</div>
  			</div>
  		</Link>
  	);
  }
  ```

  new_string:
  ```tsx
  			{/* CTA */}
  			<div className="border-border border-t bg-sidebar px-4 py-3">
  				{tab === "a_separar" ? (
  					// biome-ignore lint/a11y/useSemanticElements: role="button" aninhado no Link (padrão DESIGN.md §4, não usar <button> em âncora)
  					// role="button" aninhado no Link: padrão DESIGN.md §4 (não usar <button> em âncora)
  					<div
  						aria-disabled={isStarting}
  						className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-semibold text-[13px] transition-opacity aria-disabled:cursor-not-allowed aria-disabled:opacity-70 ${CTA_CLASS.a_separar}`}
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
  						{isStarting ? "Iniciando…" : ctaLabel}
  						<ArrowRightIcon aria-hidden className="size-4" />
  					</div>
  				) : (
  					<div
  						className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-semibold text-[13px] ${CTA_CLASS[tab]}`}
  						// role="none": o <Link> pai já é o elemento interativo
  						role="none"
  					>
  						{ctaLabel}
  					</div>
  				)}
  			</div>
  		</Link>
  	);
  }
  ```

  Nota: `handleStart` já faz o guard de `isStarting` internamente (no-op se já em andamento) —
  o `aria-disabled` é só sinalização visual/assistiva, não é enforcement (divs não têm
  `disabled` nativo). `tabIndex={0}` mantém o CTA alcançável por teclado dentro do card
  focável; o padrão espelha os outros `role="button"` aninhados em `<Link>` já existentes no
  projeto (cards clicáveis com ação interna — ver `DESIGN.md` §4).

---

#### Passo 8 — `picking-queue.tsx`: repassar `sessionUserId`

- [ ] Editar a prop interface.

  old_string:
  ```tsx
  interface PickingQueueProps {
  	activeTab: Tab;
  	counts: { a_separar: number; em_separacao: number; excecoes: number };
  	initial: PickingQueueRow[];
  	initialCursor: string | null;
  }

  export function PickingQueue({
  	activeTab,
  	counts,
  	initial,
  	initialCursor,
  }: PickingQueueProps) {
  ```

  new_string:
  ```tsx
  interface PickingQueueProps {
  	activeTab: Tab;
  	counts: { a_separar: number; em_separacao: number; excecoes: number };
  	initial: PickingQueueRow[];
  	initialCursor: string | null;
  	sessionUserId: string;
  }

  export function PickingQueue({
  	activeTab,
  	counts,
  	initial,
  	initialCursor,
  	sessionUserId,
  }: PickingQueueProps) {
  ```

- [ ] Repassar a prop pro card.

  old_string:
  ```tsx
  						<PickingOrderCard row={row} tab={activeTab} />
  ```

  new_string:
  ```tsx
  						<PickingOrderCard
  							row={row}
  							sessionUserId={sessionUserId}
  							tab={activeTab}
  						/>
  ```

---

#### Passo 9 — `page.tsx`: remover `ResumeBanner` + `getActivePickingForUser`, passar `sessionUserId`

- [ ] Remover os imports órfãos.

  old_string:
  ```tsx
  import { AutoRefresh } from "@/components/auto-refresh";
  import { PageHeader } from "@/components/page-header";
  import { getUserBranchScope } from "@/lib/branch-scope";
  import { requireCapabilityOrRedirect } from "@/lib/permissions";
  import { LateOrdersToast } from "../orders/_components/late-orders-toast";
  import { getLateOrdersCount } from "../orders/data";
  import { PickingQueue } from "./_components/picking-queue";
  import { ProductivityPanel } from "./_components/productivity-panel";
  import { ResumeBanner } from "./_components/resume-banner";
  import { type SeparacaoTab, SeparacaoTabs } from "./_components/separacao-tabs";
  import {
  	fetchPickingProductivityByOperator,
  	fetchPickingProductivitySummary,
  	fetchPickingQueueCounts,
  	fetchPickingQueuePage,
  	getActivePickingForUser,
  } from "./data";
  ```

  new_string:
  ```tsx
  import { AutoRefresh } from "@/components/auto-refresh";
  import { PageHeader } from "@/components/page-header";
  import { getUserBranchScope } from "@/lib/branch-scope";
  import { requireCapabilityOrRedirect } from "@/lib/permissions";
  import { LateOrdersToast } from "../orders/_components/late-orders-toast";
  import { getLateOrdersCount } from "../orders/data";
  import { PickingQueue } from "./_components/picking-queue";
  import { ProductivityPanel } from "./_components/productivity-panel";
  import { type SeparacaoTab, SeparacaoTabs } from "./_components/separacao-tabs";
  import {
  	fetchPickingProductivityByOperator,
  	fetchPickingProductivitySummary,
  	fetchPickingQueueCounts,
  	fetchPickingQueuePage,
  } from "./data";
  ```

- [ ] Remover `activePicking` do `Promise.all`.

  old_string:
  ```tsx
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
  ```

  new_string:
  ```tsx
  	// Contadores reais (COUNT) das 3 tabs de fila + o dado da tab ativa.
  	// Produtividade busca os agregados; tabs de fila buscam a 1ª página.
  	const [counts, lateCount, queuePage, summary, operators] = await Promise.all(
  		[
  			fetchPickingQueueCounts(scope),
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
  		]
  	);
  ```

- [ ] Remover a render do banner.

  old_string:
  ```tsx
  			/>

  			{activePicking && <ResumeBanner activePicking={activePicking} />}

  			{activeTab === "produtividade" ? (
  ```

  new_string:
  ```tsx
  			/>

  			{activeTab === "produtividade" ? (
  ```

- [ ] Passar `sessionUserId` pro `<PickingQueue>`.

  old_string:
  ```tsx
  				<PickingQueue
  					activeTab={activeTab}
  					counts={counts}
  					initial={queuePage?.items ?? []}
  					initialCursor={queuePage?.nextCursor ?? null}
  				/>
  ```

  new_string:
  ```tsx
  				<PickingQueue
  					activeTab={activeTab}
  					counts={counts}
  					initial={queuePage?.items ?? []}
  					initialCursor={queuePage?.nextCursor ?? null}
  					sessionUserId={session.user.id}
  				/>
  ```

---

#### Passo 10 — `actions.ts`: remover `getActivePickingForUserAction` (órfã)

- [ ] Remover `getActivePickingForUser` do import de `./data`.

  old_string:
  ```ts
  import {
  	fetchPickingQueuePage,
  	getActivePickingForUser,
  	getOrderBranchId,
  	getPickingForOrder,
  } from "./data";
  ```

  new_string:
  ```ts
  import {
  	fetchPickingQueuePage,
  	getOrderBranchId,
  	getPickingForOrder,
  } from "./data";
  ```

- [ ] Remover o wrapper.

  old_string:
  ```ts
  export async function getActivePickingForUserAction() {
  	const session = await requireCapability("orders.pick");
  	const scope = await getUserBranchScope(session);
  	return getActivePickingForUser(session.user.id, scope);
  }

  export async function getPickingForOrderAction(orderId: string) {
  ```

  new_string:
  ```ts
  export async function getPickingForOrderAction(orderId: string) {
  ```

---

#### Passo 11 — Deletar `resume-banner.tsx`

- [ ] Rodar: `rm apps/web/src/app/dashboard/separacao/_components/resume-banner.tsx`
  (arquivo já sem nenhum caller depois do Passo 9 — `ResumeBanner`/`resume-banner` não aparece mais em nenhum import.)

---

#### Passo 12 — Verificação completa

- [ ] Rodar da RAIZ: `rg -n "ResumeBanner|resume-banner|getActivePickingForUser" apps/web`
  Output esperado: **nenhuma ocorrência** (0 linhas).

- [ ] Rodar da RAIZ: `bun check-types --force`
  Output esperado: `Tasks: N successful, N total` sem erros em `apps/web` (nenhuma menção a `separacao/`).

- [ ] Rodar da RAIZ: `bun check`
  Output esperado: ultracite sem findings novos em `apps/web/src/app/dashboard/separacao/**` (nenhum `any`/`console`/`key={index}` introduzido; o `biome-ignore lint/a11y/useSemanticElements` do Passo 7 já cobre o `role="button"` — espelha o mesmo suppression usado em `customers/_components/customer-row.tsx` e `suppliers/_components/supplier-card.tsx`. Se `bun check` apontar qualquer OUTRO finding de a11y/lint no bloco do CTA, reportar como risco, não silenciar com `biome-ignore` adicional sem investigar).

- [ ] Rodar da RAIZ: `bun --cwd apps/web test src/app/dashboard/separacao`
  Output esperado: suíte inteira da pasta `separacao` verde (inclui `picking-logic.test.ts`, `picking-actions.test.ts`, `picking-guards.test.ts`, `fulfillment-state.test.ts`, `fulfillment-meta.test.ts`, `productivity.test.ts` — nenhum quebrado pela remoção de `getActivePickingForUser`, já que os mocks em `picking-actions.test.ts`/`picking-guards.test.ts` só declaram `getActivePickingForUser: vi.fn()` a mais no objeto mockado de `../data`, o que é inofensivo).

---

#### Passo 13 — Smoke manual no browser (dado real, sem seed novo)

- [ ] `bun dev:web` (da raiz).
- [ ] Login com um usuário `orders.pick` existente; abrir `/dashboard/separacao` (tab "A separar" default).
- [ ] **Perceptual:** conferir visualmente que o CTA "Separar" de um card na tab "A separar" é o único elemento com cursor de botão/hover distinto do resto do card (o resto do card ainda navega ao clicar fora do CTA).
- [ ] **Funcional:** clicar o CTA "Separar" de um pedido pago sem sessão ativa → esperado: `router.push` pra `/dashboard/separacao/{orderId}` (URL muda, tela de bipagem abre) e o pedido sai da tab "A separar" ao voltar pra fila.
- [ ] **Dados:** na tab "Separando", localizar o card recém-criado e confirmar visualmente o badge **"Separando · Você"** em tom primary (coral, não warning) — o `picker_user_id` da sessão criada bate com o usuário logado.
- [ ] **Corrida (opcional, 2ª sessão/aba anônima com outro usuário `orders.pick`):** abrir o mesmo pedido perdido pelo primeiro usuário (se ainda estiver em "A separar" por race) e clicar "Separar" simultaneamente nas duas abas — a 2ª a resolver deve receber `notify.error` com "Já existe uma separação em andamento para este pedido" (mensagem verbatim de `startPicking`) e **não navegar**.
- [ ] Se algum estado de teste precisar ser fabricado no banco (linha `EM-TEST-*`), reverter ao final da verificação (excluir a picking session criada e devolver o pedido pro status anterior) — banco é único dev=prod.

---

#### Passo 14 — Commit

- [ ] `git add -A -- apps/web/src/app/dashboard/separacao`
- [ ] Conferir o diff antes de commitar: `git status` (nenhum arquivo fora de `apps/web/src/app/dashboard/separacao` deveria aparecer).
- [ ] `git commit -m "separacao: card inicia sessão e remove banner de retomada"`
  (subject 43 chars, sem menção a AI/Claude, sem `Co-Authored-By`.)

### Task 8: PickingCompletePanel sem despacho (D11)

**Files:**
- Modify: `apps/web/src/app/dashboard/separacao/_components/picking-complete-panel.tsx`
- Modify: `apps/web/src/app/dashboard/separacao/_components/picking-execution.tsx`
- Modify: `apps/web/src/app/dashboard/separacao/[orderId]/page.tsx`

**Interfaces:**
- Consumes: nenhuma action nova. Remove o consumo de `updateOrderStatus({ orderId: string; toStatus: string; trackingCode: string }): Promise<ActionResult<...>>` (import de `../../orders/actions`) — não é mais chamado por este componente.
- Produces (assinatura NOVA, substitui a anterior):
  - `PickingCompletePanel({ orderId, pickedUnits, totalUnits }: { orderId: string; pickedUnits: number; totalUnits: number }): JSX.Element` — perde o campo `canShip: boolean`.
  - `PickingExecutionProps` (mesmo arquivo `picking-execution.tsx`) perde o campo `canShip: boolean`; assinatura nova: `{ branchName: string | null; items: OrderPickingItem[]; orderNumber: string; picking: OrderPicking }`.
  - `SeparacaoOrderPage` (`[orderId]/page.tsx`) para de computar `canShip` (deixa de chamar `can(session, "orders.update_status")`) e para de passar essa prop pro `<PickingExecution>`.

---

- [ ] **Passo 1 — Re-ler o arquivo alvo antes de editar.** Rode `Read` em `/home/othavio/Projects/emach/emach-dashboard-2/emach-dashboard/apps/web/src/app/dashboard/separacao/_components/picking-complete-panel.tsx`. O conteúdo atual (baseline, verbatim) é:

```tsx
"use client";

import { Button, buttonVariants } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { CheckIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { notify } from "@/lib/notify";
import { updateOrderStatus } from "../../orders/actions";

interface PickingCompletePanelProps {
	canShip: boolean;
	orderId: string;
	pickedUnits: number;
	totalUnits: number;
}

export function PickingCompletePanel({
	canShip,
	orderId,
	pickedUnits,
	totalUnits,
}: PickingCompletePanelProps) {
	const router = useRouter();
	const [trackingCode, setTrackingCode] = useState("");
	const [isPending, startTransition] = useTransition();

	function handleShip() {
		startTransition(async () => {
			const result = await updateOrderStatus({
				orderId,
				toStatus: "shipped",
				trackingCode: trackingCode.trim(),
			});
			if (result.ok) {
				notify.success("Pedido despachado");
				router.push("/dashboard/separacao");
			} else {
				notify.error(result.error);
			}
		});
	}

	return (
		<div className="rounded-xl border border-success/40 bg-card p-6">
			<p className="flex items-center gap-2 font-medium text-lg text-success">
				<CheckIcon aria-hidden className="size-5" strokeWidth={2.6} />
				Separação concluída
			</p>
			<p className="mt-1 text-[13px] text-muted-foreground">
				{`${pickedUnits} de ${totalUnits} unidades conferidas. O pedido está "Pronto para enviar".`}
			</p>

			{canShip && (
				<div className="mt-4 rounded-lg border border-border bg-muted/40 p-4">
					<p className="font-medium text-sm">Despachar agora (opcional)</p>
					<div className="mt-2 flex gap-2">
						<Input
							onChange={(e) => setTrackingCode(e.target.value)}
							placeholder="Código de rastreio — ex: BR123456789"
							value={trackingCode}
						/>
						<Button
							disabled={isPending || !trackingCode.trim()}
							onClick={handleShip}
						>
							{isPending ? "Enviando…" : "Marcar como Enviado"}
						</Button>
					</div>
				</div>
			)}

			<div className="mt-4 flex items-center gap-3">
				<Link
					className={buttonVariants({ size: "sm", variant: "outline" })}
					href="/dashboard/separacao"
				>
					Voltar à fila
				</Link>
				<span className="text-muted-foreground text-xs">
					dá pra despachar depois pelo detalhe do pedido
				</span>
			</div>
		</div>
	);
}
```

- [ ] **Passo 2 — Escrever o arquivo inteiro sem o bloco de despacho, com o link "Ver pedido".** Use `Write` para sobrescrever `/home/othavio/Projects/emach/emach-dashboard-2/emach-dashboard/apps/web/src/app/dashboard/separacao/_components/picking-complete-panel.tsx` com:

```tsx
"use client";

import { buttonVariants } from "@emach/ui/components/button";
import { CheckIcon } from "lucide-react";
import Link from "next/link";

interface PickingCompletePanelProps {
	orderId: string;
	pickedUnits: number;
	totalUnits: number;
}

export function PickingCompletePanel({
	orderId,
	pickedUnits,
	totalUnits,
}: PickingCompletePanelProps) {
	return (
		<div className="rounded-xl border border-success/40 bg-card p-6">
			<p className="flex items-center gap-2 font-medium text-lg text-success">
				<CheckIcon aria-hidden className="size-5" strokeWidth={2.6} />
				Separação concluída
			</p>
			<p className="mt-1 text-[13px] text-muted-foreground">
				{`${pickedUnits} de ${totalUnits} unidades conferidas. O pedido está "Pronto para enviar".`}
			</p>

			<div className="mt-4 flex items-center gap-3">
				<Link
					className={buttonVariants({ size: "sm", variant: "outline" })}
					href="/dashboard/separacao"
				>
					Voltar à fila
				</Link>
				<Link
					className={buttonVariants({ size: "sm", variant: "outline" })}
					href={`/dashboard/orders/${orderId}`}
				>
					Ver pedido
				</Link>
			</div>
		</div>
	);
}
```

Nota: o texto "dá pra despachar depois pelo detalhe do pedido" foi removido (não adaptado) — o link "Ver pedido" já cobre a mesma intenção sem repetir a informação em prosa (D11: rastreio/andamento vivem no detalhe do pedido).

Se o hook `PostToolUse` (`bun fix`) reordenar algo e uma futura `Edit` falhar com "string not found", re-`Read` o arquivo antes de tentar de novo.

- [ ] **Passo 3 — Re-ler `picking-execution.tsx` e remover `canShip` da interface.** `Read` `/home/othavio/Projects/emach/emach-dashboard-2/emach-dashboard/apps/web/src/app/dashboard/separacao/_components/picking-execution.tsx`. Depois `Edit`:

old_string:
```tsx
interface PickingExecutionProps {
	branchName: string | null;
	canShip: boolean;
	items: OrderPickingItem[];
	orderNumber: string;
	picking: OrderPicking;
}

export function PickingExecution({
	branchName,
	canShip,
	items,
	orderNumber,
	picking,
}: PickingExecutionProps) {
```

new_string:
```tsx
interface PickingExecutionProps {
	branchName: string | null;
	items: OrderPickingItem[];
	orderNumber: string;
	picking: OrderPicking;
}

export function PickingExecution({
	branchName,
	items,
	orderNumber,
	picking,
}: PickingExecutionProps) {
```

- [ ] **Passo 4 — Parar de passar `canShip` pro `PickingCompletePanel`.** No mesmo arquivo, `Edit`:

old_string:
```tsx
	if (completedOk) {
		return (
			<PickingCompletePanel
				canShip={canShip}
				orderId={picking.orderId}
				pickedUnits={summary.pickedUnits}
				totalUnits={summary.totalUnits}
			/>
		);
	}
```

new_string:
```tsx
	if (completedOk) {
		return (
			<PickingCompletePanel
				orderId={picking.orderId}
				pickedUnits={summary.pickedUnits}
				totalUnits={summary.totalUnits}
			/>
		);
	}
```

- [ ] **Passo 5 — Re-ler `[orderId]/page.tsx` e remover o import não usado `can`.** `Read` `/home/othavio/Projects/emach/emach-dashboard-2/emach-dashboard/apps/web/src/app/dashboard/separacao/[orderId]/page.tsx`. Depois `Edit`:

old_string:
```tsx
import { getUserBranchScope, orderInScope } from "@/lib/branch-scope";
import { can, requireCapabilityOrRedirect } from "@/lib/permissions";
```

new_string:
```tsx
import { getUserBranchScope, orderInScope } from "@/lib/branch-scope";
import { requireCapabilityOrRedirect } from "@/lib/permissions";
```

- [ ] **Passo 6 — Atualizar o docblock de `PickingDispatched` (deixa de citar "despacho").** No mesmo arquivo, `Edit`:

old_string:
```tsx
/**
 * Sessão de picking já 'completed', mas o pedido saiu de "preparing" (enviado,
 * entregue, etc.) — o painel de despacho (PickingExecution/PickingCompletePanel)
 * não faz mais sentido aqui. Estado terminal simples com link pro detalhe.
 */
```

new_string:
```tsx
/**
 * Sessão de picking já 'completed', mas o pedido saiu de "preparing" (enviado,
 * entregue, etc.) — o painel de conclusão (PickingExecution/PickingCompletePanel)
 * não faz mais sentido aqui. Estado terminal simples com link pro detalhe.
 */
```

- [ ] **Passo 7 — Atualizar o comentário sobre o refresh do Server Component (deixa de citar "Despachar agora").** No mesmo arquivo, `Edit`:

old_string:
```tsx
	// "completed" entra aqui junto de "in_progress" (só o dono): completePicking
	// revalida esta rota via revalidatePath, o que dispara um refresh automático
	// do Server Component assim que o Server Action resolve. Se esse refresh
	// caísse fora de PickingExecution, o painel "Despachar agora" (estado local
	// completedOk) seria substituído pela tela de "Iniciar separação" antes do
	// usuário conseguir vê-lo — PickingExecution deriva completedOk a partir de
	// picking.status, então mantê-lo como o mesmo componente preserva o painel.
```

new_string:
```tsx
	// "completed" entra aqui junto de "in_progress" (só o dono): completePicking
	// revalida esta rota via revalidatePath, o que dispara um refresh automático
	// do Server Component assim que o Server Action resolve. Se esse refresh
	// caísse fora de PickingExecution, o painel de conclusão (estado local
	// completedOk) seria substituído pela tela de "Iniciar separação" antes do
	// usuário conseguir vê-lo — PickingExecution deriva completedOk a partir de
	// picking.status, então mantê-lo como o mesmo componente preserva o painel.
```

- [ ] **Passo 8 — Remover o cálculo de `canShip` e a prop passada pro `<PickingExecution>`.** No mesmo arquivo, `Edit`:

old_string:
```tsx
		if (
			result.picking.status === "completed" &&
			orderRow.status !== "preparing"
		) {
			return <PickingDispatched orderId={orderId} />;
		}
		const canShip = await can(session, "orders.update_status");
		return (
			<PickingExecution
				branchName={orderRow.branchName}
				canShip={canShip}
				items={result.items}
				orderNumber={orderRow.number}
				picking={result.picking}
			/>
		);
	}
```

new_string:
```tsx
		if (
			result.picking.status === "completed" &&
			orderRow.status !== "preparing"
		) {
			return <PickingDispatched orderId={orderId} />;
		}
		return (
			<PickingExecution
				branchName={orderRow.branchName}
				items={result.items}
				orderNumber={orderRow.number}
				picking={result.picking}
			/>
		);
	}
```

- [ ] **Passo 9 — Verificação estática.** Rode, da raiz do monorepo:

```
bun check-types
```

Esperado: sem erros nos 3 arquivos tocados (saída `web:check-types: ...` sem `error TS`). Depois:

```
bun check
```

Esperado: sem findings novos (ultracite não deve reportar import não usado `can`, `Button`, `Input`, `useState`, `useTransition`, `useRouter`, `notify`, `updateOrderStatus` nos 3 arquivos — todos foram removidos junto com seu uso).

- [ ] **Passo 10 — Confirmar que nada do bloco de despacho sobrou.** Rode:

```
rg -n "trackingCode|handleShip|Despachar agora|canShip|updateOrderStatus" /home/othavio/Projects/emach/emach-dashboard-2/emach-dashboard/apps/web/src/app/dashboard/separacao
```

Esperado: nenhum resultado (saída vazia). Se aparecer algo em `picking-execution.tsx` fora dos 2 pontos já editados ou em `[orderId]/page.tsx`, revisar — significa que sobrou uma referência.

- [ ] **Passo 11 — Commit.**

```
git add apps/web/src/app/dashboard/separacao/_components/picking-complete-panel.tsx apps/web/src/app/dashboard/separacao/_components/picking-execution.tsx "apps/web/src/app/dashboard/separacao/[orderId]/page.tsx"
git commit -m "refactor(separacao): remove despacho do painel"
```

---


### Task 9: Produtividade medida do 1º bipe (D13)

**Files:**
- Modify: `apps/web/src/app/dashboard/separacao/data.ts`
- Test: nenhum arquivo de teste toca este código — `apps/web/src/app/dashboard/separacao/__tests__/productivity.test.ts` cobre só os helpers puros de `_lib/productivity.ts` (`formatSessionDuration`/`formatExceptionRate`/`exceptionTone`), não as queries SQL de `data.ts`; não há teste unitário de `fetchPickingProductivitySummary`/`fetchPickingProductivityByOperator` no repo (mockar `db.execute` para uma agregação SQL com `LATERAL`/`WITH bounds` não verificaria a lógica — ela roda no Postgres). Verificação é smoke com dado real (step 4).

**Interfaces:**
- Consumes: tabela `order_picking_scan` (`packages/db/src/schema/orders.ts`, linhas 486-519) — colunas raw SQL `picking_id` (`text`, FK → `order_picking.id`) e `scanned_at` (`timestamp with time zone`, `defaultNow().notNull()`). Índice existente `order_picking_scan_session_idx` em `(picking_id, scanned_at DESC)` já cobre o `MIN(scanned_at) WHERE picking_id = op.id` novo.
- Produces (assinaturas **inalteradas** — só a semântica interna do `avg_session_seconds` muda):
  - `export async function fetchPickingProductivitySummary(scope: BranchScope): Promise<PickingProductivitySummary>`
  - `export async function fetchPickingProductivityByOperator(scope: BranchScope): Promise<PickingOperatorProductivity[]>`
  - Tipos `PickingProductivitySummary` e `PickingOperatorProductivity` não mudam (ambos já têm `avgSessionSeconds: number | null`).

---

- [ ] **1. Reler o arquivo antes de editar.**

  Rode `Read` em `apps/web/src/app/dashboard/separacao/data.ts` (o hook `PostToolUse` de `bun fix` pode ter reordenado campos desde a última leitura registrada nesta task — releia mesmo se já leu antes de começar a implementação).

- [ ] **2. Editar `fetchPickingProductivitySummary` — LATERAL do 1º bipe + fallback `started_at`.**

  Localize o bloco exato (comentário + assinatura + corpo inteiro da função) e troque:

  **old_string:**
  ```
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
  ```

  **new_string:**
  ```
  /**
   * KPIs agregados do painel. Unidades = SUM(qty_picked) dos itens das sessões
   * finalizadas na janela — NÃO contar order_picking_scan: re-bipe de item já
   * completo insere scan sem incrementar unidade (registerScan, caso
   * alreadyFull) e supercontaria.
   *
   * Duração da sessão (D13, issue #324): COALESCE(MIN(order_picking_scan.scanned_at),
   * started_at) → completed_at. Com claim em lote (Separar e imprimir), started_at
   * passa a ser "hora da impressão" — sem o fallback pro 1º bipe, o intervalo entre
   * imprimir e efetivamente começar a bipar infla a duração média por pedido.
   * Sessão sem nenhum bipe (ex: todos os itens reportados ausentes sem scan) cai no
   * fallback started_at, preservando o comportamento anterior.
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
  			ROUND(AVG(EXTRACT(EPOCH FROM op.completed_at - COALESCE(scan.first_scanned_at, op.started_at))))::int AS avg_session_seconds
  		FROM order_picking op
  		CROSS JOIN bounds b
  		LEFT JOIN LATERAL (
  			SELECT COALESCE(SUM(pi.qty_picked), 0)::int AS units
  			FROM order_picking_item pi
  			WHERE pi.picking_id = op.id
  		) items ON true
  		LEFT JOIN LATERAL (
  			SELECT MIN(s.scanned_at) AS first_scanned_at
  			FROM order_picking_scan s
  			WHERE s.picking_id = op.id
  		) scan ON true
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
  ```

  Se a Edit falhar com `string not found` (o hook `PostToolUse` de `bun fix` pode ter reformatado o arquivo entre a leitura e este step), releia o arquivo (`Read`) e ajuste o `old_string` pelo conteúdo atual antes de repetir.

- [ ] **3. Editar `fetchPickingProductivityByOperator` — mesmo LATERAL, mesmo fallback.**

  Releia o arquivo (o step 2 já alterou o conteúdo — a leitura do step 1 está desatualizada para esta função) e troque:

  **old_string:**
  ```
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

  **new_string:**
  ```
  /**
   * Quebra por operador (últimos 7 dias). Agrupa por picker_user_id (picker_name
   * é snapshot da sessão — user renomeado não duplica linha; exibe o nome mais
   * recente). Sessões com picker_user_id nulo (user deletado) agrupam pelo
   * próprio nome, com prefixo "name:" na chave pra não colidir com ids.
   *
   * Duração da sessão (D13, issue #324): mesmo COALESCE(MIN(scan.scanned_at),
   * started_at) → completed_at de fetchPickingProductivitySummary — ver o
   * comentário lá para o racional completo.
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
  			ROUND(AVG(EXTRACT(EPOCH FROM op.completed_at - COALESCE(scan.first_scanned_at, op.started_at))))::int AS avg_session_seconds,
  			COALESCE(SUM(items.units), 0)::int AS units_week,
  			COUNT(*) FILTER (WHERE op.status = 'exception')::int AS exception_count
  		FROM order_picking op
  		CROSS JOIN bounds b
  		LEFT JOIN LATERAL (
  			SELECT COALESCE(SUM(pi.qty_picked), 0)::int AS units
  			FROM order_picking_item pi
  			WHERE pi.picking_id = op.id
  		) items ON true
  		LEFT JOIN LATERAL (
  			SELECT MIN(s.scanned_at) AS first_scanned_at
  			FROM order_picking_scan s
  			WHERE s.picking_id = op.id
  		) scan ON true
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

  Mesmo aviso do step 2: `string not found` na Edit → releia o arquivo e reajuste o `old_string` pelo conteúdo pós-`bun fix` antes de repetir.

- [ ] **4. Type-check com cache limpo.**

  Rode (da raiz do monorepo, CWD é a raiz):
  ```
  bun check-types --force
  ```
  Saída esperada: `Tasks: N successful, N total` sem nenhuma linha `error TS` para `@emach/web` (nem para nenhum outro pacote — o `--force` invalida o cache do turbo, que já serviu `FULL TURBO` obsoleto em incidentes anteriores). Nenhuma coluna nova foi introduzida no tipo de retorno de `db.execute<{...}>` além das duas já existentes (`completed_today`/`avg_session_seconds` etc. continuam os mesmos campos) — a única coisa nova no SQL (`scan.first_scanned_at`) não vaza pro shape TS, então não deve haver erro de tipo aqui. Se aparecer erro, ele é sinal de erro de digitação no SQL (ex: alias `scan` colidindo com alguma outra referência) — investigar antes de seguir.

- [ ] **5. Rodar a suíte de testes de produtividade (regressão dos helpers puros).**

  ```
  bun --cwd apps/web test apps/web/src/app/dashboard/separacao/__tests__/productivity.test.ts
  ```
  Saída esperada: todos os testes de `formatSessionDuration`/`formatExceptionRate`/`exceptionTone` continuam verdes (este arquivo não testa `data.ts` — é regressão de que nada em `_lib/productivity.ts` foi tocado, não uma prova de D13). Se falhar, o step 2/3 alterou algo fora do escopo de `data.ts` — reverter e investigar.

- [ ] **6. Smoke com dado real: sessão com bipe tardio (Dados — gate de "pronto").**

  Não existe automação de teste para a semântica SQL (ver nota em Files/Test) — a prova é observar o dado real renderizado, como exige o gate de "pronto" do projeto.

  1. Suba o dev server (`bun dev:web`) e abra `/dashboard/separacao` no browser, tab **A separar**.
  2. Escolha um pedido de teste (`EM-TEST-*`/`EM-2026-*` se algum estiver `paid` sem sessão de picking; senão, qualquer pedido `paid` — preferir teste pra não distorcer métricas reais de produtividade) e clique **Separar**. Isso cria a sessão (`order_picking.started_at = now()`) e navega pra bipagem.
  3. **Aguarde ~2 minutos antes do primeiro bipe** (simula o intervalo entre iniciar/imprimir e efetivamente começar a separar — o cenário que a D13 corrige) e só então bipe/confirme os itens até completar a sessão (`completePicking`).
  4. Confira os timestamps brutos da sessão com uma query **read-only** (psql ou SQL editor do Supabase, usando a connection string de `DATABASE_URL`):
     ```sql
     SELECT op.id, op.started_at, op.completed_at,
            (SELECT MIN(scanned_at) FROM order_picking_scan WHERE picking_id = op.id) AS first_scanned_at
     FROM order_picking op
     WHERE op.id = '<pickingId da sessão que você acabou de completar>';
     ```
     Confirme que `first_scanned_at` é ≈2 minutos **depois** de `started_at` (a espera que você simulou no passo 3).
  5. Abra a tab **Produtividade** e olhe a linha desse operador em "Por operador" → coluna **Tempo médio**. Se esse operador não tiver outra sessão concluída nos últimos 7 dias, o valor exibido bate **exatamente** com `completed_at − first_scanned_at` (formatado por `formatSessionDuration`, ex: sessão de 3min de bipagem real após 2min de espera → mostra "3min", não "5min"). Se o operador tiver outras sessões na janela, confira em vez disso o KPI **Tempo médio de sessão** do topo (afeta a média de todos) e valide a direção do efeito: adicionar uma sessão com espera pré-bipe grande **não** deveria puxar a média pra cima na mesma proporção que puxaria sem o fallback — compare mentalmente com quanto a média subiria se o cálculo ainda fosse `completed_at - started_at` (bastaria a sessão isolada pra visualizar; se preferir isolamento total, use um usuário/operador que não tenha outras sessões na janela de 7 dias).
  6. Não é necessário reverter o dado: a sessão nasceu do fluxo real do app (`startPicking`/bipes/`completePicking`), não de um INSERT manual — vira histórico legítimo, consistente com a regra do banco único (escrita pontual via app é OK). Se usou um pedido real de cliente em vez de um `EM-TEST-*`/`EM-2026-*`, documente no PR que a métrica de produtividade daquele dia inclui uma sessão de smoke.

- [ ] **7. Commit.**

  ```
  git add apps/web/src/app/dashboard/separacao/data.ts
  git commit -m "fix: medir produtividade a partir do 1º bipe"
  ```

### Task 10: Remover mode `tab` do picking-list (limpeza D3/D5)

**⚠️ Dependência:** esta task só pode ser executada **depois** que as Tasks 5/6 removerem o `<a href="/dashboard/orders/picking-list?tab=${activeTab}">` (botão "Imprimir lista" do header) em `apps/web/src/app/dashboard/separacao/page.tsx` (linha 84 no baseline atual, D5) — esse `<a>` é hoje o **único** caller do mode `tab`. O Passo 1 abaixo confirma isso antes de qualquer edição; se o grep encontrar algo, PARAR e não seguir (a task ainda não pode rodar).

**Files:**
- Modify: `apps/web/src/app/dashboard/orders/picking-list/_lib/resolve-params.ts`
- Modify: `apps/web/src/app/dashboard/orders/picking-list/route.ts`
- Modify: `apps/web/src/app/dashboard/orders/picking-list/_lib/data.ts`
- Test: `apps/web/src/app/dashboard/orders/picking-list/_lib/__tests__/resolve-params.test.ts`

**Interfaces:**
- Produces (assinatura NOVA, substitui a anterior):
  - `resolvePickingListParams(sp: URLSearchParams): { ok: true; params: PickingListParams } | { error: string; ok: false }` — inalterada na forma, mas `PickingListParams` deixa de ser union e passa a ser `{ ids: string[] }` (perde as variantes `mode: "ids" | "tab"` e o campo `tab`).
  - `fetchPickingListOrders(params: PickingListParams, scope: BranchScope): Promise<PickingListOrder[]>` (`apps/web/src/app/dashboard/orders/picking-list/_lib/data.ts`) — mesma assinatura de fora, mas o corpo para de ramificar por `params.mode`/`params.tab` e o `LEFT JOIN LATERAL` em `order_picking` (alias `lp`) é removido por ficar órfão (só existia para alimentar os branches de tab).
- Consumes: `GET` de `route.ts` continua chamando `resolvePickingListParams` e `fetchPickingListOrders` com as mesmas assinaturas externas; o campo `mode` sai do objeto logado em `logger.info("picking_list.pdf", …)`.

---

- [ ] **Passo 1 — Confirmar que não há mais caller do mode `tab`.** Rode, da raiz do monorepo:

```
rg -n "picking-list\?tab=" apps/web/src
```

Esperado: **saída vazia**. Se aparecer alguma linha, PARAR — a dependência (Tasks 5/6) ainda não foi concluída; não prosseguir com esta task.

- [ ] **Passo 2 — Re-ler `resolve-params.ts`.** `Read` `/home/othavio/Projects/emach/emach-dashboard-2/emach-dashboard/apps/web/src/app/dashboard/orders/picking-list/_lib/resolve-params.ts`. Conteúdo atual (baseline, verbatim):

```ts
import { z } from "zod";

const MAX_IDS = 100; // mesmo teto do bulkStartSeparationSchema (orders/schema.ts)

const idSchema = z.string().uuid();

export type PickingListParams =
	| { ids: string[]; mode: "ids" }
	| { mode: "tab"; tab: "a_separar" | "em_separacao" };

export type ResolveResult =
	| { ok: true; params: PickingListParams }
	| { error: string; ok: false };

/** `?ids=` (lote/seleção) e `?tab=` (recorte da fila) são mutuamente exclusivos. */
export function resolvePickingListParams(sp: URLSearchParams): ResolveResult {
	const idsRaw = sp.get("ids");
	const tabRaw = sp.get("tab");

	if (idsRaw && tabRaw) {
		return { error: "Use ids OU tab, não ambos", ok: false };
	}
	if (idsRaw) {
		const ids = Array.from(
			new Set(
				idsRaw
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean)
			)
		);
		if (ids.length === 0 || ids.length > MAX_IDS) {
			return { error: `ids deve ter entre 1 e ${MAX_IDS} itens`, ok: false };
		}
		if (!ids.every((id) => idSchema.safeParse(id).success)) {
			return { error: "ids contém valor inválido", ok: false };
		}
		return { ok: true, params: { ids, mode: "ids" } };
	}
	if (tabRaw) {
		if (tabRaw !== "a_separar" && tabRaw !== "em_separacao") {
			return { error: "tab inválida", ok: false };
		}
		return { ok: true, params: { mode: "tab", tab: tabRaw } };
	}
	return { error: "Informe ids ou tab", ok: false };
}
```

- [ ] **Passo 3 — Sobrescrever `resolve-params.ts` só com o mode `ids`.** `Write` o arquivo inteiro com:

```ts
import { z } from "zod";

const MAX_IDS = 100; // mesmo teto do bulkStartSeparationSchema (orders/schema.ts)

const idSchema = z.string().uuid();

export interface PickingListParams {
	ids: string[];
}

export type ResolveResult =
	| { ok: true; params: PickingListParams }
	| { error: string; ok: false };

/** `?ids=` (lote/seleção) é o único modo suportado pela rota. */
export function resolvePickingListParams(sp: URLSearchParams): ResolveResult {
	const idsRaw = sp.get("ids");
	if (!idsRaw) {
		return { error: "Informe ids", ok: false };
	}
	const ids = Array.from(
		new Set(
			idsRaw
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean)
		)
	);
	if (ids.length === 0 || ids.length > MAX_IDS) {
		return { error: `ids deve ter entre 1 e ${MAX_IDS} itens`, ok: false };
	}
	if (!ids.every((id) => idSchema.safeParse(id).success)) {
		return { error: "ids contém valor inválido", ok: false };
	}
	return { ok: true, params: { ids } };
}
```

- [ ] **Passo 4 — Re-ler e atualizar o teste de `resolve-params`.** `Read` `/home/othavio/Projects/emach/emach-dashboard-2/emach-dashboard/apps/web/src/app/dashboard/orders/picking-list/_lib/__tests__/resolve-params.test.ts`. Conteúdo atual (baseline, verbatim):

```ts
import { describe, expect, it } from "vitest";
import { resolvePickingListParams } from "../resolve-params";

const UUID_A = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const UUID_B = "550e8400-e29b-41d4-a716-446655440000";

function sp(query: string): URLSearchParams {
	return new URL(`http://x/y?${query}`).searchParams;
}

describe("resolvePickingListParams", () => {
	it("modo ids: csv vira array deduplicado", () => {
		const r = resolvePickingListParams(sp(`ids=${UUID_A},${UUID_B},${UUID_A}`));
		expect(r).toEqual({
			ok: true,
			params: { ids: [UUID_A, UUID_B], mode: "ids" },
		});
	});

	it("modo tab: aceita a_separar e em_separacao", () => {
		expect(resolvePickingListParams(sp("tab=a_separar"))).toEqual({
			ok: true,
			params: { mode: "tab", tab: "a_separar" },
		});
		expect(resolvePickingListParams(sp("tab=em_separacao"))).toEqual({
			ok: true,
			params: { mode: "tab", tab: "em_separacao" },
		});
	});

	it("rejeita: sem params, ids+tab juntos, tab inválida, id não-uuid", () => {
		expect(resolvePickingListParams(sp("")).ok).toBe(false);
		expect(resolvePickingListParams(sp(`ids=${UUID_A}&tab=a_separar`)).ok).toBe(
			false
		);
		expect(resolvePickingListParams(sp("tab=excecoes")).ok).toBe(false);
		expect(resolvePickingListParams(sp("ids=abc")).ok).toBe(false);
	});

	it("rejeita mais de 100 ids", () => {
		const many = Array.from(
			{ length: 101 },
			(_, i) => `${i.toString(16).padStart(8, "0")}-58cc-4372-a567-0e02b2c3d479`
		).join(",");
		expect(resolvePickingListParams(sp(`ids=${many}`)).ok).toBe(false);
	});
});
```

Sobrescreva com (`Write`):

```ts
import { describe, expect, it } from "vitest";
import { resolvePickingListParams } from "../resolve-params";

const UUID_A = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const UUID_B = "550e8400-e29b-41d4-a716-446655440000";

function sp(query: string): URLSearchParams {
	return new URL(`http://x/y?${query}`).searchParams;
}

describe("resolvePickingListParams", () => {
	it("csv vira array deduplicado", () => {
		const r = resolvePickingListParams(sp(`ids=${UUID_A},${UUID_B},${UUID_A}`));
		expect(r).toEqual({
			ok: true,
			params: { ids: [UUID_A, UUID_B] },
		});
	});

	it("rejeita: sem ids, id não-uuid", () => {
		expect(resolvePickingListParams(sp("")).ok).toBe(false);
		expect(resolvePickingListParams(sp("ids=abc")).ok).toBe(false);
	});

	it("rejeita mais de 100 ids", () => {
		const many = Array.from(
			{ length: 101 },
			(_, i) => `${i.toString(16).padStart(8, "0")}-58cc-4372-a567-0e02b2c3d479`
		).join(",");
		expect(resolvePickingListParams(sp(`ids=${many}`)).ok).toBe(false);
	});
});
```

- [ ] **Passo 5 — Rodar o teste e ver passar.** Da raiz do monorepo:

```
bun --cwd apps/web test src/app/dashboard/orders/picking-list/_lib/__tests__/resolve-params.test.ts
```

Esperado: `3 passed` (3 testes), 0 falhas.

- [ ] **Passo 6 — Re-ler `route.ts` e remover o campo `mode` do log.** `Read` `/home/othavio/Projects/emach/emach-dashboard-2/emach-dashboard/apps/web/src/app/dashboard/orders/picking-list/route.ts`. `Edit`:

old_string:
```ts
		logger.info("picking_list.pdf", {
			userId: session.user.id,
			orders: orders.length,
			mode: resolved.params.mode,
		});
```

new_string:
```ts
		logger.info("picking_list.pdf", {
			userId: session.user.id,
			orders: orders.length,
		});
```

- [ ] **Passo 7 — Re-ler `data.ts`.** `Read` `/home/othavio/Projects/emach/emach-dashboard-2/emach-dashboard/apps/web/src/app/dashboard/orders/picking-list/_lib/data.ts`. Conteúdo atual (baseline, verbatim):

```ts
import "server-only";

import { db } from "@emach/db";
import { type SQL, sql } from "drizzle-orm";
import {
	type BranchScope,
	isBlindScope,
	orderBranchCondition,
} from "@/lib/branch-scope";
import type { PickingListItem, PickingListOrder } from "./picking-list-logic";
import type { PickingListParams } from "./resolve-params";

const MAX_ORDERS = 100;

interface Row extends Record<string, unknown> {
	city: string | null;
	client_name: string;
	id: string;
	items: PickingListItem[] | null;
	number: string;
	shipping_method: string | null;
	state: string | null;
}

/**
 * Pedidos + itens completos para o PDF. Só etapas de separação
 * ('paid'/'preparing') entram — pedido enviado/cancelado não imprime.
 * Branch-scoping fail-closed: fora do escopo é excluído em silêncio (spec).
 */
export async function fetchPickingListOrders(
	params: PickingListParams,
	scope: BranchScope
): Promise<PickingListOrder[]> {
	if (isBlindScope(scope)) {
		return [];
	}
	const branchCond = orderBranchCondition(scope);
	const branchFragment = branchCond ? sql`AND ${branchCond}` : sql``;

	let modeFragment: SQL;
	if (params.mode === "ids") {
		const ph = sql.join(
			params.ids.map((id) => sql`${id}`),
			sql`, `
		);
		modeFragment = sql`o.id IN (${ph}) AND o.status IN ('paid', 'preparing')`;
	} else if (params.tab === "a_separar") {
		// Mesma condição da fila (separacao/data.ts, tab a_separar): sem sessão ativa.
		modeFragment = sql`o.status IN ('paid', 'preparing') AND (lp.status IS NULL OR lp.status = 'canceled')`;
	} else {
		// em_separacao: sessão in_progress existente (unique parcial garante ≤1).
		modeFragment = sql`o.status = 'preparing' AND lp.status = 'in_progress'`;
	}

	const result = await db.execute<Row>(sql`
		SELECT
			o.id,
			o.number,
			c.name AS client_name,
			o.shipping_method,
			o.shipping_address->>'city' AS city,
			o.shipping_address->>'state' AS state,
			li.items
		FROM "order" o
		JOIN client c ON c.id = o.client_id
		LEFT JOIN LATERAL (
			SELECT op.status FROM order_picking op
			WHERE op.order_id = o.id
			ORDER BY op.started_at DESC, op.id DESC LIMIT 1
		) lp ON true
		LEFT JOIN LATERAL (
			SELECT COALESCE(jsonb_agg(jsonb_build_object(
				'variantId', oi.variant_id, 'sku', oi.sku, 'barcode', oi.barcode,
				'name', oi.name, 'model', oi.model, 'voltage', oi.voltage,
				'quantity', oi.quantity
			) ORDER BY oi.quantity DESC, oi.name ASC), '[]'::jsonb) AS items
			FROM order_item oi
			WHERE oi.order_id = o.id
		) li ON true
		WHERE ${modeFragment}
			${branchFragment}
		ORDER BY o.paid_at ASC, o.id ASC
		LIMIT ${MAX_ORDERS}
	`);

	return result.rows.map((r) => ({
		city: r.city,
		clientName: r.client_name,
		id: r.id,
		items: r.items ?? [],
		number: r.number,
		shippingMethod: r.shipping_method,
		state: r.state,
	}));
}
```

- [ ] **Passo 8 — Sobrescrever `data.ts` sem os branches de tab e sem o `LEFT JOIN LATERAL` órfão de `order_picking`.** `Write` o arquivo inteiro com:

```ts
import "server-only";

import { db } from "@emach/db";
import { sql } from "drizzle-orm";
import {
	type BranchScope,
	isBlindScope,
	orderBranchCondition,
} from "@/lib/branch-scope";
import type { PickingListItem, PickingListOrder } from "./picking-list-logic";
import type { PickingListParams } from "./resolve-params";

const MAX_ORDERS = 100;

interface Row extends Record<string, unknown> {
	city: string | null;
	client_name: string;
	id: string;
	items: PickingListItem[] | null;
	number: string;
	shipping_method: string | null;
	state: string | null;
}

/**
 * Pedidos + itens completos para o PDF. Só etapas de separação
 * ('paid'/'preparing') entram — pedido enviado/cancelado não imprime.
 * Branch-scoping fail-closed: fora do escopo é excluído em silêncio (spec).
 */
export async function fetchPickingListOrders(
	params: PickingListParams,
	scope: BranchScope
): Promise<PickingListOrder[]> {
	if (isBlindScope(scope)) {
		return [];
	}
	const branchCond = orderBranchCondition(scope);
	const branchFragment = branchCond ? sql`AND ${branchCond}` : sql``;

	const ph = sql.join(
		params.ids.map((id) => sql`${id}`),
		sql`, `
	);
	const idsFragment = sql`o.id IN (${ph}) AND o.status IN ('paid', 'preparing')`;

	const result = await db.execute<Row>(sql`
		SELECT
			o.id,
			o.number,
			c.name AS client_name,
			o.shipping_method,
			o.shipping_address->>'city' AS city,
			o.shipping_address->>'state' AS state,
			li.items
		FROM "order" o
		JOIN client c ON c.id = o.client_id
		LEFT JOIN LATERAL (
			SELECT COALESCE(jsonb_agg(jsonb_build_object(
				'variantId', oi.variant_id, 'sku', oi.sku, 'barcode', oi.barcode,
				'name', oi.name, 'model', oi.model, 'voltage', oi.voltage,
				'quantity', oi.quantity
			) ORDER BY oi.quantity DESC, oi.name ASC), '[]'::jsonb) AS items
			FROM order_item oi
			WHERE oi.order_id = o.id
		) li ON true
		WHERE ${idsFragment}
			${branchFragment}
		ORDER BY o.paid_at ASC, o.id ASC
		LIMIT ${MAX_ORDERS}
	`);

	return result.rows.map((r) => ({
		city: r.city,
		clientName: r.client_name,
		id: r.id,
		items: r.items ?? [],
		number: r.number,
		shippingMethod: r.shipping_method,
		state: r.state,
	}));
}
```

- [ ] **Passo 9 — Verificação estática.** Da raiz do monorepo:

```
bun check-types
```

Esperado: sem erros (o `type SQL` deixou de ser importado e deixou de ser usado; `params.mode`/`params.tab` não existem mais em `PickingListParams`, então qualquer resquício de acesso a esses campos quebraria aqui).

```
bun check
```

Esperado: sem findings novos (nenhum import não usado, nenhuma variável órfã).

- [ ] **Passo 10 — Rodar a suíte inteira de testes do módulo picking-list e ver passar.** Da raiz do monorepo:

```
bun --cwd apps/web test src/app/dashboard/orders/picking-list
```

Esperado: todos os arquivos do diretório (`resolve-params.test.ts`, `picking-list-logic.test.ts`, `document.test.tsx`) passam — nenhum deles referencia `mode`/`tab`, então não deveriam quebrar; confirmar mesmo assim.

- [ ] **Passo 11 — Confirmar que não sobrou referência a `mode`/`tab` no módulo.** Rode:

```
rg -n "\.mode\b|params\.tab\b|mode: \"tab\"|a_separar\" \| \"em_separacao" /home/othavio/Projects/emach/emach-dashboard-2/emach-dashboard/apps/web/src/app/dashboard/orders/picking-list
```

Esperado: nenhum resultado (saída vazia).

- [ ] **Passo 12 — Smoke manual no browser (leitura, sem mutação — GET puro).** Logado no dashboard, abrir `/dashboard/orders/picking-list?ids=<uuid-de-um-pedido-real-paid-ou-preparing>` e confirmar que o PDF renderiza (sem 500/403). Não é preciso criar dado novo — usar um pedido `paid`/`preparing` já existente no banco único; esta é uma leitura, não grava nada.

- [ ] **Passo 13 — Commit.**

```
git add apps/web/src/app/dashboard/orders/picking-list/_lib/resolve-params.ts apps/web/src/app/dashboard/orders/picking-list/route.ts apps/web/src/app/dashboard/orders/picking-list/_lib/data.ts apps/web/src/app/dashboard/orders/picking-list/_lib/__tests__/resolve-params.test.ts
git commit -m "refactor(picking-list): remove modo tab do pdf"
```

### Task 11: Gate final integrado (3 provas)

**Files:**
- Nenhum arquivo novo — verificação integrada de tudo que as Tasks 1–10 entregaram.

**Interfaces:**
- Consumes: todas as entregas anteriores.
- Produces: veredito "pronto" com evidência, ou lista de pendências.

- [ ] **Step 1: Verificação funcional completa**

Run (da raiz): `bun verify` (encadeia `check-types && check && test`). Antes, limpar cache do turbo se houver suspeita de PASS velho: `bun check-types --force`.
Expected: os 3 verdes. Qualquer falha → voltar pra task correspondente, nunca silenciar.

- [ ] **Step 2: Build (obrigatório — tasks tocaram arquivos `"use server"`)**

Run: `bun run build`
Expected: sucesso. Falha típica a caçar: `Only async functions are allowed to be exported in a "use server" file` (re-export não-async esquecido em actions.ts).

- [ ] **Step 3: Smoke funcional no browser (dev server porta 3007)**

Com sessão autenticada em `http://localhost:3007`:
1. `/dashboard/orders` tab Pagos → selecionar 2+ pedidos → "Enviar para separação (N)" abre o dialog novo; confirmar → toast SEM botão de imprimir, nenhuma aba de PDF abre; pedidos somem de Pagos.
2. `/dashboard/orders/[id]` de um pago → não existe "Salvar" avulso; botão diz "Enviar para separação".
3. `/dashboard/separacao` → header só com "Selecionar" (sem contadores, sem imprimir); tab A separar → selecionar 2 → barra mostra "Separar e imprimir (2)" (coral) + "Imprimir lista (2)" (outline). Disparar o primário: PDF abre com os 2, pedidos vão pra Separando com badge "Separando · Você".
4. Card "Separar" de um terceiro pedido → clique único já cai na tela de bipagem (sem passo "Iniciar separação").
5. Concluir uma separação → painel de sucesso SEM campo de rastreio, com link "Ver pedido" funcionando.
6. Tab Produtividade → duração média reflete 1º bipe (sessão claimada há muito e bipada agora não infla).

- [ ] **Step 4: Prova de dados (banco único — regra EM-TEST)**

O smoke do Step 3 usa pedidos de seed `EM-2026-*`/`EM-TEST-*`. Se fabricar estado novo (INSERT/UPDATE pontual), guardar ids e REVERTER ao final. Conferir no dado real renderizado: `picker_user_id` gravado = usuário da sessão; skips de corrida aparecem no toast (abrir a mesma seleção em duas janelas se viável).

- [ ] **Step 5: Prova perceptual**

Screenshots das 4 superfícies (listagem Pedidos + dialog, detalhe do pedido, fila A separar com barra de lote, tab Separando com badges) comparadas lado a lado com os mockups aprovados em `.superpowers/brainstorm/467893-1784230338/content/` (`envio-dialog.html`, `fila-redesign.html`). Divergência visual = ajustar ou reportar, nunca declarar concluído.

- [ ] **Step 6: Relatório final**

Reportar com as 3 provas anexadas. Se alguma prova não pôde ser executada, dizer "implementado, não verificado" — nunca "concluído".
