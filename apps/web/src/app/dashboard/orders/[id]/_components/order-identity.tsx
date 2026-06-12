import { EntityIdentityHeader } from "@/components/entity/entity-identity-header";
import { formatDate } from "@/lib/format/datetime";
import { getInitials } from "@/lib/format/name";
import { OrderStatusBadge } from "../../_components/order-status-badge";
import { ShippingUnverifiedBadge } from "../../_components/shipping-unverified-badge";
import type { OrderDetail } from "../../data";

interface OrderIdentityProps {
	order: OrderDetail;
}

export function OrderIdentity({ order }: OrderIdentityProps) {
	return (
		<EntityIdentityHeader
			avatarFallback={getInitials(order.clientName)}
			badges={
				<>
					<OrderStatusBadge status={order.status} />
					{order.shippingUnverified && <ShippingUnverifiedBadge />}
				</>
			}
			subtitle={`${order.clientName} · ${order.clientEmail} · criado ${formatDate(order.createdAt)}`}
			title={<span className="font-serif tracking-tight">{order.number}</span>}
		/>
	);
}
