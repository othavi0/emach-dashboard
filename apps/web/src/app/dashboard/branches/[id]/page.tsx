import {
	Activity,
	Building2,
	Package,
	ShoppingCart,
	Users,
} from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import type { EntityClientTab } from "@/components/entity/entity-client-tabs";
import { EntityClientTabs } from "@/components/entity/entity-client-tabs";
import { can, requireCapabilityOrRedirect } from "@/lib/permissions";
import { getBranchDetail, getBranchDetailKpis } from "../data";
import { ActivityTabLoader } from "./_components/activity-tab-loader";
import { BranchDetailActions } from "./_components/branch-detail-actions";
import { BranchEditSheet } from "./_components/branch-edit-sheet";
import { BranchIdentity } from "./_components/branch-identity";
import { OrdersTabLoader } from "./_components/orders-tab-loader";
import { OverviewTab } from "./_components/overview-tab";
import { StockTabLoader } from "./_components/stock-tab-loader";
import { TeamTabLoader } from "./_components/team-tab-loader";

export const metadata: Metadata = {
	title: "Detalhe da filial",
};

interface PageProps {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ edit?: string; tab?: string }>;
}

export default function BranchDetailPage({ params, searchParams }: PageProps) {
	return (
		<BranchDetailPageContent params={params} searchParams={searchParams} />
	);
}

async function BranchDetailPageContent({ params, searchParams }: PageProps) {
	const session = await requireCapabilityOrRedirect("branches.read");
	const [canManageBranch, canManageTeam] = await Promise.all([
		can(session, "branches.manage"),
		can(session, "users.manage"),
	]);

	const { id } = await params;
	const sp = await searchParams;

	const [detail, kpis] = await Promise.all([
		getBranchDetail(id),
		getBranchDetailKpis(id),
	]);

	if (!detail) {
		notFound();
	}

	const KNOWN_TABS = new Set([
		"overview",
		"orders",
		"stock",
		"activity",
		...(canManageTeam ? ["team"] : []),
	]);
	const initialTab = sp.tab && KNOWN_TABS.has(sp.tab) ? sp.tab : "overview";

	const tabs: EntityClientTab[] = [
		{
			value: "overview",
			label: "Visão geral",
			icon: <Building2 aria-hidden className="size-3.5" />,
			content: <OverviewTab detail={detail} kpis={kpis} />,
		},
		...(canManageTeam
			? [
					{
						value: "team",
						label: "Equipe",
						icon: <Users aria-hidden className="size-3.5" />,
						badge: (
							<span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-secondary px-1 font-medium text-secondary-foreground text-xs tabular-nums">
								{kpis.teamSize}
							</span>
						),
						lazy: true,
						content: <TeamTabLoader branchId={id} />,
					},
				]
			: []),
		{
			value: "orders",
			label: "Pedidos",
			icon: <ShoppingCart aria-hidden className="size-3.5" />,
			lazy: true,
			content: <OrdersTabLoader branchId={id} />,
		},
		{
			value: "stock",
			label: "Estoque",
			icon: <Package aria-hidden className="size-3.5" />,
			lazy: true,
			content: <StockTabLoader branchId={id} branchName={detail.name} />,
		},
		{
			value: "activity",
			label: "Atividade",
			icon: <Activity aria-hidden className="size-3.5" />,
			lazy: true,
			content: <ActivityTabLoader branchId={id} />,
		},
	];

	return (
		<div className="flex flex-col gap-6 p-6">
			<EntityClientTabs
				defaultValue="overview"
				header={
					<BranchIdentity
						actions={
							<BranchDetailActions
								branchId={id}
								canManageBranch={canManageBranch}
								canManageTeam={canManageTeam}
							/>
						}
						detail={detail}
					/>
				}
				initialTab={initialTab}
				tabs={tabs}
			/>
			{sp.edit === "1" ? <BranchEditSheet branch={detail} /> : null}
		</div>
	);
}
