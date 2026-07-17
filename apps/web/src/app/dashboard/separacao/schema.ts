import { z } from "zod";

export const startPickingSchema = z.object({ orderId: z.string().uuid() });
export const scanItemSchema = z.object({
	pickingId: z.string().uuid(),
	code: z.string().trim().min(1).max(128),
});
export const reportMissingSchema = z.object({
	pickingItemId: z.string().uuid(),
	reason: z.string().trim().min(1, "Motivo obrigatório").max(500),
});
export const completePickingSchema = z.object({ pickingId: z.string().uuid() });
export const cancelPickingSchema = z.object({
	pickingId: z.string().uuid(),
	reason: z.string().trim().max(500).optional(),
});
export const bulkStartPickingSchema = z.object({
	orderIds: z
		.array(z.string().uuid())
		.min(1)
		.max(20, { message: "Selecione no máximo 20 pedidos por vez." }),
});

export type StartPickingInput = z.infer<typeof startPickingSchema>;
export type ScanItemInput = z.infer<typeof scanItemSchema>;
export type ReportMissingInput = z.infer<typeof reportMissingSchema>;
export type CompletePickingInput = z.infer<typeof completePickingSchema>;
export type CancelPickingInput = z.infer<typeof cancelPickingSchema>;
export type BulkStartPickingInput = z.infer<typeof bulkStartPickingSchema>;

export type ScanResult =
	| {
			kind: "accepted";
			pickingItemId: string;
			qtyPicked: number;
			qtyExpected: number;
	  }
	| { kind: "already_complete" }
	| { kind: "not_in_order" };
