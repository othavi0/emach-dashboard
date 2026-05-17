import { Badge } from "@emach/ui/components/badge";
import {
	BanIcon,
	CheckCheckIcon,
	CheckIcon,
	ClockIcon,
	PackageIcon,
	RotateCcwIcon,
	TruckIcon,
	Undo2Icon,
	XCircleIcon,
} from "lucide-react";

import { ORDER_STATUS_LABELS, type OrderStatus } from "../status-meta";

const STATUS_VARIANTS: Record<
	OrderStatus,
	"destructive" | "info" | "success" | "warning"
> = {
	pending_payment: "warning",
	payment_failed: "destructive",
	paid: "success",
	preparing: "info",
	shipped: "info",
	delivered: "success",
	returned: "warning",
	canceled: "destructive",
	refunded: "destructive",
};

const STATUS_ICONS: Record<OrderStatus, typeof ClockIcon> = {
	pending_payment: ClockIcon,
	payment_failed: BanIcon,
	paid: CheckIcon,
	preparing: PackageIcon,
	shipped: TruckIcon,
	delivered: CheckCheckIcon,
	returned: Undo2Icon,
	canceled: XCircleIcon,
	refunded: RotateCcwIcon,
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
	const Icon = STATUS_ICONS[status];
	return (
		<Badge variant={STATUS_VARIANTS[status]}>
			<Icon aria-hidden="true" />
			{ORDER_STATUS_LABELS[status]}
		</Badge>
	);
}
