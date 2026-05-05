import type { UserRole } from "@emach/db/schema/auth";
import { buttonVariants } from "@emach/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@emach/ui/components/empty";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { can, requireCapability } from "@/lib/permissions";
import { ExportCsvLink } from "./_components/export-csv-link";
import { OrderFiltersPanel } from "./_components/order-list-filters";
import { OrderTable } from "./_components/order-table";
import { OrdersMetricsCards } from "./_components/orders-metrics";
import {
	getOrdersMetrics,
	getOrdersTabCounts,
	listOrderBranches,
	listOrders,
	type OrderListFilters,
} from "./data";
import { ordersListFiltersSchema } from "./schema";

interface PageProps {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const dynamic = "force-dynamic";

export default async function OrdersPage({ searchParams }: PageProps) {
	const session = await requireCapability("orders.read");
	const canExport = can(session.user.role as UserRole, "orders.export");
	const raw = await searchParams;
	const parsed = ordersListFiltersSchema.safeParse(raw);
	const data = parsed.success ? parsed.data : ordersListFiltersSchema.parse({});

	const filters: OrderListFilters = {
		tab: data.tab,
		q: data.q,
		from: data.from,
		to: data.to,
		branchId: data.branchId,
		page: data.page,
	};

	const [branches, counts, metrics, result] = await Promise.all([
		listOrderBranches(),
		getOrdersTabCounts(),
		getOrdersMetrics(),
		listOrders(filters),
	]);

	const hasFilters = Boolean(
		filters.tab || filters.q || filters.from || filters.to || filters.branchId
	);

	return (
		<>
			<PageHeader
				action={
					<div className="flex items-center gap-2">
						{canExport && <ExportCsvLink filters={filters} />}
						<Link
							className={buttonVariants({ variant: "ghost" })}
							href="/dashboard"
						>
							Voltar ao painel
						</Link>
					</div>
				}
				description="Listagem operacional com busca por número e cliente, filtros por data e filial e atalhos para fulfillment."
				title="Pedidos"
			/>

			<OrdersMetricsCards metrics={metrics} />

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
		</>
	);
}
