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

import type { EntityClientTab } from "@/components/entity/entity-client-tabs";
import { EntityClientTabs } from "@/components/entity/entity-client-tabs";
import { clampInitialTab } from "@/components/entity/tab-url";
import { can, requireCapabilityOrRedirect } from "@/lib/permissions";
import { CustomerEditSheet } from "../_components/customer-edit-sheet";
import { CustomerIdentity } from "../_components/customer-identity";
import { CustomerOverviewTab } from "../_components/customer-overview-tab";
import {
	getCustomerDetail,
	getCustomerKpis,
	getCustomerSessionsCount,
	listCustomerOrders,
} from "../data";
import { AddressesTabLoader } from "./_components/addresses-tab-loader";
import { AuditTabLoader } from "./_components/audit-tab-loader";
import { ConsentTabLoader } from "./_components/consent-tab-loader";
import { CustomerDetailActions } from "./_components/customer-detail-actions";
import { OrdersTabLoader } from "./_components/orders-tab-loader";
import { ReviewsTabLoader } from "./_components/reviews-tab-loader";
import { SessionsTabLoader } from "./_components/sessions-tab-loader";

export const metadata: Metadata = { title: "Detalhe do cliente" };

interface PageProps {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ edit?: string; tab?: string }>;
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
	const sp = await searchParams;

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

	const [kpis, recentOrders, sessionsCount] = await Promise.all([
		getCustomerKpis(id),
		listCustomerOrders({ clientId: id, cursor: null }),
		getCustomerSessionsCount(id),
	]);

	const tabs: EntityClientTab[] = [
		{
			value: "perfil",
			label: "Visão geral",
			icon: <User aria-hidden className="size-3.5" />,
			content: (
				<CustomerOverviewTab
					customer={customer}
					kpis={kpis}
					recentOrders={recentOrders.items.slice(0, 3)}
				/>
			),
		},
		{
			value: "enderecos",
			label: "Endereços",
			icon: <MapPin aria-hidden className="size-3.5" />,
			lazy: true,
			content: <AddressesTabLoader clientId={id} />,
		},
		{
			value: "pedidos",
			label: "Pedidos",
			icon: <ShoppingCart aria-hidden className="size-3.5" />,
			lazy: true,
			content: <OrdersTabLoader clientId={id} />,
		},
		{
			value: "avaliacoes",
			label: "Avaliações",
			icon: <Star aria-hidden className="size-3.5" />,
			lazy: true,
			content: (
				<ReviewsTabLoader canModerate={canModerateReviews} clientId={id} />
			),
		},
		{
			value: "consentimento",
			label: "Consentimento",
			icon: <ShieldCheck aria-hidden className="size-3.5" />,
			lazy: true,
			content: <ConsentTabLoader clientId={id} />,
		},
		{
			value: "sessoes",
			label: "Sessões",
			icon: <Monitor aria-hidden className="size-3.5" />,
			lazy: true,
			content: (
				<SessionsTabLoader canManage={canManageSessions} clientId={id} />
			),
		},
		{
			value: "auditoria",
			label: "Auditoria",
			icon: <FileClock aria-hidden className="size-3.5" />,
			lazy: true,
			content: <AuditTabLoader clientId={id} />,
		},
	];

	const initialTab = clampInitialTab(sp.tab, tabs, "perfil");

	return (
		<div className="flex flex-col gap-6 p-6">
			<EntityClientTabs
				defaultValue="perfil"
				header={
					<CustomerIdentity
						actions={
							<CustomerDetailActions
								canEdit={canEdit}
								canManageSessions={canManageSessions}
								canResetPassword={canResetPassword}
								clientId={id}
								clientName={customer.name}
								sessionsCount={sessionsCount}
							/>
						}
						customer={customer}
					/>
				}
				initialTab={initialTab}
				tabs={tabs}
			/>
			{sp.edit === "1" ? <CustomerEditSheet customer={customer} /> : null}
		</div>
	);
}
