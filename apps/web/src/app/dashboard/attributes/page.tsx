import { db } from "@emach/db";
import {
	attributeDefinition,
	toolAttributeValue,
} from "@emach/db/schema/attributes";
import { category } from "@emach/db/schema/categories";
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
import { asc, eq, sql } from "drizzle-orm";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { requireCapabilityOrRedirect } from "@/lib/permissions";
import { DeleteAttributeDialog } from "./_components/delete-attribute-dialog";
import { ATTRIBUTE_INPUT_TYPE_LABELS } from "./schema";

export default async function AttributesPage() {
	const session = await requireCapabilityOrRedirect("attributes.read");
	const role = session.user.role ?? "user";
	const canMutate = role === "admin" || role === "manager";

	const rows = await db
		.select({
			id: attributeDefinition.id,
			slug: attributeDefinition.slug,
			label: attributeDefinition.label,
			inputType: attributeDefinition.inputType,
			unit: attributeDefinition.unit,
			isRequired: attributeDefinition.isRequired,
			sortOrder: attributeDefinition.sortOrder,
			categoryName: category.name,
			usageCount: sql<number>`(
				SELECT COUNT(*)::int FROM ${toolAttributeValue}
				WHERE ${toolAttributeValue.attributeId} = ${attributeDefinition.id}
			)`,
		})
		.from(attributeDefinition)
		.leftJoin(category, eq(category.id, attributeDefinition.categoryId))
		.orderBy(
			asc(category.name),
			asc(attributeDefinition.sortOrder),
			asc(attributeDefinition.label)
		);

	return (
		<>
			<PageHeader
				action={
					canMutate ? (
						<Link
							className={buttonVariants({ variant: "default" })}
							href="/dashboard/attributes/new"
						>
							Novo atributo
						</Link>
					) : null
				}
				description="Catálogo de especificações técnicas dinâmicas usadas pelas ferramentas."
				title="Atributos"
			/>

			{rows.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					Nenhum atributo cadastrado.
				</p>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Rótulo</TableHead>
							<TableHead>Slug</TableHead>
							<TableHead>Categoria</TableHead>
							<TableHead>Tipo</TableHead>
							<TableHead>Unidade</TableHead>
							<TableHead>Obrigatório</TableHead>
							<TableHead className="text-right">Em uso</TableHead>
							{canMutate && (
								<TableHead className="w-48 text-right">Ações</TableHead>
							)}
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((r) => (
							<TableRow key={r.id}>
								<TableCell className="font-medium">{r.label}</TableCell>
								<TableCell className="font-mono text-xs">{r.slug}</TableCell>
								<TableCell>{r.categoryName ?? "Global"}</TableCell>
								<TableCell>
									{ATTRIBUTE_INPUT_TYPE_LABELS[r.inputType]}
								</TableCell>
								<TableCell>{r.unit ?? "—"}</TableCell>
								<TableCell>
									{r.isRequired ? (
										<Badge>Obrigatório</Badge>
									) : (
										<span className="text-muted-foreground">—</span>
									)}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{r.usageCount}
								</TableCell>
								{canMutate && (
									<TableCell className="text-right">
										<div className="flex justify-end gap-2">
											<Link
												className={buttonVariants({
													size: "sm",
													variant: "ghost",
												})}
												href={`/dashboard/attributes/${r.id}/edit`}
											>
												Editar
											</Link>
											<DeleteAttributeDialog
												attributeId={r.id}
												attributeLabel={r.label}
												usageCount={Number(r.usageCount ?? 0)}
											/>
										</div>
									</TableCell>
								)}
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
		</>
	);
}
