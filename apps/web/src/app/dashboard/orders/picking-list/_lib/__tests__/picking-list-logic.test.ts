import { describe, expect, it } from "vitest";
import {
	batchLabel,
	consolidateItems,
	groupByCarrier,
	NO_CARRIER_LABEL,
	type PickingListOrder,
	pickingListStats,
	shouldIncludeCollect,
} from "../picking-list-logic";

function order(partial: Partial<PickingListOrder>): PickingListOrder {
	return {
		city: "Curitiba",
		clientName: "Cliente Teste",
		id: crypto.randomUUID(),
		items: [],
		number: "#EM-2026-0001",
		shippingMethod: "Correios · SEDEX",
		state: "PR",
		...partial,
	};
}

const LIXADEIRA = {
	barcode: "7891234567890",
	model: "MLP750",
	name: "Lixadeira Telescópica 750W MLP750",
	quantity: 1,
	sku: "750LED-127",
	variantId: "var-lixadeira",
	voltage: "127V",
};

const BALDE = {
	barcode: null,
	model: null,
	name: "Balde Caçamba 50L Menegotti",
	quantity: 1,
	sku: "BALDE50L",
	variantId: "var-balde",
	voltage: null,
};

describe("consolidateItems", () => {
	it("soma quantidades da mesma variante e conta pedidos distintos", () => {
		const orders = [
			order({ items: [{ ...LIXADEIRA, quantity: 1 }] }),
			order({ items: [{ ...LIXADEIRA, quantity: 2 }, BALDE] }),
		];
		const lines = consolidateItems(orders);
		expect(lines).toHaveLength(2);
		expect(lines[0]).toMatchObject({
			name: LIXADEIRA.name,
			orderCount: 2,
			totalQty: 3,
		});
		expect(lines[1]).toMatchObject({ name: BALDE.name, totalQty: 1 });
	});

	it("cai pra sku e depois name quando variantId é null", () => {
		const semVariante = { ...BALDE, variantId: null };
		const orders = [
			order({ items: [semVariante] }),
			order({ items: [{ ...semVariante, quantity: 3 }] }),
		];
		const lines = consolidateItems(orders);
		expect(lines).toHaveLength(1);
		expect(lines[0]?.totalQty).toBe(4);
	});

	it("ordena por totalQty desc e desempata por nome asc", () => {
		const orders = [order({ items: [BALDE, { ...LIXADEIRA, quantity: 5 }] })];
		const lines = consolidateItems(orders);
		expect(lines.map((l) => l.name)).toEqual([LIXADEIRA.name, BALDE.name]);
	});
});

describe("groupByCarrier", () => {
	it("agrupa por shippingMethod, A→Z, null por último com label fixo", () => {
		const orders = [
			order({ number: "#3", shippingMethod: null }),
			order({ number: "#1", shippingMethod: "Jadlog .Package" }),
			order({ number: "#2", shippingMethod: "Correios · SEDEX" }),
		];
		const groups = groupByCarrier(orders);
		expect(groups.map((g) => g.label)).toEqual([
			"Correios · SEDEX",
			"Jadlog .Package",
			NO_CARRIER_LABEL,
		]);
		expect(groups[2]?.carrier).toBeNull();
	});

	it("ordena pedidos dentro do grupo por number asc", () => {
		const orders = [
			order({ number: "#EM-2026-0009" }),
			order({ number: "#EM-2026-0002" }),
		];
		const [group] = groupByCarrier(orders);
		expect(group?.orders.map((o) => o.number)).toEqual([
			"#EM-2026-0002",
			"#EM-2026-0009",
		]);
	});
});

describe("shouldIncludeCollect (regra adaptativa, decisão 6)", () => {
	it("1 pedido → sem seção de coleta", () => {
		expect(shouldIncludeCollect([order({})])).toBe(false);
	});
	it("2+ pedidos → com seção de coleta", () => {
		expect(shouldIncludeCollect([order({}), order({})])).toBe(true);
	});
});

describe("pickingListStats", () => {
	it("conta pedidos, unidades, SKUs distintos e transportadoras distintas", () => {
		const orders = [
			order({ items: [{ ...LIXADEIRA, quantity: 2 }] }),
			order({
				items: [LIXADEIRA, BALDE],
				shippingMethod: "Jadlog .Package",
			}),
		];
		expect(pickingListStats(orders)).toEqual({
			carriers: 2,
			orders: 2,
			skus: 2,
			units: 4,
		});
	});
});

describe("batchLabel", () => {
	it("gera L-ddMM-HHmm no fuso de São Paulo", () => {
		// 2026-07-15T17:32:00Z = 14:32 em São Paulo (UTC-3)
		expect(batchLabel(new Date("2026-07-15T17:32:00Z"))).toBe("L-1507-1432");
	});
});
