"use server";

import { db } from "@emach/db";
import { stockLevel } from "@emach/db/schema/inventory";
import {
	type OrderStatus,
	order,
	orderItem,
	orderNote,
	orderStatusHistory,
} from "@emach/db/schema/orders";
import { stockMovement } from "@emach/db/schema/stock-movements";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import type { InfiniteResult } from "@/lib/infinite";
import { logger } from "@/lib/logger";
import { requireCapability } from "@/lib/permissions";
import {
	fetchOrdersPage as fetchOrdersPageImpl,
	type OrderListItem,
	type OrdersPageFiltersInput,
} from "./data";
import {
	type AddOrderNoteInput,
	type AssignBranchInput,
	addOrderNoteSchema,
	assignBranchSchema,
	capForStatus,
	type UpdateOrderStatusInput,
	type UpdateTrackingCodeInput,
	updateOrderStatusSchema,
	updateTrackingCodeSchema,
	VALID_TRANSITIONS,
} from "./schema";

export type ActionResult<T = undefined> =
	| { ok: true; data: T }
	| { ok: false; error: string };

const ORDERS_PATH = "/dashboard/orders";

export async function fetchOrdersPage(args: {
	filters: OrdersPageFiltersInput;
	cursor: string | null;
}): Promise<InfiniteResult<OrderListItem>> {
	return fetchOrdersPageImpl(args);
}

const STATUS_TIMESTAMP_MAP: Partial<Record<OrderStatus, string>> = {
	paid: "paidAt",
	shipped: "shippedAt",
	delivered: "deliveredAt",
	canceled: "canceledAt",
};

async function applyStockReturns(
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
	orderId: string,
	returnItems: { branchId: string; orderItemId: string }[],
	userId: string
) {
	for (const item of returnItems) {
		const [oi] = await tx
			.select({
				quantity: orderItem.quantity,
				variantId: orderItem.variantId,
			})
			.from(orderItem)
			.where(
				and(eq(orderItem.id, item.orderItemId), eq(orderItem.orderId, orderId))
			);

		if (!oi) {
			continue;
		}

		const [sl] = await tx
			.select({ quantity: stockLevel.quantity })
			.from(stockLevel)
			.where(
				and(
					eq(stockLevel.variantId, oi.variantId),
					eq(stockLevel.branchId, item.branchId)
				)
			)
			.for("update");

		const previousQty = sl?.quantity ?? 0;
		const newQty = previousQty + oi.quantity;

		await tx
			.insert(stockLevel)
			.values({
				variantId: oi.variantId,
				branchId: item.branchId,
				quantity: newQty,
				updatedAt: new Date(),
			})
			.onConflictDoUpdate({
				target: [stockLevel.variantId, stockLevel.branchId],
				set: { quantity: newQty, updatedAt: new Date() },
			});

		await tx.insert(stockMovement).values({
			id: crypto.randomUUID(),
			variantId: oi.variantId,
			branchId: item.branchId,
			previousQty,
			newQty,
			delta: oi.quantity,
			reason: "ajuste_inventario",
			reasonNote: "Devolução ao estoque — pedido cancelado/devolvido",
			orderId,
			orderItemId: item.orderItemId,
			actorType: "user",
			actorId: userId,
		});
	}
}

export async function updateOrderStatus(
	input: UpdateOrderStatusInput
): Promise<ActionResult> {
	const parsed = updateOrderStatusSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "Entrada inválida",
		};
	}

	const { orderId, toStatus, reason, trackingCode, branchId, returnItems } =
		parsed.data;
	const session = await requireCapability(capForStatus(toStatus));

	try {
		await db.transaction(async (tx) => {
			const [locked] = await tx
				.select({ status: order.status })
				.from(order)
				.where(eq(order.id, orderId))
				.for("update");

			if (!locked) {
				throw new Error("Pedido não encontrado");
			}

			const currentStatus = locked.status as OrderStatus;
			const allowed = VALID_TRANSITIONS[currentStatus];
			if (!allowed?.includes(toStatus)) {
				throw new Error(`Transição inválida: ${currentStatus} → ${toStatus}`);
			}

			const updates: Record<string, unknown> = { status: toStatus };
			const tsField = STATUS_TIMESTAMP_MAP[toStatus];
			if (tsField) {
				updates[tsField] = new Date();
			}
			if (toStatus === "shipped" && trackingCode) {
				updates.shippingTrackingCode = trackingCode;
			}
			if (toStatus === "preparing" && branchId) {
				updates.branchId = branchId;
			}

			await tx.update(order).set(updates).where(eq(order.id, orderId));

			await tx.insert(orderStatusHistory).values({
				id: crypto.randomUUID(),
				orderId,
				fromStatus: currentStatus,
				toStatus,
				actorType: "user",
				actorUserId: session.user.id,
				reason: reason ?? null,
			});

			if (
				(toStatus === "canceled" || toStatus === "returned") &&
				returnItems &&
				returnItems.length > 0
			) {
				await applyStockReturns(tx, orderId, returnItems, session.user.id);
			}
		});

		revalidatePath(ORDERS_PATH);
		revalidatePath(`${ORDERS_PATH}/${orderId}`);
		return { ok: true, data: undefined };
	} catch (error) {
		logger.error("updateOrderStatus", error);
		return {
			ok: false,
			error: error instanceof Error ? error.message : "Erro interno",
		};
	}
}

export async function addOrderNote(
	input: AddOrderNoteInput
): Promise<ActionResult> {
	const parsed = addOrderNoteSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "Entrada inválida",
		};
	}

	const session = await requireCapability("orders.add_note");
	const { orderId, body } = parsed.data;

	try {
		await db.insert(orderNote).values({
			id: crypto.randomUUID(),
			orderId,
			authorId: session.user.id,
			body,
		});

		revalidatePath(`${ORDERS_PATH}/${orderId}`);
		return { ok: true, data: undefined };
	} catch (error) {
		logger.error("addOrderNote", error);
		return { ok: false, error: "Erro ao adicionar nota" };
	}
}

export async function assignBranch(
	input: AssignBranchInput
): Promise<ActionResult> {
	const parsed = assignBranchSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "Entrada inválida",
		};
	}

	await requireCapability("orders.update_status");
	const { orderId, branchId } = parsed.data;

	try {
		await db.update(order).set({ branchId }).where(eq(order.id, orderId));

		revalidatePath(`${ORDERS_PATH}/${orderId}`);
		return { ok: true, data: undefined };
	} catch (error) {
		logger.error("assignBranch", error);
		return { ok: false, error: "Erro ao atribuir filial" };
	}
}

export async function updateTrackingCode(
	input: UpdateTrackingCodeInput
): Promise<ActionResult> {
	const parsed = updateTrackingCodeSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "Entrada inválida",
		};
	}

	await requireCapability("orders.update_status");
	const { orderId, trackingCode } = parsed.data;

	try {
		await db
			.update(order)
			.set({ shippingTrackingCode: trackingCode })
			.where(eq(order.id, orderId));

		revalidatePath(`${ORDERS_PATH}/${orderId}`);
		return { ok: true, data: undefined };
	} catch (error) {
		logger.error("updateTrackingCode", error);
		return { ok: false, error: "Erro ao atualizar rastreio" };
	}
}
