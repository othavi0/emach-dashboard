# Alerta proativo de reorder point (#307) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cron diário útil que e-maila os admins de cada filial (via `user_branch`) quando variantes caem abaixo do ponto de reposição, com cooldown de 7 dias persistido em tabela nova `stock_alert_sent`.

**Architecture:** Route handler `/api/cron/stock-alerts` (auth Bearer `CRON_SECRET`) roda uma query raw que já traz o estado de dedupe via `LEFT JOIN stock_alert_sent`, agrupa por filial em memória, filtra cooldown, resolve destinatários (`user_branch` admins → fallback super_admins) e envia 1 e-mail por filial via `@emach/email` (Resend); upsert do dedupe só após envio bem-sucedido.

**Tech Stack:** Next 16 route handler, Drizzle 0.45 (`db.execute` raw + `insert().onConflictDoUpdate`), React Email (`@react-email/components`), Resend, Vercel Cron, vitest.

**Spec:** `docs/superpowers/specs/2026-07-14-stock-alerts-design.md` (decisões de produto fechadas lá).

## Global Constraints

- Branch de trabalho: `feat/307-stock-alerts` (já criada). **NÃO fazer push nem abrir PR sem instrução.**
- CWD é a **RAIZ do monorepo** (turbo/bun) — nunca `cd apps/web`; comandos com paths absolutos ou `--cwd`.
- Commits: Conventional Commits em **PT**, subject **≤50 chars**. **ZERO atribuição de AI** (nada de "Generated with Claude Code" / "Co-Authored-By" em commit/PR/issue).
- Proibido: `console.log/warn/error` (usar `logger` de `apps/web/src/lib/logger.ts`), `: any`/`as any`/`@ts-ignore`, `.forEach()` em hot path (usar `for...of`).
- O handler **não** é server action — sem `requireCapability`; a auth é o Bearer `CRON_SECRET` **antes de qualquer query**.
- Hook PostToolUse roda `bun fix` após Write/Edit — pode reordenar campos e invalidar `old_string` de Edit subsequente; se Edit falhar com `string not found`, **re-Read antes de re-tentar**. lefthook roda `bun fix` + `git add -u` no commit.
- Read cada arquivo antes de Edit (`cat`/`sed` não contam para o harness).
- `bun check-types` com cache limpo antes de commit: `bun run check-types --force` (turbo já serviu PASS velho).
- **Banco Supabase é ÚNICO e COMPARTILHADO (dev = prod = ecommerce).** NENHUM `seed`/`truncate`/`drop`/reset/push destrutivo. O único toque de schema deste plano é ADITIVO (`stock_alert_sent`) e é aplicado só na Task 4, interativamente, com o user ciente.
- Envs já existentes (nenhuma nova): `CRON_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `BETTER_AUTH_URL`.

---

### Task 1: Schema — tabela `stock_alert_sent`

**Files:**
- Modify: `packages/db/src/schema/inventory.ts` (append após `userBranchRelations`, antes do bloco de `export type`)

**Interfaces:**
- Consumes: `branch`, `toolVariant` (já importados no arquivo), `pgTable`/`primaryKey`/`text`/`timestamp` (já importados), `relations` (já importado).
- Produces: `stockAlertSent` (tabela Drizzle com colunas `branchId`, `variantId`, `alertLevel`, `sentAt`) + tipos `StockAlertSent`/`NewStockAlertSent` — a Task 3 importa `stockAlertSent` de `@emach/db/schema/inventory` para o upsert.

Não há teste unitário de schema (declarativo); o gate é `check-types`. O `db:sync` fica para a Task 4 (precisa de TTY e ciência do user). O barrel `packages/db/src/schema/index.ts` já faz `export * from "./inventory"` — **não precisa mexer**.

- [ ] **Step 1: Adicionar a tabela, relations e tipos**

Ler `packages/db/src/schema/inventory.ts` e inserir após o bloco `userBranchRelations` (linha ~154):

```ts
export const stockAlertSent = pgTable(
	"stock_alert_sent",
	{
		branchId: text("branch_id")
			.notNull()
			.references(() => branch.id, { onDelete: "cascade" }),
		variantId: text("variant_id")
			.notNull()
			.references(() => toolVariant.id, { onDelete: "cascade" }),
		alertLevel: text("alert_level", {
			enum: ["critical", "reorder"],
		}).notNull(),
		sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
	},
	(table) => [primaryKey({ columns: [table.branchId, table.variantId] })]
);

export const stockAlertSentRelations = relations(stockAlertSent, ({ one }) => ({
	branch: one(branch, {
		fields: [stockAlertSent.branchId],
		references: [branch.id],
	}),
	variant: one(toolVariant, {
		fields: [stockAlertSent.variantId],
		references: [toolVariant.id],
	}),
}));
```

E ao bloco final de tipos, acrescentar:

```ts
export type StockAlertSent = typeof stockAlertSent.$inferSelect;
export type NewStockAlertSent = typeof stockAlertSent.$inferInsert;
```

Notas: PK composta declarada na **mesma ordem** das colunas na tabela (`branchId`, `variantId`) — drizzle-kit gera diff fantasma se divergir. `text` com `enum` (não pgEnum) segue o padrão de `branch.status`. Sem `defaultNow()` em `sentAt` — o handler sempre grava explicitamente.

- [ ] **Step 2: Typecheck**

Run: `bun run check-types --force` (na raiz)
Expected: exit 0, todos os pacotes PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/schema/inventory.ts
git commit -m "feat(db): tabela stock_alert_sent p/ dedupe"
```

---

### Task 2: E-mail — template `stock-alert.tsx` + `sendStockAlertEmail`

**Files:**
- Create: `packages/email/src/templates/stock-alert.tsx`
- Modify: `packages/email/src/send.tsx`

**Interfaces:**
- Consumes: `resend` (client singleton), `env.EMAIL_FROM` — padrão idêntico aos sends existentes no mesmo arquivo.
- Produces: `sendStockAlertEmail({ to, branchName, dashboardUrl, items }): Promise<void>` com `to: string[]` e `items: StockAlertEmailProps["items"]` (array de `{ alertLevel: "critical" | "reorder"; deficit: number; quantity: number; reorderPoint: number; sku: string; toolName: string }`) — a Task 3 importa de `@emach/email/send` (único entry do pacote; **não** existe barrel `@emach/email`).

- [ ] **Step 1: Criar o template**

Criar `packages/email/src/templates/stock-alert.tsx` (estrutura espelha `invite.tsx` — mesmo Tailwind preset, coral, `lang="pt-BR"`):

```tsx
import {
	Body,
	Button,
	Container,
	Head,
	Heading,
	Html,
	Preview,
	pixelBasedPreset,
	Section,
	Tailwind,
	Text,
} from "@react-email/components";

export interface StockAlertEmailProps {
	branchName: string;
	dashboardUrl: string;
	items: Array<{
		alertLevel: "critical" | "reorder";
		deficit: number;
		quantity: number;
		reorderPoint: number;
		sku: string;
		toolName: string;
	}>;
}

const CRITICAL_COLOR = "#dc2626";
const cellStyle = { padding: "6px 8px" };
const headStyle = {
	...cellStyle,
	borderBottom: "1px solid #e5e7eb",
	textAlign: "left" as const,
};
const rowStyle = { borderBottom: "1px solid #f3f4f6" };

export function StockAlertEmail({
	branchName,
	dashboardUrl,
	items,
}: StockAlertEmailProps) {
	return (
		<Html lang="pt-BR">
			<Tailwind
				config={{
					presets: [pixelBasedPreset],
					theme: { extend: { colors: { coral: "#cc785c" } } },
				}}
			>
				<Head />
				<Body className="bg-gray-100 font-sans">
					<Preview>Alerta de estoque baixo — filial {branchName}</Preview>
					<Container className="mx-auto max-w-xl p-6">
						<Section className="rounded-lg border border-gray-200 border-solid bg-white p-8">
							<Text className="m-0 font-bold text-coral text-sm tracking-widest">
								E-MACH
							</Text>
							<Heading className="mt-4 mb-2 font-normal text-2xl text-gray-900">
								Estoque abaixo do ponto de reposição
							</Heading>
							<Text className="text-base text-gray-700">
								Olá! Os itens abaixo na filial {branchName} precisam de
								reposição.
							</Text>
							<table
								style={{
									borderCollapse: "collapse" as const,
									fontSize: 14,
									width: "100%",
								}}
							>
								<thead>
									<tr>
										<th style={headStyle}>Ferramenta</th>
										<th style={headStyle}>SKU</th>
										<th style={headStyle}>Estoque</th>
										<th style={headStyle}>Ponto</th>
										<th style={headStyle}>Déficit</th>
									</tr>
								</thead>
								<tbody>
									{items.map((item) => (
										<tr key={item.sku} style={rowStyle}>
											<td style={cellStyle}>{item.toolName}</td>
											<td style={cellStyle}>{item.sku}</td>
											<td
												style={
													item.alertLevel === "critical"
														? {
																...cellStyle,
																color: CRITICAL_COLOR,
																fontWeight: 600,
															}
														: cellStyle
												}
											>
												{item.quantity}
											</td>
											<td style={cellStyle}>{item.reorderPoint}</td>
											<td style={cellStyle}>{item.deficit}</td>
										</tr>
									))}
								</tbody>
							</table>
							<Button
								className="my-4 box-border block rounded-md bg-coral px-5 py-3 text-center font-medium text-white no-underline"
								href={dashboardUrl}
							>
								Ver reposição no painel
							</Button>
							<Text className="text-gray-500 text-sm">
								Você recebeu este e-mail porque administra esta filial no
								painel E-mach.
							</Text>
						</Section>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
}

StockAlertEmail.PreviewProps = {
	branchName: "Filial Centro",
	dashboardUrl: "https://admin.emach.com.br/dashboard/tools?mode=repor&branchId=b1",
	items: [
		{
			alertLevel: "critical",
			deficit: 5,
			quantity: 0,
			reorderPoint: 5,
			sku: "PFD-12V-001",
			toolName: "Parafusadeira 12V",
		},
		{
			alertLevel: "reorder",
			deficit: 5,
			quantity: 3,
			reorderPoint: 8,
			sku: "FUR-500W-002",
			toolName: "Furadeira 500W",
		},
	],
} satisfies StockAlertEmailProps;

export default StockAlertEmail;
```

Notas: `key={item.sku}` é ID estável (sku é unique no domínio) — não é `key={index}`. Tabela em HTML direto com estilos inline (e-mail client compat); sem dependência nova.

- [ ] **Step 2: Registrar `sendStockAlertEmail` em `send.tsx`**

Ler `packages/email/src/send.tsx`. Adicionar ao bloco de imports:

```ts
import {
	StockAlertEmail,
	type StockAlertEmailProps,
} from "./templates/stock-alert";
```

E ao final do arquivo:

```tsx
export async function sendStockAlertEmail({
	to,
	branchName,
	dashboardUrl,
	items,
}: {
	to: string[];
	branchName: string;
	dashboardUrl: string;
	items: StockAlertEmailProps["items"];
}): Promise<void> {
	await resend.emails.send({
		from: env.EMAIL_FROM,
		to,
		subject: `Alerta de estoque — ${branchName} — E-mach`,
		react: (
			<StockAlertEmail
				branchName={branchName}
				dashboardUrl={dashboardUrl}
				items={items}
			/>
		),
	});
}
```

(`resend.emails.send` aceita `to: string | string[]` nativamente.)

- [ ] **Step 3: Typecheck + lint**

Run: `bun run check-types --force && bun check`
Expected: ambos exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/email/src/templates/stock-alert.tsx packages/email/src/send.tsx
git commit -m "feat(email): template de alerta de reorder point"
```

---

### Task 3: Handler cron + testes (TDD) + registro no vercel.json

**Files:**
- Create: `apps/web/src/app/api/cron/stock-alerts/__tests__/route.test.ts`
- Create: `apps/web/src/app/api/cron/stock-alerts/route.ts`
- Modify: `apps/web/vercel.json`

**Interfaces:**
- Consumes: `stockAlertSent` de `@emach/db/schema/inventory` (Task 1); `sendStockAlertEmail` de `@emach/email/send` (Task 2, assinatura `{ to: string[]; branchName: string; dashboardUrl: string; items }`); `toDate` de `@emach/db/utils`; `logger` de `@/lib/logger`; `db` de `@emach/db`.
- Produces: `GET(request: Request): Promise<NextResponse>` respondendo `{ ok: true, emailsSent: number, branchesSkipped: number, itemsAlerted: number }`.

- [ ] **Step 1: Escrever os testes (falhando)**

Criar `apps/web/src/app/api/cron/stock-alerts/__tests__/route.test.ts`. O padrão de mock (`vi.hoisted` antes dos imports, mock de `@emach/env/server`) espelha `cancel-stale-orders/__tests__/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

// --- mocks (devem vir antes dos imports do código sob teste) ---

vi.mock("@emach/env/server", () => ({
	env: {
		BETTER_AUTH_URL: "https://admin.test",
		CRON_SECRET: "test-secret-32-chars-minimum-ok",
	},
}));

const { mockDbExecute, mockDbInsert, mockSendStockAlertEmail } = vi.hoisted(
	() => ({
		mockDbExecute: vi.fn(),
		mockDbInsert: vi.fn(),
		mockSendStockAlertEmail: vi.fn(),
	})
);

vi.mock("@emach/db", () => ({
	db: {
		execute: mockDbExecute,
		insert: mockDbInsert,
	},
}));

vi.mock("@emach/email/send", () => ({
	sendStockAlertEmail: mockSendStockAlertEmail,
}));

vi.mock("@/lib/logger", () => ({
	logger: {
		error: vi.fn(),
	},
}));

// --- imports do código sob teste ---

import { logger } from "@/lib/logger";
import { GET } from "../route";

// --- helpers ---

const DAY_MS = 24 * 60 * 60 * 1000;

function makeRequest(token = "test-secret-32-chars-minimum-ok") {
	return new Request("http://localhost/api/cron/stock-alerts", {
		headers: { authorization: `Bearer ${token}` },
	});
}

interface TestRow {
	branch_id: string;
	branch_name: string;
	variant_id: string;
	tool_name: string;
	sku: string;
	quantity: number;
	min_qty: number;
	reorder_point: number;
	deficit: number;
	alert_level: "critical" | "reorder";
	last_sent_at: string | null;
	last_alert_level: "critical" | "reorder" | null;
}

function itemRow(overrides: Partial<TestRow> = {}): TestRow {
	return {
		branch_id: "b1",
		branch_name: "Filial Centro",
		variant_id: "v1",
		tool_name: "Parafusadeira 12V",
		sku: "PFD-12V-001",
		quantity: 0,
		min_qty: 2,
		reorder_point: 5,
		deficit: 5,
		alert_level: "critical",
		last_sent_at: null,
		last_alert_level: null,
		...overrides,
	};
}

/** Enfileira o resultado de um db.execute (ordem: itens → destinatários → super admins). */
function queueExecute(rows: unknown[]) {
	mockDbExecute.mockResolvedValueOnce({ rows });
}

/** Moca db.insert(...).values(...).onConflictDoUpdate(...) resolvendo. */
function mockInsertOk() {
	const onConflictDoUpdate = vi.fn(() => Promise.resolve());
	const values = vi.fn(() => ({ onConflictDoUpdate }));
	mockDbInsert.mockImplementation(() => ({ values }));
	return { values };
}

// --- testes ---

describe("GET /api/cron/stock-alerts", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockSendStockAlertEmail.mockResolvedValue(undefined);
		mockInsertOk();
	});

	describe("gate de autenticação", () => {
		it("retorna 401 sem header Authorization e não toca o DB", async () => {
			const res = await GET(
				new Request("http://localhost/api/cron/stock-alerts")
			);
			expect(res.status).toBe(401);
			expect(await res.json()).toEqual({ error: "Unauthorized" });
			expect(mockDbExecute).not.toHaveBeenCalled();
		});

		it("retorna 401 com secret errado e não toca o DB", async () => {
			const res = await GET(makeRequest("token-errado"));
			expect(res.status).toBe(401);
			expect(mockDbExecute).not.toHaveBeenCalled();
		});
	});

	describe("sem itens abaixo do ponto", () => {
		it("retorna zeros e não consulta destinatários", async () => {
			queueExecute([]);

			const res = await GET(makeRequest());
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({
				ok: true,
				emailsSent: 0,
				branchesSkipped: 0,
				itemsAlerted: 0,
			});
			expect(mockDbExecute).toHaveBeenCalledTimes(1);
			expect(mockSendStockAlertEmail).not.toHaveBeenCalled();
		});
	});

	describe("happy path", () => {
		it("1 filial com admin e 2 itens → 1 e-mail, 2 upserts", async () => {
			queueExecute([
				itemRow(),
				itemRow({
					variant_id: "v2",
					sku: "FUR-500W-002",
					tool_name: "Furadeira 500W",
					quantity: 3,
					reorder_point: 8,
					deficit: 5,
					alert_level: "reorder",
				}),
			]);
			queueExecute([{ branch_id: "b1", email: "admin@filial.com" }]);

			const res = await GET(makeRequest());
			expect(await res.json()).toEqual({
				ok: true,
				emailsSent: 1,
				branchesSkipped: 0,
				itemsAlerted: 2,
			});
			expect(mockSendStockAlertEmail).toHaveBeenCalledTimes(1);
			expect(mockSendStockAlertEmail).toHaveBeenCalledWith(
				expect.objectContaining({
					to: ["admin@filial.com"],
					branchName: "Filial Centro",
					dashboardUrl:
						"https://admin.test/dashboard/tools?mode=repor&branchId=b1",
				})
			);
			expect(mockDbInsert).toHaveBeenCalledTimes(2);
		});
	});

	describe("cooldown de 7 dias", () => {
		it("exclui item alertado há 2 dias no mesmo nível", async () => {
			const twoDaysAgo = new Date(Date.now() - 2 * DAY_MS).toISOString();
			queueExecute([
				itemRow({
					last_sent_at: twoDaysAgo,
					last_alert_level: "critical",
				}),
				itemRow({
					variant_id: "v2",
					sku: "FUR-500W-002",
					alert_level: "reorder",
					last_sent_at: null,
				}),
			]);
			queueExecute([{ branch_id: "b1", email: "admin@filial.com" }]);

			const res = await GET(makeRequest());
			expect(await res.json()).toEqual(
				expect.objectContaining({ emailsSent: 1, itemsAlerted: 1 })
			);
			const call = mockSendStockAlertEmail.mock.calls[0]?.[0] as {
				items: Array<{ sku: string }>;
			};
			expect(call.items).toHaveLength(1);
			expect(call.items[0]?.sku).toBe("FUR-500W-002");
			expect(mockDbInsert).toHaveBeenCalledTimes(1);
		});

		it("re-alerta item cujo cooldown expirou (8 dias)", async () => {
			const eightDaysAgo = new Date(Date.now() - 8 * DAY_MS).toISOString();
			queueExecute([
				itemRow({ last_sent_at: eightDaysAgo, last_alert_level: "critical" }),
			]);
			queueExecute([{ branch_id: "b1", email: "admin@filial.com" }]);

			const res = await GET(makeRequest());
			expect(await res.json()).toEqual(
				expect.objectContaining({ emailsSent: 1, itemsAlerted: 1 })
			);
		});

		it("escalada reorder→critical fura o cooldown", async () => {
			const twoDaysAgo = new Date(Date.now() - 2 * DAY_MS).toISOString();
			queueExecute([
				itemRow({
					alert_level: "critical",
					last_sent_at: twoDaysAgo,
					last_alert_level: "reorder",
				}),
			]);
			queueExecute([{ branch_id: "b1", email: "admin@filial.com" }]);

			const res = await GET(makeRequest());
			expect(await res.json()).toEqual(
				expect.objectContaining({ emailsSent: 1, itemsAlerted: 1 })
			);
		});

		it("com todos os itens em cooldown, retorna zeros sem consultar destinatários", async () => {
			const twoDaysAgo = new Date(Date.now() - 2 * DAY_MS).toISOString();
			queueExecute([
				itemRow({ last_sent_at: twoDaysAgo, last_alert_level: "critical" }),
			]);

			const res = await GET(makeRequest());
			expect(await res.json()).toEqual({
				ok: true,
				emailsSent: 0,
				branchesSkipped: 0,
				itemsAlerted: 0,
			});
			expect(mockDbExecute).toHaveBeenCalledTimes(1);
		});
	});

	describe("destinatários", () => {
		it("filial sem admin usa fallback de super_admins", async () => {
			queueExecute([itemRow()]);
			queueExecute([]); // nenhum admin em user_branch
			queueExecute([
				{ email: "root1@emach.com" },
				{ email: "root2@emach.com" },
			]);

			const res = await GET(makeRequest());
			expect(await res.json()).toEqual(
				expect.objectContaining({ emailsSent: 1, branchesSkipped: 0 })
			);
			expect(mockSendStockAlertEmail).toHaveBeenCalledWith(
				expect.objectContaining({
					to: ["root1@emach.com", "root2@emach.com"],
				})
			);
		});

		it("sem admin e sem super_admin, pula a filial e loga no_recipients", async () => {
			queueExecute([itemRow()]);
			queueExecute([]);
			queueExecute([]);

			const res = await GET(makeRequest());
			expect(await res.json()).toEqual({
				ok: true,
				emailsSent: 0,
				branchesSkipped: 1,
				itemsAlerted: 0,
			});
			expect(mockSendStockAlertEmail).not.toHaveBeenCalled();
			expect(logger.error).toHaveBeenCalledWith(
				"stockAlertsCron",
				expect.objectContaining({ branchId: "b1", reason: "no_recipients" })
			);
		});
	});

	describe("isolamento de erro por filial", () => {
		it("falha no envio de uma filial não aborta o batch nem grava upsert dela", async () => {
			queueExecute([
				itemRow(),
				itemRow({
					branch_id: "b2",
					branch_name: "Filial Norte",
					variant_id: "v2",
					sku: "FUR-500W-002",
				}),
			]);
			queueExecute([
				{ branch_id: "b1", email: "admin1@filial.com" },
				{ branch_id: "b2", email: "admin2@filial.com" },
			]);
			mockSendStockAlertEmail
				.mockRejectedValueOnce(new Error("Resend down"))
				.mockResolvedValueOnce(undefined);

			const res = await GET(makeRequest());
			expect(res.status).toBe(200);
			expect(await res.json()).toEqual({
				ok: true,
				emailsSent: 1,
				branchesSkipped: 1,
				itemsAlerted: 1,
			});
			// upsert só da filial que enviou com sucesso (1 item)
			expect(mockDbInsert).toHaveBeenCalledTimes(1);
			expect(logger.error).toHaveBeenCalledWith(
				"stockAlertsCron",
				expect.objectContaining({ branchId: "b1" })
			);
		});
	});

	describe("erro na query principal", () => {
		it("retorna 500 e loga", async () => {
			mockDbExecute.mockRejectedValueOnce(new Error("DB down"));

			const res = await GET(makeRequest());
			expect(res.status).toBe(500);
			expect(await res.json()).toEqual({ ok: false, error: "Internal error" });
			expect(logger.error).toHaveBeenCalled();
		});
	});
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `bun --cwd apps/web test stock-alerts`
Expected: FAIL — `Cannot find module '../route'` (ou equivalente). Se falhar por outro motivo (ex: mock), corrigir o teste antes de seguir.

- [ ] **Step 3: Implementar o handler**

Criar `apps/web/src/app/api/cron/stock-alerts/route.ts`:

```ts
import { db } from "@emach/db";
import { stockAlertSent } from "@emach/db/schema/inventory";
import { toDate } from "@emach/db/utils";
import { sendStockAlertEmail } from "@emach/email/send";
import { env } from "@emach/env/server";
import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

interface StockAlertDbRow extends Record<string, unknown> {
	branch_id: string;
	branch_name: string;
	variant_id: string;
	tool_name: string;
	sku: string;
	quantity: number;
	min_qty: number;
	reorder_point: number;
	deficit: number;
	alert_level: "critical" | "reorder";
	last_sent_at: string | Date | null;
	last_alert_level: "critical" | "reorder" | null;
}

interface RecipientDbRow extends Record<string, unknown> {
	branch_id: string;
	email: string;
}

interface SuperAdminDbRow extends Record<string, unknown> {
	email: string;
}

interface AlertItem {
	alertLevel: "critical" | "reorder";
	deficit: number;
	quantity: number;
	reorderPoint: number;
	sku: string;
	toolName: string;
	variantId: string;
}

interface BranchAlert {
	branchName: string;
	items: AlertItem[];
}

/**
 * Item entra no alerta se nunca foi alertado, se o cooldown de 7 dias
 * expirou, ou se escalou de reorder para critical (fura o cooldown).
 */
function shouldAlert(row: StockAlertDbRow, now: number): boolean {
	const lastSentAt = toDate(row.last_sent_at);
	if (!lastSentAt) {
		return true;
	}
	if (now - lastSentAt.getTime() > COOLDOWN_MS) {
		return true;
	}
	return row.alert_level === "critical" && row.last_alert_level === "reorder";
}

export async function GET(request: Request) {
	const authHeader = request.headers.get("authorization");
	if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	let emailsSent = 0;
	let branchesSkipped = 0;
	let itemsAlerted = 0;

	try {
		const result = await db.execute<StockAlertDbRow>(sql`
			SELECT
				b.id   AS branch_id,
				b.name AS branch_name,
				tv.id  AS variant_id,
				t.name AS tool_name,
				tv.sku,
				sl.quantity,
				sl.min_qty,
				sl.reorder_point,
				(sl.reorder_point - sl.quantity) AS deficit,
				CASE
					WHEN sl.quantity <= sl.min_qty AND sl.min_qty > 0 THEN 'critical'
					ELSE 'reorder'
				END AS alert_level,
				sas.sent_at AS last_sent_at,
				sas.alert_level AS last_alert_level
			FROM stock_level sl
			JOIN branch b ON b.id = sl.branch_id
			JOIN tool_variant tv ON tv.id = sl.variant_id
			JOIN tool t ON t.id = tv.tool_id
			LEFT JOIN stock_alert_sent sas
				ON sas.branch_id = sl.branch_id AND sas.variant_id = sl.variant_id
			WHERE sl.quantity < sl.reorder_point
				AND sl.reorder_point > 0
				AND t.status = 'active'
				AND b.status = 'active'
			ORDER BY b.id, deficit DESC
		`);

		const now = Date.now();
		const byBranch = new Map<string, BranchAlert>();
		for (const row of result.rows) {
			if (!shouldAlert(row, now)) {
				continue;
			}
			const entry = byBranch.get(row.branch_id) ?? {
				branchName: row.branch_name,
				items: [],
			};
			entry.items.push({
				alertLevel: row.alert_level,
				deficit: Number(row.deficit),
				quantity: Number(row.quantity),
				reorderPoint: Number(row.reorder_point),
				sku: row.sku,
				toolName: row.tool_name,
				variantId: row.variant_id,
			});
			byBranch.set(row.branch_id, entry);
		}

		if (byBranch.size === 0) {
			return NextResponse.json({
				ok: true,
				emailsSent: 0,
				branchesSkipped: 0,
				itemsAlerted: 0,
			});
		}

		const branchIds = [...byBranch.keys()];
		const recipientsResult = await db.execute<RecipientDbRow>(sql`
			SELECT ub.branch_id, u.email
			FROM user_branch ub
			JOIN "user" u ON u.id = ub.user_id
			WHERE u.role = 'admin'
				AND u.status = 'active'
				AND ub.branch_id IN (${sql.join(
					branchIds.map((id) => sql`${id}`),
					sql`, `
				)})
		`);
		const recipientsByBranch = new Map<string, string[]>();
		for (const row of recipientsResult.rows) {
			const emails = recipientsByBranch.get(row.branch_id) ?? [];
			emails.push(row.email);
			recipientsByBranch.set(row.branch_id, emails);
		}

		// Fallback resolvido no máximo uma vez por execução.
		let superAdminEmails: string[] | null = null;

		for (const [branchId, { branchName, items }] of byBranch) {
			try {
				let to = recipientsByBranch.get(branchId) ?? [];
				if (to.length === 0) {
					if (superAdminEmails === null) {
						const superAdminsResult = await db.execute<SuperAdminDbRow>(sql`
							SELECT email FROM "user"
							WHERE role = 'super_admin' AND status = 'active'
						`);
						superAdminEmails = superAdminsResult.rows.map((r) => r.email);
					}
					to = superAdminEmails;
				}
				if (to.length === 0) {
					branchesSkipped++;
					logger.error("stockAlertsCron", {
						branchId,
						branchName,
						reason: "no_recipients",
					});
					continue;
				}

				await sendStockAlertEmail({
					to,
					branchName,
					dashboardUrl: `${env.BETTER_AUTH_URL}/dashboard/tools?mode=repor&branchId=${branchId}`,
					items,
				});
				emailsSent++;
				itemsAlerted += items.length;

				for (const item of items) {
					await db
						.insert(stockAlertSent)
						.values({
							branchId,
							variantId: item.variantId,
							alertLevel: item.alertLevel,
							sentAt: new Date(),
						})
						.onConflictDoUpdate({
							target: [stockAlertSent.branchId, stockAlertSent.variantId],
							set: { alertLevel: item.alertLevel, sentAt: new Date() },
						});
				}
			} catch (perBranchErr) {
				branchesSkipped++;
				logger.error("stockAlertsCron", { branchId, err: perBranchErr });
			}
		}

		return NextResponse.json({
			ok: true,
			emailsSent,
			branchesSkipped,
			itemsAlerted,
		});
	} catch (err) {
		logger.error("stockAlertsCron", err);
		return NextResponse.json(
			{ ok: false, error: "Internal error" },
			{ status: 500 }
		);
	}
}
```

Notas de armadilha cobertas: `db.execute` raw devolve timestamp como **string** → `toDate` no boundary (`shouldAlert`); colunas em **snake_case** → tipos `*DbRow` em snake_case (sem mapping camel); auth **antes** de qualquer query; upsert **depois** do send (falha no send = re-tentativa no próximo dia útil); `AlertItem` tem `variantId` extra além do shape do template — atribuição estrutural é válida (não é object literal fresco).

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `bun --cwd apps/web test stock-alerts`
Expected: PASS — 11 testes verdes.

- [ ] **Step 5: Registrar o cron no vercel.json**

Ler `apps/web/vercel.json` e adicionar a terceira entrada:

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
		},
		{
			"path": "/api/cron/stock-alerts",
			"schedule": "0 7 * * 1-5"
		}
	]
}
```

(`0 7 * * 1-5` = dias úteis 07:00 UTC = 04:00 BRT.)

- [ ] **Step 6: Typecheck + lint + suíte completa**

Run: `bun run check-types --force && bun check && bun --cwd apps/web test`
Expected: exit 0 em todos; suíte cresce de 694 para 705 testes.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/api/cron/stock-alerts/ apps/web/vercel.json
git commit -m "feat(cron): alerta diário de reorder point"
```

---

### Task 4: Verificação integrada + db:sync + smoke real

**Files:**
- Nenhum arquivo novo. Gates de verificação e aplicação do schema no banco.

**Interfaces:**
- Consumes: tudo das Tasks 1–3.
- Produces: tabela `stock_alert_sent` existente no banco; evidência de smoke (e-mail recebido + linhas de dedupe + idempotência).

- [ ] **Step 1: Gates integrados**

Run: `bun verify && bun guard:forms`
(`bun verify` = `check-types && check && test`.)
Expected: exit 0. `git status` deve listar **apenas** os arquivos em escopo do plano (schema, template, send, route, teste, vercel.json, docs/superpowers/*).

- [ ] **Step 2: Aplicar o schema no banco — ⚠️ requer TTY e ciência do user**

⚠️ **Banco único dev=prod=ecommerce.** A mudança é **aditiva** (CREATE TABLE `stock_alert_sent`), sem drop/truncate. Rodar **interativamente na sessão principal** (drizzle-kit push pede confirmação TTY; subagente NÃO roda este step — reportar de volta se chegar aqui):

Run: `bun db:sync`
Expected: push cria só `stock_alert_sent` (conferir o diff que o drizzle-kit apresenta ANTES de confirmar — se listar qualquer drop/alter inesperado, ABORTAR e reportar). Depois confirmar:

```bash
# via psql/execute_sql: deve retornar a definição da tabela
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'stock_alert_sent' ORDER BY ordinal_position;
```

Expected: 4 colunas (`branch_id`, `variant_id`, `alert_level`, `sent_at`).

Nota: ao mergear na `main`, o CI abre o PR de sync do schema pro repo ecommerce automaticamente (ADR-0009) — nenhuma ação manual.

- [ ] **Step 3: Pré-smoke — inspecionar quem receberia (dados REAIS)**

⚠️ O smoke dispara **e-mails reais** para admins reais do banco compartilhado. Antes de disparar, rodar read-only:

```sql
-- filiais com itens abaixo do ponto + destinatários efetivos
SELECT b.name AS filial,
	count(*) FILTER (WHERE sl.quantity < sl.reorder_point AND sl.reorder_point > 0) AS itens,
	(SELECT string_agg(u.email, ', ') FROM user_branch ub JOIN "user" u ON u.id = ub.user_id
	 WHERE ub.branch_id = b.id AND u.role = 'admin' AND u.status = 'active') AS admins
FROM branch b
JOIN stock_level sl ON sl.branch_id = b.id
WHERE b.status = 'active'
GROUP BY b.id, b.name;
```

**Mostrar o resultado ao user e confirmar com ele antes do Step 4** (os destinatários podem ser pessoas reais que não esperam o e-mail de teste).

- [ ] **Step 4: Smoke real (após ok do user)**

```bash
bun dev:web &   # ou dev server já em execução na porta padrão
curl -s -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/stock-alerts
```

Expected: `{"ok":true,"emailsSent":N,"branchesSkipped":M,"itemsAlerted":K}` coerente com o pré-smoke; e-mail chega (conferir inbox/painel Resend); `SELECT * FROM stock_alert_sent` mostra K linhas com `sent_at` de agora.

- [ ] **Step 5: Smoke de idempotência**

Repetir o mesmo `curl`.
Expected: `{"ok":true,"emailsSent":0,"branchesSkipped":0,"itemsAlerted":0}` — cooldown ativo, nenhum e-mail duplicado.

- [ ] **Step 6: Encerramento**

Reportar resultado ao user. Integração da branch (merge/PR) via skill `finishing-a-development-branch` — **não** pushar sem instrução.
