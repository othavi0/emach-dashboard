export interface UserRow {
	branchIds: string[];
	createdAt: Date;
	email: string;
	id: string;
	name: string;
	role: "super_admin" | "admin" | "manager" | "user";
	status: "pending" | "active" | "suspended";
}

export interface BranchLite {
	id: string;
	name: string;
}
