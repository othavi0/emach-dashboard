import { db } from "@emach/db";
import {
	type AttributeDefinition,
	attributeDefinition,
} from "@emach/db/schema/attributes";
import { category } from "@emach/db/schema/categories";
import { Badge } from "@emach/ui/components/badge";
import { buttonVariants } from "@emach/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { eq, inArray } from "drizzle-orm";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { CategoryDetailActions } from "../_components/category-detail-actions";
import { ATTRIBUTE_INPUT_TYPE_LABELS } from "../_lib/attribute-schema";
import { getCategoryDetail, getCategoryProducts } from "../actions";

export const dynamic = "force-dynamic";

interface PageProps {
	params: Promise<{ id: string }>;
}

interface AttrView {
	def: AttributeDefinition;
	ownerName: string | null;
}

async function loadAttributes(categoryId: string): Promise<AttrView[]> {
	const [self] = await db
		.select({ id: category.id, parentId: category.parentId })
		.from(category)
		.where(eq(category.id, categoryId))
		.limit(1);
	if (!self) {
		return [];
	}

	const chain: { id: string; name: string }[] = [];
	let cursor: string | null = self.parentId;
	while (cursor) {
		const [row]: { id: string; name: string; parentId: string | null }[] =
			await db
				.select({
					id: category.id,
					name: category.name,
					parentId: category.parentId,
				})
				.from(category)
				.where(eq(category.id, cursor))
				.limit(1);
		if (!row) {
			break;
		}
		chain.push({ id: row.id, name: row.name });
		cursor = row.parentId;
	}
	const nameById = new Map(chain.map((c) => [c.id, c.name]));

	const ids = [categoryId, ...chain.map((c) => c.id)];
	const defs = await db
		.select()
		.from(attributeDefinition)
		.where(inArray(attributeDefinition.categoryId, ids));

	return defs
		.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
		.map((def) => ({
			def,
			ownerName:
				def.categoryId === categoryId
					? null
					: (nameById.get(def.categoryId) ?? "Origem"),
		}));
}

export default async function CategoryDetailPage({ params }: PageProps) {
	const { id } = await params;
	const [detail, products, attributes] = await Promise.all([
		getCategoryDetail(id),
		getCategoryProducts(id),
		loadAttributes(id),
	]);

	if (!detail) {
		notFound();
	}

	const {
		category: cat,
		parent,
		children,
		ownAttributeCount,
		productCount,
	} = detail;

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				action={
					<Link
						className={buttonVariants({ variant: "default" })}
						href={`/dashboard/categories/${cat.id}/edit`}
					>
						Editar
					</Link>
				}
				description={
					<>
						<code className="text-xs">{cat.path}</code>
						{parent ? ` · em ${parent.name}` : " · categoria raiz"}
					</>
				}
				title={cat.name}
			/>

			<div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(22rem,0.95fr)]">
				<div className="flex flex-col gap-4">
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-3">
								Sobre
								<Badge variant={cat.isActive ? "success" : "outline"}>
									{cat.isActive ? "Ativa" : "Inativa"}
								</Badge>
							</CardTitle>
						</CardHeader>
						<CardContent>
							<p className="text-muted-foreground text-sm">
								{cat.description ?? "Sem descrição."}
							</p>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Atributos técnicos</CardTitle>
							<CardDescription>
								Próprios desta categoria e herdados dos pais. Edite-os na aba de
								edição.
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-1">
							{attributes.length === 0 ? (
								<p className="text-muted-foreground text-xs">
									Nenhum atributo aplicável.
								</p>
							) : (
								attributes.map(({ def, ownerName }) => (
									<div
										className="flex items-center justify-between border-border border-b py-2 last:border-b-0"
										key={def.id}
									>
										<span className="text-sm">
											<span className="font-medium">{def.label}</span>{" "}
											<span className="text-muted-foreground text-xs">
												· {ATTRIBUTE_INPUT_TYPE_LABELS[def.inputType]}
												{def.unit ? ` · ${def.unit}` : ""}
											</span>
										</span>
										{ownerName ? (
											<Badge variant="secondary">↑ {ownerName}</Badge>
										) : (
											<Badge variant="default">Próprio</Badge>
										)}
									</div>
								))
							)}
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Produtos · {productCount}</CardTitle>
							<CardDescription>
								Ferramentas com esta categoria como primária.
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col gap-1">
							{products.length === 0 ? (
								<p className="text-muted-foreground text-xs">
									Nenhum produto nesta categoria.
								</p>
							) : (
								products.map((p) => (
									<div
										className="flex items-center justify-between border-border border-b py-2 last:border-b-0"
										key={p.id}
									>
										<span className="font-medium text-sm">{p.name}</span>
										<span className="font-mono text-muted-foreground text-xs">
											{p.sku ?? "—"}
										</span>
									</div>
								))
							)}
							{productCount > products.length && (
								<Link
									className="pt-2 text-primary text-xs hover:underline"
									href={`/dashboard/tools?category=${cat.id}`}
								>
									Ver todos os {productCount} produtos →
								</Link>
							)}
						</CardContent>
					</Card>
				</div>

				<div className="flex flex-col gap-4">
					<Card>
						<CardHeader>
							<CardTitle>Ações</CardTitle>
						</CardHeader>
						<CardContent className="flex flex-col gap-2">
							<Link
								className={buttonVariants({
									variant: "default",
									className: "w-full",
								})}
								href={`/dashboard/categories/${cat.id}/edit`}
							>
								Editar categoria
							</Link>
							<Link
								className={buttonVariants({
									variant: "outline",
									className: "w-full",
								})}
								href={`/dashboard/categories/new?parent=${cat.id}`}
							>
								Nova subcategoria
							</Link>
							<CategoryDetailActions
								categoryId={cat.id}
								categoryName={cat.name}
								isActive={cat.isActive}
							/>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Resumo</CardTitle>
						</CardHeader>
						<CardContent className="grid grid-cols-2 gap-2">
							<Stat label="Produtos" value={String(productCount)} />
							<Stat label="Subcategorias" value={String(children.length)} />
							<Stat
								label="Atributos próprios"
								value={String(ownAttributeCount)}
							/>
							<Stat label="Profundidade" value={`Nível ${cat.depth}`} />
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Hierarquia</CardTitle>
						</CardHeader>
						<CardContent className="flex flex-col gap-1">
							{parent && (
								<Link
									className="flex items-center gap-2 border-border border-b py-2 text-sm hover:underline"
									href={`/dashboard/categories/${parent.id}`}
								>
									<ArrowUpRight
										aria-hidden
										className="size-3.5 text-muted-foreground"
									/>
									<span className="text-primary">{parent.name}</span>
									<span className="ml-auto text-muted-foreground text-xs">
										pai
									</span>
								</Link>
							)}
							{children.length === 0 ? (
								<p className="py-2 text-muted-foreground text-xs">
									Sem subcategorias.
								</p>
							) : (
								children.map((c) => (
									<Link
										className="flex items-center justify-between border-border border-b py-2 text-sm last:border-b-0 hover:underline"
										href={`/dashboard/categories/${c.id}`}
										key={c.id}
									>
										<span>{c.name}</span>
										<span className="text-muted-foreground text-xs">
											{c.productCount}
										</span>
									</Link>
								))
							)}
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-md border border-border bg-background p-3 text-center">
			<p className="font-medium text-primary text-xl tabular-nums">{value}</p>
			<p className="text-muted-foreground text-xs uppercase tracking-wide">
				{label}
			</p>
		</div>
	);
}
