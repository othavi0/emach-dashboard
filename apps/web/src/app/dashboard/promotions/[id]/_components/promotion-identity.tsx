import { Tag, Ticket } from "lucide-react";
import type { ReactNode } from "react";

import { EntityIdentityHeader } from "@/components/entity/entity-identity-header";
import { formatJanela } from "../../_components/_lib/format";
import { PromotionStatusBadge } from "../../_components/promotion-status-badge";
import type { PromotionDetail } from "../../data";

export function PromotionIdentity({
	detail,
	actions,
}: {
	actions?: ReactNode;
	detail: PromotionDetail;
}) {
	const isCoupon = detail.type === "promocode";

	return (
		<EntityIdentityHeader
			actions={actions}
			avatarFallback={
				isCoupon ? (
					<Ticket aria-hidden className="size-5" />
				) : (
					<Tag aria-hidden className="size-5" />
				)
			}
			badges={<PromotionStatusBadge status={detail.status} />}
			subtitle={`${isCoupon ? "Cupom" : "Automática"} · ${formatJanela(detail.startsAt, detail.endsAt)}`}
			title={detail.title}
		/>
	);
}
