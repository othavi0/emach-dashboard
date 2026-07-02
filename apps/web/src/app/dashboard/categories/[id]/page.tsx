import { FolderTree, Info, Package } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import type { EntityClientTab } from "@/components/entity/entity-client-tabs";
import { EntityClientTabs } from "@/components/entity/entity-client-tabs";
import { can, requireCapabilityOrRedirect } from "@/lib/permissions";

import {
	getCategoryAncestors,
	getCategoryAttributes,
	getCategoryDetail,
} from "../data";
import { CategoryDetailActions } from "./_components/category-detail-actions";
import { CategoryDetailHeader } from "./_components/category-detail-header";
import { OverviewTab } from "./_components/overview-tab";
import { ProductsTabLoader } from "./_components/products-tab-loader";
import { SubcategoriesTabLoader } from "./_components/subcategories-tab-loader";

export const metadata: Metadata = {
	title: "Detalhe da categoria",
};

interface PageProps {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ tab?: string }>;
}

const KNOWN_TABS = new Set(["visao-geral", "produtos", "subcategorias"]);
const DEFAULT_TAB = "visao-geral";

function CountBadge({ value }: { value: number }) {
	return (
		<span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-secondary px-1 font-medium text-secondary-foreground text-xs tabular-nums">
			{value}
		</span>
	);
}

export default function CategoryDetailPage({
	params,
	searchParams,
}: PageProps) {
	return (
		<CategoryDetailPageContent params={params} searchParams={searchParams} />
	);
}

async function CategoryDetailPageContent({ params, searchParams }: PageProps) {
	const session = await requireCapabilityOrRedirect("categories.read");
	const [canDelete, canManage] = await Promise.all([
		can(session, "categories.delete"),
		can(session, "categories.manage"),
	]);

	const { id } = await params;
	const { tab } = await searchParams;
	const initialTab = tab && KNOWN_TABS.has(tab) ? tab : DEFAULT_TAB;

	const [detail, ancestors, attributes] = await Promise.all([
		getCategoryDetail(id),
		getCategoryAncestors(id),
		getCategoryAttributes(id),
	]);

	if (!detail) {
		notFound();
	}

	const { category: cat, children, productCount, rollupProductCount } = detail;

	const tabs: EntityClientTab[] = [
		{
			value: "visao-geral",
			label: "Visão geral",
			icon: <Info aria-hidden className="size-3.5" />,
			content: (
				<OverviewTab
					attributes={attributes}
					categoryId={id}
					childrenCount={children.length}
					description={cat.description}
					isActive={cat.isActive}
					productCount={productCount}
					rollupProductCount={rollupProductCount}
				/>
			),
		},
		{
			value: "produtos",
			label: "Produtos",
			icon: <Package aria-hidden className="size-3.5" />,
			badge: <CountBadge value={rollupProductCount} />,
			lazy: true,
			content: <ProductsTabLoader categoryId={id} />,
		},
		{
			value: "subcategorias",
			label: "Subcategorias",
			icon: <FolderTree aria-hidden className="size-3.5" />,
			badge: <CountBadge value={children.length} />,
			lazy: true,
			content: <SubcategoriesTabLoader categoryId={id} />,
		},
	];

	return (
		<div className="flex flex-col gap-6 p-6">
			<EntityClientTabs
				defaultValue={DEFAULT_TAB}
				header={
					<CategoryDetailHeader
						actions={
							<CategoryDetailActions
								canDelete={canDelete}
								canManage={canManage}
								categoryId={id}
								categoryName={cat.name}
								isActive={cat.isActive}
							/>
						}
						ancestors={ancestors}
						isActive={cat.isActive}
						name={cat.name}
						path={cat.path}
					/>
				}
				initialTab={initialTab}
				tabs={tabs}
			/>
		</div>
	);
}
