import { Badge } from "@emach/ui/components/badge";
import { Star } from "lucide-react";

export function BranchDefaultBadge() {
	return (
		<Badge className="gap-1 text-[10px]" variant="default">
			<Star aria-hidden className="size-2.5" />
			Padrão ecommerce
		</Badge>
	);
}
