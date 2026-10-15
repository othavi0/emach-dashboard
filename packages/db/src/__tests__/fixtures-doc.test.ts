import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	FIXTURE_SURFACES,
	ORDER_STATUS_PATH,
	type Surface,
} from "../../scripts/fixtures-surfaces";

const FULL_DOC = readFileSync(
	new URL("../../CLAUDE.md", import.meta.url),
	"utf8"
);

const SECTION_START = FULL_DOC.indexOf("## Scripts adicionais");
const SECTION_END = FULL_DOC.indexOf("\n## ", SECTION_START + 1);

const DOC = FULL_DOC.slice(
	SECTION_START,
	SECTION_END === -1 ? undefined : SECTION_END
);

const CREATE_LIST = /db:fixtures create <([a-z|-]+)>/;
const TABLE_ROW = /^\|\s*`([a-z-]+)`\s*\|\s*([^|]+?)\s*\|/gm;

function bornStatus(surface: Surface): string {
	if (surface === "banner") {
		return "—";
	}

	return `\`${ORDER_STATUS_PATH[surface].at(-1)}\``;
}

describe("doc do db:fixtures em packages/db/CLAUDE.md", () => {
	it("lista no create as mesmas superfícies do FIXTURE_SURFACES", () => {
		const listed = DOC.match(CREATE_LIST)?.[1]?.split("|") ?? [];

		expect(new Set(listed).size, "superfície repetida na doc").toBe(
			listed.length
		);
		expect([...listed].sort()).toEqual([...FIXTURE_SURFACES].sort());
	});

	it("a tabela diz o status em que cada superfície nasce", () => {
		const table = new Map(
			[...DOC.matchAll(TABLE_ROW)].map((m) => [m[1], m[2]?.trim()])
		);

		expect([...table.keys()].sort()).toEqual([...FIXTURE_SURFACES].sort());

		for (const surface of FIXTURE_SURFACES) {
			expect(table.get(surface), surface).toBe(bornStatus(surface));
		}
	});
});
