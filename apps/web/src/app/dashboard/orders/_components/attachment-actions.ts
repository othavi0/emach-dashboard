"use server";

import { db } from "@emach/db";
import { orderAttachment } from "@emach/db/schema/orders";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { logger } from "@/lib/logger";
import {
	createSignedUrl,
	ORDER_DOCUMENTS_BUCKET,
	removeStorageObject,
	uploadToPrivateBucket,
} from "@/lib/storage";
import { lockOrderAndAuthorize } from "../actions";

// ─── Constants ─────────────────────────────────────────────────────────────────

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB (Next server action body limit)
const ALLOWED_TYPES = new Set([
	"application/pdf",
	"image/jpeg",
	"image/png",
	"image/webp",
]);

const ORDERS_PATH = "/dashboard/orders";

// ─── Schemas ───────────────────────────────────────────────────────────────────

const addAttachmentSchema = z.object({
	orderId: z.string().uuid("orderId inválido"),
	label: z.string().trim().max(200).optional(),
	description: z.string().trim().max(2000).optional(),
});

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Capability guards throw `Error("Forbidden: ...")` — detect those here. */
function isCapabilityError(error: unknown): boolean {
	return error instanceof Error && error.message.startsWith("Forbidden:");
}

// ─── Actions ───────────────────────────────────────────────────────────────────

/**
 * Uploads a file to the private `order-documents` bucket and inserts an
 * `order_attachment` row inside a branch-scoped, locked transaction.
 *
 * Flow:
 * 1. Validate input fields (Zod).
 * 2. Upload the file — **before** acquiring the DB lock so the lock is held
 *    for the shortest possible time.
 * 3. Open a transaction, lock the order row FOR UPDATE, authorize via
 *    `lockOrderAndAuthorize`, then insert the attachment row.
 * 4. If the transaction or authorization fails after the file was uploaded,
 *    delete the orphan object from storage.
 */
export async function addOrderAttachment(
	formData: FormData
): Promise<ActionResult<{ id: string }>> {
	// Validate non-file fields first
	const rawOrderId = formData.get("orderId");
	const rawLabel = formData.get("label");
	const rawDescription = formData.get("description");

	const parsed = addAttachmentSchema.safeParse({
		orderId: rawOrderId,
		label: rawLabel ?? undefined,
		description: rawDescription ?? undefined,
	});

	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "Entrada inválida",
		};
	}

	const { orderId, label, description } = parsed.data;

	// Upload first — keep the DB lock duration minimal
	let uploadResult: Awaited<ReturnType<typeof uploadToPrivateBucket>>;
	try {
		uploadResult = await uploadToPrivateBucket({
			bucket: ORDER_DOCUMENTS_BUCKET,
			formData,
			maxSizeBytes: MAX_SIZE_BYTES,
			allowedTypes: ALLOWED_TYPES,
			prefix: orderId,
		});
	} catch (error) {
		logger.error("addOrderAttachment: upload falhou", error);
		return {
			ok: false,
			error: error instanceof Error ? error.message : "Falha no upload",
		};
	}

	// Now open the transaction: lock order, authorize, insert row
	try {
		const id = crypto.randomUUID();

		await db.transaction(async (tx) => {
			const auth = await lockOrderAndAuthorize(
				tx,
				"orders.update_status",
				orderId
			);

			if (!auth) {
				throw new Error("Pedido não encontrado");
			}

			await tx.insert(orderAttachment).values({
				id,
				orderId,
				fileUrl: uploadResult.path,
				fileName: uploadResult.fileName,
				fileSize: uploadResult.fileSize,
				mimeType: uploadResult.mimeType,
				label: label ?? null,
				description: description ?? null,
				uploadedBy: auth.session.user.id,
			});
		});

		revalidatePath(`${ORDERS_PATH}/${orderId}`);
		return { ok: true, data: { id } };
	} catch (error) {
		// Cleanup orphan object — failure here is best-effort (log only)
		try {
			await removeStorageObject(ORDER_DOCUMENTS_BUCKET, uploadResult.path);
		} catch (cleanupErr) {
			logger.error(
				`addOrderAttachment: falha ao remover objeto órfão do storage (${uploadResult.path})`,
				cleanupErr
			);
		}

		logger.error("addOrderAttachment: transação falhou", error);

		if (isCapabilityError(error)) {
			return { ok: false, error: "Sem permissão para alterar este pedido." };
		}
		return {
			ok: false,
			error: error instanceof Error ? error.message : "Erro interno",
		};
	}
}

/**
 * Deletes an order attachment: removes the DB row inside a branch-scoped
 * locked transaction, then deletes the storage object after the commit.
 *
 * Deleting the object *after* the row commit means a storage failure leaves
 * a harmless orphan object rather than a dangling row pointing to a missing
 * file.
 */
export async function deleteOrderAttachment(
	attachmentId: string
): Promise<ActionResult> {
	// Look up the attachment row first (outside the transaction — just a read)
	const [existing] = await db
		.select({
			fileUrl: orderAttachment.fileUrl,
			orderId: orderAttachment.orderId,
		})
		.from(orderAttachment)
		.where(eq(orderAttachment.id, attachmentId))
		.limit(1);

	if (!existing) {
		return { ok: false, error: "Anexo não encontrado" };
	}

	const { orderId, fileUrl } = existing;

	try {
		await db.transaction(async (tx) => {
			const auth = await lockOrderAndAuthorize(
				tx,
				"orders.update_status",
				orderId
			);

			if (!auth) {
				throw new Error("Pedido não encontrado");
			}

			await tx
				.delete(orderAttachment)
				.where(eq(orderAttachment.id, attachmentId));
		});
	} catch (error) {
		logger.error("deleteOrderAttachment: transação falhou", error);

		if (isCapabilityError(error)) {
			return { ok: false, error: "Sem permissão para alterar este pedido." };
		}
		return {
			ok: false,
			error: error instanceof Error ? error.message : "Erro interno",
		};
	}

	// Storage delete after the row is committed — orphan object is harmless
	try {
		await removeStorageObject(ORDER_DOCUMENTS_BUCKET, fileUrl);
	} catch (error) {
		logger.error(
			`deleteOrderAttachment: falha ao remover objeto do storage (row já deletada, ${fileUrl})`,
			error
		);
	}

	revalidatePath(`${ORDERS_PATH}/${orderId}`);
	return { ok: true, data: undefined };
}

/**
 * Signs a private order attachment URL on demand.
 *
 * Re-authorizes against the attachment's actual order (never trusts a
 * client-supplied orderId) — this is the IDOR choke point.
 */
export async function signOrderAttachment(
	attachmentId: string
): Promise<ActionResult<{ url: string }>> {
	// Look up the attachment's storage path + its REAL order (never trust a client orderId)
	const [existing] = await db
		.select({
			fileUrl: orderAttachment.fileUrl,
			orderId: orderAttachment.orderId,
		})
		.from(orderAttachment)
		.where(eq(orderAttachment.id, attachmentId))
		.limit(1);

	if (!existing) {
		return { ok: false, error: "Anexo não encontrado" };
	}

	const { orderId, fileUrl } = existing;

	try {
		// Re-authorize: lockOrderAndAuthorize enforces capability + branch scope
		// against the attachment's actual order. This is the IDOR choke point.
		// Throws if the order is not found or the caller lacks permission.
		await db.transaction(async (tx) => {
			const auth = await lockOrderAndAuthorize(tx, "orders.read", orderId);
			if (!auth) {
				throw new Error("Pedido não encontrado");
			}
		});

		const url = await createSignedUrl(ORDER_DOCUMENTS_BUCKET, fileUrl);
		if (!url) {
			return { ok: false, error: "Não foi possível gerar o link do anexo" };
		}
		return { ok: true, data: { url } };
	} catch (error) {
		logger.error("signOrderAttachment: falhou", error);
		if (isCapabilityError(error)) {
			return { ok: false, error: "Sem permissão para acessar este anexo." };
		}
		return {
			ok: false,
			error: error instanceof Error ? error.message : "Erro interno",
		};
	}
}
