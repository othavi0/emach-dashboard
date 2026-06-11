import { EntityIdentityHeader } from "@/components/entity/entity-identity-header";
import { formatDate } from "@/lib/format/datetime";
import { getInitials } from "@/lib/format/name";
import { OrderStatusBadge } from "../../_components/order-status-badge";
import type { OrderDetail } from "../../data";
import { PrintMenu } from "./print-menu";

interface OrderIdentityProps {
	order: OrderDetail;
}

export function OrderIdentity({ order }: OrderIdentityProps) {
	return (
		<EntityIdentityHeader
			actions={<PrintMenu order={order} />}
			avatarFallback={getInitials(order.clientName)}
			badges={<OrderStatusBadge status={order.status} />}
			subtitle={`${order.clientName} · ${order.clientEmail} · criado ${formatDate(order.createdAt)}`}
			title={<span className="font-serif tracking-tight">{order.number}</span>}
		/>
	);
}
