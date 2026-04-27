import { Badge } from "@emach/ui/components/badge";

import { ORDER_STATUS_LABELS, type OrderStatus } from "../status-meta";

const STATUS_VARIANTS: Record<
	OrderStatus,
	"default" | "destructive" | "outline" | "secondary"
> = {
	pending_payment: "outline",
	paid: "secondary",
	preparing: "default",
	shipped: "secondary",
	delivered: "default",
	canceled: "destructive",
	refunded: "destructive",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
	return (
		<Badge variant={STATUS_VARIANTS[status]}>
			{ORDER_STATUS_LABELS[status]}
		</Badge>
	);
}
