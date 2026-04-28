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
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";
import { eq, isNull, or } from "drizzle-orm";
import Link from "next/link";

import { ATTRIBUTE_INPUT_TYPE_LABELS } from "../../attributes/schema";

interface CategoryAttributesPanelProps {
	categoryId: string;
}

interface PanelRow {
	def: AttributeDefinition;
	source: "self" | "inherited" | "global";
	sourceLabel: string;
}

async function loadPanelRows(categoryId: string): Promise<PanelRow[]> {
	const [self] = await db
		.select({ id: category.id, parentId: category.parentId })
		.from(category)
		.where(eq(category.id, categoryId))
		.limit(1);
	if (!self) {
		return [];
	}

	const ancestors: { id: string; name: string }[] = [];
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
		ancestors.push({ id: row.id, name: row.name });
		cursor = row.parentId;
	}

	const ancestorIds = ancestors.map((a) => a.id);
	const ancestorNameById = new Map(ancestors.map((a) => [a.id, a.name]));

	const definitions = await db
		.select()
		.from(attributeDefinition)
		.where(
			ancestorIds.length > 0
				? or(
						eq(attributeDefinition.categoryId, categoryId),
						isNull(attributeDefinition.categoryId),
						...ancestorIds.map((id) => eq(attributeDefinition.categoryId, id))
					)
				: or(
						eq(attributeDefinition.categoryId, categoryId),
						isNull(attributeDefinition.categoryId)
					)
		);

	return definitions
		.map<PanelRow>((def) => {
			if (def.categoryId === categoryId) {
				return { def, source: "self", sourceLabel: "Própria" };
			}
			if (def.categoryId === null) {
				return { def, source: "global", sourceLabel: "Global" };
			}
			return {
				def,
				source: "inherited",
				sourceLabel: `Herdada de ${ancestorNameById.get(def.categoryId) ?? "ancestral"}`,
			};
		})
		.sort((a, b) => {
			const order = { self: 0, inherited: 1, global: 2 } as const;
			return (
				order[a.source] - order[b.source] ||
				a.def.sortOrder - b.def.sortOrder ||
				a.def.label.localeCompare(b.def.label)
			);
		});
}

export async function CategoryAttributesPanel({
	categoryId,
}: CategoryAttributesPanelProps) {
	const rows = await loadPanelRows(categoryId);

	return (
		<Card>
			<CardHeader className="flex flex-row items-start justify-between gap-3">
				<div className="flex flex-col gap-1">
					<CardTitle>Atributos desta categoria</CardTitle>
					<CardDescription>
						Especificações técnicas que aparecem no formulário de ferramentas
						classificadas aqui. Inclui herdadas de ancestrais e globais.
					</CardDescription>
				</div>
				<Link
					className={buttonVariants({ size: "sm" })}
					href={`/dashboard/attributes/new?categoryId=${categoryId}`}
				>
					Novo atributo
				</Link>
			</CardHeader>
			<CardContent>
				{rows.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						Nenhum atributo aplicado a esta categoria. Clique em "Novo atributo"
						para adicionar.
					</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Rótulo</TableHead>
								<TableHead>Tipo</TableHead>
								<TableHead>Unidade</TableHead>
								<TableHead>Origem</TableHead>
								<TableHead>Obrigatório</TableHead>
								<TableHead className="w-24 text-right">Ações</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((row) => (
								<TableRow key={row.def.id}>
									<TableCell className="font-medium">
										{row.def.label}
										<p className="font-mono text-muted-foreground text-xs">
											{row.def.slug}
										</p>
									</TableCell>
									<TableCell>
										{ATTRIBUTE_INPUT_TYPE_LABELS[row.def.inputType]}
									</TableCell>
									<TableCell>{row.def.unit ?? "—"}</TableCell>
									<TableCell>
										<Badge
											variant={
												row.source === "self"
													? "default"
													: row.source === "inherited"
														? "secondary"
														: "outline"
											}
										>
											{row.sourceLabel}
										</Badge>
									</TableCell>
									<TableCell>
										{row.def.isRequired ? (
											<Badge>Obrigatório</Badge>
										) : (
											<span className="text-muted-foreground">—</span>
										)}
									</TableCell>
									<TableCell className="text-right">
										<Link
											className={buttonVariants({
												size: "sm",
												variant: "ghost",
											})}
											href={`/dashboard/attributes/${row.def.id}/edit`}
										>
											Editar
										</Link>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</CardContent>
		</Card>
	);
}
