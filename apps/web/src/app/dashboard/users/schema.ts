import { z } from "zod";

const ROLES = ["super_admin", "admin", "manager", "user"] as const;

export const inviteUserSchema = z
	.object({
		email: z
			.string()
			.email("Email inválido")
			.transform((v) => v.trim().toLowerCase()),
		role: z.enum(ROLES),
		branchIds: z.array(z.string().min(1)),
	})
	.refine((d) => d.role === "super_admin" || d.branchIds.length >= 1, {
		message: "Selecione ao menos 1 filial",
		path: ["branchIds"],
	});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const inviteIdSchema = z.object({ userId: z.string().min(1) });
export type InviteIdInput = z.infer<typeof inviteIdSchema>;

export const acceptInviteSchema = z.object({
	token: z.string().min(1),
	name: z.string().min(2, "Informe seu nome").max(100),
	password: z.string().min(8, "Mínimo 8 caracteres").max(128),
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

export const updateUserSchema = z.object({
	userId: z.string().min(1),
	name: z.string().min(2).max(100).optional(),
	role: z.enum(ROLES).optional(),
	emailVerified: z.boolean().optional(),
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

export const suspendUserSchema = z.object({
	userId: z.string().min(1),
	reason: z.string().min(10, "Motivo precisa de pelo menos 10 caracteres"),
});
export type SuspendUserInput = z.infer<typeof suspendUserSchema>;

export const deleteUserSchema = z.object({
	userId: z.string().min(1),
	reason: z.string().min(10, "Motivo precisa de pelo menos 10 caracteres"),
});
export type DeleteUserInput = z.infer<typeof deleteUserSchema>;
