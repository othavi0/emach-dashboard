import { describe, expect, it } from "vitest";

import { pickingItemSecondaryLine } from "../picking-execution";

describe("pickingItemSecondaryLine (sem barcode na UI)", () => {
	it("exceção → copy fixo", () => {
		expect(pickingItemSecondaryLine({ voltage: "220V", notFound: true })).toBe(
			"Falta reportada · em exceção"
		);
	});

	it("com tensão e sem exceção → só tensão", () => {
		expect(pickingItemSecondaryLine({ voltage: "110V", notFound: false })).toBe(
			"110V"
		);
	});

	it("sem tensão e sem exceção → null (omite a linha)", () => {
		expect(
			pickingItemSecondaryLine({ voltage: null, notFound: false })
		).toBeNull();
	});
});
