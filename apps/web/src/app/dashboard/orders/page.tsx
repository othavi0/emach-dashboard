import { buttonVariants } from "@emach/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@emach/ui/components/empty";
import Link from "next/link";

import { requireCapability } from "@/lib/permissions";
import { OrderFiltersPanel } from "./_components/order-list-filters";
import { OrderTable } from "./_components/order-table";
import {
	getOrdersTabCounts,
	listOrderBranches,
	listOrders,
	type OrderListFilters,
} from "./data";

interface PageProps {
	searchParams: Promise<{
		branchId?: string;
		from?: string;
		page?: string;
		q?: string;
		tab?: string;
		to?: string;
	}>;
}

export const dynamic = "force-dynamic";

export default async function OrdersPage({ searchParams }: PageProps) {
	await requireCapability("orders.read");
	const params = await searchParams;
	const filters: OrderListFilters = {
		tab: params.tab,
		q: params.q,
		from: params.from,
		to: params.to,
		branchId: params.branchId,
		page: params.page ? Number(params.page) : 1,
	};

	const [branches, counts, result] = await Promise.all([
		listOrderBranches(),
		getOrdersTabCounts(),
		listOrders(filters),
	]);

	const hasFilters = Boolean(
		filters.tab || filters.q || filters.from || filters.to || filters.branchId
	);

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h1 className="font-serif text-2xl">Pedidos</h1>
					<p className="max-w-3xl text-muted-foreground text-sm">
						Listagem operacional com busca por número e cliente, filtros por
						data e filial e atalhos para fulfillment.
					</p>
				</div>
				<Link
					className={buttonVariants({ variant: "ghost" })}
					href="/dashboard"
				>
					Voltar ao painel
				</Link>
			</div>

			<OrderFiltersPanel
				branches={branches}
				counts={counts}
				filters={filters}
			/>

			{result.items.length === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>Nenhum pedido encontrado</EmptyTitle>
						<EmptyDescription>
							{hasFilters
								? "Ajuste os filtros para ampliar a busca."
								: "Os pedidos aparecerão aqui conforme forem criados no site ecomerce."}
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						{hasFilters && (
							<Link
								className={buttonVariants({ variant: "ghost" })}
								href="/dashboard/orders"
							>
								Limpar filtros
							</Link>
						)}
					</EmptyContent>
				</Empty>
			) : (
				<OrderTable
					filters={filters}
					items={result.items}
					page={result.page}
					totalPages={result.totalPages}
				/>
			)}
		</div>
	);
}
