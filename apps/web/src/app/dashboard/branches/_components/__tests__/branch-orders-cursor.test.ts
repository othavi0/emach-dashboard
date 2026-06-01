import { describe, expect, it } from "vitest";
import { decodeCursorAs, encodeCursor } from "@/lib/cursor";

describe("branch orders cursor (newest)", () => {
	it("round-trips createdAt + id", () => {
		const iso = "2026-05-30T12:00:00.000Z";
		const raw = encodeCursor({
			v: 1,
			sort: "newest",
			createdAt: iso,
			id: "ord_123",
		});
		const decoded = decodeCursorAs(raw, "newest");
		expect(decoded.createdAt).toBe(iso);
		expect(decoded.id).toBe("ord_123");
	});

	it("rejeita cursor de outro sort", () => {
		const raw = encodeCursor({ v: 1, sort: "name", name: "x", id: "a" });
		expect(() => decodeCursorAs(raw, "newest")).toThrow();
	});
});
