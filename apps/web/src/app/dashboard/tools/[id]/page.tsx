import { notFound } from "next/navigation";

import type { EntityTab } from "@/components/entity/entity-tabs";
import { EntityTabs } from "@/components/entity/entity-tabs";
import { can } from "@/lib/permissions";
import type { UserRole } from "@/lib/session";
import { requireCurrentSession } from "@/lib/session";

import { ActivityTab } from "./_components/activity-tab";
import { EstoqueTab } from "./_components/estoque-tab";
import { OverviewTab } from "./_components/overview-tab";
import { ToolDetailHeader } from "./_components/tool-detail-header";
import { ToolReviewsSection } from "./_components/tool-reviews-section";
import { VariantsTab } from "./_components/variants-tab";
import { getToolReviewsSummary } from "./_lib/reviews-data";
import { getToolDetail } from "./_lib/tool-detail-data";

interface PageProps {
	params: Promise<{ id: string }>;
}

export default async function ToolDetailPage({ params }: PageProps) {
	const session = await requireCurrentSession();
	const role = (session.user.role ?? "user") as UserRole;
	const canMutate = can(role, "tools.update");
	const canDelete = can(role, "tools.delete");

	const { id } = await params;
	const detail = await getToolDetail(id);

	if (!detail) {
		notFound();
	}

	const reviewsSummary = await getToolReviewsSummary(id);

	const alertCount =
		detail.stockSummary.criticalCount + detail.stockSummary.reorderCount;

	const tabs: EntityTab[] = [
		{
			value: "visao-geral",
			label: "Visão geral",
			content: (
				<OverviewTab
					attributes={detail.attributes}
					categories={detail.categories}
					images={detail.images}
					stockSummary={detail.stockSummary}
					tool={detail.tool}
				/>
			),
		},
		{
			value: "variantes",
			label: "Variantes & preços",
			content: (
				<VariantsTab
					canMutate={canMutate}
					toolId={detail.tool.id}
					variants={detail.variants}
				/>
			),
		},
		{
			value: "estoque",
			label: "Estoque",
			badge:
				alertCount > 0 ? (
					<span className="ml-1 rounded-full bg-primary/10 px-1.5 text-[10px] text-primary">
						{alertCount}
					</span>
				) : undefined,
			content: (
				<EstoqueTab
					canMutate={canMutate}
					stockRows={detail.stockRows}
					toolId={detail.tool.id}
					variants={detail.variants}
				/>
			),
		},
		{
			value: "atividade",
			label: "Atividade",
			content: <ActivityTab toolId={detail.tool.id} />,
		},
		{
			value: "avaliacoes",
			label: "Avaliações",
			content: (
				<ToolReviewsSection summary={reviewsSummary} toolId={detail.tool.id} />
			),
		},
	];

	return (
		<div className="flex flex-col gap-4">
			<ToolDetailHeader
				canDelete={canDelete}
				canMutate={canMutate}
				detail={detail}
			/>
			<EntityTabs defaultValue="visao-geral" tabs={tabs} />
		</div>
	);
}
