"use client";

import { buttonVariants } from "@emach/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@emach/ui/components/dropdown-menu";
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
import {
	Boxes,
	Building2,
	MoreHorizontal,
	Pencil,
	TriangleAlert,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useInfiniteList } from "@/lib/use-infinite-list";

import { type BranchesFiltersInput, fetchBranchesTablePage } from "../actions";
import type { BranchTableRow } from "../data";
import { BranchDefaultBadge } from "./branch-default-badge";
import { DeleteBranchDialog } from "./delete-branch-dialog";

interface BranchesTableProps {
	canMutate: boolean;
	filters: BranchesFiltersInput;
	initial: BranchTableRow[];
	initialCursor: string | null;
}

export function BranchesTable({
	canMutate,
	filters,
	initial,
	initialCursor,
}: BranchesTableProps) {
	const router = useRouter();
	const resetKey = JSON.stringify(filters);
	const fetchPage = (cursor: string) =>
		fetchBranchesTablePage({ filters, cursor });
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: initial,
		initialCursor,
		fetchPage,
		resetKey,
	});

	if (items.length === 0) {
		return (
			<div className="flex flex-col items-center gap-2 py-16 text-center">
				<Building2 aria-hidden className="size-12 opacity-40" />
				<p className="font-medium text-sm">Nenhuma filial encontrada</p>
				<p className="text-muted-foreground text-xs">
					Ajuste os filtros ou cadastre a primeira filial.
				</p>
			</div>
		);
	}

	return (
		<div aria-live="polite">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Nome</TableHead>
						<TableHead>Endereço</TableHead>
						<TableHead className="w-28 text-right">Equipe</TableHead>
						<TableHead className="w-32 text-right">SKUs ativos</TableHead>
						<TableHead className="w-36 text-right">Abaixo do mín.</TableHead>
						<TableActionsHead />
					</TableRow>
				</TableHeader>
				<TableBody>
					{items.map((b) => (
						<TableRow key={b.id}>
							<TableCell className="font-medium">
								<span className="flex flex-wrap items-center gap-2">
									{b.name}
									{b.isDefault && <BranchDefaultBadge />}
								</span>
							</TableCell>
							<TableCell className="text-muted-foreground">
								{b.address ?? "—"}
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{b.teamCount}
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{b.activeSkus}
							</TableCell>
							<TableCell className="text-right tabular-nums">
								{b.lowStock > 0 ? (
									<span className="inline-flex items-center justify-end gap-1 text-amber-500">
										<TriangleAlert aria-hidden className="size-3.5" />
										{b.lowStock}
									</span>
								) : (
									b.lowStock
								)}
							</TableCell>
							<TableActionsCell>
								<DropdownMenu>
									<DropdownMenuTrigger
										aria-label={`Ações para ${b.name}`}
										className={buttonVariants({
											size: "icon-sm",
											variant: "ghost",
										})}
									>
										<MoreHorizontal aria-hidden className="size-4" />
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end">
										<DropdownMenuItem
											onClick={() =>
												router.push(`/dashboard/branches/${b.id}/stock`)
											}
										>
											<Boxes aria-hidden className="size-4" />
											Estoque
										</DropdownMenuItem>
										{canMutate && (
											<DropdownMenuItem
												onClick={() =>
													router.push(`/dashboard/branches/${b.id}?edit=1`)
												}
											>
												<Pencil aria-hidden className="size-4" />
												Editar
											</DropdownMenuItem>
										)}
									</DropdownMenuContent>
								</DropdownMenu>
								{canMutate && (
									<DeleteBranchDialog branchId={b.id} branchName={b.name} />
								)}
							</TableActionsCell>
						</TableRow>
					))}
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
