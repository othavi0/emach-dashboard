import type { DashboardSession } from "@emach/auth/dashboard";
import { db } from "@emach/db";
import { user as userTable } from "@emach/db/schema/auth";
import { and, eq, ne, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getUserBranchScope, inScope } from "@/lib/branch-scope";
import {
	ROLE_WEIGHT,
	requireCurrentSession,
	type UserRole,
} from "@/lib/session";

export type Capability =
	| "tools.read"
	| "tools.create"
	| "tools.update"
	| "tools.delete"
	| "categories.read"
	| "categories.manage"
	| "categories.delete"
	| "suppliers.read"
	| "suppliers.manage"
	| "branches.read"
	| "branches.manage"
	| "stock.read"
	| "stock.adjust"
	| "promotions.read"
	| "promotions.manage"
	| "promotions.delete"
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
	| "users.revoke_sessions"
	| "users.delete"
	| "audit.read"
	| "attributes.read"
	| "attributes.create"
	| "attributes.update"
	| "attributes.delete";

const ALL_CAPS: readonly Capability[] = [
	"tools.read",
	"tools.create",
	"tools.update",
	"tools.delete",
	"categories.read",
	"categories.manage",
	"categories.delete",
	"suppliers.read",
	"suppliers.manage",
	"branches.read",
	"branches.manage",
	"stock.read",
	"stock.adjust",
	"promotions.read",
	"promotions.manage",
	"promotions.delete",
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
	"users.revoke_sessions",
	"users.delete",
	"audit.read",
	"attributes.read",
	"attributes.create",
	"attributes.update",
	"attributes.delete",
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
	"attributes.read",
	"stock.adjust",
	"orders.update_status",
	"orders.add_note",
];

const SUPER_ADMIN_EXCLUSIVE: readonly Capability[] = [
	"branches.manage",
	"users.delete",
	"site.update_banners",
	"site.update_settings",
	"site.publish_announcements",
	"tools.delete",
	"categories.delete",
	"promotions.delete",
	"attributes.delete",
];

const ADMIN_CAPS: readonly Capability[] = ALL_CAPS.filter(
	(c) => !SUPER_ADMIN_EXCLUSIVE.includes(c)
);

const ROLE_CAPS: Record<UserRole, readonly Capability[]> = {
	super_admin: ALL_CAPS,
	admin: ADMIN_CAPS,
	manager: ADMIN_CAPS,
	user: USER_CAPS,
};

export function can(role: string | null | undefined, cap: Capability): boolean {
	if (!(role && role in ROLE_CAPS)) {
		return false;
	}
	return ROLE_CAPS[role as UserRole].includes(cap);
}

// Listas intencionalmente separadas, ainda que coincidentes hoje:
// SELF_RESTRICTED = caps proibidas contra si mesmo (UX, independente de outros guards).
// LAST_SUPER_ADMIN_GUARDED = caps que disparam a checagem de último super_admin ativo.
// Ao reativar role-based gates, podem divergir (ex: novas caps proibidas só contra self).
const SELF_RESTRICTED: readonly Capability[] = [
	"users.suspend",
	"users.delete",
	"users.update_role",
];

const LAST_SUPER_ADMIN_GUARDED: readonly Capability[] = [
	"users.suspend",
	"users.delete",
	"users.update_role",
];

function ensureActive(session: DashboardSession): void {
	if (session.user.status !== "active") {
		throw new Error("Conta não ativa");
	}
}

async function assertNotLastActiveSuperAdmin(
	targetUserId: string
): Promise<void> {
	const [target] = await db
		.select({ role: userTable.role, status: userTable.status })
		.from(userTable)
		.where(eq(userTable.id, targetUserId))
		.limit(1);

	if (!target || target.role !== "super_admin" || target.status !== "active") {
		return;
	}

	const [row] = await db
		.select({ value: sql<number>`count(*)::int` })
		.from(userTable)
		.where(
			and(
				eq(userTable.role, "super_admin"),
				eq(userTable.status, "active"),
				ne(userTable.id, targetUserId)
			)
		);
	const others = row?.value ?? 0;
	if (others < 1) {
		throw new Error("Necessário ao menos 1 super_admin ativo");
	}
}

export async function requireCapability(
	cap: Capability
): Promise<DashboardSession> {
	const session = await requireCurrentSession();
	ensureActive(session);
	if (!can(session.user.role, cap)) {
		throw new Error(`Forbidden: capability "${cap}" requerida`);
	}
	return session;
}

export async function requireCapabilityOrRedirect(
	cap: Capability,
	redirectTo = "/dashboard"
): Promise<DashboardSession> {
	const session = await requireCurrentSession();
	if (!can(session.user.role, cap)) {
		redirect(redirectTo);
	}
	return session;
}

export async function requireUserDetailAccessOrRedirect(
	targetUserId: string,
	redirectTo = "/dashboard"
): Promise<DashboardSession> {
	const session = await requireCurrentSession();
	if (session.user.status !== "active") {
		redirect(redirectTo);
	}
	if (session.user.id === targetUserId) {
		return session;
	}
	if (!can(session.user.role, "users.manage")) {
		redirect(redirectTo);
	}
	return session;
}

interface CapabilityContext {
	targetBranchIds?: string[];
	targetUserId?: string;
}

// Hierarquia de role: non-super_admin não gerencia usuário de role igual/superior
// (admin nunca mexe em admin/super_admin). super_admin e self ignoram.
async function assertManageableTarget(
	session: DashboardSession,
	targetUserId: string
): Promise<void> {
	if (targetUserId === session.user.id) {
		return;
	}
	const actorRole = (session.user.role ?? "user") as UserRole;
	if (actorRole === "super_admin") {
		return;
	}
	const [target] = await db
		.select({ role: userTable.role })
		.from(userTable)
		.where(eq(userTable.id, targetUserId))
		.limit(1);
	if (!target) {
		throw new Error("Usuário alvo não encontrado");
	}
	if (ROLE_WEIGHT[target.role as UserRole] >= ROLE_WEIGHT[actorRole]) {
		throw new Error(
			"Não é possível gerenciar usuário com role igual ou superior"
		);
	}
}

// Branch-scoping: non-super_admin só age sobre filiais no próprio escopo.
async function assertBranchScope(
	session: DashboardSession,
	targetBranchIds: string[]
): Promise<void> {
	if (session.user.role === "super_admin") {
		return;
	}
	const scope = await getUserBranchScope(session);
	for (const targetId of targetBranchIds) {
		if (!inScope(scope, targetId)) {
			throw new Error(`Filial fora do seu escopo: ${targetId}`);
		}
	}
}

export async function requireCapabilityWithContext(
	cap: Capability,
	ctx: CapabilityContext = {}
): Promise<DashboardSession> {
	const session = await requireCurrentSession();
	ensureActive(session);
	if (!can(session.user.role, cap)) {
		throw new Error(`Forbidden: capability "${cap}" requerida`);
	}

	if (
		ctx.targetUserId &&
		ctx.targetUserId === session.user.id &&
		SELF_RESTRICTED.includes(cap)
	) {
		throw new Error("Não é possível executar essa ação em si mesmo");
	}

	if (ctx.targetUserId && LAST_SUPER_ADMIN_GUARDED.includes(cap)) {
		await assertNotLastActiveSuperAdmin(ctx.targetUserId);
	}

	if (ctx.targetUserId) {
		await assertManageableTarget(session, ctx.targetUserId);
	}

	if (ctx.targetBranchIds) {
		await assertBranchScope(session, ctx.targetBranchIds);
	}

	return session;
}

export async function requireCapabilityWithContextOrRedirect(
	cap: Capability,
	ctx: CapabilityContext = {},
	redirectTo = "/dashboard"
): Promise<DashboardSession> {
	try {
		return await requireCapabilityWithContext(cap, ctx);
	} catch {
		redirect(redirectTo);
	}
}
