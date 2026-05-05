import { buttonVariants } from "@emach/ui/components/button";

import type { OrderListFilters } from "../data";

interface ExportCsvLinkProps {
	filters: OrderListFilters;
}

export function ExportCsvLink({ filters }: ExportCsvLinkProps) {
	const params = new URLSearchParams();
	if (filters.tab && filters.tab !== "all") {
		params.set("tab", filters.tab);
	}
	if (filters.q) {
		params.set("q", filters.q);
	}
	if (filters.from) {
		params.set("from", filters.from);
	}
	if (filters.to) {
		params.set("to", filters.to);
	}
	if (filters.branchId) {
		params.set("branchId", filters.branchId);
	}
	const qs = params.toString();
	const href = `/dashboard/orders/export${qs ? `?${qs}` : ""}`;

	return (
		<a
			className={buttonVariants({ size: "sm", variant: "outline" })}
			download
			href={href}
		>
			Exportar CSV
		</a>
	);
}
