import { Info, Wrench } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import type { EntityClientTab } from "@/components/entity/entity-client-tabs";
import { EntityClientTabs } from "@/components/entity/entity-client-tabs";
import { can, requireCapabilityOrRedirect } from "@/lib/permissions";
import { getPromotion } from "../data";
import { OverviewTab } from "./_components/overview-tab";
import { PromotionDetailActions } from "./_components/promotion-detail-actions";
import { PromotionIdentity } from "./_components/promotion-identity";
import { ToolsTab } from "./_components/tools-tab";

export const metadata: Metadata = {
	title: "Detalhe da promoção",
};

interface PageProps {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ tab?: string }>;
}

export default function PromotionDetailPage({
	params,
	searchParams,
}: PageProps) {
	return (
		<PromotionDetailPageContent params={params} searchParams={searchParams} />
	);
}

async function PromotionDetailPageContent({ params, searchParams }: PageProps) {
	const session = await requireCapabilityOrRedirect("promotions.manage");
	const canDelete = await can(session, "promotions.delete");

	const { id } = await params;
	const sp = await searchParams;

	const detail = await getPromotion(id);

	if (!detail) {
		notFound();
	}

	const KNOWN_TABS = new Set(["overview", "tools"]);
	const initialTab = sp.tab && KNOWN_TABS.has(sp.tab) ? sp.tab : "overview";

	const tabs: EntityClientTab[] = [
		{
			value: "overview",
			label: "Visão geral",
			icon: <Info aria-hidden className="size-3.5" />,
			content: <OverviewTab detail={detail} />,
		},
		{
			value: "tools",
			label: "Ferramentas",
			icon: <Wrench aria-hidden className="size-3.5" />,
			lazy: true,
			badge: (
				<span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-secondary px-1 font-medium text-secondary-foreground text-xs tabular-nums">
					{detail.tools.length}
				</span>
			),
			content: <ToolsTab detail={detail} />,
		},
	];

	return (
		<div className="flex flex-col gap-6 p-6">
			<EntityClientTabs
				defaultValue="overview"
				header={
					<PromotionIdentity
						actions={
							<PromotionDetailActions canDelete={canDelete} detail={detail} />
						}
						detail={detail}
					/>
				}
				initialTab={initialTab}
				tabs={tabs}
			/>
		</div>
	);
}
