import { buttonVariants } from "@emach/ui/components/button";
import { DownloadIcon } from "lucide-react";

import type { CustomersListFilters } from "../schema";

interface ExportCsvLinkProps {
	filters: CustomersListFilters;
}

export function ExportCsvLink({ filters }: ExportCsvLinkProps) {
	const params = new URLSearchParams();

	if (filters.q) {
		params.set("q", filters.q);
	}
	if (filters.status) {
		params.set("status", filters.status);
	}
	if (filters.clientType?.length) {
		params.set("clientType", filters.clientType.join(","));
	}
	if (filters.createdFrom) {
		params.set("createdFrom", filters.createdFrom);
	}
	if (filters.createdTo) {
		params.set("createdTo", filters.createdTo);
	}
	if (filters.lastOrderFrom) {
		params.set("lastOrderFrom", filters.lastOrderFrom);
	}
	if (filters.lastOrderTo) {
		params.set("lastOrderTo", filters.lastOrderTo);
	}
	if (filters.ltvMin !== undefined) {
		params.set("ltvMin", String(filters.ltvMin));
	}
	if (filters.ltvMax !== undefined) {
		params.set("ltvMax", String(filters.ltvMax));
	}
	if (filters.sort && filters.sort !== "createdDesc") {
		params.set("sort", filters.sort);
	}

	const qs = params.toString();
	const href = `/dashboard/customers/export${qs ? `?${qs}` : ""}`;

	return (
		<a
			className={buttonVariants({ size: "sm", variant: "outline" })}
			download
			href={href}
		>
			<DownloadIcon aria-hidden className="size-3.5" />
			Exportar CSV
		</a>
	);
}
