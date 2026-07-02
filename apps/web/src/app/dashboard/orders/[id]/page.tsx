import {
	History,
	Receipt,
	RotateCcw,
	ShoppingBag,
	Star,
	Truck,
} from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { EntityClientTab } from "@/components/entity/entity-client-tabs";
import { EntityClientTabs } from "@/components/entity/entity-client-tabs";
import { clampInitialTab } from "@/components/entity/tab-url";
import { can, requireCapability } from "@/lib/permissions";
import {
	getOrderDetail,
	getOrderReviewsOverview,
	listOrderBranches,
} from "../data";
import { OrderActionColumn } from "./_components/order-action-column";
import { OrderIdentity } from "./_components/order-identity";
import { OrderSummaryCard } from "./_components/order-summary-card";
import { CustomerDeliveryTab } from "./_components/tabs/customer-delivery-tab";
import { HistoryTab } from "./_components/tabs/history-tab";
import { ItemsTab } from "./_components/tabs/items-tab";
import { PaymentFiscalTab } from "./_components/tabs/payment-fiscal-tab";
import { RefundTab } from "./_components/tabs/refund-tab";
import { ReviewsTab } from "./_components/tabs/reviews-tab";

export const metadata: Metadata = {
	title: "Detalhe do pedido",
};

function TabCount({ n }: { n: number }) {
	return (
		<span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-secondary px-1 font-medium text-secondary-foreground text-xs tabular-nums">
			{n}
		</span>
	);
}

const DEFAULT_TAB = "itens";

interface PageProps {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ tab?: string }>;
}

export default function OrderDetailPage({ params, searchParams }: PageProps) {
	return <OrderDetailPageContent params={params} searchParams={searchParams} />;
}

async function OrderDetailPageContent({ params, searchParams }: PageProps) {
	const session = await requireCapability("orders.read");
	const { id } = await params;
	const sp = await searchParams;
	const [branches, order, reviewsOverview] = await Promise.all([
		listOrderBranches(),
		getOrderDetail(id),
		getOrderReviewsOverview(id),
	]);
	if (!order) {
		notFound();
	}
	const [canAddNote, canCancel, canRefund, canUpdateStatus] = await Promise.all(
		[
			can(session, "orders.add_note"),
			can(session, "orders.cancel"),
			can(session, "orders.refund"),
			can(session, "orders.update_status"),
		]
	);

	const tabs: EntityClientTab[] = [
		{
			value: "itens",
			label: "Itens",
			icon: <ShoppingBag aria-hidden className="size-3.5" />,
			badge: <TabCount n={order.items.length} />,
			content: <ItemsTab order={order} />,
		},
		{
			value: "cliente",
			label: "Cliente / Entrega",
			icon: <Truck aria-hidden className="size-3.5" />,
			content: <CustomerDeliveryTab order={order} />,
		},
		{
			value: "fiscal",
			label: "Pagamento & Fiscal",
			icon: <Receipt aria-hidden className="size-3.5" />,
			content: <PaymentFiscalTab order={order} />,
		},
		{
			value: "historico",
			label: "Histórico",
			icon: <History aria-hidden className="size-3.5" />,
			content: <HistoryTab order={order} />,
		},
		{
			value: "avaliacoes",
			label: "Avaliações",
			icon: <Star aria-hidden className="size-3.5" />,
			content: <ReviewsTab rows={reviewsOverview} />,
		},
		...(order.refundRequests.length > 0
			? [
					{
						value: "reembolso",
						label: "Reembolso",
						icon: <RotateCcw aria-hidden className="size-3.5" />,
						content: <RefundTab refunds={order.refundRequests} />,
					},
				]
			: []),
	];

	const initialTab = clampInitialTab(sp.tab, tabs, DEFAULT_TAB);

	return (
		<div className="flex flex-col gap-6 p-6">
			<OrderIdentity order={order} />
			<OrderSummaryCard order={order} />
			<div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(20rem,1fr)]">
				<EntityClientTabs
					defaultValue={DEFAULT_TAB}
					header={null}
					initialTab={initialTab}
					tabs={tabs}
				/>
				<OrderActionColumn
					branches={branches}
					canAddNote={canAddNote}
					canCancel={canCancel}
					canRefund={canRefund}
					canUpdateStatus={canUpdateStatus}
					order={order}
				/>
			</div>
		</div>
	);
}
