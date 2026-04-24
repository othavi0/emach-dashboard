import { db } from "@emach/db";
import { productType } from "@emach/db/schema/tools";
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
	id: string;
	image_url: string | null;
	name: string;
	sku: string | null;
	slug: string | null;
	total_stock: number;
}

interface StockPageParams {
	ordem?: "nome" | "maior" | "menor";
	productType?: string;
	q?: string;
	search?: string;
}

interface StockPageProps {
	searchParams: Promise<StockPageParams>;
}

async function fetchProductTypes() {
	return await db
		.select({ id: productType.id, name: productType.name })
		.from(productType)
		.orderBy(asc(productType.name));
}

async function fetchStockRows(params: StockPageParams): Promise<StockRow[]> {
	const whereClauses = [] as ReturnType<typeof sql>[];
	if (params.search) {
		whereClauses.push(sql`t.name ILIKE ${`%${params.search}%`}`);
	}
	if (params.productType) {
		whereClauses.push(sql`t.product_type_id = ${params.productType}`);
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
			t.sku,
			(
				SELECT ti.url
				FROM tool_image ti
				WHERE ti.tool_id = t.id
				ORDER BY ti.sort_order ASC
				LIMIT 1
			) AS image_url,
			COALESCE(SUM(sl.quantity), 0)::int AS total_stock,
			COALESCE(
				json_agg(
					json_build_object(
						'branch_id', b.id,
						'branch_name', b.name,
						'quantity', sl.quantity
					)
					ORDER BY b.name ASC
				) FILTER (WHERE b.id IS NOT NULL),
				'[]'::json
			) AS branches_breakdown
		FROM tool t
		LEFT JOIN stock_level sl ON sl.tool_id = t.id
		LEFT JOIN branch b ON b.id = sl.branch_id
		${whereClause}
		GROUP BY t.id
		${orderClause}
	`);

	return result.rows.map((r) => ({
		id: r.id,
		name: r.name,
		slug: r.slug,
		sku: r.sku,
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

	const [rows, productTypes] = await Promise.all([
		fetchStockRows({ ...params, search }),
		fetchProductTypes(),
	]);
	const isEmpty = rows.length === 0;
	const hasFilters = Boolean(search || params.productType || params.ordem);

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="font-serif text-2xl">Estoque Geral</h1>
				<p className="text-muted-foreground text-sm">
					Visão centralizada do estoque de cada ferramenta somando todas as
					filiais. Use a ação na tabela para abrir o ajuste por filial.
				</p>
			</div>

			<StockFilters productTypes={productTypes} />

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
		</div>
	);
}
