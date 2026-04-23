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
import { DeleteProductTypeDialog } from "../_components/delete-product-type-dialog";
import { getProductType } from "../actions";

interface ProductTypeDetailPageProps {
	params: Promise<{ id: string }>;
}

export default async function ProductTypeDetailPage({
	params,
}: ProductTypeDetailPageProps) {
	const session = await requireCurrentSession();
	const canMutate = (session.user.role ?? "user") === "admin";
	const { id } = await params;
	const productType = await getProductType(id);

	if (!productType) {
		notFound();
	}

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h1 className="font-serif text-2xl">{productType.name}</h1>
					<p className="text-muted-foreground text-sm">
						{productType.tools.length} ferramenta
						{productType.tools.length === 1 ? "" : "s"} vinculada
						{productType.tools.length === 1 ? "" : "s"}
					</p>
				</div>
				{canMutate && (
					<div className="flex gap-2">
						<Link
							className={buttonVariants({ variant: "secondary" })}
							href={`/dashboard/product-types/${productType.id}/edit`}
						>
							Editar
						</Link>
						<DeleteProductTypeDialog
							productTypeId={productType.id}
							productTypeName={productType.name}
						/>
					</div>
				)}
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Detalhes</CardTitle>
					<CardDescription>
						Slug: {productType.slug ? `/${productType.slug}` : "—"}
					</CardDescription>
				</CardHeader>
				<CardContent className="text-sm">
					{productType.description ? (
						<p>{productType.description}</p>
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
						Ferramentas do catálogo classificadas neste tipo.
					</CardDescription>
				</CardHeader>
				<CardContent>
					{productType.tools.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							Nenhuma ferramenta vinculada a este tipo.
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
								{productType.tools.map((t) => (
									<TableRow key={t.id}>
										<TableCell>
											<Link
												className="font-medium hover:underline"
												href={`/dashboard/tools/${t.id}`}
											>
												{t.name}
											</Link>
										</TableCell>
										<TableCell className="text-muted-foreground">
											{t.sku ?? "—"}
										</TableCell>
										<TableCell className="text-right">
											<Badge variant={t.visibleOnSite ? "default" : "outline"}>
												{t.visibleOnSite ? "Visível" : "Oculto"}
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
