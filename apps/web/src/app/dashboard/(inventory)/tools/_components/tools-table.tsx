"use client";

import { Badge } from "@emach/ui/components/badge";
import { buttonVariants } from "@emach/ui/components/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";
import Link from "next/link";

import { DeleteToolDialog } from "./delete-tool-dialog";

export interface ToolRow {
	categoryName: string | null;
	id: string;
	imageUrl: string | null;
	name: string;
	sku: string | null;
	slug: string | null;
	supplierName: string | null;
	totalStock: number;
	visibleOnSite: boolean;
}

interface ToolsTableProps {
	canMutate: boolean;
	tools: ToolRow[];
}

export function ToolsTable({ tools, canMutate }: ToolsTableProps) {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead className="w-16">Imagem</TableHead>
					<TableHead>Nome</TableHead>
					<TableHead>Categoria</TableHead>
					<TableHead>Fornecedor</TableHead>
					<TableHead>Visibilidade</TableHead>
					<TableHead className="text-right">Estoque</TableHead>
					{canMutate && (
						<TableHead className="w-40 text-right">Ações</TableHead>
					)}
				</TableRow>
			</TableHeader>
			<TableBody>
				{tools.map((t) => (
					<TableRow key={t.id}>
						<TableCell>
							{t.imageUrl ? (
								// biome-ignore lint/performance/noImgElement: Supabase public URL
								// biome-ignore lint/correctness/useImageSize: fixed thumb via Tailwind
								<img
									alt={t.name}
									className="h-10 w-10 rounded border border-border object-cover"
									src={t.imageUrl}
								/>
							) : (
								<div className="h-10 w-10 rounded border border-border border-dashed" />
							)}
						</TableCell>
						<TableCell>
							<Link
								className="font-medium hover:underline"
								href={`/dashboard/tools/${t.id}`}
							>
								{t.name}
							</Link>
							{t.sku && (
								<p className="text-muted-foreground text-xs">SKU: {t.sku}</p>
							)}
						</TableCell>
						<TableCell>{t.categoryName ?? "—"}</TableCell>
						<TableCell>{t.supplierName ?? "—"}</TableCell>
						<TableCell>
							<Badge variant={t.visibleOnSite ? "default" : "outline"}>
								{t.visibleOnSite ? "Visível" : "Oculto"}
							</Badge>
						</TableCell>
						<TableCell className="text-right tabular-nums">
							{t.totalStock}
						</TableCell>
						{canMutate && (
							<TableCell className="text-right">
								<div className="flex justify-end gap-2">
									<Link
										className={buttonVariants({ size: "sm", variant: "ghost" })}
										href={`/dashboard/tools/${t.id}/edit`}
									>
										Editar
									</Link>
									<DeleteToolDialog toolId={t.id} toolName={t.name} />
								</div>
							</TableCell>
						)}
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
