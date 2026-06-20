import { buttonVariants } from "@emach/ui/components/button";
import { Info, Settings2, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import type { EntityTab } from "@/components/entity/entity-tabs";
import { EntityTabs } from "@/components/entity/entity-tabs";
import { can, requireCapabilityOrRedirect } from "@/lib/permissions";
import { getPromotion } from "../data";
import { OverviewTab } from "./_components/overview-tab";
import { PromotionHeaderActions } from "./_components/promotion-header-actions";
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

	const isToolsTab = sp.tab === "tools";

	const tabs: EntityTab[] = [
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
			badge: (
				<span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-secondary px-1 font-medium text-secondary-foreground text-xs tabular-nums">
					{detail.tools.length}
				</span>
			),
			content: isToolsTab ? <ToolsTab detail={detail} /> : null,
		},
	];

	const headerAction = isToolsTab ? (
		<Link
			className={buttonVariants({ variant: "default" })}
			href={`/dashboard/promotions/${id}/edit`}
		>
			<Settings2 aria-hidden className="mr-1.5 size-4" />
			Gerenciar ferramentas
		</Link>
	) : (
		<PromotionHeaderActions canDelete={canDelete} promotion={detail} />
	);

	return (
		<div className="flex flex-col gap-6 p-6">
			<PromotionIdentity actions={headerAction} detail={detail} />
			<EntityTabs defaultValue="overview" tabs={tabs} />
		</div>
	);
}
