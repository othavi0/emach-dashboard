import { describe, expect, it } from "vitest";

import {
	type Cursor,
	decodeCursor,
	decodeCursorAs,
	encodeCursor,
} from "@/lib/cursor";

describe("cursor encode/decode", () => {
	it("faz roundtrip de um cursor newest", () => {
		const c: Cursor = {
			v: 1,
			sort: "newest",
			createdAt: "2026-05-18T00:00:00.000Z",
			id: "abc",
		};
		expect(decodeCursor(encodeCursor(c))).toEqual(c);
	});

	it("faz roundtrip de um cursor pendingStock", () => {
		const c: Cursor = {
			v: 1,
			sort: "pendingStock",
			quantity: 3,
			id: "variant:branch",
		};
		expect(decodeCursor(encodeCursor(c))).toEqual(c);
	});

	it("lança em cursor com versão incompatível", () => {
		const raw = Buffer.from(
			JSON.stringify({ v: 2, sort: "newest", createdAt: "x", id: "y" })
		).toString("base64url");
		expect(() => decodeCursor(raw)).toThrow("Cursor incompatível");
	});
});

describe("decodeCursorAs", () => {
	it("retorna o cursor estreitado quando o sort bate", () => {
		const raw = encodeCursor({
			v: 1,
			sort: "newest",
			createdAt: "2026-05-18T00:00:00.000Z",
			id: "abc",
		});
		const c = decodeCursorAs(raw, "newest");
		expect(c.createdAt).toBe("2026-05-18T00:00:00.000Z");
		expect(c.id).toBe("abc");
	});

	it("lança quando o sort diverge", () => {
		const raw = encodeCursor({
			v: 1,
			sort: "pendingStock",
			quantity: 1,
			id: "x",
		});
		expect(() => decodeCursorAs(raw, "newest")).toThrow(
			"Cursor incompatível: esperado newest"
		);
	});
});
