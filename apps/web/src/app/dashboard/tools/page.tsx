import { db } from "@emach/db";
import { category } from "@emach/db/schema/categories";
import { buttonVariants } from "@emach/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@emach/ui/components/empty";
import { type and, asc, ilike, sql } from "drizzle-orm";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { requireCurrentSession } from "@/lib/session";
import { ToolFilters } from "./_components/tool-filters";
import { type ToolRow, ToolsTable } from "./_components/tools-table";

interface PageProps {
	searchParams: Promise<{
		categoryId?: string;
		ncm?: string;
		q?: string;
		search?: string;
		status?: string;
		visible?: string;
	}>;
}

async function fetchCategories() {
	return db
		.select({ id: category.id, name: category.name })
		.from(category)
		.orderBy(asc(category.path));
}

async function fetchTools(params: {
	categoryId?: string;
	ncm?: string;
	search?: string;
	status?: string;
	visible?: string;
}): Promise<ToolRow[]> {
	const conditions = [] as Parameters<typeof and>[number][];

	if (params.search) {
		conditions.push(ilike(sql`t.name`, `%${params.search}%`));
	}
	if (params.categoryId) {
		conditions.push(
			sql`EXISTS (SELECT 1 FROM tool_category tc WHERE tc.tool_id = t.id AND tc.category_id = ${params.categoryId})`
		);
	}
	if (params.visible === "true") {
		conditions.push(sql`t.visible_on_site = true`);
	} else if (params.visible === "false") {
		conditions.push(sql`t.visible_on_site = false`);
	}
	if (params.status) {
		const statuses = params.status.split(",").filter(Boolean);
		if (statuses.length > 0) {
			const placeholders = sql.join(
				statuses.map((s) => sql`${s}`),
				sql`, `
			);
			conditions.push(sql`t.status IN (${placeholders})`);
		}
	}
	if (params.ncm) {
		conditions.push(sql`t.ncm ILIKE ${`${params.ncm}%`}`);
	}

	const whereClause = conditions.length
		? sql`WHERE ${sql.join(conditions, sql` AND `)}`
		: sql``;

	const rows = await db.execute<{
		id: string;
		name: string;
		slug: string | null;
		default_sku: string | null;
		default_voltage: string | null;
		variant_count: number;
		model: string | null;
		status: string;
		image_url: string | null;
		visible_on_site: boolean;
		primary_category_name: string | null;
		supplier_name: string | null;
		total_stock: number;
	}>(sql`
		SELECT
			t.id,
			t.name,
			t.slug,
			(
				SELECT tv.sku FROM tool_variant tv
				WHERE tv.tool_id = t.id AND tv.is_default = true
				LIMIT 1
			) AS default_sku,
			(
				SELECT tv.voltage::text FROM tool_variant tv
				WHERE tv.tool_id = t.id AND tv.is_default = true
				LIMIT 1
			) AS default_voltage,
			(SELECT COUNT(*)::int FROM tool_variant tv WHERE tv.tool_id = t.id) AS variant_count,
			t.model,
			t.status,
			(
				SELECT ti.url
				FROM tool_image ti
				WHERE ti.tool_id = t.id
				ORDER BY ti.sort_order ASC
				LIMIT 1
			) AS image_url,
			t.visible_on_site,
			(
				SELECT c.name
				FROM tool_category tc
				JOIN category c ON c.id = tc.category_id
				WHERE tc.tool_id = t.id AND tc.is_primary = true
				LIMIT 1
			) AS primary_category_name,
			s.name AS supplier_name,
			COALESCE((
				SELECT SUM(sl.quantity)::int FROM stock_level sl
				JOIN tool_variant tv ON tv.id = sl.variant_id
				WHERE tv.tool_id = t.id
			), 0) AS total_stock
		FROM tool t
		LEFT JOIN supplier s ON s.id = t.supplier_id
		${whereClause}
		ORDER BY t.name ASC
	`);

	return rows.rows.map((r) => ({
		id: r.id,
		name: r.name,
		slug: r.slug,
		sku: r.default_sku,
		voltage: r.default_voltage,
		variantCount: Number(r.variant_count ?? 0),
		model: r.model,
		status: r.status,
		imageUrl: r.image_url,
		visibleOnSite: r.visible_on_site,
		primaryCategoryName: r.primary_category_name,
		supplierName: r.supplier_name,
		totalStock: Number(r.total_stock ?? 0),
	}));
}

export default async function ToolsPage({ searchParams }: PageProps) {
	const session = await requireCurrentSession();
	const role = session.user.role ?? "user";
	const canMutate = role === "admin";
	const params = await searchParams;
	const search = params.search ?? params.q;

	const [tools, categories] = await Promise.all([
		fetchTools({ ...params, search }),
		fetchCategories(),
	]);

	const hasFilters = Boolean(
		search || params.visible || params.status || params.categoryId || params.ncm
	);
	const isEmpty = tools.length === 0;

	return (
		<>
			<PageHeader
				action={
					canMutate ? (
						<Link
							className={buttonVariants({ variant: "default" })}
							href="/dashboard/tools/new"
						>
							Nova ferramenta
						</Link>
					) : null
				}
				description="Gerencie o catálogo de ferramentas e suas configurações de exibição."
				title="Ferramentas"
			/>

			<ToolFilters categories={categories} />

			{isEmpty ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>Nenhuma ferramenta encontrada</EmptyTitle>
						<EmptyDescription>
							{hasFilters
								? "Tente ajustar os filtros para encontrar o que procura."
								: "Comece cadastrando sua primeira ferramenta no catálogo."}
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						{hasFilters ? (
							<Link
								className={buttonVariants({ variant: "ghost" })}
								href="/dashboard/tools"
							>
								Limpar filtros
							</Link>
						) : (
							canMutate && (
								<Link
									className={buttonVariants({ variant: "default" })}
									href="/dashboard/tools/new"
								>
									Nova ferramenta
								</Link>
							)
						)}
					</EmptyContent>
				</Empty>
			) : (
				<ToolsTable canMutate={canMutate} tools={tools} />
			)}
		</>
	);
}
