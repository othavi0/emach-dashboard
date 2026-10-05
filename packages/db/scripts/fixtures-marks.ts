import { banner } from "@emach/db/schema/banner";
import {
	order,
	orderEvent,
	orderItem,
	orderPicking,
	orderPickingItem,
	orderPickingScan,
	orderStatusHistory,
	refundRequest,
} from "@emach/db/schema/orders";
import { review } from "@emach/db/schema/reviews";
import { stockMovement } from "@emach/db/schema/stock-movements";
import { inArray, type SQL, sql } from "drizzle-orm";
import { type PgColumn, type PgTable, QueryBuilder } from "drizzle-orm/pg-core";

const ANY_ORDER_PREFIX = "EM-TEST-FX-";
const ANY_TEXT_PREFIX = "[EM-TEST-FX";

export type RunId = string & { readonly __brand: "FixtureRunId" };

const RUN_ID = /^[0-9A-F]{6}$/;

export function newRunId(): RunId {
	return crypto.randomUUID().slice(0, 6).toUpperCase() as RunId;
}

export function parseRunId(raw: string | undefined): RunId {
	const value = raw?.toUpperCase();
	if (!(value && RUN_ID.test(value))) {
		throw new Error(
			`[fixtures] run inválido: "${raw ?? ""}" (esperado 6 hex, ex: 1A2B3C).`
		);
	}
	return value as RunId;
}

export interface RunMarks {
	orderPrefix: string;
	text: string;
}

export function runMarks(run: RunId): RunMarks {
	return {
		orderPrefix: `${ANY_ORDER_PREFIX}${run}-`,
		text: `[EM-TEST-FX:${run}]`,
	};
}

export function fixtureOrderNumber(run: RunId, orderId: string): string {
	return `${runMarks(run).orderPrefix}${orderId.slice(0, 8).toUpperCase()}`;
}

export type CleanupScope = { kind: "all" } | { kind: "run"; run: RunId };

export interface CleanupStep {
	table: PgTable;
	where: SQL;
}

export interface CleanupBlocker {
	fk: PgColumn;
	id: PgColumn;
	where: SQL;
}

export interface CleanupPlan {
	blockers: readonly CleanupBlocker[];
	steps: readonly CleanupStep[];
}

const startsWith = (column: PgColumn, prefix: string): SQL =>
	sql`starts_with(${column}, ${prefix})`;

export function cleanupPlan(scope: CleanupScope): CleanupPlan {
	const marks =
		scope.kind === "all"
			? { orderPrefix: ANY_ORDER_PREFIX, text: ANY_TEXT_PREFIX }
			: runMarks(scope.run);
	const qb = new QueryBuilder();
	const orderIds = qb
		.select({ id: order.id })
		.from(order)
		.where(startsWith(order.number, marks.orderPrefix));
	const itemIds = qb
		.select({ id: orderItem.id })
		.from(orderItem)
		.where(inArray(orderItem.orderId, orderIds));
	const pickingIds = qb
		.select({ id: orderPicking.id })
		.from(orderPicking)
		.where(inArray(orderPicking.orderId, orderIds));

	return {
		blockers: [
			{
				fk: refundRequest.orderId,
				id: refundRequest.id,
				where: inArray(refundRequest.orderId, orderIds),
			},
			{
				fk: stockMovement.orderId,
				id: stockMovement.id,
				where: inArray(stockMovement.orderId, orderIds),
			},
			{
				fk: stockMovement.orderItemId,
				id: stockMovement.id,
				where: inArray(stockMovement.orderItemId, itemIds),
			},
		],
		steps: [
			{ table: review, where: inArray(review.orderId, orderIds) },
			{
				table: orderPickingScan,
				where: inArray(orderPickingScan.pickingId, pickingIds),
			},
			{
				table: orderPickingItem,
				where: inArray(orderPickingItem.pickingId, pickingIds),
			},
			{ table: orderPicking, where: inArray(orderPicking.orderId, orderIds) },
			{ table: orderEvent, where: inArray(orderEvent.orderId, orderIds) },
			{
				table: orderStatusHistory,
				where: inArray(orderStatusHistory.orderId, orderIds),
			},
			{ table: orderItem, where: inArray(orderItem.orderId, orderIds) },
			{ table: order, where: startsWith(order.number, marks.orderPrefix) },
			{ table: banner, where: startsWith(banner.title, marks.text) },
		],
	};
}
