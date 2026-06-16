import {
	Activity,
	Building2,
	Package,
	ShoppingCart,
	Users,
} from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { EntityTab } from "@/components/entity/entity-tabs";
import { EntityTabs } from "@/components/entity/entity-tabs";
import { requireCapabilityOrRedirect } from "@/lib/permissions";
import { getBranchDetail, getBranchDetailKpis } from "../data";
import { ActivityTab } from "./_components/activity-tab";
import { BranchEditSheet } from "./_components/branch-edit-sheet";
import { BranchIdentity } from "./_components/branch-identity";
import { EditBranchButton } from "./_components/edit-branch-button";
import { OrdersTab } from "./_components/orders-tab";
import { OverviewTab } from "./_components/overview-tab";
import { StockTab } from "./_components/stock-tab";
import { TeamLinkPanel } from "./_components/team-link-panel";
import { TeamTab } from "./_components/team-tab";

export const metadata: Metadata = {
	title: "Detalhe da filial",
};

interface PageProps {
	params: Promise<{ id: string }>;
	searchParams: Promise<{
		edit?: string;
		tab?: string;
		categoryId?: string;
		search?: string;
		sort?: string;
		status?: string;
		type?: string;
		toolId?: string;
		period?: string;
	}>;
}

export default async function BranchDetailPage({
	params,
	searchParams,
}: PageProps) {
	await requireCapabilityOrRedirect("branches.manage");

	const { id } = await params;
	const sp = await searchParams;

	const [detail, kpis] = await Promise.all([
		getBranchDetail(id),
		getBranchDetailKpis(id),
	]);

	if (!detail) {
		notFound();
	}

	const isStockTab = sp.tab === "stock";

	const tabs: EntityTab[] = [
		{
			value: "overview",
			label: "Visão geral",
			icon: <Building2 aria-hidden className="size-3.5" />,
			content: <OverviewTab detail={detail} kpis={kpis} />,
		},
		{
			value: "team",
			label: "Equipe",
			icon: <Users aria-hidden className="size-3.5" />,
			badge: (
				<span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-secondary px-1 font-medium text-secondary-foreground text-xs tabular-nums">
					{kpis.teamSize}
				</span>
			),
			content: sp.tab === "team" ? <TeamTab branchId={id} /> : null,
		},
		{
			value: "orders",
			label: "Pedidos",
			icon: <ShoppingCart aria-hidden className="size-3.5" />,
			content: sp.tab === "orders" ? <OrdersTab branchId={id} /> : null,
		},
		{
			value: "stock",
			label: "Estoque",
			icon: <Package aria-hidden className="size-3.5" />,
			content: isStockTab ? (
				<StockTab
					branchId={id}
					branchName={detail.name}
					categoryId={sp.categoryId}
					search={sp.search}
					sort={sp.sort}
					status={sp.status}
				/>
			) : null,
		},
		{
			value: "activity",
			label: "Atividade",
			icon: <Activity aria-hidden className="size-3.5" />,
			content:
				sp.tab === "activity" ? (
					<ActivityTab
						branchId={id}
						period={sp.period}
						toolId={sp.toolId}
						type={sp.type}
					/>
				) : null,
		},
	];

	let headerAction: React.ReactNode = null;
	if (sp.tab === "team") {
		headerAction = <TeamLinkPanel branchId={id} />;
	} else if (!sp.tab || sp.tab === "overview") {
		headerAction = <EditBranchButton />;
	}

	return (
		<div className="flex flex-col gap-6 p-6">
			<BranchIdentity actions={headerAction} detail={detail} />
			<EntityTabs defaultValue="overview" tabs={tabs} />
			{sp.edit === "1" ? <BranchEditSheet branch={detail} /> : null}
		</div>
	);
}
