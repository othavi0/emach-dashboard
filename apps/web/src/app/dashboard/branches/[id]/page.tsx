import { Building2, Package, ShoppingCart, Users } from "lucide-react";
import { notFound } from "next/navigation";
import type { EntityTab } from "@/components/entity/entity-tabs";
import { EntityTabs } from "@/components/entity/entity-tabs";
import { can, requireCapabilityOrRedirect } from "@/lib/permissions";
import {
	getBranchDetail,
	getBranchDetailKpis,
	getBranchRecentOrders,
	getBranchTeam,
} from "../data";
import { BranchEditSheet } from "./_components/branch-edit-sheet";
import { BranchIdentity } from "./_components/branch-identity";
import { EditBranchButton } from "./_components/edit-branch-button";
import { OrdersTab } from "./_components/orders-tab";
import { OverviewTab } from "./_components/overview-tab";
import { StockTab } from "./_components/stock-tab";
import { TeamLinkPanel } from "./_components/team-link-panel";
import { TeamTab } from "./_components/team-tab";
import { AddToolButton } from "./stock/_components/add-tool-button";

interface PageProps {
	params: Promise<{ id: string }>;
	searchParams: Promise<{
		edit?: string;
		tab?: string;
		categoryId?: string;
		search?: string;
		sort?: string;
		status?: string;
	}>;
}

export default async function BranchDetailPage({
	params,
	searchParams,
}: PageProps) {
	const session = await requireCapabilityOrRedirect("branches.manage");

	const { id } = await params;
	const sp = await searchParams;

	const [detail, kpis, team, recentOrders] = await Promise.all([
		getBranchDetail(id),
		getBranchDetailKpis(id),
		getBranchTeam(id),
		getBranchRecentOrders(id),
	]);

	if (!detail) {
		notFound();
	}

	const isStockTab = sp.tab === "stock";
	const canMutateStock = can(session.user.role, "stock.adjust");

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
				<span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 font-medium text-muted-foreground text-xs tabular-nums">
					{team.length}
				</span>
			),
			content: <TeamTab branchId={id} team={team} />,
		},
		{
			value: "orders",
			label: "Pedidos",
			icon: <ShoppingCart aria-hidden className="size-3.5" />,
			content: <OrdersTab orders={recentOrders} />,
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
	];

	const headerAction = isStockTab ? (
		canMutateStock ? (
			<AddToolButton branchId={id} branchName={detail.name} />
		) : null
	) : sp.tab === "team" ? (
		<TeamLinkPanel branchId={id} />
	) : !sp.tab || sp.tab === "overview" ? (
		<EditBranchButton />
	) : null;

	return (
		<div className="flex flex-col gap-6 p-6">
			<BranchIdentity actions={headerAction} detail={detail} />
			<EntityTabs defaultValue="overview" tabs={tabs} />
			{sp.edit === "1" ? <BranchEditSheet branch={detail} /> : null}
		</div>
	);
}
