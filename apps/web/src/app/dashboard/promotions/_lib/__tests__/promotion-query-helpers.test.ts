import { describe, expect, it } from "vitest";
import { computeStatus } from "../promotion-query-helpers";

const day = (offsetDays: number): Date =>
	new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);

describe("computeStatus", () => {
	it("endsAt no passado → expired (mesmo se inativa)", () => {
		expect(
			computeStatus({ active: false, startsAt: null, endsAt: day(-1) })
		).toBe("expired");
	});

	it("inativa e não expirada → inactive", () => {
		expect(computeStatus({ active: false, startsAt: null, endsAt: null })).toBe(
			"inactive"
		);
	});

	it("ativa com startsAt no futuro → scheduled", () => {
		expect(
			computeStatus({ active: true, startsAt: day(1), endsAt: null })
		).toBe("scheduled");
	});

	it("ativa sem janela → active", () => {
		expect(computeStatus({ active: true, startsAt: null, endsAt: null })).toBe(
			"active"
		);
	});
});
