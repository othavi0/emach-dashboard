import "server-only";

import { db } from "@emach/db";
import { toDate } from "@emach/db/utils";
import { sql } from "drizzle-orm";

import { decodeCursorAs, encodeCursor } from "@/lib/cursor";
import { BATCH_SIZE, type InfiniteResult } from "@/lib/infinite";
import { requireCapability } from "@/lib/permissions";

export type BranchActivityKind = "stock" | "order" | "user";
export type BranchActivityPeriod = "today" | "7d" | "30d" | "90d" | "all";

export interface BranchActivityFilters {
	branchId: string;
	kinds: BranchActivityKind[];
	period: BranchActivityPeriod;
	toolId?: string;
}

export interface BranchActivityRow {
	action: string | null;
	actorName: string | null;
	at: Date;
	clientName: string | null;
	delta: number | null;
	href: string | null;
	id: string;
	kind: BranchActivityKind;
	memberName: string | null;
	note: string | null;
	orderNumber: string | null;
	reason: string | null;
	sku: string | null;
	toolName: string | null;
	toStatus: string | null;
}

interface BranchActivityDbRow extends Record<string, unknown> {
	action: string | null;
	actor_name: string | null;
	client_name: string | null;
	created_at: string;
	delta: number | null;
	href: string | null;
	id: string;
	kind: BranchActivityKind;
	member_name: string | null;
	note: string | null;
	order_number: string | null;
	reason: string | null;
	sku: string | null;
	to_status: string | null;
	tool_name: string | null;
}

const PERIOD_DAYS: Record<"7d" | "30d" | "90d", number> = {
	"7d": 7,
	"30d": 30,
	"90d": 90,
};

function computeCutoff(period: BranchActivityPeriod): Date | null {
	if (period === "all") {
		return null;
	}
	const now = new Date();
	if (period === "today") {
		return new Date(now.getFullYear(), now.getMonth(), now.getDate());
	}
	return new Date(now.getTime() - PERIOD_DAYS[period] * 86_400_000);
}

/** Cláusula keyset (created_at, id-prefixado) < cursor, ou vazia. */
function keysetClause(
	createdAtCol: string,
	idExpr: string,
	cursor: { createdAt: string; id: string } | null
) {
	return cursor
		? sql`(${sql.raw(createdAtCol)}, ${sql.raw(idExpr)}) < (${cursor.createdAt}::timestamptz, ${cursor.id})`
		: sql``;
}

function whereFrom(parts: ReturnType<typeof sql>[]) {
	const real = parts.filter((p) => p !== undefined);
	return real.length ? sql`WHERE ${sql.join(real, sql` AND `)}` : sql``;
}

interface BlockCtx {
	branchId: string;
	cutoffSql: string | null;
	decoded: { createdAt: string; id: string } | null;
	limit: number;
	toolId?: string;
}

function buildStockBlock(ctx: BlockCtx) {
	const parts = [sql`sm.branch_id = ${ctx.branchId}`];
	if (ctx.toolId) {
		parts.push(sql`tv.tool_id = ${ctx.toolId}`);
	}
	if (ctx.cutoffSql) {
		parts.push(sql`sm.created_at >= ${ctx.cutoffSql}::timestamptz`);
	}
	if (ctx.decoded) {
		parts.push(keysetClause("sm.created_at", "'stock-' || sm.id", ctx.decoded));
	}
	return sql`(
		SELECT 'stock-' || sm.id AS id, 'stock'::text AS kind, sm.created_at,
			sm.delta AS delta, sm.reason::text AS reason, tv.sku AS sku, t.name AS tool_name,
			NULL::text AS order_number, NULL::text AS to_status, NULL::text AS client_name,
			NULL::text AS action, NULL::text AS member_name,
			sm.reason_note AS note,
			CASE WHEN sm.actor_type = 'user' THEN u.name ELSE NULL END AS actor_name,
			NULL::text AS href
		FROM stock_movement sm
		LEFT JOIN tool_variant tv ON tv.id = sm.variant_id
		LEFT JOIN tool t ON t.id = tv.tool_id
		LEFT JOIN "user" u ON u.id = sm.actor_id
		${whereFrom(parts)}
		ORDER BY sm.created_at DESC, 'stock-' || sm.id DESC
		LIMIT ${ctx.limit}
	)`;
}

function buildOrderBlock(ctx: BlockCtx) {
	const parts = [sql`o.branch_id = ${ctx.branchId}`];
	if (ctx.cutoffSql) {
		parts.push(sql`osh.created_at >= ${ctx.cutoffSql}::timestamptz`);
	}
	if (ctx.decoded) {
		parts.push(
			keysetClause("osh.created_at", "'order-' || osh.id", ctx.decoded)
		);
	}
	return sql`(
		SELECT 'order-' || osh.id AS id, 'order'::text AS kind, osh.created_at,
			NULL::int AS delta, NULL::text AS reason, NULL::text AS sku, NULL::text AS tool_name,
			o.number AS order_number, osh.to_status::text AS to_status, c.name AS client_name,
			NULL::text AS action, NULL::text AS member_name,
			osh.reason AS note,
			CASE WHEN osh.actor_type = 'user' THEN u.name ELSE NULL END AS actor_name,
			'/dashboard/orders/' || o.id AS href
		FROM order_status_history osh
		JOIN "order" o ON o.id = osh.order_id
		LEFT JOIN client c ON c.id = o.client_id
		LEFT JOIN "user" u ON u.id = osh.actor_user_id
		${whereFrom(parts)}
		ORDER BY osh.created_at DESC, 'order-' || osh.id DESC
		LIMIT ${ctx.limit}
	)`;
}

function buildTeamBlock(ctx: BlockCtx) {
	const parts = [
		sql`(
			(ual.target_type = 'branch' AND ual.target_id = ${ctx.branchId})
			OR (ual.action IN ('user.branch_linked', 'user.branch_unlinked')
				AND ual.metadata->>'branchId' = ${ctx.branchId})
		)`,
	];
	if (ctx.cutoffSql) {
		parts.push(sql`ual.created_at >= ${ctx.cutoffSql}::timestamptz`);
	}
	if (ctx.decoded) {
		parts.push(
			keysetClause("ual.created_at", "'user-' || ual.id", ctx.decoded)
		);
	}
	return sql`(
		SELECT 'user-' || ual.id AS id, 'user'::text AS kind, ual.created_at,
			NULL::int AS delta, NULL::text AS reason, NULL::text AS sku, NULL::text AS tool_name,
			NULL::text AS order_number, NULL::text AS to_status, NULL::text AS client_name,
			ual.action AS action, tu.name AS member_name,
			NULL::text AS note,
			COALESCE(ual.metadata->>'actorName', au.name) AS actor_name,
			NULL::text AS href
		FROM user_activity_log ual
		LEFT JOIN "user" au ON au.id = ual.actor_user_id
		LEFT JOIN "user" tu ON tu.id = ual.target_id AND ual.target_type = 'user'
		${whereFrom(parts)}
		ORDER BY ual.created_at DESC, 'user-' || ual.id DESC
		LIMIT ${ctx.limit}
	)`;
}

export async function fetchBranchActivityPage(
	filters: BranchActivityFilters,
	cursor: string | null
): Promise<InfiniteResult<BranchActivityRow>> {
	await requireCapability("stock.read");

	if (filters.kinds.length === 0) {
		return { items: [], nextCursor: null };
	}

	const decoded = cursor ? decodeCursorAs(cursor, "activity") : null;
	const cutoff = computeCutoff(filters.period);
	const cutoffSql = cutoff ? cutoff.toISOString() : null;
	const ctx: BlockCtx = {
		branchId: filters.branchId,
		toolId: filters.toolId,
		decoded,
		cutoffSql,
		limit: BATCH_SIZE + 1,
	};

	const blocks: ReturnType<typeof sql>[] = [];
	if (filters.kinds.includes("stock")) {
		blocks.push(buildStockBlock(ctx));
	}
	if (filters.kinds.includes("order")) {
		blocks.push(buildOrderBlock(ctx));
	}
	if (filters.kinds.includes("user")) {
		blocks.push(buildTeamBlock(ctx));
	}

	// Derived table: com 1 só bloco não há UNION ALL, e `( SELECT ... ORDER BY ... )
	// ORDER BY ...` é rejeitado pelo Postgres ("multiple ORDER BY clauses"). Envolver
	// em `SELECT * FROM (...) AS feed` torna o ORDER BY externo válido para 1 ou N blocos.
	const unioned = sql.join(blocks, sql` UNION ALL `);
	const result = await db.execute<BranchActivityDbRow>(sql`
		SELECT * FROM (
			${unioned}
		) AS feed
		ORDER BY created_at DESC, id DESC
		LIMIT ${ctx.limit}
	`);

	const hasMore = result.rows.length > BATCH_SIZE;
	const pageRows = hasMore ? result.rows.slice(0, BATCH_SIZE) : result.rows;
	const items: BranchActivityRow[] = pageRows.map((r) => ({
		id: r.id,
		kind: r.kind,
		at: toDate(r.created_at),
		delta: r.delta === null ? null : Number(r.delta),
		reason: r.reason,
		sku: r.sku,
		toolName: r.tool_name,
		orderNumber: r.order_number,
		toStatus: r.to_status,
		clientName: r.client_name,
		action: r.action,
		memberName: r.member_name,
		note: r.note,
		actorName: r.actor_name,
		href: r.href,
	}));

	const last = pageRows.at(-1);
	const nextCursor =
		hasMore && last
			? encodeCursor({
					v: 1,
					sort: "activity",
					id: last.id,
					createdAt: toDate(last.created_at).toISOString(),
				})
			: null;

	return { items, nextCursor };
}

/** Ferramentas com movimentação registrada nesta filial (para o filtro). */
export async function fetchBranchActivityTools(
	branchId: string
): Promise<Array<{ id: string; name: string }>> {
	await requireCapability("stock.read");
	const result = await db.execute<{ id: string; name: string }>(sql`
		SELECT DISTINCT t.id AS id, t.name AS name
		FROM stock_movement sm
		JOIN tool_variant tv ON tv.id = sm.variant_id
		JOIN tool t ON t.id = tv.tool_id
		WHERE sm.branch_id = ${branchId}
		ORDER BY t.name ASC
	`);
	return result.rows.map((r) => ({ id: r.id, name: r.name }));
}
