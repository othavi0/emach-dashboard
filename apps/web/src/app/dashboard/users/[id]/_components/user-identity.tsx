import type { ReactNode } from "react";
import { EntityIdentityHeader } from "@/components/entity/entity-identity-header";
import { getInitials } from "@/lib/format/name";
import { RoleBadge } from "../../_components/role-badge";
import { StatusBadge } from "../../_components/status-badge";
import type { UserDetail } from "../../data";

export function UserIdentity({
	user,
	actions,
}: {
	user: UserDetail;
	actions?: ReactNode;
}) {
	return (
		<EntityIdentityHeader
			actions={actions}
			avatarFallback={getInitials(user.name)}
			avatarUrl={user.image}
			badges={
				<>
					<RoleBadge role={user.role} />
					<StatusBadge status={user.status} />
				</>
			}
			subtitle={user.email}
			title={user.name}
		/>
	);
}
