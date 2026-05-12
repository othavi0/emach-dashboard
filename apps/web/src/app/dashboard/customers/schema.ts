import { clientStatusEnum, clientTypeEnum } from "@emach/db/schema/client";
import { clientAuditActionEnum } from "@emach/db/schema/client-audit";
import { z } from "zod";

const isoDate = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (YYYY-MM-DD)")
	.optional();

export const SORT_OPTIONS = [
	"createdDesc",
	"ltvDesc",
	"lastOrderDesc",
	"nameAsc",
] as const;
export type CustomerSort = (typeof SORT_OPTIONS)[number];

export const customersListFiltersSchema = z
	.object({
		q: z.string().trim().max(100).optional(),
		status: z.enum(clientStatusEnum.enumValues).optional(),
		clientType: z
			.union([
				z.array(z.enum(clientTypeEnum.enumValues)),
				z
					.string()
					.transform((s) => s.split(",").filter(Boolean))
					.pipe(z.array(z.enum(clientTypeEnum.enumValues))),
			])
			.optional(),
		createdFrom: isoDate,
		createdTo: isoDate,
		lastOrderFrom: isoDate,
		lastOrderTo: isoDate,
		ltvMin: z.coerce.number().min(0).optional(),
		ltvMax: z.coerce.number().min(0).optional(),
		sort: z.enum(SORT_OPTIONS).default("createdDesc"),
	})
	.superRefine((d, ctx) => {
		if (d.createdFrom && d.createdTo && d.createdTo < d.createdFrom) {
			ctx.addIssue({
				code: "custom",
				message: "Data 'até' deve ser >= 'de' (cadastro)",
				path: ["createdTo"],
			});
		}
		if (d.lastOrderFrom && d.lastOrderTo && d.lastOrderTo < d.lastOrderFrom) {
			ctx.addIssue({
				code: "custom",
				message: "Data 'até' deve ser >= 'de' (último pedido)",
				path: ["lastOrderTo"],
			});
		}
		if (
			d.ltvMin !== undefined &&
			d.ltvMax !== undefined &&
			d.ltvMax < d.ltvMin
		) {
			ctx.addIssue({
				code: "custom",
				message: "LTV máx deve ser >= LTV mín",
				path: ["ltvMax"],
			});
		}
	});
export type CustomersListFilters = z.infer<typeof customersListFiltersSchema>;

export const updateCustomerProfileSchema = z.object({
	clientId: z.string().min(1),
	name: z.string().trim().min(1).max(200),
	email: z.email().max(200),
	phone: z.string().trim().max(20).nullable().optional(),
	internalNotes: z.string().trim().max(2000).nullable().optional(),
	status: z.enum(clientStatusEnum.enumValues),
	clientType: z.enum(clientTypeEnum.enumValues).nullable().optional(),
});
export type UpdateCustomerProfileInput = z.infer<
	typeof updateCustomerProfileSchema
>;

export const updateCustomerStatusSchema = z.object({
	clientId: z.string().min(1),
	status: z.enum(clientStatusEnum.enumValues),
	reason: z.string().trim().max(500).optional(),
});
export type UpdateCustomerStatusInput = z.infer<
	typeof updateCustomerStatusSchema
>;

export const updateCustomerTypeSchema = z.object({
	clientId: z.string().min(1),
	clientType: z.enum(clientTypeEnum.enumValues).nullable(),
});

export const updateCustomerNotesSchema = z.object({
	clientId: z.string().min(1),
	internalNotes: z.string().trim().max(2000).nullable(),
});

export const revokeClientSessionSchema = z.object({
	clientId: z.string().min(1),
	sessionId: z.string().min(1),
});
export const revokeAllClientSessionsSchema = z.object({
	clientId: z.string().min(1),
});
export const generatePasswordResetSchema = z.object({
	clientId: z.string().min(1),
});

export const auditFilterSchema = z.object({
	action: z.enum(clientAuditActionEnum.enumValues).optional(),
});
