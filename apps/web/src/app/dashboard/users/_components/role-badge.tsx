import type { UserRole } from "@emach/db/schema/auth";
import { Badge } from "@emach/ui/components/badge";
import type { LucideIcon } from "lucide-react";
import { Crown, ShieldCheck, UserRound } from "lucide-react";

interface RoleMeta {
	icon: LucideIcon;
	label: string;
	variant?: "default" | "secondary" | "outline";
}

const META: Record<UserRole, RoleMeta> = {
	super_admin: { label: "Super Admin", icon: Crown },
	admin: { label: "Admin", icon: ShieldCheck },
	user: { label: "Estoquista", icon: UserRound, variant: "outline" },
};

export function RoleBadge({ role }: { role: UserRole }) {
	const m = META[role];
	const Icon = m.icon;

	return (
		<Badge variant={m.variant}>
			<Icon aria-hidden className="mr-1 size-3" />
			{m.label}
		</Badge>
	);
}
