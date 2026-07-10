import { Badge } from "@emach/ui/components/badge";

import {
	STATUS_BADGE_CAPS,
	STATUS_ICONS,
	TONE_BADGE_VARIANT,
} from "@/components/status-visual";
import { ORDER_STATUS_META, type OrderStatus } from "../status-meta";

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
	const meta = ORDER_STATUS_META[status];
	const Icon = STATUS_ICONS[meta.iconKey];
	return (
		<Badge
			className={STATUS_BADGE_CAPS}
			variant={TONE_BADGE_VARIANT[meta.tone]}
		>
			<Icon aria-hidden="true" />
			{meta.label}
		</Badge>
	);
}
