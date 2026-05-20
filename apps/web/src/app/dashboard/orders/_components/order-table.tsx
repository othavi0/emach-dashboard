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
	TableActionsCell,
	TableActionsHead,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";
import { CalendarIcon, Eye } from "lucide-react";
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
	hour: "2-digit",
	minute: "2-digit",
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

const LABEL_CLASS =
	"text-[11px] uppercase tracking-widest font-medium text-muted-foreground";

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
					<TableRow className="hover:bg-transparent">
						<TableHead className={`w-36 ${LABEL_CLASS}`}>Pedido</TableHead>
						<TableHead className={LABEL_CLASS}>Cliente</TableHead>
						<TableHead className={`w-40 ${LABEL_CLASS}`}>Status</TableHead>
						<TableHead className={`w-36 ${LABEL_CLASS}`}>Filial</TableHead>
						<TableHead className={`w-14 text-right ${LABEL_CLASS}`}>
							Itens
						</TableHead>
						<TableHead className={`w-32 text-right ${LABEL_CLASS}`}>
							Total
						</TableHead>
						<TableHead className={`w-32 ${LABEL_CLASS}`}>Data</TableHead>
						<TableActionsHead className={LABEL_CLASS} />
					</TableRow>
				</TableHeader>
				<TableBody>
					{items.map((item) => (
						<TableRow key={item.id}>
							<TableCell>
								<span className="font-medium font-mono text-foreground text-sm tracking-tight">
									{item.number}
								</span>
							</TableCell>
							<TableCell>
								<span className="text-foreground text-sm">
									{item.clientName}
								</span>
							</TableCell>
							<TableCell>
								<OrderStatusBadge status={item.status} />
							</TableCell>
							<TableCell>
								<span className="block max-w-32 truncate text-muted-foreground text-xs">
									{item.branchName ?? "—"}
								</span>
							</TableCell>
							<TableCell className="text-right">
								<span className="font-mono text-muted-foreground text-sm tabular-nums">
									{item.itemsCount}
								</span>
							</TableCell>
							<TableCell className="text-right">
								<span className="font-medium font-mono text-foreground text-sm tabular-nums">
									{formatCurrency(item.totalAmount)}
								</span>
							</TableCell>
							<TableCell>
								<span
									className="inline-flex items-center gap-1 text-muted-foreground text-xs"
									title={formatAbsoluteDate(item.createdAt)}
								>
									<CalendarIcon aria-hidden className="size-3 shrink-0" />
									{formatRelativeDate(item.createdAt)}
								</span>
							</TableCell>
							<TableActionsCell>
								<Link
									aria-label={`Abrir pedido ${item.number}`}
									className={buttonVariants({
										size: "icon-sm",
										variant: "outline",
									})}
									href={`/dashboard/orders/${item.id}`}
								>
									<Eye aria-hidden className="size-3.5" />
								</Link>
							</TableActionsCell>
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
