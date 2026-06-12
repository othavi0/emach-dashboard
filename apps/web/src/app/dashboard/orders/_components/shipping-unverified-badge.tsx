import { Badge } from "@emach/ui/components/badge";
import { TriangleAlertIcon } from "lucide-react";

/**
 * Realce para pedidos cujo frete não pôde ser revalidado no checkout (fail-open
 * do ecommerce — issue #143). `compact` encurta o rótulo para caber em cards de
 * listagem; o detalhe usa o rótulo completo.
 */
export function ShippingUnverifiedBadge({
	compact = false,
}: {
	compact?: boolean;
}) {
	return (
		<Badge
			title="Frete não verificado no checkout — revisar antes de faturar"
			variant="warning"
		>
			<TriangleAlertIcon aria-hidden="true" />
			{compact ? "Rever frete" : "Frete não verificado"}
		</Badge>
	);
}
