import type { UserRole } from "@emach/db/schema/auth";
import { buttonVariants } from "@emach/ui/components/button";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { can, requireCapability } from "@/lib/permissions";
import { OrderActionsPanel } from "../_components/order-actions-panel";
import { OrderDetailInfo } from "../_components/order-detail-info";
import { OrderReviewsSection } from "../_components/order-reviews-section";
import { OrderTimeline } from "../_components/order-timeline";
import {
	getOrderDetail,
	getOrderReviewsOverview,
	listOrderBranches,
} from "../data";

interface OrderDetailPageProps {
	params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({
	params,
}: OrderDetailPageProps) {
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

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				action={
					<Link
						className={buttonVariants({ variant: "secondary" })}
						href={`/dashboard/orders/${order.id}/print`}
					>
						Imprimir
					</Link>
				}
				description={`${order.clientName} • ${order.clientEmail}`}
				title={`Pedido ${order.number}`}
			/>

			<div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(22rem,0.95fr)]">
				<OrderDetailInfo order={order} />
				<div className="flex flex-col gap-4">
					{(can(role, "orders.update_status") ||
						can(role, "orders.cancel") ||
						can(role, "orders.refund") ||
						can(role, "orders.add_note")) && (
						<OrderActionsPanel
							branches={branches}
							canAddNote={can(role, "orders.add_note")}
							canCancel={can(role, "orders.cancel")}
							canRefund={can(role, "orders.refund")}
							canUpdateStatus={can(role, "orders.update_status")}
							order={order}
						/>
					)}
					<OrderTimeline history={order.history} notes={order.notes} />
				</div>
			</div>

			<OrderReviewsSection rows={reviewsOverview} />
		</div>
	);
}
