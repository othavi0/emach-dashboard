import { Building2 } from "lucide-react";
import type { ReactNode } from "react";
import { EntityIdentityHeader } from "@/components/entity/entity-identity-header";
import { formatBranchAddress } from "@/lib/format/branch";
import { formatPhone } from "@/lib/format/phone";
import type { BranchDetail } from "../../data";

export function BranchIdentity({
	detail,
	badges,
	actions,
}: {
	detail: BranchDetail;
	badges?: ReactNode;
	actions?: ReactNode;
}) {
	return (
		<EntityIdentityHeader
			actions={actions}
			avatarFallback={<Building2 aria-hidden className="size-5" />}
			badges={badges}
			subtitle={
				// formatPhone() devolve "" (não null) — o `|| undefined` garante
				// que "sem endereço e sem telefone" propague undefined, não "".
				formatBranchAddress(detail) ?? (formatPhone(detail.phone) || undefined)
			}
			title={detail.name}
		/>
	);
}
