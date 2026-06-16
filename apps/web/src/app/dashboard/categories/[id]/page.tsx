import { buttonVariants } from "@emach/ui/components/button";
import { FolderTree, Info, Package, Pencil, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import type { EntityTab } from "@/components/entity/entity-tabs";
import { EntityTabs } from "@/components/entity/entity-tabs";
import { can } from "@/lib/permissions";
import { requireCurrentSession } from "@/lib/session";

import {
	getCategoryAncestors,
	getCategoryAttributes,
	getCategoryDetail,
} from "../actions";
import { CategoryDetailActions } from "./_components/category-detail-actions";
import { CategoryDetailHeader } from "./_components/category-detail-header";
import { OverviewTab } from "./_components/overview-tab";
import { ProductsTab } from "./_components/products-tab";
import { SubcategoriesTab } from "./_components/subcategories-tab";

export const metadata: Metadata = {
	title: "Detalhe da categoria",
};

export const dynamic = "force-dynamic";

interface PageProps {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ tab?: string }>;
}

function CountBadge({ value }: { value: number }) {
	return (
		<span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-secondary px-1 font-medium text-secondary-foreground text-xs tabular-nums">
			{value}
		</span>
	);
}

export default async function CategoryDetailPage({
	params,
	searchParams,
}: PageProps) {
	const session = await requireCurrentSession();
	const [canDelete, canManage] = await Promise.all([
		can(session, "categories.delete"),
		can(session, "categories.manage"),
	]);

	const { id } = await params;
	const { tab } = await searchParams;
	const current = tab ?? "visao-geral";
	const isOverview = current === "visao-geral";

	const [detail, ancestors] = await Promise.all([
		getCategoryDetail(id),
		getCategoryAncestors(id),
	]);

	if (!detail) {
		notFound();
	}

	const { category: cat, children, productCount, rollupProductCount } = detail;

	const attributes = isOverview ? await getCategoryAttributes(id) : [];

	const tabs: EntityTab[] = [
		{
			value: "visao-geral",
			label: "Visão geral",
			icon: <Info aria-hidden className="size-3.5" />,
			content: isOverview ? (
				<OverviewTab
					attributes={attributes}
					categoryId={id}
					childrenCount={children.length}
					description={cat.description}
					isActive={cat.isActive}
					productCount={productCount}
					rollupProductCount={rollupProductCount}
				/>
			) : null,
		},
		{
			value: "produtos",
			label: "Produtos",
			icon: <Package aria-hidden className="size-3.5" />,
			badge: <CountBadge value={rollupProductCount} />,
			content: current === "produtos" ? <ProductsTab categoryId={id} /> : null,
		},
		{
			value: "subcategorias",
			label: "Subcategorias",
			icon: <FolderTree aria-hidden className="size-3.5" />,
			badge: <CountBadge value={children.length} />,
			content:
				current === "subcategorias" ? (
					<SubcategoriesTab categoryId={id} />
				) : null,
		},
	];

	let primaryAction: React.ReactNode = null;
	if (canManage && current === "subcategorias") {
		primaryAction = (
			<Link
				className={buttonVariants({ variant: "default" })}
				href={`/dashboard/categories/new?parent=${id}`}
			>
				<Plus aria-hidden className="size-4" />
				Nova subcategoria
			</Link>
		);
	} else if (canManage && isOverview) {
		primaryAction = (
			<Link
				className={buttonVariants({ variant: "default" })}
				href={`/dashboard/categories/${id}/edit`}
			>
				<Pencil aria-hidden className="size-4" />
				Editar
			</Link>
		);
	}

	return (
		<div className="flex flex-col gap-6 p-6">
			<CategoryDetailHeader
				actions={
					<>
						{primaryAction}
						<CategoryDetailActions
							canDelete={canDelete}
							canManage={canManage}
							categoryId={id}
							categoryName={cat.name}
							isActive={cat.isActive}
						/>
					</>
				}
				ancestors={ancestors}
				isActive={cat.isActive}
				name={cat.name}
				path={cat.path}
			/>
			<EntityTabs defaultValue="visao-geral" tabs={tabs} />
		</div>
	);
}
