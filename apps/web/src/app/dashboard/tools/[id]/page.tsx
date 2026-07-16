import { Activity, Boxes, Info, Star, Tag } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
	type EntityClientTab,
	EntityClientTabs,
} from "@/components/entity/entity-client-tabs";
import { can } from "@/lib/permissions";
import { requireCurrentSession } from "@/lib/session";
import { ActivityTabLoader } from "./_components/activity-tab-loader";
import { EstoqueTab } from "./_components/estoque-tab";
import { OverviewTab } from "./_components/overview-tab";
import { ReviewsTabLoader } from "./_components/reviews-tab-loader";
import { ToolDetailActions } from "./_components/tool-detail-actions";
import { ToolDetailHeader } from "./_components/tool-detail-header";
import { VariantsTab } from "./_components/variants-tab";
import { getToolDetail } from "./_lib/tool-detail-data";

export const metadata: Metadata = {
	title: "Detalhe da ferramenta",
};

interface PageProps {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ tab?: string; variant?: string }>;
}

export default function ToolDetailPage({ params, searchParams }: PageProps) {
	return <ToolDetailPageContent params={params} searchParams={searchParams} />;
}

async function ToolDetailPageContent({ params, searchParams }: PageProps) {
	const session = await requireCurrentSession();
	const [{ id }, { tab, variant }] = await Promise.all([params, searchParams]);
	const [canMutate, canDelete, detail] = await Promise.all([
		can(session, "tools.update"),
		can(session, "tools.delete"),
		getToolDetail(id),
	]);

	if (!detail) {
		notFound();
	}

	const defaultValue = "visao-geral";
	// ?variant= define a tab inicial (Variantes) só quando nenhuma ?tab= explícita foi dada.
	const KNOWN_TABS = new Set([
		"visao-geral",
		"variantes",
		"estoque",
		"atividade",
		"avaliacoes",
	]);
	const candidateTab = tab ?? (variant ? "variantes" : defaultValue);
	const initialTab = KNOWN_TABS.has(candidateTab) ? candidateTab : defaultValue;

	const alertCount =
		detail.stockSummary.criticalCount + detail.stockSummary.reorderCount;

	const tabs: EntityClientTab[] = [
		{
			value: "visao-geral",
			label: "Visão geral",
			icon: <Info aria-hidden className="size-3.5" />,
			content: (
				<OverviewTab
					attributes={detail.attributes}
					cartSummary={detail.cartSummary}
					categories={detail.categories}
					images={detail.images}
					stockSummary={detail.stockSummary}
					tool={detail.tool}
					variants={detail.variants}
				/>
			),
		},
		{
			value: "variantes",
			label: "Variantes & preços",
			icon: <Tag aria-hidden className="size-3.5" />,
			content: (
				<VariantsTab
					canDelete={canDelete}
					canMutate={canMutate}
					highlightVariantId={variant}
					orderedVariantIds={detail.orderedVariantIds}
					stockedVariantIds={detail.stockedVariantIds}
					toolId={detail.tool.id}
					toolName={detail.tool.name}
					variants={detail.variants}
				/>
			),
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
			content: (
				<EstoqueTab
					canMutate={canMutate}
					stockRows={detail.stockRows}
					toolId={detail.tool.id}
					toolImageUrl={detail.images[0]?.url ?? null}
					toolName={detail.tool.name}
					variants={detail.variants}
				/>
			),
		},
		{
			value: "atividade",
			label: "Atividade",
			icon: <Activity aria-hidden className="size-3.5" />,
			lazy: true,
			content: <ActivityTabLoader toolId={detail.tool.id} />,
		},
		{
			value: "avaliacoes",
			label: "Avaliações",
			icon: <Star aria-hidden className="size-3.5" />,
			lazy: true,
			content: <ReviewsTabLoader toolId={detail.tool.id} />,
		},
	];

	return (
		<EntityClientTabs
			clearParams={["variant"]}
			defaultValue={defaultValue}
			header={
				<ToolDetailHeader
					actions={
						<ToolDetailActions canMutate={canMutate} toolId={detail.tool.id} />
					}
					detail={detail}
				/>
			}
			initialTab={initialTab}
			tabs={tabs}
		/>
	);
}
