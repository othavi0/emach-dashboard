import { describe, expect, it } from "vitest";
import { decodeCursorAs, encodeCursor } from "@/lib/cursor";

describe("supplier tools cursor (newest)", () => {
	it("round-trips createdAt + id", () => {
		const iso = "2026-05-01T12:00:00.000Z";
		const raw = encodeCursor({
			v: 1,
			sort: "newest",
			createdAt: iso,
			id: "tool_9",
		});
		const decoded = decodeCursorAs(raw, "newest");
		expect(decoded.createdAt).toBe(iso);
		expect(decoded.id).toBe("tool_9");
	});

	it("rejeita cursor de outro sort", () => {
		const raw = encodeCursor({ v: 1, sort: "name", name: "x", id: "a" });
		expect(() => decodeCursorAs(raw, "newest")).toThrow();
	});
});
