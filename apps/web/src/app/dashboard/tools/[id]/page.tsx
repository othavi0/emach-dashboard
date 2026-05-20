import { db } from "@emach/db";
import {
	attributeDefinition,
	toolAttributeValue,
} from "@emach/db/schema/attributes";
import { category, toolCategory } from "@emach/db/schema/categories";
import { branch, stockLevel } from "@emach/db/schema/inventory";
import { supplier, tool, toolImage, toolVariant } from "@emach/db/schema/tools";
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

import { ToolDescription } from "@/components/tool-description";
import { requireCurrentSession } from "@/lib/session";
import {
	TOOL_STATUS_LABELS,
	type ToolStatusValue,
} from "../_components/tool-schema";
import { ToolReviewsSection } from "./_components/tool-reviews-section";
import { getToolReviewsSummary } from "./_lib/reviews-data";

const STATUS_BADGE_VARIANT: Record<
	ToolStatusValue,
	"destructive" | "outline" | "secondary" | "success"
> = {
	active: "success",
	draft: "secondary",
	discontinued: "outline",
	out_of_stock: "destructive",
};

const BRL = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
});

interface PageProps {
	params: Promise<{ id: string }>;
}

function formatAttributeValue(row: {
	inputType: string;
	unit: string | null;
	valueText: string | null;
	valueNumeric: string | null;
	valueNumericMax: string | null;
	valueBool: boolean | null;
}): string {
	const unit = row.unit ? ` ${row.unit}` : "";
	switch (row.inputType) {
		case "text":
		case "select":
		case "color":
			return row.valueText ?? "—";
		case "number":
			return row.valueNumeric == null ? "—" : `${row.valueNumeric}${unit}`;
		case "boolean":
			return row.valueBool ? "Sim" : "Não";
		case "numeric_range":
			if (row.valueNumeric == null) {
				return "—";
			}
			if (row.valueNumericMax == null) {
				return `${row.valueNumeric}${unit}`;
			}
			return `${row.valueNumeric} – ${row.valueNumericMax}${unit}`;
		default:
			return "—";
	}
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: página detalhe com múltiplas seções
export default async function ToolDetailPage({ params }: PageProps) {
	const session = await requireCurrentSession();
	const canMutate = (session.user.role ?? "user") === "admin";
	const { id } = await params;

	const [row] = await db
		.select({
			id: tool.id,
			name: tool.name,
			slug: tool.slug,
			description: tool.description,
			model: tool.model,
			invoiceModel: tool.invoiceModel,
			manufacturerName: tool.manufacturerName,
			status: tool.status,
			hsCode: tool.hsCode,
			ncm: tool.ncm,
			cest: tool.cest,
			powerWatts: tool.powerWatts,
			weightKg: tool.weightKg,
			lengthCm: tool.lengthCm,
			widthCm: tool.widthCm,
			heightCm: tool.heightCm,
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

	const [
		toolCategoriesRows,
		images,
		variants,
		attributeValues,
		stockRows,
		reviewsSummary,
	] = await Promise.all([
		db
			.select({
				categoryId: toolCategory.categoryId,
				categoryName: category.name,
				isPrimary: toolCategory.isPrimary,
			})
			.from(toolCategory)
			.innerJoin(category, eq(category.id, toolCategory.categoryId))
			.where(eq(toolCategory.toolId, id))
			.orderBy(asc(category.name)),
		db
			.select({ id: toolImage.id, url: toolImage.url })
			.from(toolImage)
			.where(eq(toolImage.toolId, id))
			.orderBy(asc(toolImage.sortOrder)),
		db
			.select()
			.from(toolVariant)
			.where(eq(toolVariant.toolId, id))
			.orderBy(asc(toolVariant.sortOrder)),
		db
			.select({
				slug: attributeDefinition.slug,
				label: attributeDefinition.label,
				inputType: attributeDefinition.inputType,
				unit: attributeDefinition.unit,
				valueText: toolAttributeValue.valueText,
				valueNumeric: toolAttributeValue.valueNumeric,
				valueNumericMax: toolAttributeValue.valueNumericMax,
				valueBool: toolAttributeValue.valueBool,
			})
			.from(toolAttributeValue)
			.innerJoin(
				attributeDefinition,
				eq(attributeDefinition.id, toolAttributeValue.attributeId)
			)
			.where(eq(toolAttributeValue.toolId, id))
			.orderBy(
				asc(attributeDefinition.sortOrder),
				asc(attributeDefinition.label)
			),
		db
			.select({
				variantId: toolVariant.id,
				variantSku: toolVariant.sku,
				variantVoltage: toolVariant.voltage,
				branchId: branch.id,
				branchName: branch.name,
				quantity: stockLevel.quantity,
			})
			.from(stockLevel)
			.innerJoin(toolVariant, eq(toolVariant.id, stockLevel.variantId))
			.innerJoin(branch, eq(branch.id, stockLevel.branchId))
			.where(eq(toolVariant.toolId, id))
			.orderBy(asc(toolVariant.sortOrder), asc(branch.name)),
		getToolReviewsSummary(id),
	]);

	const primaryCategoryName =
		toolCategoriesRows.find((c) => c.isPrimary)?.categoryName ?? null;
	const allCategoryNames = toolCategoriesRows
		.map((c) => c.categoryName)
		.join(", ");
	const defaultVariant = variants.find((v) => v.isDefault) ?? variants[0];
	const firstImage = images[0];

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-start justify-between">
				<div>
					<h1 className="font-medium font-serif text-4xl tracking-tight">
						{row.name}
					</h1>
					<p className="text-muted-foreground text-sm">
						{defaultVariant
							? `SKU padrão: ${defaultVariant.sku}`
							: "Sem variantes cadastradas"}
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
					{firstImage ? (
						// biome-ignore lint/performance/noImgElement: Supabase public URL
						// biome-ignore lint/correctness/useImageSize: detail view fixed via Tailwind
						<img
							alt={row.name}
							className="h-60 w-60 rounded border border-border object-cover"
							src={firstImage.url}
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
								<Badge variant={row.visibleOnSite ? "success" : "outline"}>
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
						{row.description && (
							<div>
								<strong>Descrição:</strong>
								<ToolDescription markdown={row.description} />
							</div>
						)}
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Variantes</CardTitle>
					<CardDescription>
						SKUs vendáveis. Estoque por filial é gerenciado em "Gerenciar
						estoque".
					</CardDescription>
				</CardHeader>
				<CardContent>
					{variants.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							Nenhuma variante cadastrada.
						</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>SKU</TableHead>
									<TableHead>Voltagem</TableHead>
									<TableHead className="text-right">Preço</TableHead>
									<TableHead className="text-right">Custo</TableHead>
									<TableHead>Padrão</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{variants.map((v) => (
									<TableRow key={v.id}>
										<TableCell className="font-mono text-xs">{v.sku}</TableCell>
										<TableCell>{v.voltage ?? "—"}</TableCell>
										<TableCell className="text-right tabular-nums">
											{BRL.format(Number(v.priceAmount))}
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{v.costAmount ? BRL.format(Number(v.costAmount)) : "—"}
										</TableCell>
										<TableCell>
											{v.isDefault ? <Badge>Padrão</Badge> : "—"}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>

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
						<CardTitle>Especificações fixas</CardTitle>
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
								<dt className="text-muted-foreground">Fabricante</dt>
								<dd>{row.manufacturerName ?? "—"}</dd>
							</div>
							<div className="flex justify-between">
								<dt className="text-muted-foreground">Potência</dt>
								<dd>{row.powerWatts == null ? "—" : `${row.powerWatts} W`}</dd>
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
					<CardTitle>Especificações técnicas dinâmicas</CardTitle>
					<CardDescription>
						Atributos definidos pela categoria principal.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{attributeValues.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							Nenhuma especificação cadastrada.
						</p>
					) : (
						<dl className="grid gap-2 text-sm md:grid-cols-2">
							{attributeValues.map((av) => (
								<div className="flex justify-between" key={av.slug}>
									<dt className="text-muted-foreground">{av.label}</dt>
									<dd>{formatAttributeValue(av)}</dd>
								</div>
							))}
						</dl>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Estoque por variante e filial</CardTitle>
					<CardDescription>
						Quantidade disponível por SKU em cada unidade.
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
									<TableHead>SKU</TableHead>
									<TableHead>Voltagem</TableHead>
									<TableHead>Filial</TableHead>
									<TableHead className="text-right">Quantidade</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{stockRows.map((s) => (
									<TableRow key={`${s.variantId}-${s.branchId}`}>
										<TableCell className="font-mono text-xs">
											{s.variantSku}
										</TableCell>
										<TableCell>{s.variantVoltage ?? "—"}</TableCell>
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

			<ToolReviewsSection summary={reviewsSummary} toolId={id} />
		</div>
	);
}
