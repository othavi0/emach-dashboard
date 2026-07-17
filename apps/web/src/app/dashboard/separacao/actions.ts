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
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { isCapabilityError } from "@/lib/action-error";
import type { ActionResult } from "@/lib/action-result";
import { getUserBranchScope, orderInScope } from "@/lib/branch-scope";
import { getPgError } from "@/lib/db-error";
import { logger } from "@/lib/logger";
import { requireCapability } from "@/lib/permissions";
import { bulkSkipReasonFromError } from "../orders/_lib/bulk-eligibility";
import { lockOrderAndAuthorize } from "../orders/actions";
import {
	BULK_PICKING_SKIP_LABEL,
	bulkStartPickingSkipReason,
	canFinalizePicking,
	matchPickItem,
} from "./_lib/picking-logic";
import {
	fetchPickingQueuePage,
	getActivePickingForUser,
	getOrderBranchId,
	getPickingForOrder,
} from "./data";
import { bulkStartPickingSchema, type ScanResult } from "./schema";

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function revalidatePickingPaths(orderId: string): void {
	revalidatePath("/dashboard/separacao");
	revalidatePath(`/dashboard/separacao/${orderId}`);
	revalidatePath(`/dashboard/orders/${orderId}`);
}

type PickingRow = typeof orderPicking.$inferSelect;
interface SessionUser {
	id: string;
	name?: string | null;
	role?: string | null;
}

function assertInProgress(picking: PickingRow): void {
	if (picking.status !== "in_progress") {
		throw new Error("Sessão de separação não está em andamento");
	}
}

function assertOwner(picking: PickingRow, user: SessionUser): void {
	if (picking.pickerUserId !== user.id) {
		throw new Error(
			`Apenas quem iniciou a separação (${picking.pickerName}) pode operá-la`
		);
	}
}

function canManageOthersSession(user: SessionUser): boolean {
	return user.role === "admin" || user.role === "super_admin";
}

const ORDER_LEFT_PREPARING_ERROR =
	"O pedido foi cancelado ou alterado — a sessão de separação foi encerrada.";

/**
 * Guard P1 (spec 2026-07-15): o ecommerce pode cancelar/estornar o pedido
 * durante uma sessão ativa. Se o status travado não é mais "preparing",
 * encerra a sessão (auditada como Sistema) e retorna true — o caller então
 * retorna erro amigável SEM throw (throw daria rollback no próprio
 * encerramento). NÃO aplicar em cancelPicking: cancelar a sessão de um
 * pedido cancelado é exatamente a ação de limpeza.
 */
async function autoCancelIfOrderLeftPreparing(
	tx: Tx,
	pickingId: string,
	orderStatus: string
): Promise<boolean> {
	if (orderStatus === "preparing") {
		return false;
	}
	await tx
		.update(orderPicking)
		.set({
			status: "canceled",
			canceledByUserId: null,
			canceledByName: "Sistema",
			canceledAt: new Date(),
			cancelReason: `Pedido saiu de preparação (${orderStatus}) durante a separação`,
		})
		.where(eq(orderPicking.id, pickingId));
	return true;
}

async function createPickingItems(
	tx: Tx,
	pickingId: string,
	orderId: string
): Promise<void> {
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
			pickingId,
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
}

/**
 * Miolo compartilhado de criação de sessão (startPicking + bulkStartPicking):
 * insere a sessão in_progress no nome do ator, copia os itens do pedido e,
 * quando o pedido ainda está "paid", transiciona pra "preparing" com history.
 * O caller já validou status (paid/preparing) e branchId (non-null) antes de
 * chamar — esta função não repete essas checagens.
 */
async function createPickingSession(
	tx: Tx,
	orderId: string,
	branchId: string,
	status: string,
	user: SessionUser
): Promise<string> {
	const newPickingId = crypto.randomUUID();

	await tx.insert(orderPicking).values({
		id: newPickingId,
		orderId,
		branchId,
		status: "in_progress",
		pickerUserId: user.id,
		pickerName: user.name ?? user.id,
	});

	await createPickingItems(tx, newPickingId, orderId);

	// If paid → transition to preparing
	if (status === "paid") {
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
			actorUserId: user.id,
		});
	}

	return newPickingId;
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

			return await createPickingSession(
				tx,
				orderId,
				locked.branchId,
				locked.status,
				locked.session.user
			);
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
// bulkStartPicking
// ---------------------------------------------------------------------------

export interface BulkStartPickingResult {
	moved: number;
	movedIds: string[];
	skipped: { number: string; reason: string }[];
}

const BULK_PICKING_GENERIC_ERROR = "Erro ao iniciar separação em lote.";

/**
 * Claim em lote da tab "A separar" (D7/D12, spec 2026-07-16): cria uma sessão
 * de picking in_progress no nome do ator para cada pedido, uma transação por
 * pedido (lock + capability branch-scoped via lockOrderAndAuthorize). Reusa o
 * miolo de startPicking (createPickingSession) e a régua de elegibilidade via
 * bulkStartPickingSkipReason — pedido inelegível é pulado, nunca derruba o
 * lote (padrão de bulkStartSeparation). A corrida contra outro claim (D12) é
 * coberta duas vezes: pré-check de sessão in_progress existente (caminho
 * comum) e catch do 23505 de order_picking_one_active (última defesa).
 */
export async function bulkStartPicking(input: {
	orderIds: string[];
}): Promise<ActionResult<BulkStartPickingResult>> {
	const parsed = bulkStartPickingSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "Entrada inválida",
		};
	}

	const orderIds = Array.from(new Set(parsed.data.orderIds));
	let moved = 0;
	const movedIds: string[] = [];
	const skipped: { number: string; reason: string }[] = [];

	try {
		// Fail-fast global: sem a capability nem adianta iterar (padrão de
		// bulkStartSeparation). A autorização por pedido/filial roda de novo
		// dentro de lockOrderAndAuthorize — este check só evita processar o
		// lote inteiro quando o ator não tem a capability de forma alguma.
		await requireCapability("orders.pick");

		try {
			for (const orderId of orderIds) {
				const fallbackLabel = orderId.slice(0, 8);
				try {
					await db.transaction(async (tx: Tx) => {
						const locked = await lockOrderAndAuthorize(
							tx,
							"orders.pick",
							orderId
						);
						if (!locked) {
							skipped.push({ number: fallbackLabel, reason: "não encontrado" });
							return;
						}

						const [row] = await tx
							.select({ number: order.number })
							.from(order)
							.where(eq(order.id, orderId))
							.limit(1);
						const label = row?.number ?? fallbackLabel;

						const reason = bulkStartPickingSkipReason(locked);
						if (reason) {
							skipped.push({
								number: label,
								reason: BULK_PICKING_SKIP_LABEL[reason],
							});
							return;
						}

						if (!locked.branchId) {
							// Inatingível: bulkStartPickingSkipReason já retornou
							// "sem_filial" acima quando branchId é null. Mantido só
							// para o TypeScript estreitar `string | null` → `string`.
							skipped.push({
								number: label,
								reason: BULK_PICKING_SKIP_LABEL.sem_filial,
							});
							return;
						}
						const branchId = locked.branchId;

						const [existingSession] = await tx
							.select({ id: orderPicking.id })
							.from(orderPicking)
							.where(
								and(
									eq(orderPicking.orderId, orderId),
									eq(orderPicking.status, "in_progress")
								)
							)
							.limit(1);
						if (existingSession) {
							skipped.push({ number: label, reason: "já em separação" });
							return;
						}

						await createPickingSession(
							tx,
							orderId,
							branchId,
							locked.status,
							locked.session.user
						);

						moved += 1;
						movedIds.push(orderId);
					});
				} catch (error) {
					const pgErr = getPgError(error);
					if (
						pgErr?.code === "23505" &&
						pgErr.constraint === "order_picking_one_active"
					) {
						skipped.push({ number: fallbackLabel, reason: "já em separação" });
						continue;
					}
					const skipReason = bulkSkipReasonFromError(error);
					if (skipReason) {
						skipped.push({ number: fallbackLabel, reason: skipReason });
						continue;
					}
					throw error;
				}
			}
		} finally {
			// Escritas parciais já commitadas por pedido processado antes de um
			// abort no meio do lote (erro de infra) precisam refletir no cache,
			// mesmo quando o retorno abaixo é {ok:false} (padrão de bulkStartSeparation).
			for (const id of movedIds) {
				revalidatePickingPaths(id);
			}
		}

		return { ok: true, data: { moved, movedIds, skipped } };
	} catch (error) {
		logger.error("bulkStartPicking", error);

		if (isCapabilityError(error)) {
			return { ok: false, error: "Sem permissão para iniciar separação." };
		}

		return { ok: false, error: BULK_PICKING_GENERIC_ERROR };
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
		let orderId: string | undefined;
		let orderLeft = false;

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

			orderId = picking.orderId;

			if (picking.status !== "in_progress") {
				throw new Error("Sessão de separação não está em andamento");
			}

			assertOwner(picking, locked.session.user);

			if (await autoCancelIfOrderLeftPreparing(tx, picking.id, locked.status)) {
				orderLeft = true;
				return;
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

			// Item já completo (e sem pendência) → nada a bipar.
			const alreadyFull = matched.qtyPicked >= matched.qtyExpected;
			if (!matched.notFound && alreadyFull) {
				return { kind: "already_complete" } satisfies ScanResult;
			}

			// Re-bipar um item antes marcado como ausente LIMPA a pendência
			// (resolve a exceção). Incrementa qtyPicked se ainda houver espaço.
			const newQtyPicked = alreadyFull
				? matched.qtyPicked
				: matched.qtyPicked + 1;

			await tx
				.update(orderPickingItem)
				.set({
					qtyPicked: newQtyPicked,
					notFound: false,
					lastScannedAt: new Date(),
				})
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

		if (orderLeft || scanResult === undefined) {
			if (orderId) {
				revalidatePickingPaths(orderId);
			}
			return { ok: false, error: ORDER_LEFT_PREPARING_ERROR };
		}

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
		let orderLeft = false;

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

			assertInProgress(picking);
			assertOwner(picking, locked.session.user);

			orderId = picking.orderId;

			if (await autoCancelIfOrderLeftPreparing(tx, picking.id, locked.status)) {
				orderLeft = true;
				return;
			}

			// Mark item as not found
			await tx
				.update(orderPickingItem)
				.set({ notFound: true })
				.where(eq(orderPickingItem.id, pickingItemId));

			// P0: NÃO trava a sessão inteira em 'exception'. O item fica marcado como
			// ausente, mas a sessão continua 'in_progress' — o operador segue bipando
			// os demais itens (a UI já mantém o ScanInput ativo). A pendência só vira
			// status 'exception' na finalização (completePicking). Guardamos o motivo.
			await tx
				.update(orderPicking)
				.set({ exceptionReason: reason })
				.where(eq(orderPicking.id, item.pickingId));
		});

		if (orderId) {
			revalidatePickingPaths(orderId);
		}

		if (orderLeft) {
			return { ok: false, error: ORDER_LEFT_PREPARING_ERROR };
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
// confirmItemManually
// ---------------------------------------------------------------------------

const MIN_MANUAL_REASON_LENGTH = 10;

/**
 * Confirma unidades de um item SEM bipe (issue #325): etiqueta física
 * ilegível/danificada ou variante legada sem barcode. Espelha reportMissing
 * (gates + guards), mas incrementa qtyPicked e registra 1 scan por unidade
 * com manual=true + manualReason — o relatório de produtividade (#324)
 * distingue bipe real de confirmação manual.
 */
export async function confirmItemManually(
	pickingItemId: string,
	qty: number,
	reason: string
): Promise<ActionResult<{ qtyPicked: number; qtyExpected: number }>> {
	try {
		const trimmedReason = reason.trim();
		if (trimmedReason.length < MIN_MANUAL_REASON_LENGTH) {
			return {
				ok: false,
				error: `Informe um motivo com pelo menos ${MIN_MANUAL_REASON_LENGTH} caracteres`,
			};
		}
		if (!Number.isInteger(qty) || qty < 1) {
			return { ok: false, error: "Quantidade inválida" };
		}

		let orderId: string | undefined;
		let orderLeft = false;
		let updated: { qtyPicked: number; qtyExpected: number } | undefined;

		await db.transaction(async (tx: Tx) => {
			const [item] = await tx
				.select()
				.from(orderPickingItem)
				.where(eq(orderPickingItem.id, pickingItemId))
				.limit(1);

			if (!item) {
				throw new Error("Item de separação não encontrado");
			}

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

			assertInProgress(picking);
			assertOwner(picking, locked.session.user);

			orderId = picking.orderId;

			if (await autoCancelIfOrderLeftPreparing(tx, picking.id, locked.status)) {
				orderLeft = true;
				return;
			}

			const remaining = item.qtyExpected - item.qtyPicked;
			if (remaining <= 0) {
				throw new Error("Item já está completo — nada a confirmar");
			}
			if (qty > remaining) {
				throw new Error(
					`Quantidade acima do restante (falta${remaining === 1 ? "" : "m"} ${remaining})`
				);
			}

			const newQtyPicked = item.qtyPicked + qty;

			// Paridade com o re-bipe: confirmar manualmente LIMPA a pendência
			// de item ausente (o item está fisicamente na mão).
			await tx
				.update(orderPickingItem)
				.set({
					qtyPicked: newQtyPicked,
					notFound: false,
					lastScannedAt: new Date(),
				})
				.where(eq(orderPickingItem.id, pickingItemId));

			const { session } = locked;
			for (let i = 0; i < qty; i++) {
				await tx.insert(orderPickingScan).values({
					id: crypto.randomUUID(),
					pickingId: item.pickingId,
					pickingItemId,
					variantId: item.variantId,
					scannedCode: "manual",
					manual: true,
					manualReason: trimmedReason,
					scannedBy: session.user.id,
					scannedByName: session.user.name ?? session.user.id,
				});
			}

			updated = { qtyPicked: newQtyPicked, qtyExpected: item.qtyExpected };
		});

		if (orderId) {
			revalidatePickingPaths(orderId);
		}

		if (orderLeft) {
			return { ok: false, error: ORDER_LEFT_PREPARING_ERROR };
		}

		if (!updated) {
			throw new Error("Erro ao confirmar item manualmente");
		}

		return { ok: true, data: updated };
	} catch (error) {
		logger.error("confirmItemManually", error);

		if (isCapabilityError(error)) {
			return { ok: false, error: "Sem permissão para confirmar item." };
		}

		return {
			ok: false,
			error:
				error instanceof Error
					? error.message
					: "Erro ao confirmar item manualmente",
		};
	}
}

// ---------------------------------------------------------------------------
// completePicking
// ---------------------------------------------------------------------------

export async function completePicking(
	pickingId: string
): Promise<ActionResult<{ finalStatus: "completed" | "exception" }>> {
	try {
		let orderId: string | undefined;
		let finalStatus: "completed" | "exception" | undefined;
		let orderLeft = false;

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

			assertOwner(picking, locked.session.user);

			if (await autoCancelIfOrderLeftPreparing(tx, picking.id, locked.status)) {
				orderLeft = true;
				return;
			}

			// Load items to check completion
			const items = await tx
				.select()
				.from(orderPickingItem)
				.where(eq(orderPickingItem.pickingId, pickingId));

			// canFinalizePicking checa qtyPicked/qtyExpected/notFound — sem barcode.
			const pickItems = items.map((pi) => ({
				id: pi.id,
				variantId: pi.variantId,
				barcode: null,
				qtyExpected: pi.qtyExpected,
				qtyPicked: pi.qtyPicked,
				notFound: pi.notFound,
			}));

			// Finalizável quando todo item está bipado OU marcado como ausente.
			if (!canFinalizePicking(pickItems)) {
				throw new Error(
					"Bipe os itens restantes ou reporte-os como ausentes antes de finalizar"
				);
			}

			// Sem pendências → 'completed'; com item ausente → 'exception' (terminal).
			finalStatus = pickItems.some((it) => it.notFound)
				? "exception"
				: "completed";

			await tx
				.update(orderPicking)
				.set({ status: finalStatus, completedAt: new Date() })
				.where(eq(orderPicking.id, pickingId));
		});

		if (orderId) {
			revalidatePickingPaths(orderId);
		}

		if (orderLeft) {
			return { ok: false, error: ORDER_LEFT_PREPARING_ERROR };
		}

		if (!finalStatus) {
			throw new Error("Erro ao concluir separação");
		}

		return { ok: true, data: { finalStatus } };
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

export async function cancelPicking(
	pickingId: string,
	reason?: string
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

			assertInProgress(picking);
			const { session } = locked;
			if (
				picking.pickerUserId !== session.user.id &&
				!canManageOthersSession(session.user)
			) {
				throw new Error(
					"Apenas quem iniciou a separação ou um admin pode cancelá-la"
				);
			}

			await tx
				.update(orderPicking)
				.set({
					status: "canceled",
					canceledByUserId: session.user.id,
					canceledByName: session.user.name ?? session.user.id,
					canceledAt: new Date(),
					cancelReason: reason ?? null,
				})
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
// takeoverPicking
// ---------------------------------------------------------------------------

export async function takeoverPicking(
	pickingId: string
): Promise<ActionResult<{ pickingId: string }>> {
	try {
		let orderId: string | undefined;
		const newPickingId = await db.transaction(async (tx: Tx) => {
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

			const { session } = locked;
			assertInProgress(picking);

			if (!canManageOthersSession(session.user)) {
				throw new Error(
					"Apenas admin ou super admin pode assumir uma separação"
				);
			}

			if (picking.pickerUserId === session.user.id) {
				throw new Error("A sessão já é sua — continue a separação");
			}

			orderId = picking.orderId;
			const actorName = session.user.name ?? session.user.id;

			// Cancela a sessão do outro (auditado) e abre uma nova do zero — quem
			// assume re-confere fisicamente, então não herda qtyPicked.
			await tx
				.update(orderPicking)
				.set({
					status: "canceled",
					canceledByUserId: session.user.id,
					canceledByName: actorName,
					canceledAt: new Date(),
					cancelReason: `Assumida por ${actorName}`,
				})
				.where(eq(orderPicking.id, pickingId));

			const createdId = crypto.randomUUID();

			await tx.insert(orderPicking).values({
				id: createdId,
				orderId: picking.orderId,
				branchId: picking.branchId,
				status: "in_progress",
				pickerUserId: session.user.id,
				pickerName: actorName,
			});

			await createPickingItems(tx, createdId, picking.orderId);

			return createdId;
		});

		if (orderId) {
			revalidatePickingPaths(orderId);
		}

		return { ok: true, data: { pickingId: newPickingId } };
	} catch (error) {
		logger.error("takeoverPicking", error);

		if (isCapabilityError(error)) {
			return { ok: false, error: "Sem permissão para assumir separação." };
		}

		return {
			ok: false,
			error:
				error instanceof Error ? error.message : "Erro ao assumir separação",
		};
	}
}

// ---------------------------------------------------------------------------
// Read wrappers ("use server" thin wrappers with auth guard)
// ---------------------------------------------------------------------------

export async function fetchPickingQueuePageAction(args: {
	cursor: string | null;
	tab: "a_separar" | "em_separacao" | "excecoes";
}) {
	const session = await requireCapability("orders.pick");
	const scope = await getUserBranchScope(session);
	return fetchPickingQueuePage({ ...args, scope });
}

export async function getActivePickingForUserAction() {
	const session = await requireCapability("orders.pick");
	const scope = await getUserBranchScope(session);
	return getActivePickingForUser(session.user.id, scope);
}

export async function getPickingForOrderAction(orderId: string) {
	const session = await requireCapability("orders.pick");
	const scope = await getUserBranchScope(session);
	const orderRow = await getOrderBranchId(orderId);
	if (!(orderRow && orderInScope(scope, orderRow.branchId))) {
		return null;
	}
	return getPickingForOrder(orderId);
}
