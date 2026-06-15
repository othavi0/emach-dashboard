import { buttonVariants } from "@emach/ui/components/button";
import { Boxes, Factory, History, Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import type { EntityTab } from "@/components/entity/entity-tabs";
import { EntityTabs } from "@/components/entity/entity-tabs";
import { can, requireCapabilityOrRedirect } from "@/lib/permissions";

import {
	getSupplierAuditLog,
	getSupplierDetail,
	getSupplierDetailKpis,
} from "../data";
import { ArchiveSupplierDialog } from "./_components/archive-supplier-dialog";
import { EstoqueTab } from "./_components/estoque-tab";
import { HistoryTab } from "./_components/history-tab";
import { OverviewTab } from "./_components/overview-tab";
import { SupplierEditSheet } from "./_components/supplier-edit-sheet";
import { SupplierIdentity } from "./_components/supplier-identity";

interface PageProps {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ edit?: string; q?: string; tab?: string }>;
}

export default async function SupplierDetailPage({
	params,
	searchParams,
}: PageProps) {
	const session = await requireCapabilityOrRedirect("suppliers.read");
	const canManage = can(session.user.role, "suppliers.manage");

	const { id } = await params;
	const sp = await searchParams;

	const [detail, kpis] = await Promise.all([
		getSupplierDetail(id),
		getSupplierDetailKpis(id),
	]);

	if (!detail) {
		notFound();
	}

	const tab = sp.tab ?? "overview";
	const audit = tab === "history" ? await getSupplierAuditLog(id) : [];

	let headerAction: React.ReactNode = null;
	if (canManage && tab === "overview") {
		headerAction = (
			<div className="flex items-center gap-2">
				<Link
					className={buttonVariants({ size: "sm", variant: "outline" })}
					href={`/dashboard/suppliers/${id}?edit=1`}
				>
					<Pencil aria-hidden className="mr-1.5 size-3.5" />
					Editar
				</Link>
				<ArchiveSupplierDialog
					status={detail.status}
					supplierId={id}
					supplierName={detail.name}
				/>
			</div>
		);
	}

	const tabs: EntityTab[] = [
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
			content:
				tab === "estoque" ? <EstoqueTab search={sp.q} supplierId={id} /> : null,
		},
		{
			value: "history",
			label: "Histórico",
			icon: <History aria-hidden className="size-3.5" />,
			content: tab === "history" ? <HistoryTab rows={audit} /> : null,
		},
	];

	return (
		<div className="flex flex-col gap-6 p-6">
			<SupplierIdentity actions={headerAction} detail={detail} />
			<EntityTabs defaultValue="overview" tabs={tabs} />
			{sp.edit === "1" ? <SupplierEditSheet supplier={detail} /> : null}
		</div>
	);
}
