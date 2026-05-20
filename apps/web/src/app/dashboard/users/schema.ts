import { z } from "zod";

const ROLES = ["super_admin", "admin", "manager", "user"] as const;

export const approveUserSchema = z
	.object({
		userId: z.string().min(1),
		role: z.enum(ROLES),
		branchIds: z.array(z.string().min(1)),
	})
	.refine((data) => data.role === "super_admin" || data.branchIds.length >= 1, {
		message: "Selecione ao menos 1 filial",
		path: ["branchIds"],
	});

export type ApproveUserInput = z.infer<typeof approveUserSchema>;

export const updateUserSchema = z.object({
	userId: z.string().min(1),
	name: z.string().min(2).max(100).optional(),
	role: z.enum(ROLES).optional(),
	branchIds: z.array(z.string().min(1)).optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const userIdSchema = z.object({ userId: z.string().min(1) });
export type UserIdInput = z.infer<typeof userIdSchema>;

export const triggerPasswordResetSchema = z.object({
	userId: z.string().min(1),
});
export type TriggerPasswordResetInput = z.infer<
	typeof triggerPasswordResetSchema
>;

export const revokeSessionSchema = z.object({
	sessionId: z.string().min(1),
});
export type RevokeSessionInput = z.infer<typeof revokeSessionSchema>;

export const branchLinkSchema = z.object({
	userId: z.string().min(1),
	branchId: z.string().min(1),
});
export type BranchLinkInput = z.infer<typeof branchLinkSchema>;
