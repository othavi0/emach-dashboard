import { buttonVariants } from "@emach/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@emach/ui/components/empty";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { can, requireCapability } from "@/lib/permissions";
import { ExportCsvLink } from "./_components/export-csv-link";
import { OrderFiltersPanel } from "./_components/order-list-filters";
import { OrdersInfinite } from "./_components/orders-infinite";
import {
	fetchOrdersPage,
	getOrdersTabCounts,
	listOrderBranches,
	type OrderListFilters,
	type OrdersPageFiltersInput,
} from "./data";
import { ordersListFiltersSchema } from "./schema";
import { DEFAULT_ORDER_TAB } from "./status-meta";

export const metadata: Metadata = {
	title: "Pedidos",
};

interface PageProps {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default function OrdersPage({ searchParams }: PageProps) {
	return <OrdersPageContent searchParams={searchParams} />;
}

async function OrdersPageContent({ searchParams }: PageProps) {
	const session = await requireCapability("orders.read");
	const canExport = await can(session, "orders.export");
	const raw = await searchParams;
	const parsed = ordersListFiltersSchema.safeParse(raw);
	const data = parsed.success ? parsed.data : ordersListFiltersSchema.parse({});

	// Sem ?tab na URL → abre na fila de entrada ("Pago"), não em todos.
	const activeTab = data.tab ?? DEFAULT_ORDER_TAB;
	const unverifiedShipping = data.unverified === "1";

	const filters: OrderListFilters = {
		tab: activeTab,
		q: data.q,
		from: data.from,
		to: data.to,
		branchId: data.branchId,
		page: data.page,
		unverifiedShipping,
	};

	const pageFilters: OrdersPageFiltersInput = {
		tab: activeTab,
		q: data.q,
		from: data.from,
		to: data.to,
		branchId: data.branchId,
		unverifiedShipping,
	};

	const [branches, counts, result] = await Promise.all([
		listOrderBranches(),
		getOrdersTabCounts(),
		fetchOrdersPage({ filters: pageFilters, cursor: null }),
	]);

	// O tab default ("Pago") não conta como filtro ativo — só desvios dele.
	const hasFilters = Boolean(
		filters.q ||
			filters.from ||
			filters.to ||
			filters.branchId ||
			unverifiedShipping ||
			activeTab !== DEFAULT_ORDER_TAB
	);

	return (
		<>
			<PageHeader
				action={
					<div className="flex items-center gap-2">
						{canExport && <ExportCsvLink filters={filters} />}
					</div>
				}
				description="Listagem operacional com busca por número e cliente, filtros por data e filial e atalhos para fulfillment."
				title="Pedidos"
			/>

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
								: "Nenhum pedido nesta etapa. Use a aba “Todos” para ver o histórico completo."}
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
				<OrdersInfinite
					filters={pageFilters}
					initial={result.items}
					initialCursor={result.nextCursor}
				/>
			)}
		</>
	);
}
