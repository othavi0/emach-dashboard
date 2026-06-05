import { Badge } from "@emach/ui/components/badge";
import { Ban, CheckCircle2, Clock } from "lucide-react";

const META = {
	active: { label: "Ativo", icon: CheckCircle2, variant: "success" as const },
	pending: { label: "Convidado", icon: Clock, variant: "warning" as const },
	suspended: { label: "Suspenso", icon: Ban, variant: "destructive" as const },
};

export function StatusBadge({ status }: { status: keyof typeof META }) {
	const m = META[status];
	const Icon = m.icon;
	return (
		<Badge variant={m.variant}>
			<Icon aria-hidden className="mr-1 size-3" />
			{m.label}
		</Badge>
	);
}
