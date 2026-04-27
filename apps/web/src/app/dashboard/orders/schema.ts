import type { OrderStatus } from "@emach/db/schema/orders";
import { z } from "zod";

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
	pending_payment: ["canceled"],
	paid: ["preparing", "canceled", "refunded"],
	preparing: ["shipped", "canceled"],
	shipped: ["delivered", "canceled"],
	delivered: [],
	canceled: [],
	refunded: [],
};

export { VALID_TRANSITIONS };

export const updateOrderStatusSchema = z
	.object({
		orderId: z.string().uuid(),
		toStatus: z.enum([
			"pending_payment",
			"paid",
			"preparing",
			"shipped",
			"delivered",
			"canceled",
			"refunded",
		]),
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
