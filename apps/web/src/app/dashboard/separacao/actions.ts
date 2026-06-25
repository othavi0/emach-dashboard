"use server";

import { db } from "@emach/db";
import {
	order,
	orderItem,
	orderPicking,
	orderPickingItem,
	orderPickingScan,
	orderStatusHistory,
} from "@emach/db/schema/orders";
import { toolVariant } from "@emach/db/schema/tools";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { isCapabilityError } from "@/lib/action-error";
import type { ActionResult } from "@/lib/action-result";
import type { BranchScope } from "@/lib/branch-scope";
import { getPgError } from "@/lib/db-error";
import { logger } from "@/lib/logger";
import { requireCapability } from "@/lib/permissions";
import { lockOrderAndAuthorize } from "../orders/actions";
import {
	canScanMore,
	isPickingComplete,
	matchPickItem,
} from "./_lib/picking-logic";
import {
	fetchPickingQueuePage,
	getActivePickingForUser,
	getPickingForOrder,
} from "./data";
import type { ScanResult } from "./schema";

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function revalidatePickingPaths(orderId: string): void {
	revalidatePath("/dashboard/separacao");
	revalidatePath(`/dashboard/separacao/${orderId}`);
	revalidatePath(`/dashboard/orders/${orderId}`);
}

// ---------------------------------------------------------------------------
// startPicking
// ---------------------------------------------------------------------------

export async function startPicking(
	orderId: string
): Promise<ActionResult<{ pickingId: string }>> {
	try {
		const pickingId = await db.transaction(async (tx: Tx) => {
			const locked = await lockOrderAndAuthorize(tx, "orders.pick", orderId);

			if (!locked) {
				throw new Error("Pedido não encontrado");
			}

			if (locked.status !== "paid" && locked.status !== "preparing") {
				throw new Error(
					`Não é possível iniciar separação com status "${locked.status}". Permitido: paid ou preparing.`
				);
			}

			if (!locked.branchId) {
				throw new Error("Pedido sem filial associada");
			}

			const { session } = locked;
			const newPickingId = crypto.randomUUID();

			await tx.insert(orderPicking).values({
				id: newPickingId,
				orderId,
				branchId: locked.branchId,
				status: "in_progress",
				pickerUserId: session.user.id,
				pickerName: session.user.name ?? session.user.id,
			});

			// Load order items to create picking items (left join variant for barcode fallback)
			const items = await tx
				.select({
					id: orderItem.id,
					variantId: orderItem.variantId,
					sku: orderItem.sku,
					name: orderItem.name,
					barcode: orderItem.barcode,
					voltage: orderItem.voltage,
					quantity: orderItem.quantity,
					variantBarcode: toolVariant.barcode,
				})
				.from(orderItem)
				.leftJoin(toolVariant, eq(orderItem.variantId, toolVariant.id))
				.where(eq(orderItem.orderId, orderId));

			for (const item of items) {
				await tx.insert(orderPickingItem).values({
					id: crypto.randomUUID(),
					pickingId: newPickingId,
					orderItemId: item.id,
					variantId: item.variantId,
					variantSnapshot: {
						sku: item.sku ?? null,
						name: item.name,
						// COALESCE: preferir barcode do snapshot do pedido; fallback para barcode atual da variante
						barcode: item.barcode ?? item.variantBarcode ?? null,
						voltage: item.voltage ?? null,
					},
					qtyExpected: item.quantity,
					qtyPicked: 0,
					notFound: false,
				});
			}

			// If paid → transition to preparing
			if (locked.status === "paid") {
				await tx
					.update(order)
					.set({ status: "preparing", preparingAt: new Date() })
					.where(eq(order.id, orderId));

				await tx.insert(orderStatusHistory).values({
					id: crypto.randomUUID(),
					orderId,
					fromStatus: "paid",
					toStatus: "preparing",
					actorType: "user",
					actorUserId: session.user.id,
				});
			}

			return newPickingId;
		});

		revalidatePickingPaths(orderId);
		return { ok: true, data: { pickingId } };
	} catch (error) {
		logger.error("startPicking", error);

		const pgErr = getPgError(error);
		if (
			pgErr?.code === "23505" &&
			pgErr.constraint === "order_picking_one_active"
		) {
			return {
				ok: false,
				error: "Já existe uma separação em andamento para este pedido",
			};
		}

		if (isCapabilityError(error)) {
			return { ok: false, error: "Sem permissão para iniciar separação." };
		}

		return {
			ok: false,
			error:
				error instanceof Error ? error.message : "Erro ao iniciar separação",
		};
	}
}

// ---------------------------------------------------------------------------
// scanItem
// ---------------------------------------------------------------------------

export async function scanItem(
	pickingId: string,
	code: string
): Promise<ActionResult<ScanResult>> {
	try {
		const scanResult = await db.transaction(async (tx: Tx) => {
			// Load picking to get orderId
			const [picking] = await tx
				.select()
				.from(orderPicking)
				.where(eq(orderPicking.id, pickingId))
				.limit(1);

			if (!picking) {
				throw new Error("Sessão de separação não encontrada");
			}

			const locked = await lockOrderAndAuthorize(
				tx,
				"orders.pick",
				picking.orderId
			);

			if (!locked) {
				throw new Error("Pedido não encontrado");
			}

			if (picking.status !== "in_progress") {
				throw new Error("Sessão de separação não está em andamento");
			}

			// Load picking items
			const pickingItems = await tx
				.select()
				.from(orderPickingItem)
				.where(eq(orderPickingItem.pickingId, pickingId));

			// Try to find variant by barcode for fallback matching
			const [variantRow] = await tx
				.select({ id: toolVariant.id })
				.from(toolVariant)
				.where(eq(toolVariant.barcode, code))
				.limit(1);

			const variantIdFromBarcode = variantRow?.id ?? null;

			// Build PickItem array from picking items (using variantSnapshot for barcode)
			const pickItems = pickingItems.map((pi) => {
				const snap = (pi.variantSnapshot ?? {}) as {
					sku?: string | null;
					name?: string;
					barcode?: string | null;
					voltage?: string | null;
				};
				return {
					id: pi.id,
					variantId: pi.variantId,
					barcode: snap.barcode ?? null,
					qtyExpected: pi.qtyExpected,
					qtyPicked: pi.qtyPicked,
					notFound: pi.notFound,
				};
			});

			const matchResult = matchPickItem(pickItems, code, variantIdFromBarcode);

			if ("error" in matchResult) {
				return { kind: "not_in_order" } satisfies ScanResult;
			}

			const matched = matchResult.item;

			if (!canScanMore(matched)) {
				return { kind: "already_complete" } satisfies ScanResult;
			}

			const newQtyPicked = matched.qtyPicked + 1;

			// Update qtyPicked
			await tx
				.update(orderPickingItem)
				.set({ qtyPicked: newQtyPicked, lastScannedAt: new Date() })
				.where(eq(orderPickingItem.id, matched.id));

			// Insert scan record
			const { session } = locked;
			await tx.insert(orderPickingScan).values({
				id: crypto.randomUUID(),
				pickingId,
				pickingItemId: matched.id,
				variantId: variantIdFromBarcode ?? matched.variantId,
				scannedCode: code,
				scannedBy: session.user.id,
				scannedByName: session.user.name ?? session.user.id,
			});

			return {
				kind: "accepted",
				pickingItemId: matched.id,
				qtyPicked: newQtyPicked,
				qtyExpected: matched.qtyExpected,
			} satisfies ScanResult;
		});

		// scanItem é hot-path (N bipagens por sessão): não revalida aqui.
		// Revalidação ocorre em completePicking / reportMissing / cancelPicking.
		return { ok: true, data: scanResult };
	} catch (error) {
		logger.error("scanItem", error);

		if (isCapabilityError(error)) {
			return { ok: false, error: "Sem permissão para escanear item." };
		}

		return {
			ok: false,
			error: error instanceof Error ? error.message : "Erro ao escanear item",
		};
	}
}

// ---------------------------------------------------------------------------
// reportMissing
// ---------------------------------------------------------------------------

export async function reportMissing(
	pickingItemId: string,
	reason: string
): Promise<ActionResult> {
	try {
		let orderId: string | undefined;

		await db.transaction(async (tx: Tx) => {
			// Load picking item to get pickingId
			const [item] = await tx
				.select()
				.from(orderPickingItem)
				.where(eq(orderPickingItem.id, pickingItemId))
				.limit(1);

			if (!item) {
				throw new Error("Item de separação não encontrado");
			}

			// Load picking to get orderId
			const [picking] = await tx
				.select()
				.from(orderPicking)
				.where(eq(orderPicking.id, item.pickingId))
				.limit(1);

			if (!picking) {
				throw new Error("Sessão de separação não encontrada");
			}

			const locked = await lockOrderAndAuthorize(
				tx,
				"orders.pick",
				picking.orderId
			);

			if (!locked) {
				throw new Error("Pedido não encontrado");
			}

			orderId = picking.orderId;

			// Mark item as not found
			await tx
				.update(orderPickingItem)
				.set({ notFound: true })
				.where(eq(orderPickingItem.id, pickingItemId));

			// Set picking to exception
			await tx
				.update(orderPicking)
				.set({ status: "exception", exceptionReason: reason })
				.where(eq(orderPicking.id, item.pickingId));
		});

		if (orderId) {
			revalidatePickingPaths(orderId);
		}

		return { ok: true, data: undefined };
	} catch (error) {
		logger.error("reportMissing", error);

		if (isCapabilityError(error)) {
			return { ok: false, error: "Sem permissão para reportar item ausente." };
		}

		return {
			ok: false,
			error:
				error instanceof Error
					? error.message
					: "Erro ao reportar item ausente",
		};
	}
}

// ---------------------------------------------------------------------------
// completePicking
// ---------------------------------------------------------------------------

export async function completePicking(
	pickingId: string
): Promise<ActionResult> {
	try {
		let orderId: string | undefined;

		await db.transaction(async (tx: Tx) => {
			// Load picking
			const [picking] = await tx
				.select()
				.from(orderPicking)
				.where(eq(orderPicking.id, pickingId))
				.limit(1);

			if (!picking) {
				throw new Error("Sessão de separação não encontrada");
			}

			const locked = await lockOrderAndAuthorize(
				tx,
				"orders.pick",
				picking.orderId
			);

			if (!locked) {
				throw new Error("Pedido não encontrado");
			}

			orderId = picking.orderId;

			if (picking.status !== "in_progress") {
				throw new Error("Sessão de separação não está em andamento");
			}

			// Load items to check completion
			const items = await tx
				.select()
				.from(orderPickingItem)
				.where(eq(orderPickingItem.pickingId, pickingId));

			// isPickingComplete only checks qtyPicked/qtyExpected/notFound — no barcode needed
			const pickItems = items.map((pi) => ({
				id: pi.id,
				variantId: pi.variantId,
				barcode: null,
				qtyExpected: pi.qtyExpected,
				qtyPicked: pi.qtyPicked,
				notFound: pi.notFound,
			}));

			if (!isPickingComplete(pickItems)) {
				throw new Error(
					"Conclua a conferência de todos os itens antes de finalizar"
				);
			}

			await tx
				.update(orderPicking)
				.set({ status: "completed", completedAt: new Date() })
				.where(eq(orderPicking.id, pickingId));
		});

		if (orderId) {
			revalidatePickingPaths(orderId);
		}

		return { ok: true, data: undefined };
	} catch (error) {
		logger.error("completePicking", error);

		if (isCapabilityError(error)) {
			return { ok: false, error: "Sem permissão para concluir separação." };
		}

		return {
			ok: false,
			error:
				error instanceof Error ? error.message : "Erro ao concluir separação",
		};
	}
}

// ---------------------------------------------------------------------------
// cancelPicking
// ---------------------------------------------------------------------------

export async function cancelPicking(pickingId: string): Promise<ActionResult> {
	try {
		let orderId: string | undefined;

		await db.transaction(async (tx: Tx) => {
			// Load picking
			const [picking] = await tx
				.select()
				.from(orderPicking)
				.where(eq(orderPicking.id, pickingId))
				.limit(1);

			if (!picking) {
				throw new Error("Sessão de separação não encontrada");
			}

			const locked = await lockOrderAndAuthorize(
				tx,
				"orders.pick",
				picking.orderId
			);

			if (!locked) {
				throw new Error("Pedido não encontrado");
			}

			orderId = picking.orderId;

			await tx
				.update(orderPicking)
				.set({ status: "canceled" })
				.where(eq(orderPicking.id, pickingId));
		});

		if (orderId) {
			revalidatePickingPaths(orderId);
		}

		return { ok: true, data: undefined };
	} catch (error) {
		logger.error("cancelPicking", error);

		if (isCapabilityError(error)) {
			return { ok: false, error: "Sem permissão para cancelar separação." };
		}

		return {
			ok: false,
			error:
				error instanceof Error ? error.message : "Erro ao cancelar separação",
		};
	}
}

// ---------------------------------------------------------------------------
// Read wrappers ("use server" thin wrappers with auth guard)
// ---------------------------------------------------------------------------

export async function fetchPickingQueuePageAction(args: {
	cursor: string | null;
	scope: BranchScope;
	tab: "a_separar" | "em_separacao" | "excecoes";
}) {
	await requireCapability("orders.pick");
	return fetchPickingQueuePage(args);
}

export async function getActivePickingForUserAction(
	userId: string,
	scope: BranchScope
) {
	await requireCapability("orders.pick");
	return getActivePickingForUser(userId, scope);
}

export async function getPickingForOrderAction(orderId: string) {
	await requireCapability("orders.pick");
	return getPickingForOrder(orderId);
}
