import { buttonVariants } from "@emach/ui/components/button";
import {
	Pagination,
	PaginationContent,
	PaginationItem,
	PaginationNext,
	PaginationPrevious,
} from "@emach/ui/components/pagination";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";
import Link from "next/link";

import type { OrderListFilters, OrderListItem } from "../data";
import { OrderStatusBadge } from "./order-status-badge";

const CURRENCY_FORMATTER = new Intl.NumberFormat("pt-BR", {
	currency: "BRL",
	style: "currency",
});

const DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
});

const RELATIVE_FORMATTER = new Intl.RelativeTimeFormat("pt-BR", {
	numeric: "auto",
	style: "short",
});

function formatCurrency(value: number) {
	return CURRENCY_FORMATTER.format(value);
}

function formatAbsoluteDate(value: Date) {
	return DATE_FORMATTER.format(value);
}

function formatRelativeDate(value: Date) {
	const diffMs = value.getTime() - Date.now();
	const diffMinutes = Math.round(diffMs / 60_000);

	if (Math.abs(diffMinutes) < 60) {
		return RELATIVE_FORMATTER.format(diffMinutes, "minute");
	}

	const diffHours = Math.round(diffMinutes / 60);
	if (Math.abs(diffHours) < 24) {
		return RELATIVE_FORMATTER.format(diffHours, "hour");
	}

	const diffDays = Math.round(diffHours / 24);
	return RELATIVE_FORMATTER.format(diffDays, "day");
}

function buildHref(filters: OrderListFilters, page: number) {
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
	if (page > 1) {
		params.set("page", String(page));
	}

	const query = params.toString();
	return query ? `/dashboard/orders?${query}` : "/dashboard/orders";
}

interface OrderTableProps {
	filters: OrderListFilters;
	items: OrderListItem[];
	page: number;
	totalPages: number;
}

export function OrderTable({
	filters,
	items,
	page,
	totalPages,
}: OrderTableProps) {
	return (
		<div className="flex flex-col gap-4">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Número</TableHead>
						<TableHead>Cliente</TableHead>
						<TableHead>Status</TableHead>
						<TableHead>Filial</TableHead>
						<TableHead className="text-right">Total</TableHead>
						<TableHead>Data</TableHead>
						<TableHead className="w-28 text-right">Ação</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{items.map((item) => (
						<TableRow key={item.id}>
							<TableCell className="font-medium">{item.number}</TableCell>
							<TableCell>{item.clientName}</TableCell>
							<TableCell>
								<OrderStatusBadge status={item.status} />
							</TableCell>
							<TableCell className="text-muted-foreground text-sm">
								{item.branchName ?? "—"}
							</TableCell>
							<TableCell className="text-right font-mono text-sm">
								{formatCurrency(item.totalAmount)}
							</TableCell>
							<TableCell className="text-muted-foreground text-sm">
								<span title={formatAbsoluteDate(item.createdAt)}>
									{formatRelativeDate(item.createdAt)}
								</span>
							</TableCell>
							<TableCell className="text-right">
								<Link
									className={buttonVariants({ size: "sm", variant: "ghost" })}
									href={`/dashboard/orders/${item.id}`}
								>
									Abrir
								</Link>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>

			{totalPages > 1 && (
				<Pagination className="justify-end">
					<PaginationContent>
						<PaginationItem>
							<PaginationPrevious
								aria-disabled={page <= 1}
								className={page <= 1 ? "pointer-events-none opacity-50" : ""}
								href={buildHref(filters, Math.max(1, page - 1))}
								text="Anterior"
							/>
						</PaginationItem>
						<PaginationItem>
							<span className="px-3 text-muted-foreground text-xs">
								Página {page} de {totalPages}
							</span>
						</PaginationItem>
						<PaginationItem>
							<PaginationNext
								aria-disabled={page >= totalPages}
								className={
									page >= totalPages ? "pointer-events-none opacity-50" : ""
								}
								href={buildHref(filters, Math.min(totalPages, page + 1))}
								text="Próxima"
							/>
						</PaginationItem>
					</PaginationContent>
				</Pagination>
			)}
		</div>
	);
}
