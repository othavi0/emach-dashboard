import type { DashboardSession } from "@emach/auth/dashboard";
import { db } from "@emach/db";
import type { UserRole } from "@emach/db/schema/auth";
import { user as userTable } from "@emach/db/schema/auth";
import { userBranch } from "@emach/db/schema/inventory";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { ROLE_WEIGHT, requireCurrentSession } from "@/lib/session";

export type Capability =
	| "tools.read"
	| "tools.create"
	| "tools.update"
	| "tools.delete"
	| "categories.read"
	| "categories.manage"
	| "suppliers.read"
	| "suppliers.manage"
	| "branches.read"
	| "branches.manage"
	| "stock.read"
	| "stock.adjust"
	| "promotions.read"
	| "promotions.manage"
	| "orders.read"
	| "orders.update_status"
	| "orders.cancel"
	| "orders.refund"
	| "orders.add_note"
	| "orders.export"
	| "customers.read"
	| "customers.update_status"
	| "customers.export"
	| "customers.manage_sessions"
	| "customers.reset_password"
	| "site.read"
	| "site.update_banners"
	| "site.update_settings"
	| "site.publish_announcements"
	| "reviews.read"
	| "reviews.moderate"
	| "users.manage"
	| "users.approve"
	| "users.update_role"
	| "users.update_branches"
	| "users.suspend"
	| "users.reset_password"
	| "users.delete"
	| "audit.read"
	| "attributes.read"
	| "attributes.create"
	| "attributes.update"
	| "attributes.delete"
	| "branches.set_default";

const ALL_CAPS: readonly Capability[] = [
	"tools.read",
	"tools.create",
	"tools.update",
	"tools.delete",
	"categories.read",
	"categories.manage",
	"suppliers.read",
	"suppliers.manage",
	"branches.read",
	"branches.manage",
	"stock.read",
	"stock.adjust",
	"promotions.read",
	"promotions.manage",
	"orders.read",
	"orders.update_status",
	"orders.cancel",
	"orders.refund",
	"orders.add_note",
	"orders.export",
	"customers.read",
	"customers.update_status",
	"customers.export",
	"customers.manage_sessions",
	"customers.reset_password",
	"site.read",
	"site.update_banners",
	"site.update_settings",
	"site.publish_announcements",
	"reviews.read",
	"reviews.moderate",
	"users.manage",
	"users.approve",
	"users.update_role",
	"users.update_branches",
	"users.suspend",
	"users.reset_password",
	"users.delete",
	"audit.read",
	"attributes.read",
	"attributes.create",
	"attributes.update",
	"attributes.delete",
	"branches.set_default",
];

const USER_CAPS: readonly Capability[] = [
	"tools.read",
	"categories.read",
	"suppliers.read",
	"branches.read",
	"stock.read",
	"promotions.read",
	"orders.read",
	"customers.read",
	"site.read",
	"reviews.read",
	"stock.adjust",
	"orders.update_status",
	"orders.add_note",
	"attributes.read",
];

const MANAGER_CAPS: readonly Capability[] = [
	...USER_CAPS,
	"tools.create",
	"tools.update",
	"tools.delete",
	"categories.manage",
	"suppliers.manage",
	"promotions.manage",
	"orders.cancel",
	"orders.refund",
	"orders.export",
	"customers.update_status",
	"customers.manage_sessions",
	"customers.reset_password",
	"site.update_banners",
	"site.update_settings",
	"site.publish_announcements",
	"reviews.moderate",
	"audit.read",
	"attributes.create",
	"attributes.update",
	"attributes.delete",
];

const SUPER_ADMIN_EXCLUSIVE: readonly Capability[] = [
	"branches.manage",
	"branches.set_default",
	"users.delete",
	"audit.read", // global (admin tem escopado, mas a cap "audit.read" simples fica exclusiva)
];

const ADMIN_CAPS: readonly Capability[] = ALL_CAPS.filter(
	(c) => !SUPER_ADMIN_EXCLUSIVE.includes(c)
);

const ROLE_CAPS: Record<UserRole, readonly Capability[]> = {
	super_admin: ALL_CAPS,
	admin: ADMIN_CAPS,
	manager: MANAGER_CAPS,
	user: USER_CAPS,
};

export function can(
	role: UserRole | null | undefined,
	cap: Capability
): boolean {
	if (!(role && role in ROLE_CAPS)) {
		return false;
	}
	return ROLE_CAPS[role].includes(cap);
}

export async function requireCapability(
	cap: Capability
): Promise<DashboardSession> {
	const session = await requireCurrentSession();
	const role = session.user.role as UserRole | undefined;
	if (!can(role, cap)) {
		throw new Error(`Forbidden: capability "${cap}" requerida`);
	}
	return session;
}

export async function requireCapabilityOrRedirect(
	cap: Capability,
	redirectTo = "/dashboard"
): Promise<DashboardSession> {
	const session = await requireCurrentSession();
	if (!can(session.user.role as UserRole, cap)) {
		redirect(redirectTo);
	}
	return session;
}

interface CapabilityContext {
	targetBranchIds?: string[];
	targetUserId?: string;
}

const SELF_RESTRICTED: readonly Capability[] = [
	"users.suspend",
	"users.delete",
	"users.update_role",
];

export async function requireCapabilityWithContext(
	cap: Capability,
	ctx: CapabilityContext = {}
): Promise<DashboardSession> {
	const session = await requireCurrentSession();
	const role = (session.user.role ?? "user") as UserRole;
	if (!can(role, cap)) {
		throw new Error(`Forbidden: capability "${cap}" requerida`);
	}

	if (ctx.targetUserId) {
		if (ctx.targetUserId === session.user.id && SELF_RESTRICTED.includes(cap)) {
			throw new Error("Não é possível executar essa ação em si mesmo");
		}

		const [target] = await db
			.select({ role: userTable.role })
			.from(userTable)
			.where(eq(userTable.id, ctx.targetUserId))
			.limit(1);

		if (!target) {
			throw new Error("Usuário alvo não encontrado");
		}

		const targetWeight = ROLE_WEIGHT[target.role as UserRole];
		const actorWeight = ROLE_WEIGHT[role];

		if (role !== "super_admin" && targetWeight >= actorWeight) {
			throw new Error(
				"Não é possível gerenciar usuário com role igual ou superior"
			);
		}
	}

	if (ctx.targetBranchIds && role !== "super_admin") {
		const ownBranches = await db
			.select({ branchId: userBranch.branchId })
			.from(userBranch)
			.where(eq(userBranch.userId, session.user.id));
		const ownSet = new Set(ownBranches.map((b) => b.branchId));
		for (const targetId of ctx.targetBranchIds) {
			if (!ownSet.has(targetId)) {
				throw new Error(`Filial fora do seu escopo: ${targetId}`);
			}
		}
	}

	return session;
}
