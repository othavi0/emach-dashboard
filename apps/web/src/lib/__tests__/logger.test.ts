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
			const arg = spy.mock.calls[0]?.[0];
			expect(arg).toBeTypeOf("string");

			expect(JSON.parse(arg)).toMatchObject({
				level: "error",
				scope: "myScope",
				ts: expect.stringMatching(ISO_RE),
				payload: { name: "Error", message: "boom" },
			});
		});

		it("error com string como cause a grava como está", () => {
			const spy = vi.spyOn(console, "error").mockImplementation(noop);
			logger.error("scope", "no_recipients");

			const arg = spy.mock.calls[0]?.[0];

			expect(JSON.parse(arg)).toMatchObject({ payload: "no_recipients" });
		});

		it("error com context grava Error em payload e o contexto em context", () => {
			const spy = vi.spyOn(console, "error").mockImplementation(noop);
			logger.error("cancelStaleOrder", new TypeError("deadlock"), {
				orderId: "o1",
				code: null,
			});

			const parsed = JSON.parse(spy.mock.calls[0]?.[0]);

			expect(parsed).toMatchObject({
				level: "error",
				scope: "cancelStaleOrder",
				payload: { name: "TypeError", message: "deadlock" },
				context: { orderId: "o1", code: null },
			});
			expect(parsed.payload.stack).toContain("deadlock");
		});

		it("error sem context não grava o campo context", () => {
			const spy = vi.spyOn(console, "error").mockImplementation(noop);
			logger.error("scope", new Error("boom"));

			expect(JSON.parse(spy.mock.calls[0]?.[0])).not.toHaveProperty("context");
		});

		it("warn emite JSON com level: warn em console.warn", () => {
			const spy = vi.spyOn(console, "warn").mockImplementation(noop);
			logger.warn("createPromotion", new Error("Forbidden: x"));

			expect(spy).toHaveBeenCalledTimes(1);
			expect(JSON.parse(spy.mock.calls[0]?.[0])).toMatchObject({
				level: "warn",
				scope: "createPromotion",
				ts: expect.stringMatching(ISO_RE),
				payload: { name: "Error", message: "Forbidden: x" },
			});
		});

		it("info emite JSON com level: info e payload correto", () => {
			const spy = vi.spyOn(console, "log").mockImplementation(noop);
			logger.info("scope", { count: 5 });

			expect(spy).toHaveBeenCalledTimes(1);
			const arg = spy.mock.calls[0]?.[0];

			expect(JSON.parse(arg)).toMatchObject({
				level: "info",
				payload: { count: 5 },
			});
		});
	});

	describe("em desenvolvimento (NODE_ENV=development)", () => {
		beforeEach(() => {
			vi.stubEnv("NODE_ENV", "development");
		});

		it("error NÃO emite JSON stringificado", () => {
			const spy = vi.spyOn(console, "error").mockImplementation(noop);
			const cause = new Error("x");
			logger.error("scope", cause);

			// prefixo legível + o próprio erro, não JSON
			expect(spy).toHaveBeenCalledWith("[scope]", cause);
		});

		it("warn usa console.warn com prefixo legível", () => {
			const spy = vi.spyOn(console, "warn").mockImplementation(noop);
			const cause = new Error("x");
			logger.warn("scope", cause);

			expect(spy).toHaveBeenCalledWith("[scope]", cause);
		});

		it("error com context passa o contexto como terceiro argumento", () => {
			const spy = vi.spyOn(console, "error").mockImplementation(noop);
			const cause = new Error("x");
			logger.error("scope", cause, { cep: "01001000" });

			expect(spy).toHaveBeenCalledWith("[scope]", cause, { cep: "01001000" });
		});
	});

	describe("em ambiente de teste (NODE_ENV=test)", () => {
		it("info chama console.info com saída legível — não JSON stringificado", () => {
			// NODE_ENV já é "test" no vitest por padrão (diferente de "production")
			const spyInfo = vi.spyOn(console, "info").mockImplementation(noop);
			logger.info("scope", { x: 1 });

			expect(spyInfo).toHaveBeenCalledTimes(1);
			expect(spyInfo).toHaveBeenCalledWith("[scope]", { x: 1 });
		});
	});
});
