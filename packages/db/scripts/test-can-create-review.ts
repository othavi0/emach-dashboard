import crypto from "node:crypto";

import { inArray, like } from "drizzle-orm";

import { db } from "../src";
import { canCreateReview, REVIEW_WINDOW_DAYS } from "../src/queries/reviews";
import { client } from "../src/schema/client";
import { order, orderItem } from "../src/schema/orders";
import { review } from "../src/schema/reviews";
import { tool, toolVariant } from "../src/schema/tools";

const PREFIX = "test-canreview-";

function id(suffix: string) {
	return `${PREFIX}${suffix}-${crypto.randomUUID().slice(0, 8)}`;
}

function daysAgo(n: number) {
	const d = new Date();
	d.setDate(d.getDate() - n);
	return d;
}

type Fixture = {
	clientAId: string;
	clientBId: string;
	toolXId: string;
	toolYId: string;
	variantXId: string;
	variantYId: string;
	orderPaidRecentId: string;
	orderPaidExpiredId: string;
	orderPendingId: string;
};

async function setup(): Promise<Fixture> {
	const f: Fixture = {
		clientAId: id("client-a"),
		clientBId: id("client-b"),
		toolXId: id("tool-x"),
		toolYId: id("tool-y"),
		variantXId: id("var-x"),
		variantYId: id("var-y"),
		orderPaidRecentId: id("order-paid-recent"),
		orderPaidExpiredId: id("order-paid-expired"),
		orderPendingId: id("order-pending"),
	};

	await db.insert(client).values([
		{
			id: f.clientAId,
			name: "Cliente A Teste",
			email: `${f.clientAId}@test.local`,
			emailVerified: true,
		},
		{
			id: f.clientBId,
			name: "Cliente B Teste",
			email: `${f.clientBId}@test.local`,
			emailVerified: true,
		},
	]);

	await db.insert(tool).values([
		{ id: f.toolXId, name: "Tool X", status: "active" },
		{ id: f.toolYId, name: "Tool Y", status: "active" },
	]);

	await db.insert(toolVariant).values([
		{
			id: f.variantXId,
			toolId: f.toolXId,
			sku: id("sku-x"),
			priceAmount: "100.00",
			isDefault: true,
		},
		{
			id: f.variantYId,
			toolId: f.toolYId,
			sku: id("sku-y"),
			priceAmount: "200.00",
			isDefault: true,
		},
	]);

	const baseOrder = {
		clientId: f.clientAId,
		subtotalAmount: "100.00",
		totalAmount: "100.00",
		shippingAddress: { street: "Test" },
	};

	await db.insert(order).values([
		{
			...baseOrder,
			id: f.orderPaidRecentId,
			number: id("num-rec"),
			status: "paid",
			paymentStatus: "paid",
			paidAt: daysAgo(10),
		},
		{
			...baseOrder,
			id: f.orderPaidExpiredId,
			number: id("num-exp"),
			status: "delivered",
			paymentStatus: "paid",
			paidAt: daysAgo(REVIEW_WINDOW_DAYS + 5),
		},
		{
			...baseOrder,
			id: f.orderPendingId,
			number: id("num-pen"),
			status: "pending_payment",
			paymentStatus: "pending",
		},
	]);

	await db.insert(orderItem).values([
		{
			id: id("item-recent"),
			orderId: f.orderPaidRecentId,
			toolId: f.toolXId,
			variantId: f.variantXId,
			name: "Tool X",
			unitPrice: "100.00",
			quantity: 1,
			lineTotal: "100.00",
		},
		{
			id: id("item-expired"),
			orderId: f.orderPaidExpiredId,
			toolId: f.toolXId,
			variantId: f.variantXId,
			name: "Tool X",
			unitPrice: "100.00",
			quantity: 1,
			lineTotal: "100.00",
		},
		{
			id: id("item-pending"),
			orderId: f.orderPendingId,
			toolId: f.toolXId,
			variantId: f.variantXId,
			name: "Tool X",
			unitPrice: "100.00",
			quantity: 1,
			lineTotal: "100.00",
		},
	]);

	return f;
}

async function cleanup(f: Fixture) {
	const orderIds = [
		f.orderPaidRecentId,
		f.orderPaidExpiredId,
		f.orderPendingId,
	];
	const toolIds = [f.toolXId, f.toolYId];
	const variantIds = [f.variantXId, f.variantYId];
	const clientIds = [f.clientAId, f.clientBId];

	await db.delete(review).where(inArray(review.orderId, orderIds));
	await db.delete(orderItem).where(inArray(orderItem.orderId, orderIds));
	await db.delete(order).where(inArray(order.id, orderIds));
	await db.delete(toolVariant).where(inArray(toolVariant.id, variantIds));
	await db.delete(tool).where(inArray(tool.id, toolIds));
	await db.delete(client).where(inArray(client.id, clientIds));

	// Defensive sweep — caso algo tenha sobrado de execuções anteriores
	await db.delete(review).where(like(review.id, `${PREFIX}%`));
}

type Case = {
	label: string;
	expected: "ok" | string;
	run: (f: Fixture) => Promise<unknown>;
};

const cases: Case[] = [
	{
		label: "ok — order paga recente, tool no item, sem review prévia",
		expected: "ok",
		run: (f) =>
			canCreateReview(db, {
				clientId: f.clientAId,
				orderId: f.orderPaidRecentId,
				toolId: f.toolXId,
			}),
	},
	{
		label: "order_not_found",
		expected: "order_not_found",
		run: (f) =>
			canCreateReview(db, {
				clientId: f.clientAId,
				orderId: "no-such-order",
				toolId: f.toolXId,
			}),
	},
	{
		label: "order_not_owned_by_client",
		expected: "order_not_owned_by_client",
		run: (f) =>
			canCreateReview(db, {
				clientId: f.clientBId,
				orderId: f.orderPaidRecentId,
				toolId: f.toolXId,
			}),
	},
	{
		label: "not_paid",
		expected: "not_paid",
		run: (f) =>
			canCreateReview(db, {
				clientId: f.clientAId,
				orderId: f.orderPendingId,
				toolId: f.toolXId,
			}),
	},
	{
		label: "window_expired",
		expected: "window_expired",
		run: (f) =>
			canCreateReview(db, {
				clientId: f.clientAId,
				orderId: f.orderPaidExpiredId,
				toolId: f.toolXId,
			}),
	},
	{
		label: "tool_not_in_order",
		expected: "tool_not_in_order",
		run: (f) =>
			canCreateReview(db, {
				clientId: f.clientAId,
				orderId: f.orderPaidRecentId,
				toolId: f.toolYId,
			}),
	},
	{
		label: "already_reviewed",
		expected: "already_reviewed",
		run: async (f) => {
			await db.insert(review).values({
				id: id("rev"),
				clientId: f.clientAId,
				orderId: f.orderPaidRecentId,
				toolId: f.toolXId,
				rating: 5,
				body: "Existing",
			});
			return canCreateReview(db, {
				clientId: f.clientAId,
				orderId: f.orderPaidRecentId,
				toolId: f.toolXId,
			});
		},
	},
];

async function main() {
	const fixture = await setup();
	let failures = 0;
	try {
		for (const c of cases) {
			const result = (await c.run(fixture)) as
				| { ok: true }
				| { ok: false; reason: string };
			const actual = result.ok ? "ok" : result.reason;
			const pass = actual === c.expected;
			const tag = pass ? "OK" : "FAIL";
			console.log(
				`[${tag}] ${c.label}  expected=${c.expected}  actual=${actual}`
			);
			if (!pass) {
				failures++;
			}
		}
	} finally {
		await cleanup(fixture);
		// pg pool keeps process alive; force exit
		process.exit(failures > 0 ? 1 : 0);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
