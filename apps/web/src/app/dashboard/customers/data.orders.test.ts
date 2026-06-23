import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("@emach/db", () => ({ db: { execute } }));

import { listCustomerOrders } from "./data";

function row(i: number) {
	return {
		id: `ord_${i}`,
		number: `EM-2026-00${i}`,
		status: "delivered",
		total_amount: "929.60",
		created_at: new Date(`2026-05-${10 + i}T12:00:00Z`),
		items_count: 3,
		first_item_name: "Furadeira 750W",
		branch_name: i % 2 === 0 ? "Matriz" : null,
	};
}

describe("listCustomerOrders", () => {
	beforeEach(() => execute.mockReset());

	it("mapeia campos enriquecidos e tipa total como número", async () => {
		execute.mockResolvedValue({ rows: [row(1)] });
		const res = await listCustomerOrders({ clientId: "c1", cursor: null });
		expect(res.items[0]).toMatchObject({
			number: "EM-2026-001",
			totalAmount: 929.6,
			itemsCount: 3,
			firstItemName: "Furadeira 750W",
			branchName: null,
		});
		expect(res.nextCursor).toBeNull();
	});

	it("emite nextCursor quando há mais que BATCH_SIZE linhas", async () => {
		const rows = Array.from({ length: 21 }, (_, i) => row(i + 1));
		execute.mockResolvedValue({ rows });
		const res = await listCustomerOrders({ clientId: "c1", cursor: null });
		expect(res.items).toHaveLength(20);
		expect(res.nextCursor).not.toBeNull();
	});
});
