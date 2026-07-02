import { Boxes, Factory, History } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import type { EntityClientTab } from "@/components/entity/entity-client-tabs";
import { EntityClientTabs } from "@/components/entity/entity-client-tabs";
import { clampInitialTab } from "@/components/entity/tab-url";
import { can, requireCapabilityOrRedirect } from "@/lib/permissions";

import { getSupplierDetail, getSupplierDetailKpis } from "../data";
import { EstoqueTabLoader } from "./_components/estoque-tab-loader";
import { HistoryTabLoader } from "./_components/history-tab-loader";
import { OverviewTab } from "./_components/overview-tab";
import { SupplierDetailActions } from "./_components/supplier-detail-actions";
import { SupplierEditSheet } from "./_components/supplier-edit-sheet";
import { SupplierIdentity } from "./_components/supplier-identity";

export const metadata: Metadata = {
	title: "Detalhe do fornecedor",
};

interface PageProps {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ edit?: string; tab?: string }>;
}

export default function SupplierDetailPage({
	params,
	searchParams,
}: PageProps) {
	return (
		<SupplierDetailPageContent params={params} searchParams={searchParams} />
	);
}

async function SupplierDetailPageContent({ params, searchParams }: PageProps) {
	const session = await requireCapabilityOrRedirect("suppliers.read");
	const canManage = await can(session, "suppliers.manage");

	const { id } = await params;
	const sp = await searchParams;

	const [detail, kpis] = await Promise.all([
		getSupplierDetail(id),
		getSupplierDetailKpis(id),
	]);

	if (!detail) {
		notFound();
	}

	const tabs: EntityClientTab[] = [
		{
			value: "overview",
			label: "Visão geral",
			icon: <Factory aria-hidden className="size-3.5" />,
			content: <OverviewTab detail={detail} kpis={kpis} />,
		},
		{
			value: "estoque",
			label: "Estoque",
			icon: <Boxes aria-hidden className="size-3.5" />,
			badge: (
				<span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-secondary px-1 font-medium text-secondary-foreground text-xs tabular-nums">
					{detail.toolsTotal}
				</span>
			),
			lazy: true,
			content: <EstoqueTabLoader supplierId={id} />,
		},
		{
			value: "history",
			label: "Histórico",
			icon: <History aria-hidden className="size-3.5" />,
			lazy: true,
			content: <HistoryTabLoader supplierId={id} />,
		},
	];

	const initialTab = clampInitialTab(sp.tab, tabs, "overview");

	return (
		<div className="flex flex-col gap-6 p-6">
			<EntityClientTabs
				defaultValue="overview"
				header={
					<SupplierIdentity
						actions={
							<SupplierDetailActions canManage={canManage} detail={detail} />
						}
						detail={detail}
					/>
				}
				initialTab={initialTab}
				tabs={tabs}
			/>
			{sp.edit === "1" ? <SupplierEditSheet supplier={detail} /> : null}
		</div>
	);
}
