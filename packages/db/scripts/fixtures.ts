import { banner } from "@emach/db/schema/banner";
import { client } from "@emach/db/schema/client";
import { branch } from "@emach/db/schema/inventory";
import {
	type OrderStatus,
	order,
	orderItem,
	orderPicking,
	orderPickingItem,
	orderPickingScan,
	orderStatusHistory,
	refundRequest,
} from "@emach/db/schema/orders";
import { review } from "@emach/db/schema/reviews";
import { tool, toolVariant } from "@emach/db/schema/tools";
import { and, asc, eq, getTableName, isNotNull } from "drizzle-orm";
import { db } from "../src/index";
import {
	type CleanupScope,
	cleanupPlan,
	fixtureOrderNumber,
	newRunId,
	parseRunId,
	type RunId,
	type RunMarks,
	runMarks,
} from "./fixtures-marks";
import {
	FIXTURE_SURFACES,
	ORDER_STATUS_PATH,
	type OrderSurface,
	parseAgeHours,
	type Surface,
} from "./fixtures-surfaces";
import type { Tx } from "./seed/context";

const HIDDEN_FROM_STOREFRONT = false;

const MINUTES = 60_000;
const HOURS = 60 * MINUTES;

interface CreateOptions {
	ageHours: number | undefined;
	branchId: string | undefined;
	marks: RunMarks;
	run: RunId;
}

interface Created {
	extraRoutes?: { route: string; shows: string }[];
	ids: Record<string, string>;
	orderNumber?: string;
	route: string;
	surface: Surface;
}

interface Base {
	branchId: string;
	clientId: string;
	variant: {
		barcode: string | null;
		name: string;
		priceAmount: string;
		sku: string;
		toolId: string;
		variantId: string;
	};
}

async function loadBase(tx: Tx, opts: CreateOptions): Promise<Base> {
	const [branchRow] = await tx
		.select({ id: branch.id })
		.from(branch)
		.where(
			opts.branchId ? eq(branch.id, opts.branchId) : eq(branch.status, "active")
		)
		.orderBy(asc(branch.createdAt), asc(branch.id))
		.limit(1);

	if (!branchRow) {
		throw new Error(
			opts.branchId
				? `[fixtures] filial ${opts.branchId} não existe.`
				: "[fixtures] nenhuma filial ativa."
		);
	}

	const [clientRow] = await tx
		.select({ id: client.id })
		.from(client)
		.where(eq(client.status, "active"))
		.orderBy(asc(client.createdAt), asc(client.id))
		.limit(1);

	if (!clientRow) {
		throw new Error("[fixtures] nenhum client ativo.");
	}

	const [variant] = await tx
		.select({
			variantId: toolVariant.id,
			toolId: toolVariant.toolId,
			sku: toolVariant.sku,
			barcode: toolVariant.barcode,
			priceAmount: toolVariant.priceAmount,
			name: tool.name,
		})
		.from(toolVariant)
		.innerJoin(
			tool,
			and(eq(tool.id, toolVariant.toolId), eq(tool.status, "active"))
		)
		.where(isNotNull(toolVariant.priceAmount))
		.orderBy(asc(tool.name), asc(toolVariant.sortOrder), asc(toolVariant.id))
		.limit(1);

	if (!variant?.priceAmount) {
		throw new Error("[fixtures] nenhuma variante ativa com preço.");
	}

	return {
		branchId: branchRow.id,
		clientId: clientRow.id,
		variant: { ...variant, priceAmount: variant.priceAmount },
	};
}

type ReachedAtColumn = Extract<
	keyof typeof order.$inferInsert,
	| "paidAt"
	| "preparingAt"
	| "shippedAt"
	| "deliveredAt"
	| "canceledAt"
	| "returnedAt"
	| "refundedAt"
>;

// pending_payment e payment_failed não têm coluna; ficam só no histórico.
const REACHED_AT_COLUMN: Partial<Record<OrderStatus, ReachedAtColumn>> = {
	paid: "paidAt",
	preparing: "preparingAt",
	shipped: "shippedAt",
	delivered: "deliveredAt",
	canceled: "canceledAt",
	returned: "returnedAt",
	refunded: "refundedAt",
};

interface FixtureOrder {
	itemId: string;
	orderId: string;
	orderNumber: string;
	reachedAt: Date;
	totalAmount: string;
}

async function insertFixtureOrder(
	tx: Tx,
	base: Base,
	opts: CreateOptions,
	surface: OrderSurface
): Promise<FixtureOrder> {
	const orderId = crypto.randomUUID();
	const itemId = crypto.randomUUID();
	const orderNumber = fixtureOrderNumber(opts.run, orderId);
	const steps = ORDER_STATUS_PATH[surface];
	const status = steps.at(-1) ?? "pending_payment";
	const lastStepAt = Date.now() - (opts.ageHours ?? 1) * HOURS;

	const stepAt = (i: number) =>
		new Date(lastStepAt - (steps.length - 1 - i) * HOURS);

	const createdAt = new Date(lastStepAt - steps.length * HOURS);

	const reachedAt: Partial<Record<ReachedAtColumn, Date>> = {};

	for (const [i, s] of steps.entries()) {
		const column = REACHED_AT_COLUMN[s];

		if (column) {
			reachedAt[column] = stepAt(i);
		}
	}

	await tx.insert(order).values({
		id: orderId,
		number: orderNumber,
		clientId: base.clientId,
		branchId: base.branchId,
		status,
		paymentMethod: "pix",
		subtotalAmount: base.variant.priceAmount,
		shippingAmount: "0",
		totalAmount: base.variant.priceAmount,
		shippingAddress: {
			recipient: opts.marks.text,
			zipCode: "01001-000",
			street: "Praça da Sé",
			number: "0",
			complement: null,
			neighborhood: "Sé",
			city: "São Paulo",
			state: "SP",
			country: "BR",
		},
		shippingMethod: "PAC",
		notes: `${opts.marks.text} pedido de fixture`,
		createdAt,
		...reachedAt,
	});

	await tx.insert(orderItem).values({
		id: itemId,
		orderId,
		toolId: base.variant.toolId,
		variantId: base.variant.variantId,
		sku: base.variant.sku,
		name: base.variant.name,
		unitPrice: base.variant.priceAmount,
		quantity: 1,
		lineTotal: base.variant.priceAmount,
	});

	const history: (typeof orderStatusHistory.$inferInsert)[] = [
		{
			id: crypto.randomUUID(),
			orderId,
			fromStatus: "pending_payment",
			toStatus: "pending_payment",
			actorType: "system",
			reason: "criado",
			createdAt,
		},
	];

	let from: OrderStatus = "pending_payment";

	for (const [i, to] of steps.entries()) {
		history.push({
			id: crypto.randomUUID(),
			orderId,
			fromStatus: from,
			toStatus: to,
			actorType: "system",
			createdAt: stepAt(i),
		});
		from = to;
	}

	await tx.insert(orderStatusHistory).values(history);

	return {
		itemId,
		orderId,
		orderNumber,
		reachedAt: stepAt(steps.length - 1),
		totalAmount: base.variant.priceAmount,
	};
}

// Pedido sem linha extra: o status vem do caminho e a aba da listagem confirma.
function plainOrderSurface(
	surface: OrderSurface,
	tab: string
): (tx: Tx, opts: CreateOptions) => Promise<Created> {
	return async (tx, opts) => {
		const base = await loadBase(tx, opts);
		const o = await insertFixtureOrder(tx, base, opts, surface);

		return {
			surface,
			ids: {
				order: o.orderId,
				order_item: o.itemId,
				branch: base.branchId,
				client: base.clientId,
			},
			orderNumber: o.orderNumber,
			route: `/dashboard/orders/${o.orderId}`,
			extraRoutes: [
				{ route: `/dashboard/orders?tab=${tab}`, shows: "aba da listagem" },
			],
		};
	};
}

const SURFACES: Record<
	Surface,
	(tx: Tx, opts: CreateOptions) => Promise<Created>
> = {
	order: plainOrderSurface("order", "paid"),
	"payment-failed": plainOrderSurface("payment-failed", "pending_payment"),
	canceled: plainOrderSurface("canceled", "canceled"),
	returned: plainOrderSurface("returned", "returned"),

	refunded: async (tx, opts) => {
		const base = await loadBase(tx, opts);
		const o = await insertFixtureOrder(tx, base, opts, "refunded");
		const refundId = crypto.randomUUID();
		await tx.insert(refundRequest).values({
			id: refundId,
			orderId: o.orderId,
			clientId: base.clientId,
			reasonCategory: "outro",
			reasonText: `${opts.marks.text} reembolso de fixture`,
			status: "refunded",
			amount: o.totalAmount,
			actorType: "system",
			actorUserId: null,
			requestedAt: o.reachedAt,
			resolvedAt: o.reachedAt,
		});

		return {
			surface: "refunded",
			ids: {
				order: o.orderId,
				order_item: o.itemId,
				refund_request: refundId,
				branch: base.branchId,
				client: base.clientId,
			},
			orderNumber: o.orderNumber,
			route: `/dashboard/orders/${o.orderId}`,
			extraRoutes: [
				{ route: "/dashboard/orders?tab=canceled", shows: "aba da listagem" },
			],
		};
	},

	"ready-to-ship": async (tx, opts) => {
		const base = await loadBase(tx, opts);
		const o = await insertFixtureOrder(tx, base, opts, "ready-to-ship");
		const pickingId = crypto.randomUUID();
		const pickingItemId = crypto.randomUUID();
		const scanId = crypto.randomUUID();
		const pickerName = `${opts.marks.text} Separador`;
		const scannedAt = new Date(o.reachedAt.getTime() + 10 * MINUTES);
		const completedAt = new Date(o.reachedAt.getTime() + 15 * MINUTES);
		const { barcode } = base.variant;

		await tx.insert(orderPicking).values({
			id: pickingId,
			orderId: o.orderId,
			branchId: base.branchId,
			status: "completed",
			pickerName,
			startedAt: o.reachedAt,
			completedAt,
		});
		await tx.insert(orderPickingItem).values({
			id: pickingItemId,
			pickingId,
			orderItemId: o.itemId,
			variantId: base.variant.variantId,
			variantSnapshot: {
				sku: base.variant.sku,
				name: base.variant.name,
				barcode,
			},
			qtyExpected: 1,
			qtyPicked: 1,
			lastScannedAt: scannedAt,
		});
		await tx.insert(orderPickingScan).values({
			id: scanId,
			pickingId,
			pickingItemId,
			variantId: base.variant.variantId,
			scannedCode: barcode ?? base.variant.sku,
			manual: barcode === null,
			manualReason:
				barcode === null ? `${opts.marks.text} variante sem código` : null,
			scannedByName: pickerName,
			scannedAt,
		});

		return {
			surface: "ready-to-ship",
			ids: {
				order: o.orderId,
				order_item: o.itemId,
				order_picking: pickingId,
				order_picking_item: pickingItemId,
				order_picking_scan: scanId,
				branch: base.branchId,
				client: base.clientId,
			},
			orderNumber: o.orderNumber,
			route: `/dashboard/orders/${o.orderId}`,
			extraRoutes: [
				{ route: "/dashboard/orders?tab=picked", shows: "Pronto para enviar" },
			],
		};
	},

	"picking-exception": async (tx, opts) => {
		const base = await loadBase(tx, opts);
		const o = await insertFixtureOrder(tx, base, opts, "picking-exception");
		const pickingId = crypto.randomUUID();
		const pickingItemId = crypto.randomUUID();
		await tx.insert(orderPicking).values({
			id: pickingId,
			orderId: o.orderId,
			branchId: base.branchId,
			status: "exception",
			pickerName: `${opts.marks.text} Separador`,
			exceptionReason: `${opts.marks.text} item não encontrado na prateleira`,
		});
		await tx.insert(orderPickingItem).values({
			id: pickingItemId,
			pickingId,
			orderItemId: o.itemId,
			variantId: base.variant.variantId,
			variantSnapshot: { sku: base.variant.sku, name: base.variant.name },
			qtyExpected: 1,
			qtyPicked: 0,
			notFound: true,
		});

		return {
			surface: "picking-exception",
			ids: {
				order: o.orderId,
				order_picking: pickingId,
				order_picking_item: pickingItemId,
				branch: base.branchId,
				client: base.clientId,
			},
			orderNumber: o.orderNumber,
			route: `/dashboard/orders/${o.orderId}`,
			extraRoutes: [
				{ route: "/dashboard", shows: "linha de exceção da overview" },
			],
		};
	},

	banner: async (tx, opts) => {
		if (opts.ageHours !== undefined) {
			throw new Error("[fixtures] --age vale só para superfícies de pedido.");
		}

		const id = crypto.randomUUID();
		await tx.insert(banner).values({
			id,
			title: `${opts.marks.text} Banner de fixture`,
			altText: opts.marks.text,
			isActive: HIDDEN_FROM_STOREFRONT,
		});

		return {
			surface: "banner",
			ids: { banner: id },
			route: "/dashboard/site/banners",
		};
	},

	review: async (tx, opts) => {
		const base = await loadBase(tx, opts);
		const o = await insertFixtureOrder(tx, base, opts, "review");
		const id = crypto.randomUUID();
		await tx.insert(review).values({
			id,
			toolId: base.variant.toolId,
			clientId: base.clientId,
			orderId: o.orderId,
			rating: 4,
			title: `${opts.marks.text} Avaliação de fixture`,
			body: `${opts.marks.text} texto da avaliação de fixture`,
		});

		return {
			surface: "review",
			ids: { review: id, order: o.orderId, client: base.clientId },
			orderNumber: o.orderNumber,
			route: `/dashboard/reviews/${id}`,
		};
	},
};

function isSurface(value: string | undefined): value is Surface {
	return value !== undefined && Object.hasOwn(SURFACES, value);
}

const CLI = "bun run --cwd packages/db db:fixtures";
const USAGE = `[fixtures] uso: ${CLI} create <${FIXTURE_SURFACES.join("|")}> [--branch <id>] [--run <run>] [--age <horas>] | ${CLI} cleanup --run <run> | ${CLI} cleanup --all`;

function flagValue(args: string[], flag: string): string | undefined {
	const at = args.indexOf(flag);

	if (at === -1) {
		return;
	}

	const value = args[at + 1];

	if (!value || value.startsWith("--")) {
		throw new Error(`[fixtures] ${flag} exige um valor. ${USAGE}`);
	}

	return value;
}

async function create(args: string[]): Promise<void> {
	const [surface] = args;

	if (!isSurface(surface)) {
		throw new Error(
			`[fixtures] superfície inválida: "${surface ?? ""}". ${USAGE}`
		);
	}

	const runRaw = flagValue(args, "--run");
	const run = runRaw === undefined ? newRunId() : parseRunId(runRaw);

	const ageRaw = flagValue(args, "--age");

	const opts: CreateOptions = {
		ageHours: ageRaw === undefined ? undefined : parseAgeHours(ageRaw),
		branchId: flagValue(args, "--branch"),
		marks: runMarks(run),
		run,
	};

	const created = await db.transaction((tx) => SURFACES[surface](tx, opts));
	console.log(
		JSON.stringify(
			{ run, ...created, cleanup: `${CLI} cleanup --run ${run}` },
			null,
			2
		)
	);
}

function parseScope(args: string[]): CleanupScope {
	const runRaw = flagValue(args, "--run");

	if (args.includes("--all") === (runRaw !== undefined)) {
		throw new Error(USAGE);
	}

	return runRaw === undefined
		? { kind: "all" }
		: { kind: "run", run: parseRunId(runRaw) };
}

async function cleanup(args: string[]): Promise<void> {
	const scope = parseScope(args);
	const { blockers, steps } = cleanupPlan(scope);

	const counts = await db.transaction(async (tx) => {
		const found: string[] = [];

		for (const blocker of blockers) {
			const rows = await tx
				.select({ id: blocker.id })
				.from(blocker.fk.table)
				.where(blocker.where);

			if (rows.length > 0) {
				const fk = `${getTableName(blocker.fk.table)}.${blocker.fk.name}`;
				found.push(`  ${fk}: ${rows.map((r) => r.id).join(", ")}`);
			}
		}

		if (found.length > 0) {
			throw new Error(
				[
					"[fixtures] cleanup abortado, nada foi apagado. O app gravou reembolso ou movimento de estoque sobre a fixture:",
					...found,
					"O stock_level da variante real mudou por uma venda que a fixture nunca debitou. Estorne o stock_level à mão, apague essas linhas e rode o cleanup de novo.",
				].join("\n")
			);
		}

		const result: Record<string, number> = {};

		for (const step of steps) {
			const deleted = await tx.delete(step.table).where(step.where);
			result[getTableName(step.table)] = deleted.rowCount ?? 0;
		}

		return result;
	});

	console.log(JSON.stringify({ scope, deleted: counts }, null, 2));
}

async function main(): Promise<void> {
	const [command, ...rest] = process.argv.slice(2);

	if (command === "create") {
		await create(rest);
	} else if (command === "cleanup") {
		await cleanup(rest);
	} else {
		throw new Error(USAGE);
	}
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err instanceof Error ? err.message : err);
		process.exit(1);
	});
