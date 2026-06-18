import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "../logger";

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

// biome-ignore lint/suspicious/noEmptyBlockStatements: mock supressor intencional
const noop = () => {};

describe("logger", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
	});

	describe("em produção (NODE_ENV=production)", () => {
		beforeEach(() => {
			vi.stubEnv("NODE_ENV", "production");
		});

		it("error com Error emite JSON com campos corretos", () => {
			const spy = vi.spyOn(console, "error").mockImplementation(noop);
			logger.error("myScope", new Error("boom"));

			expect(spy).toHaveBeenCalledTimes(1);
			const arg = spy.mock.calls[0]?.[0] as string;
			expect(typeof arg).toBe("string");

			const parsed = JSON.parse(arg) as {
				level: string;
				scope: string;
				ts: string;
				payload: { message: string; name: string; stack?: string };
			};
			expect(parsed.level).toBe("error");
			expect(parsed.scope).toBe("myScope");
			expect(parsed.payload.message).toBe("boom");
			expect(typeof parsed.ts).toBe("string");
			expect(parsed.ts).toMatch(ISO_RE);
		});

		it("error com objeto literal preserva campos do payload", () => {
			const spy = vi.spyOn(console, "error").mockImplementation(noop);
			logger.error("scope", { orderId: "x", err: "msg" });

			const arg = spy.mock.calls[0]?.[0] as string;
			const parsed = JSON.parse(arg) as {
				payload: { orderId: string; err: string };
			};
			expect(parsed.payload.orderId).toBe("x");
		});

		it("info emite JSON com level: info e payload correto", () => {
			const spy = vi.spyOn(console, "log").mockImplementation(noop);
			logger.info("scope", { count: 5 });

			expect(spy).toHaveBeenCalledTimes(1);
			const arg = spy.mock.calls[0]?.[0] as string;
			const parsed = JSON.parse(arg) as {
				level: string;
				payload: { count: number };
			};
			expect(parsed.level).toBe("info");
			expect(parsed.payload.count).toBe(5);
		});
	});

	describe("em desenvolvimento (NODE_ENV=development)", () => {
		beforeEach(() => {
			vi.stubEnv("NODE_ENV", "development");
		});

		it("error NÃO emite JSON stringificado", () => {
			const spy = vi.spyOn(console, "error").mockImplementation(noop);
			logger.error("scope", new Error("x"));

			const arg = spy.mock.calls[0]?.[0];
			// arg deve ser uma string de prefixo legível, não JSON
			expect(typeof arg === "string" && arg.startsWith("{")).toBe(false);
		});
	});

	describe("em ambiente de teste (NODE_ENV=test)", () => {
		it("info chama console.info com saída legível — não JSON stringificado", () => {
			// NODE_ENV já é "test" no vitest por padrão (diferente de "production")
			const spyInfo = vi.spyOn(console, "info").mockImplementation(noop);
			logger.info("scope", { x: 1 });

			expect(spyInfo).toHaveBeenCalledTimes(1);
			const arg = spyInfo.mock.calls[0]?.[0];
			expect(typeof arg === "string" && arg.startsWith("{")).toBe(false);
		});
	});
});
