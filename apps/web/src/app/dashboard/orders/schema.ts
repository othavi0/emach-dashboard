import type { OrderStatus } from "@emach/db/schema/orders";
import { orderStatusEnum } from "@emach/db/schema/orders";
import { z } from "zod";
import { BULK_ASSIGN_LIMIT } from "./status-meta";

const isoDate = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (YYYY-MM-DD)")
	.optional();

export const ordersListFiltersSchema = z
	.object({
		tab: z.string().optional(),
		q: z.string().trim().max(100).optional(),
		from: isoDate,
		to: isoDate,
		branchId: z.string().uuid().optional(),
		carrier: z.string().trim().max(80).optional(),
		productId: z.string().uuid().optional(),
		// Sub-aba de Atrasados (?tab=late&lateStatus=paid) — spec 2026-07-13.
		// "picked" = etapa Separado (recorte de preparing), spec 2026-07-11.
		lateStatus: z.enum(["paid", "preparing", "picked"]).optional(),
		// CSV de IDs (export de selecionados). Quando presente, exporta só estes.
		ids: z.string().max(20_000).optional(),
	})
	.superRefine((data, ctx) => {
		if (data.from && data.to && data.to < data.from) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Data 'até' deve ser >= 'de'",
				path: ["to"],
			});
		}
	});

export type OrdersListFiltersInput = z.input<typeof ordersListFiltersSchema>;
export type OrdersListFiltersParsed = z.infer<typeof ordersListFiltersSchema>;

export const ALL_ORDER_STATUSES = orderStatusEnum.enumValues;

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
	pending_payment: ["paid", "payment_failed", "canceled"],
	payment_failed: ["pending_payment", "canceled"],
	paid: ["preparing", "refunded"],
	preparing: ["shipped", "refunded"],
	shipped: ["delivered", "refunded", "returned"],
	delivered: ["returned"],
	returned: ["refunded"],
	canceled: [],
	refunded: [],
};

export { VALID_TRANSITIONS };

export type OrderStatusCapability =
	| "orders.cancel"
	| "orders.refund"
	| "orders.update_status";

export function capForStatus(toStatus: OrderStatus): OrderStatusCapability {
	if (toStatus === "canceled") {
		return "orders.cancel";
	}
	if (toStatus === "refunded") {
		return "orders.refund";
	}
	return "orders.update_status";
}

export const updateOrderStatusSchema = z
	.object({
		orderId: z.string().uuid(),
		toStatus: z.enum(orderStatusEnum.enumValues),
		reason: z.string().max(500).optional(),
		trackingCode: z.string().trim().min(1).max(200).optional(),
		branchId: z.string().uuid().optional(),
		returnItems: z
			.array(
				z.object({
					orderItemId: z.string().uuid(),
					branchId: z.string().uuid(),
				})
			)
			.optional(),
		forceShip: z.boolean().optional(),
		forceReason: z
			.string()
			.trim()
			.min(10, "Motivo do envio forçado precisa de ao menos 10 caracteres")
			.max(500)
			.optional(),
	})
	.superRefine((data, ctx) => {
		if (data.toStatus === "shipped" && !data.trackingCode) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Código de rastreio obrigatório ao marcar como enviado",
				path: ["trackingCode"],
			});
		}
		const requiresReason: (typeof data.toStatus)[] = [
			"canceled",
			"refunded",
			"returned",
		];
		if (
			requiresReason.includes(data.toStatus) &&
			(!data.reason || data.reason.trim().length === 0)
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Motivo obrigatório para cancelamento, reembolso ou devolução",
				path: ["reason"],
			});
		}
		if (data.forceShip && !data.forceReason) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Motivo obrigatório ao forçar envio sem separação",
				path: ["forceReason"],
			});
		}
	});

export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;

export const bulkStartSeparationSchema = z.object({
	orderIds: z.array(z.string().uuid()).min(1).max(100),
	// Dialog "Enviar para separação" (D1, spec 2026-07-16): quando informada,
	// aplica-se SÓ aos pedidos do lote sem filial própria — nunca sobrescreve.
	branchId: z.string().uuid().optional(),
});

export type BulkStartSeparationInput = z.infer<
	typeof bulkStartSeparationSchema
>;

// Atribuição de filial em lote (triagem). BULK_ASSIGN_LIMIT vive em status-meta
// (client-safe) — compartilhado com o BranchPickerDialog.
export const bulkAssignBranchSchema = z.object({
	branchId: z.string().uuid(),
	orderIds: z
		.array(z.string().uuid())
		.min(1)
		.max(BULK_ASSIGN_LIMIT, {
			message: `Selecione no máximo ${BULK_ASSIGN_LIMIT} pedidos por vez.`,
		}),
});

export type BulkAssignBranchInput = z.infer<typeof bulkAssignBranchSchema>;

export const addOrderNoteSchema = z.object({
	orderId: z.string().uuid(),
	body: z.string().trim().min(1).max(2000),
});

export type AddOrderNoteInput = z.infer<typeof addOrderNoteSchema>;

export const togglePinNoteSchema = z.object({
	noteId: z.string().uuid(),
	pinned: z.boolean(),
});

export type TogglePinNoteInput = z.infer<typeof togglePinNoteSchema>;

export const assignBranchSchema = z.object({
	orderId: z.string().uuid(),
	branchId: z.string().uuid(),
});

export type AssignBranchInput = z.infer<typeof assignBranchSchema>;

export const updateTrackingCodeSchema = z.object({
	orderId: z.string().uuid(),
	trackingCode: z.string().trim().min(1).max(200),
});

export type UpdateTrackingCodeInput = z.infer<typeof updateTrackingCodeSchema>;

export const markShippingReviewedSchema = z.object({
	orderId: z.string().uuid(),
});

export type MarkShippingReviewedInput = z.infer<
	typeof markShippingReviewedSchema
>;

export const refundOrderSchema = z
	.object({
		orderId: z.string().uuid(),
		reason: z.string().trim().min(1, "Motivo obrigatório").max(500),
		creditStock: z.boolean(),
		returnItems: z
			.array(
				z.object({
					orderItemId: z.string().uuid(),
					branchId: z.string().uuid(),
				})
			)
			.optional(),
	})
	.superRefine((data, ctx) => {
		if (
			data.creditStock &&
			(!data.returnItems || data.returnItems.length === 0)
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Selecione pelo menos um item para creditar ao estoque",
				path: ["returnItems"],
			});
		}
	});

export type RefundOrderInput = z.infer<typeof refundOrderSchema>;

export const cancelOrderSchema = z.object({
	orderId: z.string().uuid(),
	reason: z.string().trim().min(1, "Motivo obrigatório").max(500),
});

export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
