import type { ClientAuditAction } from "@emach/db/schema/client-audit";
import { notFound } from "next/navigation";

import { can, requireCapability } from "@/lib/permissions";
import { CustomerHeader } from "../_components/customer-header";
import { CustomerKpisHeader } from "../_components/customer-kpis-header";
import { CustomerTabs } from "../_components/customer-tabs";
import {
	getCustomerAddresses,
	getCustomerAudit,
	getCustomerConsent,
	getCustomerDetail,
	getCustomerKpis,
	getCustomerOrders,
	getCustomerReviews,
	getCustomerSessions,
} from "../data";
import { auditFilterSchema } from "../schema";

interface PageProps {
	params: Promise<{ id: string }>;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}

type TabKey =
	| "perfil"
	| "enderecos"
	| "pedidos"
	| "avaliacoes"
	| "consentimento"
	| "sessoes"
	| "auditoria";

const VALID_TABS: TabKey[] = [
	"perfil",
	"enderecos",
	"pedidos",
	"avaliacoes",
	"consentimento",
	"sessoes",
	"auditoria",
];

function parseTab(raw: unknown): TabKey {
	if (typeof raw === "string" && (VALID_TABS as string[]).includes(raw)) {
		return raw as TabKey;
	}
	return "perfil";
}

function parsePage(raw: unknown): number {
	const n = typeof raw === "string" ? Number.parseInt(raw, 10) : 1;
	return Number.isFinite(n) && n > 0 ? n : 1;
}

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({
	params,
	searchParams,
}: PageProps) {
	const session = await requireCapability("customers.read");

	const { id } = await params;
	const raw = await searchParams;

	const currentTab = parseTab(Array.isArray(raw.tab) ? raw.tab[0] : raw.tab);
	const editMode = (Array.isArray(raw.edit) ? raw.edit[0] : raw.edit) === "1";
	const page = parsePage(Array.isArray(raw.page) ? raw.page[0] : raw.page);
	const rawAuditAction = Array.isArray(raw.auditAction)
		? raw.auditAction[0]
		: raw.auditAction;
	const parsedAudit = auditFilterSchema.safeParse({
		action: rawAuditAction,
	});
	const auditAction = parsedAudit.success ? parsedAudit.data.action : undefined;

	const [canEdit, canResetPassword, canModerateReviews, canManageSessions] =
		await Promise.all([
			can(session, "customers.update_status"),
			can(session, "customers.reset_password"),
			can(session, "reviews.moderate"),
			can(session, "customers.manage_sessions"),
		]);

	// Always-loaded data
	const [customer, kpis, addresses] = await Promise.all([
		getCustomerDetail(id),
		getCustomerKpis(id),
		getCustomerAddresses(id),
	]);

	if (!customer) {
		notFound();
	}

	// Tab-conditional data
	const [ordersResult, reviews, consentByKind, sessions, auditItems] =
		await Promise.all([
			currentTab === "pedidos" ? getCustomerOrders(id, page) : null,
			currentTab === "avaliacoes" ? getCustomerReviews(id) : null,
			currentTab === "consentimento" ? getCustomerConsent(id) : null,
			currentTab === "sessoes" ? getCustomerSessions(id) : null,
			currentTab === "auditoria"
				? getCustomerAudit(id, {
						action: auditAction as ClientAuditAction | undefined,
					})
				: null,
		]);

	return (
		<div className="flex flex-col gap-6">
			<CustomerHeader
				canEdit={canEdit}
				canResetPassword={canResetPassword}
				customer={customer}
			/>

			<CustomerKpisHeader kpis={kpis} />

			<CustomerTabs
				addresses={addresses}
				auditAction={auditAction}
				auditItems={auditItems}
				canEdit={canEdit}
				canManageSessions={canManageSessions}
				canModerateReviews={canModerateReviews}
				consentByKind={consentByKind}
				currentTab={currentTab}
				customer={customer}
				editMode={editMode}
				ordersResult={ordersResult}
				reviews={reviews}
				sessions={sessions}
			/>
		</div>
	);
}
