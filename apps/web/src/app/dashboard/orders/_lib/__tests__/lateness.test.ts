import { describe, expect, it } from "vitest";
import { latenessOf } from "../lateness";

const NOW = new Date("2026-07-10T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

describe("latenessOf", () => {
	it("none abaixo de 48h", () => {
		expect(latenessOf("paid", hoursAgo(47), hoursAgo(50), NOW)).toBe("none");
	});
	it("amber entre 48h e 72h", () => {
		expect(latenessOf("preparing", hoursAgo(50), hoursAgo(60), NOW)).toBe(
			"amber"
		);
	});
	it("late a partir de 72h", () => {
		expect(latenessOf("paid", hoursAgo(72), hoursAgo(80), NOW)).toBe("late");
	});
	it("usa createdAt como fallback quando paidAt é null", () => {
		expect(latenessOf("paid", null, hoursAgo(73), NOW)).toBe("late");
	});
	it("statuses fora do funil de expedição nunca atrasam", () => {
		expect(latenessOf("shipped", hoursAgo(200), hoursAgo(200), NOW)).toBe(
			"none"
		);
		expect(latenessOf("delivered", hoursAgo(200), hoursAgo(200), NOW)).toBe(
			"none"
		);
	});
});
