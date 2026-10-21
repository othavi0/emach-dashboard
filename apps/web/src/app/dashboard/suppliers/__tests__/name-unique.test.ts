import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockInsert, mockSelect, mockUpdate } = vi.hoisted(() => ({
	mockInsert: vi.fn(),
	mockSelect: vi.fn(),
	mockUpdate: vi.fn(),
}));

vi.mock("@emach/db", () => ({
	db: { insert: mockInsert, select: mockSelect, update: mockUpdate },
}));

vi.mock("@/lib/permissions", () => ({
	requireCapability: vi.fn().mockResolvedValue({ user: { id: "usr_1" } }),
}));

vi.mock("@/lib/logger", () => ({
	logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { SUPPLIER_NAME_TAKEN } from "../_components/supplier-schema";
import { createSupplier, updateSupplier } from "../actions";

const INPUT = {
	name: "Bosch Brasil",
	phone: "11987654321",
	notes: "Sem CNPJ por enquanto",
};

function uniqueViolation(constraint: string) {
	return new Error("Failed query: insert into supplier", {
		cause: Object.assign(new Error("duplicate key value"), {
			code: "23505",
			constraint,
		}),
	});
}

function rejectingWrite(error: Error) {
	const chain = {
		values: vi.fn().mockRejectedValue(error),
		set: vi.fn(() => ({ where: vi.fn().mockRejectedValue(error) })),
	};

	return chain;
}

beforeEach(() => {
	vi.clearAllMocks();
	mockSelect.mockReturnValue({
		from: () => ({
			where: () => ({ limit: vi.fn().mockResolvedValue([{ name: "Antigo" }]) }),
		}),
	});
});

describe("fornecedor com nome repetido", () => {
	it("createSupplier devolve a mensagem do campo nome no 23505 de supplier_name_unique", async () => {
		mockInsert.mockReturnValue(
			rejectingWrite(uniqueViolation("supplier_name_unique"))
		);

		await expect(createSupplier(INPUT)).resolves.toEqual({
			ok: false,
			error: SUPPLIER_NAME_TAKEN,
		});
	});

	it("updateSupplier devolve a mesma mensagem", async () => {
		mockUpdate.mockReturnValue(
			rejectingWrite(uniqueViolation("supplier_name_unique"))
		);

		await expect(updateSupplier("sup_1", INPUT)).resolves.toEqual({
			ok: false,
			error: SUPPLIER_NAME_TAKEN,
		});
	});

	it("23505 de outro índice continua genérico", async () => {
		mockInsert.mockReturnValue(
			rejectingWrite(uniqueViolation("supplier_cnpj_unique_when_present"))
		);

		const result = await createSupplier(INPUT);

		expect(result.ok).toBe(false);
		expect(result.ok ? "" : result.error).not.toBe(SUPPLIER_NAME_TAKEN);
	});
});
