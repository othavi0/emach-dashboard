import { stockLevel } from "@emach/db/schema/inventory";
import { orderItem } from "@emach/db/schema/orders";
import { stockMovement } from "@emach/db/schema/stock-movements";
import { tool, toolVariant } from "@emach/db/schema/tools";
import type { Table } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake, mockLoggerError } = vi.hoisted(() => {
	type Row = Record<string, string | number | boolean | null>;

	interface Chain {
		for: () => Chain;
		from: (table: Table) => Chain;
		innerJoin: () => Chain;
		limit: () => Chain;
		orderBy: () => Chain;
		returning: () => Promise<Row[]>;
		set: () => Chain;
		then: <R>(resolve: (rows: Row[]) => R) => Promise<R>;
		values: () => Chain;
		where: () => Chain;
	}

	interface FakeDb {
		delete: (table: Table) => Chain;
		insert: () => Chain;
		select: () => Chain;
		transaction: <R>(fn: (tx: FakeDb) => Promise<R>) => Promise<R>;
		update: (table: Table) => Chain;
	}

	interface FakeState {
		deleted: Table[];
		rows: Map<Table, Row[]>;
		transactionError: Error | null;
		updated: Table[];
	}

	const state: FakeState = {
		rows: new Map(),
		deleted: [],
		updated: [],
		transactionError: null,
	};

	function chain(rowsFor: (table: Table) => Row[], returned: Row[]): Chain {
		let rows: Row[] = [];

		const c: Chain = {
			for: () => c,
			from: (table) => {
				rows = rowsFor(table);

				return c;
			},
			innerJoin: () => c,
			limit: () => c,
			orderBy: () => c,
			returning: () => Promise.resolve(returned),
			set: () => c,
			// biome-ignore lint/suspicious/noThenProperty: mock do query builder thenable do Drizzle
			then: (resolve) => Promise.resolve(rows).then(resolve),
			values: () => c,
			where: () => c,
		};

		return c;
	}

	const db: FakeDb = {
		select: () => chain((table) => state.rows.get(table) ?? [], []),
		update: (table) => {
			state.updated.push(table);

			return chain(() => [], [{ id: "updated" }]);
		},
		insert: () => chain(() => [], []),
		delete: (table) => {
			state.deleted.push(table);

			return chain(() => [], []);
		},
		transaction: (fn) =>
			state.transactionError ? Promise.reject(state.transactionError) : fn(db),
	};

	return { fake: { state, db }, mockLoggerError: vi.fn() };
});

vi.mock("@emach/db", () => ({ db: fake.db }));

vi.mock("../data", () => ({
	fetchToolDeletionFacts: vi.fn(),
	fetchToolsPage: vi.fn(),
	currentPrimaryCategoryId: vi.fn().mockResolvedValue(""),
	fetchDefinitionsBySlug: vi.fn().mockResolvedValue(new Map()),
	primaryCategoryIncompleteError: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/permissions", () => ({
	requireCapability: vi.fn().mockResolvedValue({
		user: { id: "actor-1", name: "Admin Test", role: "super_admin" },
	}),
	can: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/activity", () => ({
	logUserActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/logger", () => ({
	logger: { error: mockLoggerError, info: vi.fn(), warn: vi.fn() },
}));

vi.mock("next/cache", () => ({
	revalidatePath: vi.fn(),
	revalidateTag: vi.fn(),
}));

vi.mock("../_components/image-actions", () => ({
	deleteToolImage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../_components/video-actions", () => ({
	deleteToolVideoObject: vi.fn().mockResolvedValue(undefined),
}));

import {
	type ToolFormInput,
	type ToolFormValues,
	toolFormSchema,
} from "../_components/tool-schema";
import {
	createTool,
	deleteToolVariant,
	setDefaultToolVariant,
	setVariantVisibility,
	updateTool,
} from "../actions";

function draft(variants: ToolFormInput["variants"]): ToolFormValues {
	return toolFormSchema.parse({
		name: "Furadeira de teste",
		status: "draft",
		categoryIds: [],
		primaryCategoryId: "",
		images: [],
		variants,
		attributeAssignments: [],
		attributeValues: {},
	});
}

function uniqueViolation(constraint: string) {
	return new Error("Failed query", {
		cause: { code: "23505", constraint, message: "duplicate key" },
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	fake.state.rows = new Map();
	fake.state.deleted = [];
	fake.state.updated = [];
	fake.state.transactionError = null;
});

describe("#441 a variante padrão não fica oculta", () => {
	it("setVariantVisibility recusa ocultar a variante padrão", async () => {
		fake.state.rows.set(toolVariant, [{ toolId: "t1", isDefault: true }]);

		const result = await setVariantVisibility({
			variantId: "v1",
			visible: false,
		});

		expect(result.ok).toBe(false);

		if (!result.ok) {
			expect(result.error).toContain("outra variante como padrão");
		}

		expect(fake.state.updated).toEqual([]);
	});

	it("setDefaultToolVariant recusa tornar padrão uma variante oculta", async () => {
		fake.state.rows.set(toolVariant, [{ id: "v2", visibleOnSite: false }]);

		const result = await setDefaultToolVariant({
			toolId: "t1",
			variantId: "v2",
		});

		expect(result.ok).toBe(false);

		if (!result.ok) {
			expect(result.error).toContain("oculta");
		}

		expect(fake.state.updated).toEqual([]);
	});

	it("updateTool recusa salvar com a padrão oculta no banco", async () => {
		fake.state.rows.set(tool, [{ status: "draft", url: null, poster: null }]);
		fake.state.rows.set(toolVariant, [{ id: "v1", sku: "SKU-OCULTA" }]);

		const result = await updateTool(
			"t1",
			draft([
				{
					id: "v1",
					sku: "SKU-OCULTA",
					isDefault: true,
					visibleOnSite: true,
					sortOrder: 0,
				},
			])
		);

		expect(result.ok).toBe(false);

		if (!result.ok) {
			expect(result.error).toContain("SKU-OCULTA está oculta");
		}
	});
});

describe("#444 conflito único mapeado por constraint", () => {
	it("slug duplicado diz que a ferramenta já existe", async () => {
		fake.state.transactionError = uniqueViolation("tool_slug_unique");

		const result = await createTool(draft([]));

		expect(result).toEqual({
			ok: false,
			error: "Já existe uma ferramenta com esse nome",
		});
	});

	it("SKU duplicado mantém a mensagem de SKU", async () => {
		fake.state.transactionError = uniqueViolation("tool_variant_sku_unique");

		const result = await createTool(draft([]));

		expect(result).toEqual({
			ok: false,
			error: "SKU já existe para outra variante",
		});
	});

	it("constraint desconhecida cai na mensagem genérica e loga", async () => {
		fake.state.transactionError = uniqueViolation(
			"tool_variant_tool_sort_unique"
		);

		const result = await createTool(draft([]));

		expect(result.ok).toBe(false);

		if (!result.ok) {
			expect(result.error).not.toContain("SKU");
			expect(result.error).not.toContain("Código de barras");
		}

		expect(mockLoggerError).toHaveBeenCalledWith(
			expect.stringContaining("constraint"),
			expect.objectContaining({ constraint: "tool_variant_tool_sort_unique" })
		);
	});
});

describe("#445 variante com histórico no ledger não é apagada", () => {
	it("deleteToolVariant bloqueia variante com movimento de estoque", async () => {
		fake.state.rows.set(toolVariant, [
			{
				id: "v1",
				toolId: "t1",
				isDefault: false,
				sku: "SKU-1",
				sortOrder: 1,
				visibleOnSite: true,
			},
			{
				id: "v0",
				toolId: "t1",
				isDefault: true,
				sku: "SKU-0",
				sortOrder: 0,
				visibleOnSite: true,
			},
		]);
		fake.state.rows.set(orderItem, [{ n: 0 }]);
		fake.state.rows.set(stockLevel, []);
		fake.state.rows.set(stockMovement, [{ n: 3 }]);

		const result = await deleteToolVariant({ variantId: "v1" });

		expect(result.ok).toBe(false);

		if (!result.ok) {
			expect(result.error).toContain("histórico");
			expect(result.error).toContain("Oculte");
		}

		expect(fake.state.deleted).not.toContain(toolVariant);
	});

	it("updateTool não remove do form variante com movimento de estoque", async () => {
		fake.state.rows.set(tool, [{ status: "draft", url: null, poster: null }]);
		fake.state.rows.set(toolVariant, [{ id: "v-antiga", sku: "SKU-ANTIGA" }]);
		fake.state.rows.set(orderItem, []);
		fake.state.rows.set(stockLevel, []);
		fake.state.rows.set(stockMovement, [{ sku: "SKU-ANTIGA" }]);

		const result = await updateTool(
			"t1",
			draft([
				{ sku: "SKU-NOVA", isDefault: true, visibleOnSite: true, sortOrder: 0 },
			])
		);

		expect(result.ok).toBe(false);

		if (!result.ok) {
			expect(result.error).toContain("SKU-ANTIGA tem histórico");
		}

		expect(fake.state.deleted).not.toContain(toolVariant);
	});
});
