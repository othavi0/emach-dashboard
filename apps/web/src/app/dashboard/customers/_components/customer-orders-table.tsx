import { Badge } from "@emach/ui/components/badge";
import { buttonVariants } from "@emach/ui/components/button";
import { Empty, EmptyHeader, EmptyTitle } from "@emach/ui/components/empty";
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
import { EyeIcon } from "lucide-react";
import Link from "next/link";
import { ORDER_STATUS_LABELS } from "../../orders/status-meta";
import type { CustomerOrdersResult } from "../data";

const CURRENCY = new Intl.NumberFormat("pt-BR", {
	currency: "BRL",
	style: "currency",
});

const DATE = new Intl.DateTimeFormat("pt-BR", {
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
});

const ORDER_STATUS_VARIANTS: Record<
	string,
	"default" | "secondary" | "destructive" | "warning" | "info" | "success"
> = {
	pending_payment: "warning",
	paid: "info",
	preparing: "info",
	shipped: "info",
	delivered: "success",
	canceled: "destructive",
	refunded: "secondary",
};

interface CustomerOrdersTableProps {
	clientId: string;
	result: CustomerOrdersResult;
}

function buildPageHref(clientId: string, page: number) {
	const params = new URLSearchParams({ tab: "pedidos" });
	if (page > 1) {
		params.set("page", String(page));
	}
	return `/dashboard/customers/${clientId}?${params.toString()}`;
}

export function CustomerOrdersTable({
	result,
	clientId,
}: CustomerOrdersTableProps) {
	if (result.items.length === 0) {
		return (
			<Empty>
				<EmptyHeader>
					<EmptyTitle>Nenhum pedido encontrado</EmptyTitle>
				</EmptyHeader>
			</Empty>
		);
	}

	const { page, totalPages } = result;

	return (
		<div className="flex flex-col gap-4">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Número</TableHead>
						<TableHead>Status</TableHead>
						<TableHead className="text-right">Itens</TableHead>
						<TableHead className="text-right">Total</TableHead>
						<TableHead>Data</TableHead>
						<TableHead className="w-16 text-right">Ação</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{result.items.map((order) => {
						const variant = ORDER_STATUS_VARIANTS[order.status] ?? "secondary";
						const label = ORDER_STATUS_LABELS[order.status] ?? order.status;
						return (
							<TableRow key={order.id}>
								<TableCell className="font-medium font-mono text-sm">
									{order.number}
								</TableCell>
								<TableCell>
									<Badge variant={variant}>{label}</Badge>
								</TableCell>
								<TableCell className="text-right text-sm">
									{order.itemsCount}
								</TableCell>
								<TableCell className="text-right font-mono text-sm">
									{CURRENCY.format(order.totalAmount)}
								</TableCell>
								<TableCell className="text-muted-foreground text-sm">
									{DATE.format(order.createdAt)}
								</TableCell>
								<TableCell className="text-right">
									<Link
										aria-label={`Abrir pedido ${order.number}`}
										className={buttonVariants({
											size: "icon-sm",
											variant: "secondary",
										})}
										href={`/dashboard/orders/${order.id}`}
									>
										<EyeIcon aria-hidden className="size-3.5" />
									</Link>
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>

			{totalPages > 1 && (
				<Pagination className="justify-end">
					<PaginationContent>
						<PaginationItem>
							<PaginationPrevious
								aria-disabled={page <= 1}
								className={page <= 1 ? "pointer-events-none opacity-50" : ""}
								href={buildPageHref(clientId, Math.max(1, page - 1))}
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
								href={buildPageHref(clientId, Math.min(totalPages, page + 1))}
								text="Próxima"
							/>
						</PaginationItem>
					</PaginationContent>
				</Pagination>
			)}
		</div>
	);
}
