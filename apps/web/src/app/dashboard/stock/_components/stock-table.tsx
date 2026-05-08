"use client";

import { Badge } from "@emach/ui/components/badge";
import { Button, buttonVariants } from "@emach/ui/components/button";
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
import { AlertTriangleIcon, Boxes } from "lucide-react";
import Link from "next/link";

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
	reorderCount: number;
	sku: string | null;
	slug: string | null;
	totalStock: number;
	variantCount: number;
	voltage: string | null;
}

interface StockTableProps {
	rows: StockRow[];
}

export function StockTable({ rows }: StockTableProps) {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead className="w-16">Imagem</TableHead>
					<TableHead>Nome</TableHead>
					<TableHead>SKU</TableHead>
					<TableHead className="text-right">Total</TableHead>
					<TableHead className="w-40 text-right">Filiais</TableHead>
					<TableHead className="w-40 text-right">Ações</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.map((row) => (
					<TableRow key={row.id}>
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
						<TableCell>
							<div className="flex items-center gap-2">
								<p className="font-medium">{row.name}</p>
								{row.reorderCount > 0 && (
									<Badge variant="warning">
										<AlertTriangleIcon aria-hidden="true" />
										Repor
										{row.reorderCount > 1 ? ` (${row.reorderCount})` : ""}
									</Badge>
								)}
							</div>
							<p className="text-muted-foreground text-xs">
								Gerenciar estoque por filial
							</p>
						</TableCell>
						<TableCell className="text-muted-foreground text-sm">
							{row.sku ?? "—"}
							{row.voltage ? ` · ${row.voltage}` : ""}
							{row.variantCount > 1
								? ` · +${row.variantCount - 1} variantes`
								: ""}
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
						<TableCell className="text-right">
							<Link
								aria-label={`Gerenciar estoque de ${row.name}`}
								className={buttonVariants({
									size: "icon-sm",
									variant: "secondary",
								})}
								href={`/dashboard/tools/${row.id}/stock`}
							>
								<Boxes aria-hidden className="size-3.5" />
							</Link>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
