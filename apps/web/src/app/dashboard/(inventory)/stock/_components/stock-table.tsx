"use client";

import { Button } from "@emach/ui/components/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@emach/ui/components/popover";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";
import { useRouter } from "next/navigation";

export interface StockRowBranch {
	branchId: string;
	branchName: string;
	quantity: number;
}

export interface StockRow {
	branches: StockRowBranch[];
	id: string;
	imageUrl: string | null;
	name: string;
	sku: string | null;
	slug: string | null;
	totalStock: number;
}

interface StockTableProps {
	rows: StockRow[];
}

export function StockTable({ rows }: StockTableProps) {
	const router = useRouter();

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead className="w-16">Imagem</TableHead>
					<TableHead>Nome</TableHead>
					<TableHead>SKU</TableHead>
					<TableHead className="text-right">Total</TableHead>
					<TableHead className="w-40 text-right">Filiais</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.map((row) => (
					<TableRow
						className="cursor-pointer hover:bg-muted/50"
						key={row.id}
						onClick={() => router.push(`/dashboard/tools/${row.id}/stock`)}
					>
						<TableCell>
							{row.imageUrl ? (
								// biome-ignore lint/performance/noImgElement: Supabase public URL
								// biome-ignore lint/correctness/useImageSize: fixed thumb via Tailwind
								<img
									alt={row.name}
									className="h-10 w-10 rounded border border-border object-cover"
									src={row.imageUrl}
								/>
							) : (
								<div className="h-10 w-10 rounded border border-border bg-muted" />
							)}
						</TableCell>
						<TableCell className="font-medium">{row.name}</TableCell>
						<TableCell className="text-muted-foreground text-sm">
							{row.sku ?? "—"}
						</TableCell>
						<TableCell className="text-right font-mono">
							{row.totalStock}
						</TableCell>
						<TableCell
							className="text-right"
							onClick={(event) => event.stopPropagation()}
						>
							{row.branches.length === 0 ? (
								<span className="text-muted-foreground text-xs">
									Nenhuma filial com estoque
								</span>
							) : (
								<Popover>
									<PopoverTrigger render={<Button size="sm" variant="ghost" />}>
										Ver {row.branches.length}
									</PopoverTrigger>
									<PopoverContent className="w-64">
										<ul className="flex flex-col gap-2">
											{row.branches.map((item) => (
												<li
													className="flex items-center justify-between text-sm"
													key={item.branchId}
												>
													<span className="text-muted-foreground">
														{item.branchName}
													</span>
													<span className="font-mono">{item.quantity}</span>
												</li>
											))}
										</ul>
									</PopoverContent>
								</Popover>
							)}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
