import { banner } from "@emach/db/schema/banner";
import { client } from "@emach/db/schema/client";
import { branch } from "@emach/db/schema/inventory";
import {
	type OrderStatus,
	order,
	orderItem,
	orderPicking,
	orderPickingItem,
	orderStatusHistory,
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
import type { Tx } from "./seed/context";

const HIDDEN_FROM_STOREFRONT = false;

const HOURS = 3_600_000;

interface CreateOptions {
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

const STATUS_PATH = [
	"paid",
	"preparing",
	"shipped",
	"delivered",
] as const satisfies readonly OrderStatus[];
type FixtureOrderStatus = (typeof STATUS_PATH)[number];

const REACHED_AT_COLUMN = {
	paid: "paidAt",
	preparing: "preparingAt",
	shipped: "shippedAt",
	delivered: "deliveredAt",
} as const satisfies Record<
	FixtureOrderStatus,
	keyof typeof order.$inferInsert
>;

async function insertFixtureOrder(
	tx: Tx,
	base: Base,
	opts: CreateOptions,
	status: FixtureOrderStatus
): Promise<{ itemId: string; orderId: string; orderNumber: string }> {
	const orderId = crypto.randomUUID();
	const itemId = crypto.randomUUID();
	const orderNumber = fixtureOrderNumber(opts.run, orderId);
	const steps = STATUS_PATH.slice(0, STATUS_PATH.indexOf(status) + 1);
	const createdAt = new Date(Date.now() - (steps.length + 1) * HOURS);
	const stepAt = (i: number) => new Date(createdAt.getTime() + (i + 1) * HOURS);

	const reachedAt: Partial<
		Record<(typeof REACHED_AT_COLUMN)[FixtureOrderStatus], Date>
	> = {};
	for (const [i, s] of steps.entries()) {
		reachedAt[REACHED_AT_COLUMN[s]] = stepAt(i);
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

	return { itemId, orderId, orderNumber };
}

type Surface = "order" | "picking-exception" | "banner" | "review";

const SURFACES: Record<
	Surface,
	(tx: Tx, opts: CreateOptions) => Promise<Created>
> = {
	order: async (tx, opts) => {
		const base = await loadBase(tx, opts);
		const o = await insertFixtureOrder(tx, base, opts, "paid");
		return {
			surface: "order",
			ids: {
				order: o.orderId,
				order_item: o.itemId,
				branch: base.branchId,
				client: base.clientId,
			},
			orderNumber: o.orderNumber,
			route: `/dashboard/orders/${o.orderId}`,
		};
	},

	"picking-exception": async (tx, opts) => {
		const base = await loadBase(tx, opts);
		const o = await insertFixtureOrder(tx, base, opts, "preparing");
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
		const o = await insertFixtureOrder(tx, base, opts, "delivered");
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
const USAGE = `[fixtures] uso: ${CLI} create <${Object.keys(SURFACES).join("|")}> [--branch <id>] [--run <run>] | ${CLI} cleanup --run <run> | ${CLI} cleanup --all`;

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
	const opts: CreateOptions = {
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
