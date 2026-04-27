import { db } from "@emach/db";
import { category, toolCategory } from "@emach/db/schema/categories";
import { branch, stockLevel } from "@emach/db/schema/inventory";
import { supplier, tool, toolImage } from "@emach/db/schema/tools";
import { Badge } from "@emach/ui/components/badge";
import { buttonVariants } from "@emach/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
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

import { requireCurrentSession } from "@/lib/session";
import {
	TOOL_STATUS_LABELS,
	type ToolStatusValue,
} from "../_components/tool-schema";

const STATUS_BADGE_VARIANT: Record<
	ToolStatusValue,
	"default" | "secondary" | "outline" | "destructive"
> = {
	active: "default",
	draft: "secondary",
	discontinued: "outline",
	out_of_stock: "destructive",
};

interface PageProps {
	params: Promise<{ id: string }>;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: página detalhe com múltiplas seções; refactor em docs/plano-melhorias.md
export default async function ToolDetailPage({ params }: PageProps) {
	const session = await requireCurrentSession();
	const canMutate = (session.user.role ?? "user") === "admin";
	const { id } = await params;

	const [row] = await db
		.select({
			id: tool.id,
			name: tool.name,
			slug: tool.slug,
			sku: tool.sku,
			description: tool.description,
			model: tool.model,
			invoiceModel: tool.invoiceModel,
			barcode: tool.barcode,
			manufacturerName: tool.manufacturerName,
			countryOfOrigin: tool.countryOfOrigin,
			status: tool.status,
			hsCode: tool.hsCode,
			ncm: tool.ncm,
			cest: tool.cest,
			voltage: tool.voltage,
			powerWatts: tool.powerWatts,
			frequencyHz: tool.frequencyHz,
			warrantyMonths: tool.warrantyMonths,
			weightKg: tool.weightKg,
			lengthCm: tool.lengthCm,
			widthCm: tool.widthCm,
			heightCm: tool.heightCm,
			price: tool.price,
			cost: tool.cost,
			visibleOnSite: tool.visibleOnSite,
			supplierName: supplier.name,
		})
		.from(tool)
		.leftJoin(supplier, eq(supplier.id, tool.supplierId))
		.where(eq(tool.id, id))
		.limit(1);

	if (!row) {
		notFound();
	}

	const toolCategoriesRows = await db
		.select({
			categoryId: toolCategory.categoryId,
			categoryName: category.name,
			isPrimary: toolCategory.isPrimary,
		})
		.from(toolCategory)
		.innerJoin(category, eq(category.id, toolCategory.categoryId))
		.where(eq(toolCategory.toolId, id))
		.orderBy(asc(category.name));
	const primaryCategoryName =
		toolCategoriesRows.find((c) => c.isPrimary)?.categoryName ?? null;
	const allCategoryNames = toolCategoriesRows
		.map((c) => c.categoryName)
		.join(", ");

	const images = await db
		.select({ id: toolImage.id, url: toolImage.url })
		.from(toolImage)
		.where(eq(toolImage.toolId, id))
		.orderBy(asc(toolImage.sortOrder));

	const stockRows = await db
		.select({
			branchId: branch.id,
			branchName: branch.name,
			quantity: stockLevel.quantity,
		})
		.from(stockLevel)
		.innerJoin(branch, eq(branch.id, stockLevel.branchId))
		.where(eq(stockLevel.toolId, id))
		.orderBy(asc(branch.name));

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-start justify-between">
				<div>
					<h1 className="font-serif text-2xl">{row.name}</h1>
					<p className="text-muted-foreground text-sm">
						{row.sku ? `SKU: ${row.sku}` : "Sem SKU definido"}
					</p>
				</div>
				<div className="flex gap-2">
					<Link
						className={buttonVariants({ variant: "secondary" })}
						href={`/dashboard/tools/${id}/stock`}
					>
						Gerenciar estoque
					</Link>
					{canMutate && (
						<Link
							className={buttonVariants({ variant: "ghost" })}
							href={`/dashboard/tools/${id}/edit`}
						>
							Editar
						</Link>
					)}
				</div>
			</div>

			<div className="grid gap-6 md:grid-cols-[240px_1fr]">
				<div className="flex flex-col gap-2">
					{images.length > 0 ? (
						// biome-ignore lint/performance/noImgElement: Supabase public URL
						// biome-ignore lint/correctness/useImageSize: detail view fixed via Tailwind
						<img
							alt={row.name}
							className="h-60 w-60 rounded border border-border object-cover"
							src={images[0].url}
						/>
					) : (
						<div className="flex h-60 w-60 items-center justify-center rounded border border-border border-dashed text-muted-foreground text-xs">
							Sem imagem
						</div>
					)}
					{images.length > 1 && (
						<div className="grid grid-cols-4 gap-1">
							{images.slice(1).map((img, idx) => (
								// biome-ignore lint/performance/noImgElement: Supabase public URL
								// biome-ignore lint/correctness/useImageSize: thumbnail fixed via Tailwind
								<img
									alt={`${row.name} - ${idx + 2}`}
									className="aspect-square w-full rounded border border-border object-cover"
									key={img.id}
									src={img.url}
								/>
							))}
						</div>
					)}
				</div>

				<Card>
					<CardHeader>
						<CardTitle>Detalhes</CardTitle>
						<CardDescription>
							<span className="flex items-center gap-2">
								<span>Status:</span>
								<Badge
									variant={
										STATUS_BADGE_VARIANT[row.status as ToolStatusValue] ??
										"outline"
									}
								>
									{TOOL_STATUS_LABELS[row.status as ToolStatusValue] ??
										row.status}
								</Badge>
								<span className="ml-2">Visível no site:</span>
								<Badge variant={row.visibleOnSite ? "default" : "outline"}>
									{row.visibleOnSite ? "Sim" : "Não"}
								</Badge>
							</span>
						</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-2 text-sm">
						<p>
							<strong>Categoria principal:</strong> {primaryCategoryName ?? "—"}
						</p>
						{allCategoryNames && (
							<p>
								<strong>Todas as categorias:</strong> {allCategoryNames}
							</p>
						)}
						<p>
							<strong>Fornecedor:</strong> {row.supplierName ?? "—"}
						</p>
						<p>
							<strong>Voltagem:</strong> {row.voltage ?? "—"}
						</p>
						<p>
							<strong>Preço:</strong> {row.price ?? "—"}
						</p>
						<p>
							<strong>Custo:</strong> {row.cost ?? "—"}
						</p>
						{row.description && (
							<p>
								<strong>Descrição:</strong> {row.description}
							</p>
						)}
					</CardContent>
				</Card>
			</div>

			<div className="grid gap-6 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>Classificação fiscal</CardTitle>
					</CardHeader>
					<CardContent>
						<dl className="grid gap-2 text-sm">
							<div className="flex justify-between">
								<dt className="text-muted-foreground">HS Code</dt>
								<dd>{row.hsCode ?? "—"}</dd>
							</div>
							<div className="flex justify-between">
								<dt className="text-muted-foreground">NCM</dt>
								<dd>{row.ncm ?? "—"}</dd>
							</div>
							<div className="flex justify-between">
								<dt className="text-muted-foreground">CEST</dt>
								<dd>{row.cest ?? "—"}</dd>
							</div>
						</dl>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Especificações</CardTitle>
					</CardHeader>
					<CardContent>
						<dl className="grid gap-2 text-sm">
							<div className="flex justify-between">
								<dt className="text-muted-foreground">Modelo</dt>
								<dd>{row.model ?? "—"}</dd>
							</div>
							<div className="flex justify-between">
								<dt className="text-muted-foreground">Modelo invoice</dt>
								<dd>{row.invoiceModel ?? "—"}</dd>
							</div>
							<div className="flex justify-between">
								<dt className="text-muted-foreground">Barcode</dt>
								<dd>{row.barcode ?? "—"}</dd>
							</div>
							<div className="flex justify-between">
								<dt className="text-muted-foreground">Fabricante</dt>
								<dd>{row.manufacturerName ?? "—"}</dd>
							</div>
							<div className="flex justify-between">
								<dt className="text-muted-foreground">País de origem</dt>
								<dd>{row.countryOfOrigin ?? "—"}</dd>
							</div>
							<div className="flex justify-between">
								<dt className="text-muted-foreground">Potência</dt>
								<dd>{row.powerWatts == null ? "—" : `${row.powerWatts} W`}</dd>
							</div>
							<div className="flex justify-between">
								<dt className="text-muted-foreground">Frequência</dt>
								<dd>
									{row.frequencyHz == null ? "—" : `${row.frequencyHz} Hz`}
								</dd>
							</div>
							<div className="flex justify-between">
								<dt className="text-muted-foreground">Garantia</dt>
								<dd>
									{row.warrantyMonths == null
										? "—"
										: `${row.warrantyMonths} meses`}
								</dd>
							</div>
							<div className="flex justify-between">
								<dt className="text-muted-foreground">Peso</dt>
								<dd>{row.weightKg == null ? "—" : `${row.weightKg} kg`}</dd>
							</div>
							<div className="flex justify-between">
								<dt className="text-muted-foreground">Dimensões (C×L×A)</dt>
								<dd>
									{row.lengthCm != null &&
									row.widthCm != null &&
									row.heightCm != null
										? `${row.lengthCm}×${row.widthCm}×${row.heightCm} cm`
										: "—"}
								</dd>
							</div>
						</dl>
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Estoque por Filial</CardTitle>
					<CardDescription>
						Quantidade disponível por unidade da rede.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{stockRows.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							Nenhum estoque registrado para esta ferramenta.
						</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Filial</TableHead>
									<TableHead className="text-right">Quantidade</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{stockRows.map((s) => (
									<TableRow key={s.branchId}>
										<TableCell>{s.branchName}</TableCell>
										<TableCell className="text-right tabular-nums">
											{s.quantity}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
