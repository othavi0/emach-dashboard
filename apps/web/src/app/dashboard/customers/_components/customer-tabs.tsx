import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@emach/ui/components/tabs";
import Link from "next/link";

import type {
	CustomerAddressRow,
	CustomerAuditRow,
	CustomerConsentByKind,
	CustomerDetail,
	CustomerOrdersResult,
	CustomerReviewRow,
	CustomerSessionRow,
} from "../data";
import { CustomerAddressesList } from "./customer-addresses-list";
import { CustomerAuditTable } from "./customer-audit-table";
import { CustomerConsentList } from "./customer-consent-list";
import { CustomerOrdersTable } from "./customer-orders-table";
import { CustomerProfileForm } from "./customer-profile-form";
import { CustomerReviewsTable } from "./customer-reviews-table";
import { CustomerSessionsTable } from "./customer-sessions-table";

type TabKey =
	| "perfil"
	| "enderecos"
	| "pedidos"
	| "avaliacoes"
	| "consentimento"
	| "sessoes"
	| "auditoria";

const TAB_LABELS: Record<TabKey, string> = {
	perfil: "Perfil",
	enderecos: "Endereços",
	pedidos: "Pedidos",
	avaliacoes: "Avaliações",
	consentimento: "Consentimento",
	sessoes: "Sessões",
	auditoria: "Auditoria",
};

const TAB_KEYS: TabKey[] = [
	"perfil",
	"enderecos",
	"pedidos",
	"avaliacoes",
	"consentimento",
	"sessoes",
	"auditoria",
];

interface CustomerTabsProps {
	addresses: CustomerAddressRow[];
	auditAction?: string;
	auditItems: CustomerAuditRow[] | null;
	canEdit: boolean;
	canManageSessions: boolean;
	canModerateReviews: boolean;
	consentByKind: CustomerConsentByKind | null;
	currentTab: TabKey;
	customer: CustomerDetail;
	editMode: boolean;
	ordersResult: CustomerOrdersResult | null;
	reviews: CustomerReviewRow[] | null;
	sessions: CustomerSessionRow[] | null;
}

function buildTabHref(customerId: string, tab: TabKey): string {
	const params = new URLSearchParams({ tab });
	return `/dashboard/customers/${customerId}?${params.toString()}`;
}

export function CustomerTabs({
	customer,
	currentTab,
	editMode,
	canEdit,
	canModerateReviews,
	canManageSessions,
	addresses,
	ordersResult,
	reviews,
	consentByKind,
	sessions,
	auditItems,
	auditAction,
}: CustomerTabsProps) {
	return (
		<Tabs value={currentTab}>
			<TabsList scrollable>
				{TAB_KEYS.map((key) => (
					<TabsTrigger
						key={key}
						nativeButton={false}
						render={<Link href={buildTabHref(customer.id, key)} />}
						value={key}
					>
						{TAB_LABELS[key]}
					</TabsTrigger>
				))}
			</TabsList>

			<TabsContent className="mt-4" value="perfil">
				<CustomerProfileForm
					canEdit={canEdit}
					customer={customer}
					editMode={editMode}
				/>
			</TabsContent>

			<TabsContent className="mt-4" value="enderecos">
				<CustomerAddressesList addresses={addresses} />
			</TabsContent>

			<TabsContent className="mt-4" value="pedidos">
				{ordersResult ? (
					<CustomerOrdersTable clientId={customer.id} result={ordersResult} />
				) : (
					<p className="text-muted-foreground text-sm">Carregando…</p>
				)}
			</TabsContent>

			<TabsContent className="mt-4" value="avaliacoes">
				{reviews ? (
					<CustomerReviewsTable
						canModerate={canModerateReviews}
						items={reviews}
					/>
				) : (
					<p className="text-muted-foreground text-sm">Carregando…</p>
				)}
			</TabsContent>

			<TabsContent className="mt-4" value="consentimento">
				{consentByKind ? (
					<CustomerConsentList consentByKind={consentByKind} />
				) : (
					<p className="text-muted-foreground text-sm">Carregando…</p>
				)}
			</TabsContent>

			<TabsContent className="mt-4" value="sessoes">
				{sessions ? (
					<CustomerSessionsTable
						canManage={canManageSessions}
						clientId={customer.id}
						sessions={sessions}
					/>
				) : (
					<p className="text-muted-foreground text-sm">Carregando…</p>
				)}
			</TabsContent>

			<TabsContent className="mt-4" value="auditoria">
				{auditItems ? (
					<CustomerAuditTable
						clientId={customer.id}
						currentAction={auditAction}
						items={auditItems}
					/>
				) : (
					<p className="text-muted-foreground text-sm">Carregando…</p>
				)}
			</TabsContent>
		</Tabs>
	);
}
