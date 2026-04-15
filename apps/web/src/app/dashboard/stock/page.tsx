import { db } from "@emach/db";
import { buttonVariants } from "@emach/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@emach/ui/components/empty";
import { sql } from "drizzle-orm";
import Link from "next/link";

import { requireCurrentSession } from "@/lib/session";
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

async function fetchStockRows(): Promise<StockRow[]> {
	const result = await db.execute<StockPageRow>(sql`
		SELECT
			t.id,
			t.name,
			t.slug,
			t.sku,
			t.image_url,
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
		GROUP BY t.id
		ORDER BY t.name ASC
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

export default async function StockPage() {
	await requireCurrentSession();

	const rows = await fetchStockRows();
	const isEmpty = rows.length === 0;

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="font-serif text-2xl">Estoque por Filial</h1>
				<p className="text-muted-foreground text-sm">
					Visão consolidada do estoque de cada ferramenta agregado por filial.
					Clique em uma linha para ajustar o estoque da ferramenta.
				</p>
			</div>

			{isEmpty ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>Nenhuma ferramenta cadastrada</EmptyTitle>
						<EmptyDescription>
							Crie ferramentas em{" "}
							<Link
								className="text-foreground underline"
								href="/dashboard/tools"
							>
								/dashboard/tools
							</Link>{" "}
							para começar a acompanhar o estoque.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Link
							className={buttonVariants({ variant: "default" })}
							href="/dashboard/tools/new"
						>
							Nova ferramenta
						</Link>
					</EmptyContent>
				</Empty>
			) : (
				<StockTable rows={rows} />
			)}
		</div>
	);
}
