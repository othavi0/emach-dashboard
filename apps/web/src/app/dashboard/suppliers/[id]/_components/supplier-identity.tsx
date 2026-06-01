import { Badge } from "@emach/ui/components/badge";
import { ExternalLink, Factory } from "lucide-react";
import type { ReactNode } from "react";
import { EntityIdentityHeader } from "@/components/entity/entity-identity-header";
import type { SupplierDetail } from "../../data";

export function SupplierIdentity({
	detail,
	actions,
}: {
	detail: SupplierDetail;
	actions?: ReactNode;
}) {
	const badges = detail.website ? (
		<a href={detail.website} rel="noopener noreferrer" target="_blank">
			<Badge className="flex items-center gap-1" variant="outline">
				<ExternalLink aria-hidden className="size-3" />
				Website
			</Badge>
		</a>
	) : undefined;

	return (
		<EntityIdentityHeader
			actions={actions}
			avatarFallback={<Factory aria-hidden className="size-5" />}
			badges={badges}
			subtitle={detail.contactEmail ?? detail.phone ?? undefined}
			title={detail.name}
		/>
	);
}
