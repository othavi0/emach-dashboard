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
import { ProductFilterSummary } from "./_components/product-filter-summary";
import {
	fetchOrdersPage,
	fetchOrdersProductSummary,
	getOrdersTabCounts,
	getToolName,
	listOrderBranches,
	listOrderCarrierOptions,
	listOrderToolOptions,
	type OrderListFilters,
	type OrdersPageFiltersInput,
} from "./data";
import { ordersListFiltersSchema } from "./schema";
import { canonicalOrderTabKey, DEFAULT_ORDER_TAB } from "./status-meta";

export const metadata: Metadata = {
	title: "Pedidos",
};

interface PageProps {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}

// URL atual sem `productId` — destino do "limpar filtro" do resumo de produto.
function buildClearProductHref(
	raw: Record<string, string | string[] | undefined>
): string {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(raw)) {
		if (key === "productId" || value === undefined) {
			continue;
		}
		if (Array.isArray(value)) {
			for (const v of value) {
				params.append(key, v);
			}
		} else {
			params.set(key, value);
		}
	}
	const qs = params.toString();
	return `/dashboard/orders${qs ? `?${qs}` : ""}`;
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
	// Canonicaliza o alias legado (to_prepare→paid) antes de tudo, senão o
	// hasFilters trata o alias como filtro ativo e acende "Limpar filtros".
	const activeTab = canonicalOrderTabKey(data.tab) ?? DEFAULT_ORDER_TAB;

	const filters: OrderListFilters = {
		tab: activeTab,
		q: data.q,
		from: data.from,
		to: data.to,
		branchId: data.branchId,
		carrier: data.carrier,
		toolId: data.productId,
	};

	const pageFilters: OrdersPageFiltersInput = {
		tab: activeTab,
		q: data.q,
		from: data.from,
		to: data.to,
		branchId: data.branchId,
		carrier: data.carrier,
		toolId: data.productId,
	};

	const [
		branches,
		counts,
		result,
		carrierOptions,
		toolOptions,
		productSummary,
		productName,
	] = await Promise.all([
		listOrderBranches(),
		getOrdersTabCounts(),
		fetchOrdersPage({ filters: pageFilters, cursor: null }),
		listOrderCarrierOptions(),
		listOrderToolOptions(),
		fetchOrdersProductSummary({ filters: pageFilters }),
		data.productId ? getToolName(data.productId) : Promise.resolve(null),
	]);

	const clearProductHref = buildClearProductHref(raw);

	// O tab default ("Pago") não conta como filtro ativo — só desvios dele.
	const hasFilters = Boolean(
		filters.q ||
			filters.from ||
			filters.to ||
			filters.branchId ||
			data.carrier ||
			data.productId ||
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
				carrierOptions={carrierOptions}
				counts={counts}
				filters={filters}
				toolOptions={toolOptions}
			/>

			{productSummary && productName && (
				<ProductFilterSummary
					clearHref={clearProductHref}
					name={productName}
					orders={productSummary.orders}
					units={productSummary.units}
				/>
			)}

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
					highlightToolId={data.productId ?? null}
					initial={result.items}
					initialCursor={result.nextCursor}
					tabKey={activeTab}
				/>
			)}
		</>
	);
}
