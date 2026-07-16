import { beforeEach, describe, expect, it, vi } from "vitest";

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("@emach/db", () => ({ db: { execute } }));

vi.mock("@/lib/permissions", () => ({
	requireCapability: vi.fn(),
	can: vi.fn(),
}));

// pending-data.ts importa @/lib/session no topo (→ @emach/auth → createDb),
// que exige env. Mockar evita a cadeia, como em pending-data-guards.test.ts.
vi.mock("@/lib/session", () => ({
	requireCurrentSession: vi.fn(),
}));

import { fetchPendingOrders } from "../pending-data";

const HOUR_MS = 3_600_000;
const isoHoursAgo = (h: number) =>
	new Date(Date.now() - h * HOUR_MS).toISOString();

// Linha crua no formato que db.execute devolve (snake_case, timestamp string).
function row(overrides: Record<string, unknown> = {}) {
	const recent = isoHoursAgo(1);
	return {
		id: "o1",
		number: "1001",
		status: "preparing",
		created_at: recent,
		paid_at: recent,
		preparing_at: recent,
		client_name: "Fulano",
		picking_status: null,
		...overrides,
	};
}

describe("fetchPendingOrders — aging e exceção de separação", () => {
	beforeEach(() => execute.mockReset());

	it("marca exceção de separação: preparing com última sessão em exception", async () => {
		execute.mockResolvedValue({
			rows: [row({ status: "preparing", picking_status: "exception" })],
		});
		const res = await fetchPendingOrders(null);
		const item = res.items[0];
		expect(item?.href).toBe("/dashboard/separacao?tab=excecoes");
		expect(item?.iconKey).toBe("ban");
		expect(item?.tone).toBe("warning");
		expect(item?.badge).toEqual({ label: "Exceção", role: "warning" });
	});

	it("NÃO marca exceção quando a última sessão não é exception", async () => {
		execute.mockResolvedValue({
			rows: [row({ status: "preparing", picking_status: "in_progress" })],
		});
		const res = await fetchPendingOrders(null);
		const item = res.items[0];
		expect(item?.iconKey).toBeUndefined();
		expect(item?.tone).toBeUndefined();
		expect(item?.href).toBe("/dashboard/orders/o1");
		expect(item?.badge).toEqual({ label: "Preparando", role: "info" });
	});

	it("popula aging=late para pedido paid ≥72h (relógio de paid_at)", async () => {
		const old = isoHoursAgo(100);
		execute.mockResolvedValue({
			rows: [row({ status: "paid", paid_at: old, preparing_at: null })],
		});
		const res = await fetchPendingOrders(null);
		expect(res.items[0]?.aging).toEqual({ level: "late", label: "Atrasado" });
	});

	it("popula aging=warn (48h+) entre 48h e 72h", async () => {
		const amber = isoHoursAgo(60);
		execute.mockResolvedValue({
			rows: [row({ status: "paid", paid_at: amber, preparing_at: null })],
		});
		const res = await fetchPendingOrders(null);
		expect(res.items[0]?.aging).toEqual({ level: "warn", label: "48h+" });
	});

	it("não popula aging para pedido recente", async () => {
		execute.mockResolvedValue({ rows: [row({ status: "paid" })] });
		const res = await fetchPendingOrders(null);
		expect(res.items[0]?.aging).toBeUndefined();
	});
});
