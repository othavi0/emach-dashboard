import { describe, expect, it } from "vitest";
import { parseArgs } from "../../scripts/db-read";

const USAGE = /uso/;
const NEEDS_INT = /exige inteiro/;
const UNKNOWN = /flag desconhecida/;

describe("parseArgs do db-read", () => {
	it("aceita o SQL sem flags, com limite 200 e timeout 15 s", () => {
		expect(parseArgs(["SELECT 1"])).toEqual({
			limit: 200,
			statement: "SELECT 1",
			timeoutSeconds: 15,
		});
	});

	it("aceita --limit e --timeout antes ou depois do SQL", () => {
		expect(parseArgs(["SELECT 1", "--limit", "5", "--timeout", "30"])).toEqual({
			limit: 5,
			statement: "SELECT 1",
			timeoutSeconds: 30,
		});
		expect(parseArgs(["--timeout", "2", "--limit", "5", "SELECT 1"])).toEqual({
			limit: 5,
			statement: "SELECT 1",
			timeoutSeconds: 2,
		});
	});

	it("recusa flag sem valor ou com valor que não é inteiro positivo", () => {
		expect(() => parseArgs(["SELECT 1", "--limit"])).toThrow(NEEDS_INT);
		expect(() => parseArgs(["SELECT 1", "--timeout"])).toThrow(NEEDS_INT);
		expect(() => parseArgs(["SELECT 1", "--limit", "0"])).toThrow(NEEDS_INT);
		expect(() => parseArgs(["SELECT 1", "--limit", "2.5"])).toThrow(NEEDS_INT);
		expect(() => parseArgs(["SELECT 1", "--timeout", "-1"])).toThrow(NEEDS_INT);
	});

	it("recusa flag desconhecida", () => {
		expect(() => parseArgs(["SELECT 1", "--limt", "5"])).toThrow(UNKNOWN);
	});

	it("recusa SQL vazio ou mais de um argumento solto", () => {
		expect(() => parseArgs([])).toThrow(USAGE);
		expect(() => parseArgs(["  "])).toThrow(USAGE);
		expect(() => parseArgs(["SELECT 1", "SELECT 2"])).toThrow(USAGE);
	});
});
