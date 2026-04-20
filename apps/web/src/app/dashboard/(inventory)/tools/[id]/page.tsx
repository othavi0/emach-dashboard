import { db } from "@emach/db";
import { branch, stockLevel } from "@emach/db/schema/inventory";
import {
	category,
	supplier,
	tool,
	toolImage,
} from "@emach/db/schema/tools";
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

interface PageProps {
	params: Promise<{ id: string }>;
}

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
			voltage: tool.voltage,
			price: tool.price,
			cost: tool.cost,
			visibleOnSite: tool.visibleOnSite,
			categoryName: category.name,
			supplierName: supplier.name,
		})
		.from(tool)
		.leftJoin(category, eq(category.id, tool.categoryId))
		.leftJoin(supplier, eq(supplier.id, tool.supplierId))
		.where(eq(tool.id, id))
		.limit(1);

	if (!row) {
		notFound();
	}

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
				{canMutate && (
					<Link
						className={buttonVariants({ variant: "secondary" })}
						href={`/dashboard/tools/${id}/edit`}
					>
						Editar
					</Link>
				)}
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
							Visível no site:{" "}
							<Badge variant={row.visibleOnSite ? "default" : "outline"}>
								{row.visibleOnSite ? "Sim" : "Não"}
							</Badge>
						</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-2 text-sm">
						<p>
							<strong>Categoria:</strong> {row.categoryName ?? "—"}
						</p>
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
