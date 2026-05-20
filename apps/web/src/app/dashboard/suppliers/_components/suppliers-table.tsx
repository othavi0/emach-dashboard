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
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";
import { Eye, Factory, MoreHorizontal, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";

import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { useInfiniteList } from "@/lib/use-infinite-list";

import {
	fetchSuppliersTablePage,
	type SuppliersFiltersInput,
} from "../actions";
import type { SupplierTableRow } from "../data";

interface SuppliersTableProps {
	canMutate: boolean;
	filters: SuppliersFiltersInput;
	initial: SupplierTableRow[];
	initialCursor: string | null;
}

const DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
});

function formatDate(value: Date): string {
	return DATE_FORMATTER.format(value);
}

export function SuppliersTable({
	canMutate,
	filters,
	initial,
	initialCursor,
}: SuppliersTableProps) {
	const router = useRouter();
	const resetKey = JSON.stringify(filters);
	const fetchPage = (cursor: string) =>
		fetchSuppliersTablePage({ filters, cursor });
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: initial,
		initialCursor,
		fetchPage,
		resetKey,
	});

	if (items.length === 0) {
		return (
			<div className="flex flex-col items-center gap-2 py-16 text-center">
				<Factory aria-hidden className="size-12 opacity-40" />
				<p className="font-medium text-sm">Nenhum fornecedor encontrado</p>
				<p className="text-muted-foreground text-xs">
					Ajuste os filtros ou cadastre o primeiro fornecedor.
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
						<TableHead>E-mail</TableHead>
						<TableHead>Telefone</TableHead>
						<TableHead className="w-32 text-right">Ferramentas</TableHead>
						<TableHead className="w-36">Adicionado em</TableHead>
						<TableHead className="w-12" />
					</TableRow>
				</TableHeader>
				<TableBody>
					{items.map((s) => (
						<TableRow key={s.id}>
							<TableCell className="font-medium">{s.name}</TableCell>
							<TableCell className="max-w-[180px] truncate text-muted-foreground">
								{s.contactEmail ?? "—"}
							</TableCell>
							<TableCell className="max-w-[140px] truncate text-muted-foreground">
								{s.phone ?? "—"}
							</TableCell>
							<TableCell className="text-right tabular-nums">
								<span
									className={s.toolsTotal === 0 ? "text-amber-500" : undefined}
								>
									{s.toolsActive}/{s.toolsTotal}
								</span>
							</TableCell>
							<TableCell className="text-muted-foreground text-sm">
								{formatDate(s.createdAt)}
							</TableCell>
							<TableCell>
								<DropdownMenu>
									<DropdownMenuTrigger
										aria-label={`Ações para ${s.name}`}
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
												router.push(`/dashboard/suppliers/${s.id}`)
											}
										>
											<Eye aria-hidden className="size-4" />
											Detalhes
										</DropdownMenuItem>
										{canMutate && (
											<DropdownMenuItem
												onClick={() =>
													router.push(`/dashboard/suppliers/${s.id}?edit=1`)
												}
											>
												<Pencil aria-hidden className="size-4" />
												Editar
											</DropdownMenuItem>
										)}
									</DropdownMenuContent>
								</DropdownMenu>
							</TableCell>
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
