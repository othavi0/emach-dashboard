import { getTableName, is, sql } from "drizzle-orm";
import {
	check,
	getTableConfig,
	PgDialect,
	PgTable,
	pgTable,
	text,
} from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { actorTypeEnum } from "../schema/shared-enums";

const dialect = new PgDialect();

// Mesma lista da tabela "Auditoria" em packages/db/CLAUDE.md: tabela nova
// com actor_type obriga a atualizar a doc junto.
const DOCUMENTED = [
	"client_audit_log",
	"order_event",
	"order_status_history",
	"refund_request",
	"stock_movement",
	"supplier_audit_log",
];

function actorTables(exported: readonly unknown[]) {
	const found: { name: string; coherent: boolean }[] = [];

	for (const table of exported) {
		if (!is(table, PgTable)) {
			continue;
		}

		const config = getTableConfig(table);

		if (!config.columns.some((c) => c.name === "actor_type")) {
			continue;
		}

		const coherent = config.checks.some((c) =>
			dialect.sqlToQuery(c.value).sql.includes("actor_type")
		);

		found.push({ name: getTableName(table), coherent });
	}

	return found.sort((a, b) => a.name.localeCompare(b.name));
}

const auditColumns = {
	id: text("id").primaryKey(),
	actorType: actorTypeEnum("actor_type").notNull(),
	actorUserId: text("actor_user_id"),
};

describe("coerência de ator nas tabelas de auditoria", () => {
	it("toda tabela do schema com actor_type tem CHECK que cita actor_type", async () => {
		const schema = await import("../schema/index");

		expect(
			actorTables(Object.values(schema)).filter((t) => !t.coherent)
		).toEqual([]);
	});

	it("as tabelas com actor_type são as documentadas em packages/db/CLAUDE.md", async () => {
		const schema = await import("../schema/index");

		expect(actorTables(Object.values(schema)).map((t) => t.name)).toEqual(
			DOCUMENTED
		);
	});

	it("acusa tabela com actor_type sem CHECK e aceita a que tem", () => {
		const semCheck = pgTable("audit_sem_check", auditColumns);

		const comCheck = pgTable("audit_com_check", auditColumns, (table) => [
			check(
				"audit_com_check_actor_coherence",
				sql`(${table.actorType} = 'user') = (${table.actorUserId} IS NOT NULL)`
			),
		]);

		expect(actorTables([semCheck, comCheck])).toEqual([
			{ name: "audit_com_check", coherent: true },
			{ name: "audit_sem_check", coherent: false },
		]);
	});
});
