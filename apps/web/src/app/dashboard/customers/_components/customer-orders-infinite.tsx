"use client";

import { buttonVariants } from "@emach/ui/components/button";
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
import { EyeIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { formatDateTime, formatRelative } from "@/lib/format/datetime";
import { useInfiniteList } from "@/lib/use-infinite-list";
import { OrderStatusBadge } from "../../orders/_components/order-status-badge";
import { fetchCustomerOrdersPage } from "../actions";
import type { CustomerOrderRow } from "../data";

const CURRENCY = new Intl.NumberFormat("pt-BR", {
	currency: "BRL",
	style: "currency",
});

function itemsPreview(order: CustomerOrderRow): string {
	if (!order.firstItemName) {
		return "";
	}
	const extra = order.itemsCount > 1 ? ` +${order.itemsCount - 1}` : "";
	return `${order.firstItemName}${extra}`;
}

interface CustomerOrdersInfiniteProps {
	clientId: string;
	initialCursor: string | null;
	initialItems: CustomerOrderRow[];
}

export function CustomerOrdersInfinite({
	clientId,
	initialItems,
	initialCursor,
}: CustomerOrdersInfiniteProps) {
	const router = useRouter();
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems,
		initialCursor,
		fetchPage: (cursor) => fetchCustomerOrdersPage({ clientId, cursor }),
	});

	return (
		<div className="flex flex-col gap-4">
			<Table className="table-fixed">
				<colgroup>
					<col className="w-[16%]" />
					<col className="w-[12%]" />
					<col className="w-[27%]" />
					<col className="w-[16%]" />
					<col className="w-[15%]" />
					<col className="w-[11%]" />
					<col className="w-16" />
				</colgroup>
				<TableHeader>
					<TableRow>
						<TableHead>Pedido</TableHead>
						<TableHead>Data</TableHead>
						<TableHead>Itens</TableHead>
						<TableHead>Filial</TableHead>
						<TableHead>Status</TableHead>
						<TableHead className="text-right">Total</TableHead>
						<TableActionsHead>Ação</TableActionsHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{items.map((order) => {
						const href = `/dashboard/orders/${order.id}`;
						const preview = itemsPreview(order);
						return (
							<TableRow
								className="cursor-pointer transition-colors hover:bg-primary/[0.06]"
								key={order.id}
								onClick={() => router.push(href)}
							>
								<TableCell className="truncate font-medium font-mono text-sm">
									{order.number}
								</TableCell>
								<TableCell
									className="truncate text-muted-foreground text-sm"
									title={formatDateTime(order.createdAt)}
								>
									<span suppressHydrationWarning>
										{formatRelative(order.createdAt)}
									</span>
								</TableCell>
								<TableCell className="truncate text-sm">
									<span className="font-medium">{order.itemsCount}</span>
									{preview ? (
										<span className="text-muted-foreground"> · {preview}</span>
									) : null}
								</TableCell>
								<TableCell className="truncate text-muted-foreground text-sm">
									{order.branchName ?? "—"}
								</TableCell>
								<TableCell>
									<OrderStatusBadge status={order.status} />
								</TableCell>
								<TableCell className="text-right font-medium font-mono text-primary text-sm">
									{CURRENCY.format(order.totalAmount)}
								</TableCell>
								<TableActionsCell>
									<Link
										aria-label={`Abrir pedido ${order.number}`}
										className={buttonVariants({
											size: "icon-sm",
											variant: "outline",
										})}
										href={href}
										onClick={(e) => e.stopPropagation()}
									>
										<EyeIcon aria-hidden className="size-3.5" />
									</Link>
								</TableActionsCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
			<InfiniteSentinel
				error={error}
				hasMore={hasMore}
				onLoadMore={loadMore}
				pending={pending}
			/>
		</div>
	);
}
