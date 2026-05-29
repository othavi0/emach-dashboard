import type { DashboardSession } from "@emach/auth/dashboard";
import { db } from "@emach/db";
import { user as userTable } from "@emach/db/schema/auth";
import { and, eq, ne, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireCurrentSession } from "@/lib/session";

// ⚠️ Gates role-based desligados em 2026-05-27 (ver docs/adr/0012-disable-role-based-gates.md).
// Matriz original preservada em `permissions.disabled.ts`. Não adicionar capabilities novas
// sem religar primeiro — o tipo ainda é checado para que callsites continuem corretos.

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
	| "users.revoke_sessions"
	| "users.delete"
	| "audit.read"
	| "attributes.read"
	| "attributes.create"
	| "attributes.update"
	| "attributes.delete";

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

export function can(
	role: string | null | undefined,
	_cap: Capability
): boolean {
	return Boolean(role);
}

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
	_cap: Capability
): Promise<DashboardSession> {
	const session = await requireCurrentSession();
	ensureActive(session);
	return session;
}

export async function requireCapabilityOrRedirect(
	_cap: Capability,
	redirectTo = "/dashboard"
): Promise<DashboardSession> {
	const session = await requireCurrentSession();
	if (session.user.status !== "active") {
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

export async function requireCapabilityWithContext(
	cap: Capability,
	ctx: CapabilityContext = {}
): Promise<DashboardSession> {
	const session = await requireCurrentSession();
	ensureActive(session);

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
