import { db } from "@emach/db";
import { stockLevel } from "@emach/db/schema/inventory";
import { tool } from "@emach/db/schema/tools";
import { buttonVariants } from "@emach/ui/components/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";
import { eq } from "drizzle-orm";
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

async function fetchTool(id: string) {
	const rows = await db.select().from(tool).where(eq(tool.id, id)).limit(1);
	return rows[0] ?? null;
}

async function fetchStockLevelsForTool(toolId: string) {
	return await db
		.select({
			branchId: stockLevel.branchId,
			quantity: stockLevel.quantity,
			updatedAt: stockLevel.updatedAt,
		})
		.from(stockLevel)
		.where(eq(stockLevel.toolId, toolId));
}

interface BranchStockRow {
	branchId: string;
	branchName: string;
	quantity: number;
	updatedAt: Date | null;
}

export default async function ToolStockPage({ params }: PageProps) {
	const session = await requireCurrentSession();
	const { id } = await params;
	const role = session.user.role ?? "user";
	const canMutate = role === "admin";

	const currentTool = await fetchTool(id);
	if (!currentTool) {
		notFound();
	}

	const [branches, stockLevels, movements] = await Promise.all([
		listBranches(),
		fetchStockLevelsForTool(id),
		getStockMovements(id, 50),
	]);

	const stockByBranch = new Map(stockLevels.map((sl) => [sl.branchId, sl]));

	const rows: BranchStockRow[] = branches
		.map((b) => {
			const row = stockByBranch.get(b.id);
			return {
				branchId: b.id,
				branchName: b.name,
				quantity: row?.quantity ?? 0,
				updatedAt: row?.updatedAt ?? null,
			};
		})
		.sort((a, b) => a.branchName.localeCompare(b.branchName, "pt-BR"));

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="font-serif text-2xl">{currentTool.name}</h1>
					<p className="text-muted-foreground text-sm">
						{currentTool.sku ? `SKU: ${currentTool.sku}` : "Sem SKU"}
					</p>
				</div>
				<Link
					className={buttonVariants({ variant: "ghost" })}
					href="/dashboard/stock"
				>
					Voltar ao estoque
				</Link>
			</div>

			<div>
				<h2 className="mb-3 font-serif text-lg">Estoque por filial</h2>
				{branches.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						Nenhuma filial cadastrada. Crie uma filial em{" "}
						<Link className="underline" href="/dashboard/branches">
							/dashboard/branches
						</Link>
						.
					</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Filial</TableHead>
								<TableHead className="text-right">Quantidade atual</TableHead>
								<TableHead>Última atualização</TableHead>
								{canMutate && (
									<TableHead className="w-32 text-right">Ações</TableHead>
								)}
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((row) => (
								<TableRow key={row.branchId}>
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
												toolId={id}
											/>
										</TableCell>
									)}
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</div>

			<div>
				<h2 className="mb-3 font-serif text-lg">Histórico de movimentações</h2>
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
