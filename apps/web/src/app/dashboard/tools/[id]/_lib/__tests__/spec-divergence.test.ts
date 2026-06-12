import { describe, expect, it } from "vitest";
import { detectSpecDivergences } from "../spec-divergence";
import type { ToolDetailAttribute } from "../tool-detail-data";

function attr(
	unit: string | null,
	valueNumeric: number | null,
	slug: string
): ToolDetailAttribute {
	return {
		slug,
		label: slug,
		inputType: "number",
		unit,
		options: null,
		sortOrder: 0,
		sourceCategoryId: "c",
		sourceCategoryName: "C",
		sourceCategoryDepth: 0,
		valueText: null,
		valueNumeric,
		valueNumericMax: null,
		valueBool: null,
	};
}

describe("detectSpecDivergences", () => {
	it("marca peso fixo e atributo kg quando divergem", () => {
		const d = detectSpecDivergences({ weightKg: "1.700", powerWatts: 650 }, [
			attr("kg", 1.8, "peso"),
			attr("W", 650, "potencia"),
		]);
		expect(d.fixed.has("weightKg")).toBe(true);
		expect(d.attributeSlugs.has("peso")).toBe(true);
		expect(d.fixed.has("powerWatts")).toBe(false);
		expect(d.attributeSlugs.has("potencia")).toBe(false);
	});

	it("não marca quando não há atributo de mesma unidade", () => {
		const d = detectSpecDivergences({ weightKg: "1.700", powerWatts: null }, [
			attr("Nm", 30, "torque"),
		]);
		expect(d.fixed.size).toBe(0);
		expect(d.attributeSlugs.size).toBe(0);
	});
});
