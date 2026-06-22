import { Badge } from "@emach/ui/components/badge";
import { EntityIdentityHeader } from "@/components/entity/entity-identity-header";
import type { CarrierDetail } from "../../../data";
import { EditCarrierButton } from "./edit-carrier-button";

interface Props {
	canManage: boolean;
	detail: CarrierDetail;
}

export function CarrierIdentity({ detail, canManage }: Props) {
	return (
		<EntityIdentityHeader
			actions={canManage ? <EditCarrierButton /> : null}
			avatarClassName="rounded-lg"
			avatarFallback={
				<span className="font-semibold text-base">
					{detail.name.charAt(0).toUpperCase()}
				</span>
			}
			badges={
				<Badge variant={detail.active ? "default" : "secondary"}>
					{detail.active ? "Ativa" : "Inativa"}
				</Badge>
			}
			subtitle={detail.cnpj ?? undefined}
			title={detail.name}
		/>
	);
}
