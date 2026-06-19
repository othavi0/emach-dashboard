"use server";

import type { DashboardSession } from "@emach/auth/dashboard";
import { db } from "@emach/db";
import { branch } from "@emach/db/schema/inventory";
import {
	type OrderStatus,
	order,
	orderEvent,
	orderNote,
	orderStatusHistory,
} from "@emach/db/schema/orders";
import { eq } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import type { ActivityEvent } from "@/components/activity-feed";
import type { PendingRow } from "@/components/pending-panel";
import { isCapabilityError } from "@/lib/action-error";
import type { ActionResult } from "@/lib/action-result";
import { getUserBranchScope } from "@/lib/branch-scope";
import type { InfiniteResult } from "@/lib/infinite";
import { logger } from "@/lib/logger";
import {
	type Capability,
	requireCapability,
	requireCapabilityWithContext,
} from "@/lib/permissions";
import { applyStockReturns } from "./_lib/stock-returns";
import {
	fetchOrdersPage as fetchOrdersPageImpl,
	ORDERS_COUNTS_TAG,
	type OrderListItem,
	type OrdersPageFiltersInput,
} from "./data";
import {
	fetchOrderActivityPage as fetchOrderActivityPageImpl,
	fetchPendingOrdersPage as fetchPendingOrdersPageImpl,
} from "./pending-data";
import {
	type AddOrderNoteInput,
	type AssignBranchInput,
	addOrderNoteSchema,
	assignBranchSchema,
	capForStatus,
	type MarkShippingReviewedInput,
	markShippingReviewedSchema,
	type RefundOrderInput,
	refundOrderSchema,
	type TogglePinNoteInput,
	togglePinNoteSchema,
	type UpdateOrderStatusInput,
	type UpdateTrackingCodeInput,
	updateOrderStatusSchema,
	updateTrackingCodeSchema,
	VALID_TRANSITIONS,
} from "./schema";

const ORDERS_PATH = "/dashboard/orders";

export async function fetchOrdersPage(args: {
	filters: OrdersPageFiltersInput;
	cursor: string | null;
}): Promise<InfiniteResult<OrderListItem>> {
	await requireCapability("orders.read");
	return await fetchOrdersPageImpl(args);
}

export async function fetchPendingOrdersPage(args: {
	statuses: OrderStatus[];
	cursor: string | null;
}): Promise<InfiniteResult<PendingRow>> {
	await requireCapability("orders.read");
	return await fetchPendingOrdersPageImpl(args);
}

export async function fetchPendingAwaitingOrdersPage(
	cursor: string | null
): Promise<InfiniteResult<PendingRow>> {
	await requireCapability("orders.read");
	return await fetchPendingOrdersPageImpl({
		statuses: ["paid", "pending_payment"],
		cursor,
	});
}

export async function fetchPendingFlowOrdersPage(
	cursor: string | null
): Promise<InfiniteResult<PendingRow>> {
	await requireCapability("orders.read");
	return await fetchPendingOrdersPageImpl({
		statuses: ["preparing", "shipped"],
		cursor,
	});
}

export async function fetchOrderActivityPage(
	cursor: string | null
): Promise<InfiniteResult<ActivityEvent>> {
	await requireCapability("orders.read");
	return await fetchOrderActivityPageImpl(cursor);
}

const STATUS_TIMESTAMP_MAP: Partial<Record<OrderStatus, string>> = {
	paid: "paidAt",
	preparing: "preparingAt",
	shipped: "shippedAt",
	delivered: "deliveredAt",
	canceled: "canceledAt",
	returned: "returnedAt",
	refunded: "refundedAt",
};

type OrderTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

interface LockedOrderAuth {
	branchId: string | null;
	session: DashboardSession;
	status: string;
}

/**
 * Locks the order row (`FOR UPDATE`) and runs the branch-scoped capability
 * check against the *locked* branchId — the authoritative enforcement point.
 * Keeping the lock held across the check (and the caller's mutation) closes
 * the fail-open window where a concurrent reassignment could move the order
 * to a branch outside the actor's scope between a non-locking pre-read and
 * the mutation. Returns the locked row, or null if the order doesn't exist.
 */
export async function lockOrderAndAuthorize(
	tx: OrderTx,
	cap: Capability,
	orderId: string
): Promise<LockedOrderAuth | null> {
	const [locked] = await tx
		.select({ status: order.status, branchId: order.branchId })
		.from(order)
		.where(eq(order.id, orderId))
		.for("update")
		.limit(1);

	if (!locked) {
		return null;
	}

	// The capability check runs its own read-only queries on the global `db`
	// pool (a separate connection), not on `tx` — it touches `user`/`userBranch`,
	// never the locked `order` row, so there is no deadlock with the held lock.
	let session: DashboardSession;
	if (locked.branchId === null) {
		// Pedido na triagem: capability + só quem enxerga a triagem (admin/super_admin).
		// `user` tem orders.update_status mas não pode agir sobre pedido não-roteado.
		session = await requireCapability(cap);
		const scope = await getUserBranchScope(session);
		if (scope.kind === "scoped" && !scope.includeUnassigned) {
			throw new Error(
				"Pedido na triagem só pode ser tratado por admin ou super_admin"
			);
		}
	} else {
		session = await requireCapabilityWithContext(cap, {
			targetBranchIds: [locked.branchId],
		});
	}

	return { status: locked.status, branchId: locked.branchId, session };
}

async function insertOrderEvent(
	tx: OrderTx,
	args: {
		orderId: string;
		eventType: "tracking_set" | "branch_assigned" | "shipping_reviewed";
		metadata: Record<string, unknown>;
		actorUserId: string | null;
	}
): Promise<void> {
	await tx.insert(orderEvent).values({
		id: crypto.randomUUID(),
		orderId: args.orderId,
		eventType: args.eventType,
		metadata: args.metadata,
		actorType: args.actorUserId ? "user" : "system",
		actorUserId: args.actorUserId,
	});
}

/** Monta o objeto de update do pedido para uma transição de status. */
function buildOrderStatusUpdate(
	toStatus: OrderStatus,
	trackingCode: string | undefined,
	branchId: string | undefined
): Record<string, unknown> {
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
	return updates;
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
	const cap = capForStatus(toStatus);

	try {
		await db.transaction(async (tx) => {
			// Lock the order row, then authorize against the *locked* branchId —
			// the single, authoritative branch-scope check. Reuses this one lock
			// for the mutation below; no separate non-locking pre-read is needed.
			const locked = await lockOrderAndAuthorize(tx, cap, orderId);

			if (!locked) {
				throw new Error("Pedido não encontrado");
			}

			const { session } = locked;
			const currentStatus = locked.status as OrderStatus;
			const allowed = VALID_TRANSITIONS[currentStatus];
			if (!allowed?.includes(toStatus)) {
				throw new Error(`Transição inválida: ${currentStatus} → ${toStatus}`);
			}

			// branchId is mandatory when entering "preparing"
			const resolvedBranchId = branchId ?? locked.branchId;
			if (toStatus === "preparing" && !resolvedBranchId) {
				throw new Error(
					"Filial obrigatória para iniciar a preparação do pedido"
				);
			}

			const updates = buildOrderStatusUpdate(toStatus, trackingCode, branchId);

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

			if (toStatus === "shipped" && trackingCode) {
				await insertOrderEvent(tx, {
					orderId,
					eventType: "tracking_set",
					metadata: { trackingCode },
					actorUserId: session.user.id,
				});
			}

			// Stock returns: only for "returned" status.
			// Canceled orders (especially unpaid ones) never debited stock, so we
			// must NOT credit stock back on cancellation.
			if (toStatus === "returned" && returnItems && returnItems.length > 0) {
				await applyStockReturns(
					tx,
					orderId,
					returnItems,
					session.user.id,
					"Devolução ao estoque — pedido devolvido"
				);
			}
		});

		revalidatePath(ORDERS_PATH);
		revalidateTag(ORDERS_COUNTS_TAG, "max");
		revalidatePath(`${ORDERS_PATH}/${orderId}`);
		return { ok: true, data: undefined };
	} catch (error) {
		logger.error("updateOrderStatus", error);
		// Capability failures throw "Forbidden: ..." — never leak that internal
		// prefix to the UI; surface a clean Portuguese message instead.
		if (isCapabilityError(error)) {
			return { ok: false, error: "Sem permissão para alterar este pedido." };
		}
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

	const { orderId, body } = parsed.data;

	try {
		await db.transaction(async (tx) => {
			// Lock the order row, then authorize against the locked branchId —
			// the lock is held across the check and the insert below.
			const locked = await lockOrderAndAuthorize(
				tx,
				"orders.add_note",
				orderId
			);

			if (!locked) {
				throw new Error("Pedido não encontrado");
			}

			await tx.insert(orderNote).values({
				id: crypto.randomUUID(),
				orderId,
				authorId: locked.session.user.id,
				body,
				statusAtCreation: locked.status as OrderStatus,
			});
		});

		revalidatePath(`${ORDERS_PATH}/${orderId}`);
		return { ok: true, data: undefined };
	} catch (error) {
		logger.error("addOrderNote", error);
		if (isCapabilityError(error)) {
			return { ok: false, error: "Sem permissão para alterar este pedido." };
		}
		if (error instanceof Error && error.message === "Pedido não encontrado") {
			return { ok: false, error: "Pedido não encontrado" };
		}
		return { ok: false, error: "Erro ao adicionar nota" };
	}
}

export async function togglePinNote(
	input: TogglePinNoteInput
): Promise<ActionResult> {
	const parsed = togglePinNoteSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "Entrada inválida",
		};
	}

	const { noteId, pinned } = parsed.data;

	const [existing] = await db
		.select({ orderId: orderNote.orderId })
		.from(orderNote)
		.where(eq(orderNote.id, noteId))
		.limit(1);

	if (!existing) {
		return { ok: false, error: "Nota não encontrada" };
	}

	try {
		await db.transaction(async (tx) => {
			const locked = await lockOrderAndAuthorize(
				tx,
				"orders.add_note",
				existing.orderId
			);
			if (!locked) {
				throw new Error("Pedido não encontrado");
			}
			await tx
				.update(orderNote)
				.set({ pinned })
				.where(eq(orderNote.id, noteId));
		});

		revalidatePath(`${ORDERS_PATH}/${existing.orderId}`);
		return { ok: true, data: undefined };
	} catch (error) {
		logger.error("togglePinNote", error);
		if (isCapabilityError(error)) {
			return { ok: false, error: "Sem permissão para alterar este pedido." };
		}
		return { ok: false, error: "Erro ao fixar nota" };
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

	const { orderId, branchId } = parsed.data;

	try {
		await db.transaction(async (tx) => {
			// Lock the order row and authorize against the *current* branchId —
			// closes the cross-branch hijack window (SECURITY-02).
			const locked = await lockOrderAndAuthorize(
				tx,
				"orders.update_status",
				orderId
			);

			if (!locked) {
				throw new Error("Pedido não encontrado");
			}

			// After the lock, also assert the actor can write to the *destination*
			// branch (e.g. an admin must have scope there too).
			await requireCapabilityWithContext("orders.update_status", {
				targetBranchIds: [branchId],
			});

			await tx.update(order).set({ branchId }).where(eq(order.id, orderId));

			const [branchRow] = await tx
				.select({ name: branch.name })
				.from(branch)
				.where(eq(branch.id, branchId))
				.limit(1);

			await insertOrderEvent(tx, {
				orderId,
				eventType: "branch_assigned",
				metadata: { branchId, branchName: branchRow?.name ?? branchId },
				actorUserId: locked.session.user.id, // BUG-02 fix: ação humana
			});
		});

		revalidatePath(`${ORDERS_PATH}/${orderId}`);
		return { ok: true, data: undefined };
	} catch (error) {
		logger.error("assignBranch", error);
		if (isCapabilityError(error)) {
			return { ok: false, error: "Sem permissão para alterar este pedido." };
		}
		if (error instanceof Error && error.message === "Pedido não encontrado") {
			return { ok: false, error: "Pedido não encontrado" };
		}
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

	const { orderId, trackingCode } = parsed.data;

	try {
		await db.transaction(async (tx) => {
			// Lock the order row, then authorize against the locked branchId —
			// the lock is held across the check and the mutation below.
			const locked = await lockOrderAndAuthorize(
				tx,
				"orders.update_status",
				orderId
			);

			if (!locked) {
				throw new Error("Pedido não encontrado");
			}

			await tx
				.update(order)
				.set({ shippingTrackingCode: trackingCode })
				.where(eq(order.id, orderId));

			await insertOrderEvent(tx, {
				orderId,
				eventType: "tracking_set",
				metadata: { trackingCode },
				actorUserId: locked.session.user.id,
			});
		});

		revalidatePath(`${ORDERS_PATH}/${orderId}`);
		return { ok: true, data: undefined };
	} catch (error) {
		logger.error("updateTrackingCode", error);
		if (isCapabilityError(error)) {
			return { ok: false, error: "Sem permissão para alterar este pedido." };
		}
		if (error instanceof Error && error.message === "Pedido não encontrado") {
			return { ok: false, error: "Pedido não encontrado" };
		}
		return { ok: false, error: "Erro ao atualizar rastreio" };
	}
}

export async function markShippingReviewed(
	input: MarkShippingReviewedInput
): Promise<ActionResult> {
	const parsed = markShippingReviewedSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "Entrada inválida",
		};
	}

	const { orderId } = parsed.data;

	try {
		await db.transaction(async (tx) => {
			// Lock the order row, then authorize against the locked branchId —
			// the lock is held across the check and the mutation below.
			const locked = await lockOrderAndAuthorize(
				tx,
				"orders.update_status",
				orderId
			);

			if (!locked) {
				throw new Error("Pedido não encontrado");
			}

			await tx
				.update(order)
				.set({ shippingUnverified: false })
				.where(eq(order.id, orderId));

			await insertOrderEvent(tx, {
				orderId,
				eventType: "shipping_reviewed",
				metadata: {},
				actorUserId: locked.session.user.id,
			});
		});

		revalidatePath(ORDERS_PATH);
		revalidateTag(ORDERS_COUNTS_TAG, "max");
		revalidatePath(`${ORDERS_PATH}/${orderId}`);
		return { ok: true, data: undefined };
	} catch (error) {
		logger.error("markShippingReviewed", error);
		if (isCapabilityError(error)) {
			return { ok: false, error: "Sem permissão para alterar este pedido." };
		}
		if (error instanceof Error && error.message === "Pedido não encontrado") {
			return { ok: false, error: "Pedido não encontrado" };
		}
		return { ok: false, error: "Erro ao marcar frete como revisado" };
	}
}

export async function refundOrder(
	input: RefundOrderInput
): Promise<ActionResult> {
	const parsed = refundOrderSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "Entrada inválida",
		};
	}

	const { orderId, reason, creditStock, returnItems } = parsed.data;

	try {
		await db.transaction(async (tx) => {
			const locked = await lockOrderAndAuthorize(tx, "orders.refund", orderId);
			if (!locked) {
				throw new Error("Pedido não encontrado");
			}

			const { session } = locked;
			const currentStatus = locked.status as OrderStatus;
			const allowed = VALID_TRANSITIONS[currentStatus];
			if (!allowed?.includes("refunded")) {
				throw new Error(`Transição inválida: ${currentStatus} → refunded`);
			}

			await tx
				.update(order)
				.set({ status: "refunded", refundedAt: new Date() })
				.where(eq(order.id, orderId));

			await tx.insert(orderStatusHistory).values({
				id: crypto.randomUUID(),
				orderId,
				fromStatus: currentStatus,
				toStatus: "refunded",
				actorType: "user",
				actorUserId: session.user.id,
				reason,
			});

			if (creditStock && returnItems && returnItems.length > 0) {
				await applyStockReturns(
					tx,
					orderId,
					returnItems,
					session.user.id,
					"Estoque creditado em reembolso"
				);
			}
		});

		revalidatePath(ORDERS_PATH);
		revalidateTag(ORDERS_COUNTS_TAG, "max");
		revalidatePath(`${ORDERS_PATH}/${orderId}`);
		return { ok: true, data: undefined };
	} catch (error) {
		logger.error("refundOrder", error);
		if (isCapabilityError(error)) {
			return { ok: false, error: "Sem permissão para reembolsar este pedido." };
		}
		return {
			ok: false,
			error: error instanceof Error ? error.message : "Erro interno",
		};
	}
}
