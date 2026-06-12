// apps/web/src/app/dashboard/promotions/_lib/__tests__/featured-message.test.ts
import { describe, expect, it } from "vitest";
import { featuredConflictMessage } from "../featured-message";

describe("featuredConflictMessage", () => {
	it("com fim → cita a data", () => {
		const msg = featuredConflictMessage({
			endsAt: new Date("2026-08-20T12:00:00Z"),
		});
		expect(msg).toMatch(/20\/08\/2026/);
		expect(msg).toMatch(/remova-o ou aguarde/i);
	});

	it("sem fim → mensagem de sem prazo", () => {
		const msg = featuredConflictMessage({ endsAt: null });
		expect(msg).toMatch(/sem prazo de fim/i);
	});
});
