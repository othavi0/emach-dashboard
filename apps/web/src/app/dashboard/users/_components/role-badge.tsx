import { Badge } from "@emach/ui/components/badge";
import type { LucideIcon } from "lucide-react";
import { Crown, ShieldCheck, UserRound } from "lucide-react";

const META: Record<
	string,
	{
		icon: LucideIcon;
		label: string;
		variant?: "default" | "secondary" | "outline";
	}
> = {
	super_admin: { label: "Super Admin", icon: Crown },
	admin: { label: "Admin", icon: ShieldCheck },
	user: { label: "Estoquista", icon: UserRound, variant: "outline" },
};

export function RoleBadge({ role }: { role: string }) {
	const m = META[role] ?? META.user;
	if (!m) {
		return null;
	}
	const Icon = m.icon;
	return (
		<Badge variant={m.variant}>
			<Icon aria-hidden className="mr-1 size-3" />
			{m.label}
		</Badge>
	);
}
