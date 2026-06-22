import { Badge } from "@emach/ui/components/badge";
import type { ReactNode } from "react";

import { EntityIdentityHeader } from "@/components/entity/entity-identity-header";
import {
	CLIENT_STATUS_CONFIG,
	CLIENT_TYPE_CONFIG,
	getInitials,
} from "../_lib/customer-display";
import type { CustomerDetail } from "../data";

interface Props {
	actions?: ReactNode;
	customer: CustomerDetail;
}

export function CustomerIdentity({ customer, actions }: Props) {
	const status = CLIENT_STATUS_CONFIG[customer.status];
	const type = customer.clientType
		? CLIENT_TYPE_CONFIG[customer.clientType]
		: null;

	return (
		<EntityIdentityHeader
			actions={actions}
			avatarFallback={getInitials(customer.name)}
			avatarUrl={customer.image}
			badges={
				<>
					<Badge variant={status.variant}>{status.label}</Badge>
					{type ? <Badge variant={type.variant}>{type.label}</Badge> : null}
				</>
			}
			subtitle={customer.email}
			title={customer.name}
		/>
	);
}
