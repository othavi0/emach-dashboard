import type { UserRole } from "@emach/db/schema/auth";
import {
	History,
	Receipt,
	RotateCcw,
	ShoppingBag,
	Star,
	Truck,
} from "lucide-react";
import { notFound } from "next/navigation";
import type { EntityTab } from "@/components/entity/entity-tabs";
import { EntityTabs } from "@/components/entity/entity-tabs";
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

export const dynamic = "force-dynamic";

function TabCount({ n }: { n: number }) {
	return (
		<span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-secondary px-1 font-medium text-secondary-foreground text-xs tabular-nums">
			{n}
		</span>
	);
}

export default async function OrderDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const session = await requireCapability("orders.read");
	const { id } = await params;
	const [branches, order, reviewsOverview] = await Promise.all([
		listOrderBranches(),
		getOrderDetail(id),
		getOrderReviewsOverview(id),
	]);
	if (!order) {
		notFound();
	}
	const role = (session.user.role ?? "user") as UserRole;

	const tabs: EntityTab[] = [
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

	return (
		<div className="flex flex-col gap-6 p-6">
			<OrderIdentity order={order} />
			<OrderSummaryCard order={order} />
			<div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(20rem,1fr)]">
				<EntityTabs defaultValue="itens" tabs={tabs} />
				<OrderActionColumn
					branches={branches}
					canAddNote={can(role, "orders.add_note")}
					canCancel={can(role, "orders.cancel")}
					canRefund={can(role, "orders.refund")}
					canUpdateStatus={can(role, "orders.update_status")}
					order={order}
				/>
			</div>
		</div>
	);
}
