import { Building2, Package, ShoppingCart, Users } from "lucide-react";
import { notFound } from "next/navigation";
import type { EntityTab } from "@/components/entity/entity-tabs";
import { EntityTabs } from "@/components/entity/entity-tabs";
import { requireCapabilityOrRedirect } from "@/lib/permissions";
import {
	getBranchDetail,
	getBranchDetailKpis,
	getBranchRecentOrders,
	getBranchTeam,
} from "../data";
import { BranchEditSheet } from "./_components/branch-edit-sheet";
import { BranchIdentity } from "./_components/branch-identity";
import { OrdersTab } from "./_components/orders-tab";
import { OverviewTab } from "./_components/overview-tab";
import { TeamTab } from "./_components/team-tab";

interface PageProps {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ edit?: string; tab?: string }>;
}

export default async function BranchDetailPage({
	params,
	searchParams,
}: PageProps) {
	await requireCapabilityOrRedirect("branches.manage");

	const { id } = await params;
	const { edit } = await searchParams;

	const [detail, kpis, team, recentOrders] = await Promise.all([
		getBranchDetail(id),
		getBranchDetailKpis(id),
		getBranchTeam(id),
		getBranchRecentOrders(id),
	]);

	if (!detail) {
		notFound();
	}

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
			href: `/dashboard/branches/${id}/stock`,
		},
	];

	return (
		<div className="flex flex-col gap-6 p-6">
			<BranchIdentity detail={detail} />
			<EntityTabs defaultValue="overview" tabs={tabs} />
			{edit === "1" ? <BranchEditSheet branch={detail} /> : null}
		</div>
	);
}
