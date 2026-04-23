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
import { type and, asc, ilike, sql } from "drizzle-orm";
import Link from "next/link";

import { requireCurrentSession } from "@/lib/session";
import { ToolFilters } from "./_components/tool-filters";
import { type ToolRow, ToolsTable } from "./_components/tools-table";

interface PageProps {
	searchParams: Promise<{
		ncm?: string;
		productType?: string;
		q?: string;
		search?: string;
		status?: string;
		visible?: string;
	}>;
}

async function fetchProductTypes() {
	return db
		.select({ id: productType.id, name: productType.name })
		.from(productType)
		.orderBy(asc(productType.name));
}

async function fetchTools(params: {
	ncm?: string;
	productType?: string;
	search?: string;
	status?: string;
	visible?: string;
}): Promise<ToolRow[]> {
	const conditions = [] as Parameters<typeof and>[number][];

	if (params.search) {
		conditions.push(ilike(sql`t.name`, `%${params.search}%`));
	}
	if (params.productType) {
		conditions.push(sql`t.product_type_id = ${params.productType}`);
	}
	if (params.visible === "true") {
		conditions.push(sql`t.visible_on_site = true`);
	} else if (params.visible === "false") {
		conditions.push(sql`t.visible_on_site = false`);
	}
	if (params.status) {
		const statuses = params.status.split(",").filter(Boolean);
		if (statuses.length > 0) {
			conditions.push(sql`t.status = ANY(${statuses})`);
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
		sku: string | null;
		model: string | null;
		status: string;
		image_url: string | null;
		visible_on_site: boolean;
		product_type_name: string | null;
		supplier_name: string | null;
		total_stock: number;
	}>(sql`
		SELECT
			t.id,
			t.name,
			t.slug,
			t.sku,
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
			pt.name AS product_type_name,
			s.name AS supplier_name,
			COALESCE(SUM(sl.quantity), 0)::int AS total_stock
		FROM tool t
		LEFT JOIN product_type pt ON pt.id = t.product_type_id
		LEFT JOIN supplier s ON s.id = t.supplier_id
		LEFT JOIN stock_level sl ON sl.tool_id = t.id
		${whereClause}
		GROUP BY t.id, pt.name, s.name
		ORDER BY t.name ASC
	`);

	return rows.rows.map((r) => ({
		id: r.id,
		name: r.name,
		slug: r.slug,
		sku: r.sku,
		model: r.model,
		status: r.status,
		imageUrl: r.image_url,
		visibleOnSite: r.visible_on_site,
		productTypeName: r.product_type_name,
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

	const [tools, productTypes] = await Promise.all([
		fetchTools({ ...params, search }),
		fetchProductTypes(),
	]);

	const hasFilters = Boolean(
		search ||
			params.visible ||
			params.status ||
			params.productType ||
			params.ncm,
	);
	const isEmpty = tools.length === 0;

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="font-serif text-2xl">Ferramentas</h1>
					<p className="text-muted-foreground text-sm">
						Gerencie o catálogo de ferramentas e suas configurações de exibição.
					</p>
				</div>
				{canMutate && (
					<Link
						className={buttonVariants({ variant: "default" })}
						href="/dashboard/tools/new"
					>
						Nova ferramenta
					</Link>
				)}
			</div>

			<ToolFilters productTypes={productTypes} />

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
		</div>
	);
}
