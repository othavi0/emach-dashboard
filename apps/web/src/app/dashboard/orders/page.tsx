import type { Metadata } from "next";
import { requireCapability } from "@/lib/permissions";
import { LateOrdersToast } from "./_components/late-orders-toast";
import { OrderFiltersPanel } from "./_components/order-list-filters";
import { OrdersView } from "./_components/orders-view";
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
	await requireCapability("orders.read");
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
		// Só faz sentido dentro da aba Atrasados; fora dela não propaga.
		lateStatus: activeTab === "late" ? data.lateStatus : undefined,
	};

	const pageFilters: OrdersPageFiltersInput = {
		tab: activeTab,
		q: data.q,
		from: data.from,
		to: data.to,
		branchId: data.branchId,
		carrier: data.carrier,
		toolId: data.productId,
		// Só faz sentido dentro da aba Atrasados; fora dela não propaga.
		lateStatus: activeTab === "late" ? data.lateStatus : undefined,
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
			<LateOrdersToast count={counts.late ?? 0} />
			<OrdersView
				filters={pageFilters}
				filtersSlot={
					<OrderFiltersPanel
						branches={branches}
						carrierOptions={carrierOptions}
						counts={counts}
						filters={filters}
						toolOptions={toolOptions}
					/>
				}
				hasFilters={hasFilters}
				highlightToolId={data.productId ?? null}
				initial={result.items}
				initialCursor={result.nextCursor}
				summarySlot={
					productSummary && productName ? (
						<ProductFilterSummary
							clearHref={clearProductHref}
							name={productName}
							orders={productSummary.orders}
							units={productSummary.units}
						/>
					) : null
				}
				tabKey={activeTab}
			/>
		</>
	);
}
