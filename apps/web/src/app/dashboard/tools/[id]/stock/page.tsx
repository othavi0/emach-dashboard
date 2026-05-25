import { db } from "@emach/db";
import { stockLevel } from "@emach/db/schema/inventory";
import { tool, toolVariant } from "@emach/db/schema/tools";
import { buttonVariants } from "@emach/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";
import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { listBranches } from "@/app/dashboard/branches/actions";
import { requireCurrentSession } from "@/lib/session";
import { StockAdjustButton } from "../../../stock/_components/stock-adjust-button";
import { getStockMovements } from "../../../stock/actions";

interface PageProps {
	params: Promise<{ id: string }>;
}

const DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
	hour: "2-digit",
	minute: "2-digit",
});

function formatDateTime(value: Date | null): string {
	if (!value) {
		return "—";
	}
	return DATE_FORMATTER.format(value);
}

const REASON_LABELS: Record<string, string> = {
	entrada_compra: "Entrada de compra",
	saida_venda: "Saída de venda",
	ajuste_inventario: "Ajuste de inventário",
	perda: "Perda",
	outro: "Outro",
};

function formatReason(value: string | null): string {
	if (!value) {
		return "—";
	}
	return REASON_LABELS[value] ?? value;
}

function formatDelta(delta: number): {
	className: string;
	text: string;
} {
	if (delta > 0) {
		return {
			className: "font-mono text-emerald-400",
			text: `+${delta}`,
		};
	}
	if (delta < 0) {
		return {
			className: "font-mono text-red-400",
			text: String(delta),
		};
	}
	return {
		className: "font-mono text-muted-foreground",
		text: "0",
	};
}

interface VariantBranchRow {
	branchId: string;
	branchName: string;
	quantity: number;
	updatedAt: Date | null;
	variantId: string;
}

export default async function ToolStockPage({ params }: PageProps) {
	const session = await requireCurrentSession();
	const { id } = await params;
	const role = session.user.role ?? "user";
	const canMutate = role === "admin";

	const [currentTool] = await db
		.select()
		.from(tool)
		.where(eq(tool.id, id))
		.limit(1);
	if (!currentTool) {
		notFound();
	}

	const [variants, branches, stockLevels, movements] = await Promise.all([
		db
			.select()
			.from(toolVariant)
			.where(eq(toolVariant.toolId, id))
			.orderBy(asc(toolVariant.sortOrder)),
		listBranches({ activeOnly: true }),
		db
			.select({
				variantId: stockLevel.variantId,
				branchId: stockLevel.branchId,
				quantity: stockLevel.quantity,
				updatedAt: stockLevel.updatedAt,
			})
			.from(stockLevel)
			.innerJoin(toolVariant, eq(toolVariant.id, stockLevel.variantId))
			.where(eq(toolVariant.toolId, id)),
		getStockMovements(id, 50),
	]);

	const stockByVariantBranch = new Map<string, (typeof stockLevels)[number]>();
	for (const sl of stockLevels) {
		stockByVariantBranch.set(`${sl.variantId}:${sl.branchId}`, sl);
	}

	const defaultVariant = variants.find((v) => v.isDefault) ?? variants[0];

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="font-medium font-serif text-4xl tracking-tight">
						{currentTool.name}
					</h1>
					<p className="text-muted-foreground text-sm">
						{defaultVariant
							? `SKU padrão: ${defaultVariant.sku}`
							: "Sem variantes"}
					</p>
				</div>
				<Link
					className={buttonVariants({ variant: "ghost" })}
					href="/dashboard/stock"
				>
					Voltar ao estoque
				</Link>
			</div>

			{variants.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					Cadastre variantes na página de edição para gerenciar estoque.
				</p>
			) : (
				variants.map((variant) => {
					const rows: VariantBranchRow[] = branches
						.map((b) => {
							const row = stockByVariantBranch.get(`${variant.id}:${b.id}`);
							return {
								variantId: variant.id,
								branchId: b.id,
								branchName: b.name,
								quantity: row?.quantity ?? 0,
								updatedAt: row?.updatedAt ?? null,
							};
						})
						.sort((a, b) => a.branchName.localeCompare(b.branchName, "pt-BR"));
					return (
						<Card key={variant.id}>
							<CardHeader>
								<CardTitle>
									{variant.sku}
									{variant.voltage ? ` · ${variant.voltage}` : ""}
									{variant.isDefault ? " · padrão" : ""}
								</CardTitle>
							</CardHeader>
							<CardContent>
								{branches.length === 0 ? (
									<p className="text-muted-foreground text-sm">
										Nenhuma filial cadastrada.
									</p>
								) : (
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>Filial</TableHead>
												<TableHead className="text-right">
													Quantidade atual
												</TableHead>
												<TableHead>Última atualização</TableHead>
												{canMutate && (
													<TableHead className="w-32 text-right">
														Ações
													</TableHead>
												)}
											</TableRow>
										</TableHeader>
										<TableBody>
											{rows.map((row) => (
												<TableRow key={`${row.variantId}-${row.branchId}`}>
													<TableCell className="font-medium">
														{row.branchName}
													</TableCell>
													<TableCell className="text-right font-mono">
														{row.quantity}
													</TableCell>
													<TableCell className="text-muted-foreground text-sm">
														{formatDateTime(row.updatedAt)}
													</TableCell>
													{canMutate && (
														<TableCell className="text-right">
															<StockAdjustButton
																branchId={row.branchId}
																branchName={row.branchName}
																currentQty={row.quantity}
																variantId={row.variantId}
															/>
														</TableCell>
													)}
												</TableRow>
											))}
										</TableBody>
									</Table>
								)}
							</CardContent>
						</Card>
					);
				})
			)}

			<div>
				<h2 className="mb-3 font-medium font-serif text-2xl tracking-tight">
					Histórico de movimentações (todas as variantes)
				</h2>
				{movements.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						Nenhuma movimentação registrada
					</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-40">Data</TableHead>
								<TableHead>Filial</TableHead>
								<TableHead className="text-right">Qtd anterior</TableHead>
								<TableHead className="text-right">Qtd nova</TableHead>
								<TableHead className="text-right">Delta</TableHead>
								<TableHead>Motivo</TableHead>
								<TableHead>Usuário</TableHead>
								<TableHead>Nota</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{movements.map((movement) => {
								const delta = formatDelta(movement.delta);
								return (
									<TableRow key={movement.id}>
										<TableCell className="text-muted-foreground text-sm">
											{formatDateTime(movement.createdAt)}
										</TableCell>
										<TableCell
											className={
												movement.branchName
													? "font-medium"
													: "text-muted-foreground italic"
											}
										>
											{movement.branchName ?? "Filial removida"}
										</TableCell>
										<TableCell className="text-right font-mono">
											{movement.previousQty}
										</TableCell>
										<TableCell className="text-right font-mono">
											{movement.newQty}
										</TableCell>
										<TableCell className={`text-right ${delta.className}`}>
											{delta.text}
										</TableCell>
										<TableCell className="text-muted-foreground text-sm">
											{formatReason(movement.reason)}
										</TableCell>
										<TableCell className="text-muted-foreground text-sm">
											{movement.actorName ?? "—"}
										</TableCell>
										<TableCell className="text-muted-foreground text-sm">
											{movement.reasonNote ?? "—"}
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				)}
			</div>
		</div>
	);
}
