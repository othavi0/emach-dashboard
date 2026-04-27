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
import { TOOL_STATUS_LABELS, type ToolStatusValue } from "./tool-schema";

const STATUS_BADGE_VARIANT: Record<
	ToolStatusValue,
	"default" | "secondary" | "destructive" | "outline"
> = {
	active: "default",
	draft: "secondary",
	discontinued: "outline",
	out_of_stock: "destructive",
};

export interface ToolRow {
	id: string;
	imageUrl: string | null;
	model: string | null;
	name: string;
	primaryCategoryName: string | null;
	sku: string | null;
	slug: string | null;
	status: string;
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
					<TableHead>Tipo de produto</TableHead>
					<TableHead>Fornecedor</TableHead>
					<TableHead>Modelo</TableHead>
					<TableHead>Status</TableHead>
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
						<TableCell>{t.primaryCategoryName ?? "—"}</TableCell>
						<TableCell>{t.supplierName ?? "—"}</TableCell>
						<TableCell>
							{t.model ? (
								<span className="font-mono text-xs">{t.model}</span>
							) : (
								<span className="text-muted-foreground">—</span>
							)}
						</TableCell>
						<TableCell>
							<Badge
								variant={
									STATUS_BADGE_VARIANT[t.status as ToolStatusValue] ?? "outline"
								}
							>
								{TOOL_STATUS_LABELS[t.status as ToolStatusValue] ?? t.status}
							</Badge>
						</TableCell>
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
										className={buttonVariants({
											size: "sm",
											variant: "secondary",
										})}
										href={`/dashboard/tools/${t.id}/stock`}
									>
										Gerenciar estoque
									</Link>
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
