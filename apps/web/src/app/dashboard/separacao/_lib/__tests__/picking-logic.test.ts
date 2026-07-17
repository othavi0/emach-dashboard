import { describe, expect, it } from "vitest";
import {
	BULK_PICKING_SKIP_LABEL,
	bulkStartPickingSkipReason,
	canScanMore,
	isPickingComplete,
	isSelfPicker,
	matchPickItem,
	type PickItem,
	summarizePicking,
} from "../picking-logic";

const item = (over: Partial<PickItem>): PickItem => ({
	id: "i1",
	barcode: "789",
	variantId: "v1",
	qtyExpected: 2,
	qtyPicked: 0,
	notFound: false,
	...over,
});

describe("matchPickItem", () => {
	it("casa pelo snapshot do barcode", () => {
		const items = [
			item({ id: "a", barcode: "111" }),
			item({ id: "b", barcode: "222" }),
		];
		expect(matchPickItem(items, "222", null)).toEqual({ item: items[1] });
	});
	it("fallback pelo variantId quando snapshot é nulo", () => {
		const items = [item({ id: "a", barcode: null, variantId: "v9" })];
		expect(matchPickItem(items, "222", "v9")).toEqual({ item: items[0] });
	});
	it("erro not_in_order quando nada casa", () => {
		const items = [item({ id: "a", barcode: "111", variantId: "v1" })];
		expect(matchPickItem(items, "999", "vX")).toEqual({
			error: "not_in_order",
		});
	});
});

describe("canScanMore", () => {
	it("true quando ainda falta", () => {
		expect(canScanMore(item({ qtyPicked: 1, qtyExpected: 2 }))).toBe(true);
	});
	it("false quando completo", () => {
		expect(canScanMore(item({ qtyPicked: 2, qtyExpected: 2 }))).toBe(false);
	});
	it("false quando reportado como falta", () => {
		expect(canScanMore(item({ qtyPicked: 0, notFound: true }))).toBe(false);
	});
});

describe("isPickingComplete", () => {
	it("true só quando todos batem e nenhum em falta", () => {
		expect(isPickingComplete([item({ qtyPicked: 2, qtyExpected: 2 })])).toBe(
			true
		);
	});
	it("false se algum incompleto", () => {
		expect(
			isPickingComplete([
				item({ qtyPicked: 2, qtyExpected: 2 }),
				item({ qtyPicked: 1, qtyExpected: 2 }),
			])
		).toBe(false);
	});
	it("false se algum notFound", () => {
		expect(isPickingComplete([item({ qtyPicked: 0, notFound: true })])).toBe(
			false
		);
	});
});

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
		expect(bulkStartPickingSkipReason({ status: "paid", branchId: null })).toBe(
			"sem_filial"
		);
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
