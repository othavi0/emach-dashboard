import { Factory, History, Wrench } from "lucide-react";
import { notFound } from "next/navigation";

import type { EntityTab } from "@/components/entity/entity-tabs";
import { EntityTabs } from "@/components/entity/entity-tabs";
import { requireCapabilityOrRedirect } from "@/lib/permissions";

import {
	getSupplierAuditLog,
	getSupplierDetail,
	getSupplierDetailKpis,
	getSupplierTools,
} from "../data";
import { HistoryTab } from "./_components/history-tab";
import { OverviewTab } from "./_components/overview-tab";
import { SupplierEditSheet } from "./_components/supplier-edit-sheet";
import { SupplierIdentity } from "./_components/supplier-identity";
import { ToolsTab } from "./_components/tools-tab";

interface PageProps {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ edit?: string; q?: string; tab?: string }>;
}

export default async function SupplierDetailPage({
	params,
	searchParams,
}: PageProps) {
	await requireCapabilityOrRedirect("suppliers.read");

	const { id } = await params;
	const sp = await searchParams;

	const [detail, kpis, tools, audit] = await Promise.all([
		getSupplierDetail(id),
		getSupplierDetailKpis(id),
		getSupplierTools(id, sp.q ?? ""),
		getSupplierAuditLog(id),
	]);

	if (!detail) {
		notFound();
	}

	const tabs: EntityTab[] = [
		{
			value: "overview",
			label: "Visão geral",
			icon: Factory,
			content: <OverviewTab detail={detail} kpis={kpis} />,
		},
		{
			value: "tools",
			label: "Ferramentas",
			icon: Wrench,
			badge: (
				<span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 font-medium text-muted-foreground text-xs tabular-nums">
					{detail.toolsTotal}
				</span>
			),
			content: (
				<ToolsTab initialSearch={sp.q ?? ""} supplierId={id} tools={tools} />
			),
		},
		{
			value: "history",
			label: "Histórico",
			icon: History,
			content: <HistoryTab rows={audit} />,
		},
	];

	return (
		<div className="flex flex-col gap-6 p-6">
			<SupplierIdentity detail={detail} />
			<EntityTabs defaultValue="overview" tabs={tabs} />
			{sp.edit === "1" ? <SupplierEditSheet supplier={detail} /> : null}
		</div>
	);
}
