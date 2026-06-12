import { Activity, Boxes, Info, Star, Tag } from "lucide-react";
import { notFound } from "next/navigation";

import type { EntityTab } from "@/components/entity/entity-tabs";
import { EntityTabs } from "@/components/entity/entity-tabs";
import { can } from "@/lib/permissions";
import type { UserRole } from "@/lib/session";
import { requireCurrentSession } from "@/lib/session";

import { ActivityTab } from "./_components/activity-tab";
import { EstoqueTab } from "./_components/estoque-tab";
import { OverviewTab } from "./_components/overview-tab";
import { ToolDetailActions } from "./_components/tool-detail-actions";
import { ToolDetailHeader } from "./_components/tool-detail-header";
import { ToolReviewsSection } from "./_components/tool-reviews-section";
import { VariantsTab } from "./_components/variants-tab";
import { getToolReviewsSummary } from "./_lib/reviews-data";
import { getToolDetail } from "./_lib/tool-detail-data";

interface PageProps {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ tab?: string }>;
}

export default async function ToolDetailPage({
	params,
	searchParams,
}: PageProps) {
	const session = await requireCurrentSession();
	const role = (session.user.role ?? "user") as UserRole;
	const canMutate = can(role, "tools.update");
	const canDelete = can(role, "tools.delete");

	const { id } = await params;
	const { tab } = await searchParams;
	const detail = await getToolDetail(id);

	if (!detail) {
		notFound();
	}

	const current = tab ?? "visao-geral";
	const isOverview = current === "visao-geral";

	// Carrega o resumo de reviews só quando a aba está ativa (lazy).
	const reviewsSummary =
		current === "avaliacoes" ? await getToolReviewsSummary(id) : null;

	const alertCount =
		detail.stockSummary.criticalCount + detail.stockSummary.reorderCount;

	const tabs: EntityTab[] = [
		{
			value: "visao-geral",
			label: "Visão geral",
			icon: <Info aria-hidden className="size-3.5" />,
			content: isOverview ? (
				<OverviewTab
					attributes={detail.attributes}
					categories={detail.categories}
					images={detail.images}
					stockSummary={detail.stockSummary}
					tool={detail.tool}
				/>
			) : null,
		},
		{
			value: "variantes",
			label: "Variantes & preços",
			icon: <Tag aria-hidden className="size-3.5" />,
			content:
				current === "variantes" ? (
					<VariantsTab
						canDelete={canDelete}
						canMutate={canMutate}
						orderedVariantIds={detail.orderedVariantIds}
						toolId={detail.tool.id}
						toolName={detail.tool.name}
						variants={detail.variants}
					/>
				) : null,
		},
		{
			value: "estoque",
			label: "Estoque",
			icon: <Boxes aria-hidden className="size-3.5" />,
			badge:
				alertCount > 0 ? (
					<span className="ml-1 rounded-full bg-primary/10 px-1.5 text-[10px] text-primary">
						{alertCount}
					</span>
				) : undefined,
			content:
				current === "estoque" ? (
					<EstoqueTab
						canMutate={canMutate}
						stockRows={detail.stockRows}
						toolId={detail.tool.id}
						toolImageUrl={detail.images[0]?.url ?? null}
						toolName={detail.tool.name}
						variants={detail.variants}
					/>
				) : null,
		},
		{
			value: "atividade",
			label: "Atividade",
			icon: <Activity aria-hidden className="size-3.5" />,
			content:
				current === "atividade" ? (
					<ActivityTab toolId={detail.tool.id} />
				) : null,
		},
		{
			value: "avaliacoes",
			label: "Avaliações",
			icon: <Star aria-hidden className="size-3.5" />,
			content:
				current === "avaliacoes" && reviewsSummary ? (
					<ToolReviewsSection
						summary={reviewsSummary}
						toolId={detail.tool.id}
					/>
				) : null,
		},
	];

	return (
		<div className="flex flex-col gap-4">
			<ToolDetailHeader
				actions={
					<ToolDetailActions
						canDelete={canDelete}
						canMutate={canMutate}
						tab={current}
						toolId={detail.tool.id}
						toolName={detail.tool.name}
					/>
				}
				detail={detail}
			/>
			<EntityTabs defaultValue="visao-geral" tabs={tabs} />
		</div>
	);
}
