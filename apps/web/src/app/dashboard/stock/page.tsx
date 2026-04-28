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
import { asc, sql } from "drizzle-orm";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { requireCurrentSession } from "@/lib/session";
import { StockFilters } from "./_components/stock-filters";
import { type StockRow, StockTable } from "./_components/stock-table";

export const dynamic = "force-dynamic";

interface StockPageRow extends Record<string, unknown> {
	branches_breakdown: Array<{
		branch_id: string;
		branch_name: string;
		quantity: number;
	}> | null;
	default_sku: string | null;
	default_voltage: string | null;
	id: string;
	image_url: string | null;
	name: string;
	slug: string | null;
	total_stock: number;
	variant_count: number;
}

interface StockPageParams {
	categoryId?: string;
	ordem?: "nome" | "maior" | "menor";
	q?: string;
	search?: string;
}

interface StockPageProps {
	searchParams: Promise<StockPageParams>;
}

async function fetchCategories() {
	return await db
		.select({
			id: category.id,
			name: category.name,
			path: category.path,
			depth: category.depth,
		})
		.from(category)
		.orderBy(asc(category.path));
}

async function fetchStockRows(params: StockPageParams): Promise<StockRow[]> {
	const whereClauses = [] as ReturnType<typeof sql>[];
	if (params.search) {
		whereClauses.push(sql`t.name ILIKE ${`%${params.search}%`}`);
	}
	if (params.categoryId) {
		whereClauses.push(
			sql`EXISTS (SELECT 1 FROM tool_category tc WHERE tc.tool_id = t.id AND tc.category_id = ${params.categoryId})`
		);
	}
	const whereClause = whereClauses.length
		? sql`WHERE ${sql.join(whereClauses, sql` AND `)}`
		: sql``;

	let orderClause = sql`ORDER BY t.name ASC`;
	if (params.ordem === "maior") {
		orderClause = sql`ORDER BY total_stock DESC NULLS LAST, t.name ASC`;
	} else if (params.ordem === "menor") {
		orderClause = sql`ORDER BY total_stock ASC NULLS FIRST, t.name ASC`;
	}

	const result = await db.execute<StockPageRow>(sql`
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
			(
				SELECT ti.url
				FROM tool_image ti
				WHERE ti.tool_id = t.id
				ORDER BY ti.sort_order ASC
				LIMIT 1
			) AS image_url,
			COALESCE((
				SELECT SUM(sl.quantity)::int FROM stock_level sl
				JOIN tool_variant tv ON tv.id = sl.variant_id
				WHERE tv.tool_id = t.id
			), 0) AS total_stock,
			COALESCE((
				SELECT json_agg(
					json_build_object(
						'branch_id', b.id,
						'branch_name', b.name,
						'quantity', branch_total
					)
					ORDER BY b.name ASC
				)
				FROM (
					SELECT b2.id AS bid, SUM(sl2.quantity)::int AS branch_total
					FROM stock_level sl2
					JOIN tool_variant tv2 ON tv2.id = sl2.variant_id
					JOIN branch b2 ON b2.id = sl2.branch_id
					WHERE tv2.tool_id = t.id
					GROUP BY b2.id
				) g
				JOIN branch b ON b.id = g.bid
			), '[]'::json) AS branches_breakdown
		FROM tool t
		${whereClause}
		${orderClause}
	`);

	return result.rows.map((r) => ({
		id: r.id,
		name: r.name,
		slug: r.slug,
		sku: r.default_sku,
		voltage: r.default_voltage,
		variantCount: Number(r.variant_count ?? 0),
		imageUrl: r.image_url,
		totalStock: Number(r.total_stock ?? 0),
		branches: (r.branches_breakdown ?? []).map((item) => ({
			branchId: item.branch_id,
			branchName: item.branch_name,
			quantity: item.quantity,
		})),
	}));
}

export default async function StockPage({ searchParams }: StockPageProps) {
	await requireCurrentSession();
	const params = await searchParams;
	const search = params.search ?? params.q;

	const [rows, categories] = await Promise.all([
		fetchStockRows({ ...params, search }),
		fetchCategories(),
	]);
	const isEmpty = rows.length === 0;
	const hasFilters = Boolean(search || params.categoryId || params.ordem);

	return (
		<>
			<PageHeader
				description="Visão centralizada do estoque de cada ferramenta somando todas as filiais. Use a ação na tabela para abrir o ajuste por filial."
				title="Estoque Geral"
			/>

			<StockFilters categories={categories} />

			{isEmpty ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>
							{hasFilters
								? "Nenhuma ferramenta encontrada"
								: "Nenhuma ferramenta cadastrada"}
						</EmptyTitle>
						<EmptyDescription>
							{hasFilters
								? "Tente ajustar os filtros para encontrar o que procura."
								: "Crie ferramentas em /dashboard/tools para começar a acompanhar o estoque."}
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						{hasFilters ? (
							<Link
								className={buttonVariants({ variant: "ghost" })}
								href="/dashboard/stock"
							>
								Limpar filtros
							</Link>
						) : (
							<Link
								className={buttonVariants({ variant: "default" })}
								href="/dashboard/tools/new"
							>
								Nova ferramenta
							</Link>
						)}
					</EmptyContent>
				</Empty>
			) : (
				<StockTable rows={rows} />
			)}
		</>
	);
}
