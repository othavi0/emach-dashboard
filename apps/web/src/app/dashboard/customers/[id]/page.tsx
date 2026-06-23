import type { ClientAuditAction } from "@emach/db/schema/client-audit";
import {
	FileClock,
	MapPin,
	Monitor,
	ShieldCheck,
	ShoppingCart,
	Star,
	User,
} from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { type EntityTab, EntityTabs } from "@/components/entity/entity-tabs";
import type { InfiniteResult } from "@/lib/infinite";
import { can, requireCapabilityOrRedirect } from "@/lib/permissions";
import { CustomerAddressesList } from "../_components/customer-addresses-list";
import { CustomerAuditTable } from "../_components/customer-audit-table";
import { CustomerConsentList } from "../_components/customer-consent-list";
import { CustomerEditSheet } from "../_components/customer-edit-sheet";
import { CustomerIdentity } from "../_components/customer-identity";
import { CustomerOrdersTable } from "../_components/customer-orders-table";
import { CustomerOverviewTab } from "../_components/customer-overview-tab";
import { CustomerReviewsTable } from "../_components/customer-reviews-table";
import { CustomerSessionsTable } from "../_components/customer-sessions-table";
import { EditCustomerButton } from "../_components/edit-customer-button";
import { ResetPasswordDialog } from "../_components/reset-password-dialog";
import { RevokeAllSessionsDialog } from "../_components/revoke-all-sessions-dialog";
import type {
	CustomerAddressRow,
	CustomerAuditRow,
	CustomerConsentByKind,
	CustomerDetail,
	CustomerKpis,
	CustomerOrderRow,
	CustomerReviewRow,
	CustomerSessionRow,
} from "../data";
import {
	getCustomerAddresses,
	getCustomerAudit,
	getCustomerConsent,
	getCustomerDetail,
	getCustomerKpis,
	getCustomerReviews,
	getCustomerSessions,
	listCustomerOrders,
} from "../data";
import { auditFilterSchema } from "../schema";

export const metadata: Metadata = { title: "Detalhe do cliente" };

interface PageProps {
	params: Promise<{ id: string }>;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const VALID_TABS = [
	"perfil",
	"enderecos",
	"pedidos",
	"avaliacoes",
	"consentimento",
	"sessoes",
	"auditoria",
] as const;
type TabKey = (typeof VALID_TABS)[number];

function parseTab(raw: unknown): TabKey {
	if (
		typeof raw === "string" &&
		(VALID_TABS as readonly string[]).includes(raw)
	) {
		return raw as TabKey;
	}
	return "perfil";
}

function pick(raw: string | string[] | undefined): string | undefined {
	return Array.isArray(raw) ? raw[0] : raw;
}

interface TabData {
	addresses: CustomerAddressRow[] | null;
	auditAction: string | undefined;
	auditItems: CustomerAuditRow[] | null;
	canManageSessions: boolean;
	canModerateReviews: boolean;
	consentByKind: CustomerConsentByKind | null;
	currentTab: TabKey;
	customer: CustomerDetail;
	kpis: CustomerKpis | null;
	recentOrders: InfiniteResult<CustomerOrderRow> | null;
	reviews: CustomerReviewRow[] | null;
	sessions: CustomerSessionRow[] | null;
}

function buildTabs(data: TabData): EntityTab[] {
	const {
		currentTab,
		customer,
		kpis,
		recentOrders,
		addresses,
		reviews,
		consentByKind,
		sessions,
		auditItems,
		auditAction,
		canModerateReviews,
		canManageSessions,
	} = data;

	const onOverview = currentTab === "perfil";

	return [
		{
			value: "perfil",
			label: "Visão geral",
			icon: <User aria-hidden className="size-3.5" />,
			content:
				onOverview && kpis ? (
					<CustomerOverviewTab
						customer={customer}
						kpis={kpis}
						recentOrders={recentOrders?.items.slice(0, 3) ?? []}
					/>
				) : null,
		},
		{
			value: "enderecos",
			label: "Endereços",
			icon: <MapPin aria-hidden className="size-3.5" />,
			content:
				currentTab === "enderecos" && addresses ? (
					<CustomerAddressesList addresses={addresses} />
				) : null,
		},
		{
			value: "pedidos",
			label: "Pedidos",
			icon: <ShoppingCart aria-hidden className="size-3.5" />,
			content:
				currentTab === "pedidos" ? (
					<CustomerOrdersTable clientId={customer.id} />
				) : null,
		},
		{
			value: "avaliacoes",
			label: "Avaliações",
			icon: <Star aria-hidden className="size-3.5" />,
			content:
				currentTab === "avaliacoes" && reviews ? (
					<CustomerReviewsTable
						canModerate={canModerateReviews}
						items={reviews}
					/>
				) : null,
		},
		{
			value: "consentimento",
			label: "Consentimento",
			icon: <ShieldCheck aria-hidden className="size-3.5" />,
			content:
				currentTab === "consentimento" && consentByKind ? (
					<CustomerConsentList consentByKind={consentByKind} />
				) : null,
		},
		{
			value: "sessoes",
			label: "Sessões",
			icon: <Monitor aria-hidden className="size-3.5" />,
			content:
				currentTab === "sessoes" && sessions ? (
					<CustomerSessionsTable
						canManage={canManageSessions}
						clientId={customer.id}
						sessions={sessions}
					/>
				) : null,
		},
		{
			value: "auditoria",
			label: "Auditoria",
			icon: <FileClock aria-hidden className="size-3.5" />,
			content:
				currentTab === "auditoria" && auditItems ? (
					<CustomerAuditTable
						clientId={customer.id}
						currentAction={auditAction}
						items={auditItems}
					/>
				) : null,
		},
	];
}

interface HeaderActionProps {
	canEdit: boolean;
	canManageSessions: boolean;
	canResetPassword: boolean;
	currentTab: TabKey;
	customer: CustomerDetail;
	sessions: CustomerSessionRow[] | null;
}

function buildHeaderAction({
	currentTab,
	canEdit,
	canResetPassword,
	canManageSessions,
	customer,
	sessions,
}: HeaderActionProps): ReactNode {
	if (currentTab === "perfil" && canEdit) {
		return <EditCustomerButton />;
	}
	if (currentTab === "sessoes") {
		return (
			<>
				{canResetPassword ? (
					<ResetPasswordDialog
						clientId={customer.id}
						clientName={customer.name}
					/>
				) : null}
				{canManageSessions && sessions && sessions.length > 0 ? (
					<RevokeAllSessionsDialog
						clientId={customer.id}
						sessionCount={sessions.length}
					/>
				) : null}
			</>
		);
	}
	return null;
}

export default function CustomerDetailPage({
	params,
	searchParams,
}: PageProps) {
	return (
		<CustomerDetailPageContent params={params} searchParams={searchParams} />
	);
}

async function CustomerDetailPageContent({ params, searchParams }: PageProps) {
	const session = await requireCapabilityOrRedirect(
		"customers.read",
		"/dashboard/sem-acesso?recurso=Clientes"
	);

	const { id } = await params;
	const raw = await searchParams;

	const currentTab = parseTab(pick(raw.tab));
	const parsedAudit = auditFilterSchema.safeParse({
		action: pick(raw.auditAction),
	});
	const auditAction = parsedAudit.success ? parsedAudit.data.action : undefined;

	const [canEdit, canResetPassword, canModerateReviews, canManageSessions] =
		await Promise.all([
			can(session, "customers.update_status"),
			can(session, "customers.reset_password"),
			can(session, "reviews.moderate"),
			can(session, "customers.manage_sessions"),
		]);

	const customer = await getCustomerDetail(id);
	if (!customer) {
		notFound();
	}

	const onOverview = currentTab === "perfil";

	const [
		kpis,
		recentOrders,
		addresses,
		reviews,
		consentByKind,
		sessions,
		auditItems,
	] = await Promise.all([
		onOverview ? getCustomerKpis(id) : null,
		onOverview ? listCustomerOrders({ clientId: id, cursor: null }) : null,
		currentTab === "enderecos" ? getCustomerAddresses(id) : null,
		currentTab === "avaliacoes" ? getCustomerReviews(id) : null,
		currentTab === "consentimento" ? getCustomerConsent(id) : null,
		currentTab === "sessoes" ? getCustomerSessions(id) : null,
		currentTab === "auditoria"
			? getCustomerAudit(id, {
					action: auditAction as ClientAuditAction | undefined,
				})
			: null,
	]);

	const tabs = buildTabs({
		currentTab,
		customer,
		kpis,
		recentOrders,
		addresses,
		reviews,
		consentByKind,
		sessions,
		auditItems,
		auditAction,
		canModerateReviews,
		canManageSessions,
	});

	const headerAction = buildHeaderAction({
		currentTab,
		canEdit,
		canResetPassword,
		canManageSessions,
		customer,
		sessions,
	});

	return (
		<div className="flex flex-col gap-6 p-6">
			<CustomerIdentity actions={headerAction} customer={customer} />
			<EntityTabs defaultValue="perfil" tabs={tabs} />
			{canEdit ? <CustomerEditSheet customer={customer} /> : null}
		</div>
	);
}
