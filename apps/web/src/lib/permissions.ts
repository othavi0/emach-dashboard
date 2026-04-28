import type { DashboardSession } from "@emach/auth/dashboard";
import type { UserRole } from "@emach/db/schema/auth";
import { redirect } from "next/navigation";
import { requireCurrentSession } from "@/lib/session";

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
	| "customers.read"
	| "customers.update_tags"
	| "customers.update_status"
	| "customers.delete"
	| "leads.read"
	| "leads.manage"
	| "site.read"
	| "site.update_banners"
	| "site.update_settings"
	| "site.publish_announcements"
	| "reviews.read"
	| "reviews.moderate"
	| "users.manage"
	| "apikeys.manage"
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
	"customers.read",
	"customers.update_tags",
	"customers.update_status",
	"customers.delete",
	"leads.read",
	"leads.manage",
	"site.read",
	"site.update_banners",
	"site.update_settings",
	"site.publish_announcements",
	"reviews.read",
	"reviews.moderate",
	"users.manage",
	"apikeys.manage",
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
	"leads.read",
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
	"customers.update_tags",
	"customers.update_status",
	"leads.manage",
	"site.update_banners",
	"site.update_settings",
	"site.publish_announcements",
	"reviews.moderate",
	"audit.read",
	"attributes.create",
	"attributes.update",
	"attributes.delete",
];

const ROLE_CAPS: Record<UserRole, readonly Capability[]> = {
	admin: ALL_CAPS,
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
