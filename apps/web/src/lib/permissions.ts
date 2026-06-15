import type { DashboardSession } from "@emach/auth/dashboard";
import { db } from "@emach/db";
import { user as userTable } from "@emach/db/schema/auth";
import { userCapabilityOverride } from "@emach/db/schema/user-capability-override";
import { and, eq, ne, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getUserBranchScope, inScope } from "@/lib/branch-scope";
import {
	type Capability,
	isCapability,
	roleDefaultCapabilities,
} from "@/lib/capabilities";
import {
	ROLE_WEIGHT,
	requireCurrentSession,
	type UserRole,
} from "@/lib/session";

// Re-export do tipo direto da fonte (evita lint/style/noExportedImports).
export type { Capability } from "@/lib/capabilities";

// Matriz de defaults derivada do registry (sem hardcode paralelo).
const ROLE_CAPS: Record<UserRole, ReadonlySet<Capability>> = {
	super_admin: roleDefaultCapabilities("super_admin"),
	admin: roleDefaultCapabilities("admin"),
	manager: roleDefaultCapabilities("manager"),
	user: roleDefaultCapabilities("user"),
};

// Checagem PURA de role-default (sync). Não considera overrides — usar `can`
// (async) para o conjunto efetivo. Mantida para display de "padrão do role" e testes.
export function roleHasCapability(
	role: string | null | undefined,
	cap: Capability
): boolean {
	if (!(role && role in ROLE_CAPS)) {
		return false;
	}
	return ROLE_CAPS[role as UserRole].has(cap);
}

// Conjunto EFETIVO (role default ± overrides). Use em Server Components para
// gating de UI. Para o default puro do role (sync), use roleHasCapability.
export async function can(
	session: DashboardSession,
	cap: Capability
): Promise<boolean> {
	return (await getUserCapabilities(session)).has(cap);
}

// Conjunto efetivo de capabilities, resolvido UMA vez por request (React.cache
// keya por identidade da session). base do role ± overrides do usuário.
export const getUserCapabilities = cache(
	async (session: DashboardSession): Promise<Set<Capability>> => {
		const role = (session.user.role ?? "user") as UserRole;
		const caps = roleDefaultCapabilities(role);
		const overrides = await db
			.select({
				capability: userCapabilityOverride.capability,
				effect: userCapabilityOverride.effect,
			})
			.from(userCapabilityOverride)
			.where(eq(userCapabilityOverride.userId, session.user.id));
		for (const o of overrides) {
			if (!isCapability(o.capability)) {
				continue; // cap removida do registry → ignora (fail-closed)
			}
			if (o.effect === "grant") {
				caps.add(o.capability);
			} else {
				caps.delete(o.capability);
			}
		}
		return caps;
	}
);

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
	if (!(await getUserCapabilities(session)).has(cap)) {
		throw new Error(`Forbidden: capability "${cap}" requerida`);
	}
	return session;
}

export async function requireCapabilityOrRedirect(
	cap: Capability,
	redirectTo = "/dashboard"
): Promise<DashboardSession> {
	const session = await requireCurrentSession();
	if (!(await getUserCapabilities(session)).has(cap)) {
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
	if (!(await getUserCapabilities(session)).has("users.manage")) {
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
	if (!(await getUserCapabilities(session)).has(cap)) {
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
