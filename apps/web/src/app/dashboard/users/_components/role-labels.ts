export const ROLE_LABELS = {
	super_admin: "Super Admin",
	admin: "Admin",
	manager: "Manager",
	user: "User",
} as const;

export type Role = keyof typeof ROLE_LABELS;
