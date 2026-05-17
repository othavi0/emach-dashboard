import type { OrderStatus } from "@emach/db/schema/orders";
import { orderStatusEnum } from "@emach/db/schema/orders";
import { z } from "zod";

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
		page: z.coerce.number().int().min(1).default(1),
		pageSize: z.coerce.number().int().min(1).max(100).default(20),
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
	shipped: ["delivered", "refunded"],
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
	})
	.superRefine((data, ctx) => {
		if (data.toStatus === "shipped" && !data.trackingCode) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Código de rastreio obrigatório ao marcar como enviado",
				path: ["trackingCode"],
			});
		}
	});

export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;

export const addOrderNoteSchema = z.object({
	orderId: z.string().uuid(),
	body: z.string().trim().min(1).max(2000),
});

export type AddOrderNoteInput = z.infer<typeof addOrderNoteSchema>;

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
