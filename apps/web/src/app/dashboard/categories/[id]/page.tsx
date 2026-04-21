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
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireCurrentSession } from "@/lib/session";
import { DeleteCategoryDialog } from "../_components/delete-category-dialog";
import { getCategory } from "../actions";

interface CategoryDetailPageProps {
	params: Promise<{ id: string }>;
}

export default async function CategoryDetailPage({
	params,
}: CategoryDetailPageProps) {
	const session = await requireCurrentSession();
	const canMutate = (session.user.role ?? "user") === "admin";
	const { id } = await params;
	const category = await getCategory(id);

	if (!category) {
		notFound();
	}

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h1 className="font-serif text-2xl">{category.name}</h1>
					<p className="text-muted-foreground text-sm">
						{category.tools.length} ferramenta
						{category.tools.length === 1 ? "" : "s"} vinculada
						{category.tools.length === 1 ? "" : "s"}
					</p>
				</div>
				{canMutate && (
					<div className="flex gap-2">
						<Link
							className={buttonVariants({ variant: "secondary" })}
							href={`/dashboard/categories/${category.id}/edit`}
						>
							Editar
						</Link>
						<DeleteCategoryDialog
							categoryId={category.id}
							categoryName={category.name}
						/>
					</div>
				)}
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Detalhes</CardTitle>
					<CardDescription>
						Slug: {category.slug ? `/${category.slug}` : "—"}
					</CardDescription>
				</CardHeader>
				<CardContent className="text-sm">
					{category.description ? (
						<p>{category.description}</p>
					) : (
						<p className="text-muted-foreground">
							Nenhuma descrição cadastrada.
						</p>
					)}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Ferramentas vinculadas</CardTitle>
					<CardDescription>
						Ferramentas do catálogo classificadas nesta categoria.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{category.tools.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							Nenhuma ferramenta vinculada a esta categoria.
						</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Ferramenta</TableHead>
									<TableHead>SKU</TableHead>
									<TableHead className="text-right">Visibilidade</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{category.tools.map((tool) => (
									<TableRow key={tool.id}>
										<TableCell>
											<Link
												className="font-medium hover:underline"
												href={`/dashboard/tools/${tool.id}`}
											>
												{tool.name}
											</Link>
										</TableCell>
										<TableCell className="text-muted-foreground">
											{tool.sku ?? "—"}
										</TableCell>
										<TableCell className="text-right">
											<Badge variant={tool.visibleOnSite ? "default" : "outline"}>
												{tool.visibleOnSite ? "Visível" : "Oculto"}
											</Badge>
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
