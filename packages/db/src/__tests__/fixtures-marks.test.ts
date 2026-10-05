import { getTableName, is } from "drizzle-orm";
import { getTableConfig, PgDialect, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
	type CleanupScope,
	cleanupPlan,
	fixtureOrderNumber,
	newRunId,
	parseRunId,
	runMarks,
} from "../../scripts/fixtures-marks";
import { SEED_ORDER_PREFIX } from "../../scripts/ready-to-ship-marks";

const dialect = new PgDialect();
const run = parseRunId("1a2b3c");
const SCOPES: CleanupScope[] = [{ kind: "all" }, { kind: "run", run }];
const LOOSE_OR_TRUE = /\b(or|true)\b/i;
const RUN_INVALID = /run inválido/;
const SIX_HEX = /^[0-9A-F]{6}$/;

/** FKs `set null` para tabela do plano que o cleanup aceita, porque bloqueia. */
const SET_NULL_ALLOWLIST = [
	"stock_movement.order_id",
	"stock_movement.order_item_id",
];

const label = (table: PgTable, column: string) =>
	`${getTableName(table)}.${column}`;

describe("fixtures cleanup", () => {
	it("escopa todo DELETE e todo bloqueio pelo marcador da execução", () => {
		const { orderPrefix, text } = runMarks(run);
		const { blockers, steps } = cleanupPlan({ kind: "run", run });
		const wheres = [
			...steps.map((s) => ({ name: getTableName(s.table), where: s.where })),
			...blockers.map((b) => ({ name: label(b.fk.table, b.fk.name), ...b })),
		];
		for (const { name, where } of wheres) {
			const { sql, params } = dialect.sqlToQuery(where);
			expect(sql, name).not.toMatch(LOOSE_OR_TRUE);
			expect(params, name).toHaveLength(1);
			expect([orderPrefix, text], name).toContain(params[0]);
		}
	});

	it("--all casa o formato antigo e o novo", () => {
		const { steps } = cleanupPlan({ kind: "all" });
		const params = steps.flatMap((s) => dialect.sqlToQuery(s.where).params);
		const prefixes = params.filter((p): p is string => typeof p === "string");
		const covered = (value: string) =>
			prefixes.some((p) => value.startsWith(p));
		expect(covered("EM-TEST-FX-1A2B3C4D")).toBe(true);
		expect(covered(fixtureOrderNumber(run, crypto.randomUUID()))).toBe(true);
		expect(covered("[EM-TEST-FX] Banner de fixture")).toBe(true);
		expect(covered(`${runMarks(run).text} Banner de fixture`)).toBe(true);
		expect(covered(`${SEED_ORDER_PREFIX}01`)).toBe(false);
		expect(covered("EM-TEST-9001")).toBe(false);
	});

	it("o plano cobre toda FK do schema que aponta para tabela apagada", async () => {
		const schema = await import("../schema/index");
		for (const scope of SCOPES) {
			const { blockers, steps } = cleanupPlan(scope);
			const planned = steps.map((s) => getTableName(s.table));
			const blocked = blockers.map((b) => label(b.fk.table, b.fk.name));
			const violations: string[] = [];

			for (const table of Object.values(schema)) {
				if (!is(table, PgTable)) {
					continue;
				}
				const config = getTableConfig(table);
				for (const fk of config.foreignKeys) {
					const ref = fk.reference();
					const parent = getTableName(ref.foreignTable);
					const parentAt = planned.indexOf(parent);
					if (parentAt === -1) {
						continue;
					}
					const childAt = planned.indexOf(config.name);
					if (childAt !== -1 && childAt < parentAt) {
						continue;
					}
					const fkLabel = `${config.name}.${ref.columns.map((c) => c.name).join(",")}`;
					const onDelete = fk.onDelete ?? "no action";
					if (onDelete === "cascade") {
						continue;
					}
					if (
						(onDelete === "restrict" || onDelete === "no action") &&
						!blocked.includes(fkLabel)
					) {
						violations.push(`${fkLabel} -> ${parent} ${onDelete}`);
					}
					if (
						onDelete === "set null" &&
						!SET_NULL_ALLOWLIST.includes(fkLabel)
					) {
						violations.push(`${fkLabel} -> ${parent} set null`);
					}
					if (onDelete === "set default") {
						violations.push(`${fkLabel} -> ${parent} set default`);
					}
				}
			}

			expect(violations, scope.kind).toEqual([]);
			for (const allowed of SET_NULL_ALLOWLIST) {
				expect(blocked, allowed).toContain(allowed);
			}
		}
	});

	it("número do pedido carrega a execução e não colide com outra nem com seed", () => {
		const other = parseRunId("ABCDEF");
		const number = fixtureOrderNumber(run, crypto.randomUUID());
		expect(number.startsWith(runMarks(run).orderPrefix)).toBe(true);
		expect(number.startsWith(runMarks(other).orderPrefix)).toBe(false);
		expect("EM-TEST-FX-1A2B3C4D".startsWith(runMarks(run).orderPrefix)).toBe(
			false
		);
		expect(number.startsWith(SEED_ORDER_PREFIX)).toBe(false);
	});

	it("run aceita só 6 hex", () => {
		expect(parseRunId(newRunId())).toMatch(SIX_HEX);
		for (const bad of [undefined, "", "1A2B3", "1A2B3C4", "ZZZZZZ", "1A2B3-"]) {
			expect(() => parseRunId(bad), String(bad)).toThrow(RUN_INVALID);
		}
	});
});
