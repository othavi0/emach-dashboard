"use server";

import type { DashboardSession } from "@emach/auth/dashboard";
import { db } from "@emach/db";
import { branch } from "@emach/db/schema/inventory";
import {
	ACTIVE_REFUND_STATUSES,
	type OrderStatus,
	order,
	orderEvent,
	orderNote,
	orderStatusHistory,
	type RefundStatus,
	refundRequest,
} from "@emach/db/schema/orders";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import { isCapabilityError } from "@/lib/action-error";
import type { ActionResult } from "@/lib/action-result";
import { getUserBranchScope } from "@/lib/branch-scope";
import { getPgError } from "@/lib/db-error";
import type { InfiniteResult } from "@/lib/infinite";
import { logger } from "@/lib/logger";
import {
	type Capability,
	requireCapability,
	requireCapabilityWithContext,
} from "@/lib/permissions";
import { deriveFulfillmentState } from "../separacao/_lib/picking-logic";
import { getLatestPicking } from "../separacao/data";
import {
	BULK_SKIP_LABEL,
	bulkSkipReasonFromError,
	bulkStartSeparationSkipReason,
} from "./_lib/bulk-eligibility";
import { applyStockReturns } from "./_lib/stock-returns";
import {
	fetchOrdersPage as fetchOrdersPageImpl,
	ORDERS_COUNTS_TAG,
	type OrderListItem,
	type OrdersPageFiltersInput,
} from "./data";
import {
	type AddOrderNoteInput,
	type AssignBranchInput,
	addOrderNoteSchema,
	assignBranchSchema,
	type BulkAssignBranchInput,
	type BulkStartSeparationInput,
	bulkAssignBranchSchema,
	bulkStartSeparationSchema,
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

const STATUS_TIMESTAMP_MAP: Partial<Record<OrderStatus, string>> = {
	paid: "paidAt",
	preparing: "preparingAt",
	shipped: "shippedAt",
	delivered: "deliveredAt",
	canceled: "canceledAt",
	returned: "returnedAt",
	refunded: "refundedAt",
};

// Mensagens do gate de envio, indexadas pelo FulfillmentState que bloqueia o
// despacho (todos exceto "picked"). Não exportado: arquivo é "use server" e
// exportar uma const não-async quebra o build.
const SHIP_GATE_ERRORS: Record<
	"awaiting_picking" | "picking_in_progress" | "picking_exception",
	string
> = {
	awaiting_picking: "Conclua a separação antes de despachar o pedido",
	picking_in_progress: "Separação em andamento — conclua antes de despachar",
	picking_exception: "Separação com exceção — resolva antes de despachar",
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
		eventType:
			| "tracking_set"
			| "branch_assigned"
			| "shipping_reviewed"
			| "ship_forced";
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

/**
 * Gate de envio: bloqueia "shipped" sem a última sessão de picking completed,
 * exceto quando `forceShip` é usado (só super_admin, auditado via order_event
 * "ship_forced"). Nunca força por cima de uma separação em andamento.
 */
async function enforceShipGate(
	tx: OrderTx,
	orderId: string,
	session: DashboardSession,
	forceShip: boolean | undefined,
	forceReason: string | undefined
): Promise<void> {
	const latest = await getLatestPicking(orderId);
	const state = deriveFulfillmentState(latest?.status ?? null);

	if (forceShip) {
		if (session.user.role !== "super_admin") {
			throw new Error("Apenas super admin pode forçar envio sem separação");
		}
		if (state === "picking_in_progress") {
			throw new Error(
				`Separação em andamento por ${latest?.pickerName ?? "outro usuário"} — cancele ou assuma antes de forçar o envio`
			);
		}
		await insertOrderEvent(tx, {
			orderId,
			eventType: "ship_forced",
			metadata: { reason: forceReason },
			actorUserId: session.user.id,
		});
		return;
	}

	if (state !== "picked") {
		throw new Error(SHIP_GATE_ERRORS[state]);
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
					"Filial obrigatória para enviar o pedido para separação"
				);
			}

			if (toStatus === "shipped") {
				await enforceShipGate(
					tx,
					orderId,
					session,
					parsed.data.forceShip,
					parsed.data.forceReason
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
				reason: reason ?? parsed.data.forceReason ?? null,
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

export interface BulkStartSeparationResult {
	moved: number;
	movedIds: string[];
	skipped: { number: string; reason: string }[];
}

const BULK_GENERIC_ERROR = "Erro ao enviar pedidos para separação.";

// SQLSTATE → mensagem amigável (apps/web/CLAUDE.md): o erro cru do Postgres
// nunca chega ao toast. P0001 = RAISE EXCEPTION dos triggers do domínio.
function pgErrorMessage(pgErr: { code: string }): string {
	switch (pgErr.code) {
		case "23503":
			return "Pedido referencia um registro que não existe mais.";
		case "23505":
			return "Este pedido já foi enviado para separação.";
		case "P0001":
			return "O pedido não pode ir para separação neste estado.";
		default:
			return BULK_GENERIC_ERROR;
	}
}

/**
 * Bulk pago→separação (spec 2026-07-11). Cada pedido roda em transação
 * própria com lock + capability branch-scoped; inelegíveis são pulados e
 * reportados — um pedido problemático não derruba o lote.
 */
export async function bulkStartSeparation(
	input: BulkStartSeparationInput
): Promise<ActionResult<BulkStartSeparationResult>> {
	const parsed = bulkStartSeparationSchema.safeParse(input);
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
		// Fail-fast global: sem a capability nem adianta iterar.
		await requireCapability("orders.update_status");

		try {
			for (const orderId of orderIds) {
				// Placeholder até a autorização passar — o número real só é lido
				// (dentro da tx, já travado) depois do lock+capability check, pra
				// não vazar número de pedido fora do escopo do ator (skip reports
				// pré-autorização usam só o id truncado).
				const fallbackLabel = orderId.slice(0, 8);
				try {
					await db.transaction(async (tx) => {
						const locked = await lockOrderAndAuthorize(
							tx,
							"orders.update_status",
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

						const reason = bulkStartSeparationSkipReason(locked);
						if (reason) {
							skipped.push({ number: label, reason: BULK_SKIP_LABEL[reason] });
							return;
						}
						await tx
							.update(order)
							.set(buildOrderStatusUpdate("preparing", undefined, undefined))
							.where(eq(order.id, orderId));
						await tx.insert(orderStatusHistory).values({
							id: crypto.randomUUID(),
							orderId,
							fromStatus: "paid",
							toStatus: "preparing",
							actorType: "user",
							actorUserId: locked.session.user.id,
							reason: null,
						});
						moved += 1;
						movedIds.push(orderId);
					});
				} catch (error) {
					const skipReason = bulkSkipReasonFromError(error);
					if (skipReason) {
						skipped.push({ number: fallbackLabel, reason: skipReason });
					} else {
						throw error;
					}
				}
			}
		} finally {
			// Escritas parciais já commitadas por pedido processado antes de um
			// abort no meio do lote (erro de infra) precisam refletir no cache,
			// mesmo quando o retorno abaixo é {ok:false}.
			revalidatePath(ORDERS_PATH);
			revalidateTag(ORDERS_COUNTS_TAG, "max");
		}

		return { ok: true, data: { moved, movedIds, skipped } };
	} catch (error) {
		logger.error("bulkStartSeparation", { err: error });
		if (isCapabilityError(error)) {
			return { ok: false, error: "Sem permissão para alterar pedidos." };
		}
		// Erro de banco: mapear SQLSTATE p/ mensagem amigável. NUNCA devolver
		// error.message (o toast exibe o retorno cru — vazaria SQL do drizzle).
		const pgErr = getPgError(error);
		if (pgErr) {
			return { ok: false, error: pgErrorMessage(pgErr) };
		}
		return { ok: false, error: BULK_GENERIC_ERROR };
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

export interface BulkAssignBranchResult {
	assigned: number;
	skipped: { number: string; reason: string }[];
}

const BULK_ASSIGN_GENERIC_ERROR = "Erro ao atribuir filial aos pedidos.";

/**
 * Atribuição de filial em lote — o caso de uso é a triagem (pedidos vindos do
 * ecommerce com branch_id null). Contrato branch-scoped, o inverso de reviews
 * (que são globais): a capability da filial de DESTINO é checada UMA vez; cada
 * pedido roda em transação própria com lock + autorização da filial de ORIGEM
 * (fecha o race de reatribuição e barra quem não enxerga a triagem). Um pedido
 * inelegível vira skip reportado — não derruba o lote. Espelha bulkStartSeparation.
 */
export async function bulkAssignBranch(
	input: BulkAssignBranchInput
): Promise<ActionResult<BulkAssignBranchResult>> {
	const parsed = bulkAssignBranchSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? "Entrada inválida",
		};
	}

	const { branchId } = parsed.data;
	const orderIds = Array.from(new Set(parsed.data.orderIds));
	let assigned = 0;
	const skipped: { number: string; reason: string }[] = [];

	try {
		// Filial de DESTINO, uma vez: o ator precisa de escopo lá para rotear.
		// Falhar aqui aborta o lote inteiro (não é skip — é falta de permissão).
		await requireCapabilityWithContext("orders.update_status", {
			targetBranchIds: [branchId],
		});

		// Nome da filial de destino lido uma vez (igual para todo o lote) — o
		// metadata do orderEvent replica o do assignBranch singular.
		const [destBranch] = await db
			.select({ name: branch.name })
			.from(branch)
			.where(eq(branch.id, branchId))
			.limit(1);
		if (!destBranch) {
			return { ok: false, error: "Filial não encontrada" };
		}

		try {
			for (const orderId of orderIds) {
				const fallbackLabel = orderId.slice(0, 8);
				try {
					await db.transaction(async (tx) => {
						const locked = await lockOrderAndAuthorize(
							tx,
							"orders.update_status",
							orderId
						);
						if (!locked) {
							skipped.push({ number: fallbackLabel, reason: "não encontrado" });
							return;
						}
						await tx
							.update(order)
							.set({ branchId })
							.where(eq(order.id, orderId));
						await insertOrderEvent(tx, {
							orderId,
							eventType: "branch_assigned",
							metadata: { branchId, branchName: destBranch.name },
							actorUserId: locked.session.user.id,
						});
						assigned += 1;
					});
				} catch (error) {
					const skipReason = bulkSkipReasonFromError(error);
					if (skipReason) {
						skipped.push({ number: fallbackLabel, reason: skipReason });
					} else {
						throw error;
					}
				}
			}
		} finally {
			// Escritas parciais já commitadas antes de um abort no meio do lote
			// precisam refletir no cache, mesmo com retorno {ok:false}.
			revalidatePath(ORDERS_PATH);
			revalidateTag(ORDERS_COUNTS_TAG, "max");
		}

		return { ok: true, data: { assigned, skipped } };
	} catch (error) {
		logger.error("bulkAssignBranch", { err: error });
		if (isCapabilityError(error)) {
			return { ok: false, error: "Sem permissão para atribuir esta filial." };
		}
		return { ok: false, error: BULK_ASSIGN_GENERIC_ERROR };
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

			const [ord] = await tx
				.select({ clientId: order.clientId, total: order.totalAmount })
				.from(order)
				.where(eq(order.id, orderId));
			if (!ord) {
				throw new Error("Pedido não encontrado");
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

			// ADR-0025: refund_request é a fonte de verdade do reembolso. Se o cliente
			// já abriu uma solicitação ativa, resolve-a; senão cria uma já resolvida.
			// O índice parcial refund_request_one_open_per_order garante 1 ativa/pedido.
			const [openReq] = await tx
				.select({ id: refundRequest.id })
				.from(refundRequest)
				.where(
					and(
						eq(refundRequest.orderId, orderId),
						inArray(refundRequest.status, [...ACTIVE_REFUND_STATUSES])
					)
				);
			if (openReq) {
				await tx
					.update(refundRequest)
					.set({
						status: "refunded",
						resolvedAt: new Date(),
						actorType: "user",
						actorUserId: session.user.id,
					})
					.where(eq(refundRequest.id, openReq.id));
			} else {
				await tx.insert(refundRequest).values({
					id: crypto.randomUUID(),
					orderId,
					clientId: ord.clientId,
					reasonCategory: "outro",
					reasonText: reason,
					status: "refunded",
					amount: ord.total,
					actorType: "user",
					actorUserId: session.user.id,
					resolvedAt: new Date(),
				});
			}

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

// ---------------------------------------------------------------------------
// Workflow da solicitação de reembolso (ADR-0025): requested → under_review →
// approved → refunded | rejected. A execução final (→ refunded) fica em
// refundOrder; aqui ficam as transições de análise/aprovação/recusa.
// ---------------------------------------------------------------------------

async function transitionRefund(
	refundRequestId: string,
	from: readonly RefundStatus[],
	to: RefundStatus,
	rejectionReason?: string
): Promise<ActionResult> {
	try {
		let orderId: string | undefined;
		await db.transaction(async (tx) => {
			const [req] = await tx
				.select({
					orderId: refundRequest.orderId,
					status: refundRequest.status,
				})
				.from(refundRequest)
				.where(eq(refundRequest.id, refundRequestId));
			if (!req) {
				throw new Error("Solicitação de reembolso não encontrada");
			}
			orderId = req.orderId;
			const locked = await lockOrderAndAuthorize(
				tx,
				"orders.refund",
				req.orderId
			);
			if (!locked) {
				throw new Error("Pedido não encontrado");
			}
			if (!from.includes(req.status)) {
				throw new Error(
					`Transição de reembolso inválida: ${req.status} → ${to}`
				);
			}
			await tx
				.update(refundRequest)
				.set({
					status: to,
					actorType: "user",
					actorUserId: locked.session.user.id,
					resolvedAt: to === "rejected" ? new Date() : null,
					rejectionReason: rejectionReason ?? null,
				})
				.where(eq(refundRequest.id, refundRequestId));
		});
		if (orderId) {
			revalidatePath(`${ORDERS_PATH}/${orderId}`);
			revalidateTag(ORDERS_COUNTS_TAG, "max");
		}
		return { ok: true, data: undefined };
	} catch (error) {
		logger.error("transitionRefund", error);
		if (isCapabilityError(error)) {
			return { ok: false, error: "Sem permissão para gerenciar reembolsos." };
		}
		return {
			ok: false,
			error: error instanceof Error ? error.message : "Erro interno",
		};
	}
}

export async function reviewRefund(
	refundRequestId: string
): Promise<ActionResult> {
	return await transitionRefund(
		refundRequestId,
		["requested"] as const,
		"under_review"
	);
}

export async function approveRefund(
	refundRequestId: string
): Promise<ActionResult> {
	return await transitionRefund(
		refundRequestId,
		["requested", "under_review"] as const,
		"approved"
	);
}

export async function rejectRefund(
	refundRequestId: string,
	reason: string
): Promise<ActionResult> {
	if (reason.trim().length < 10) {
		return { ok: false, error: "Motivo da recusa muito curto (mín. 10)." };
	}
	return await transitionRefund(
		refundRequestId,
		["requested", "under_review", "approved"] as const,
		"rejected",
		reason.trim()
	);
}
