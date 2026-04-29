"use client";

import type {
	AttributeDefinition,
	AttributeOptions,
} from "@emach/db/schema/attributes";
import { Button } from "@emach/ui/components/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { Plus } from "lucide-react";
import { useState } from "react";

import type { AttributeFormValues } from "../_lib/attribute-schema";
import { AttributeSheet, type AttributeSheetMode } from "./attribute-sheet";
import {
	InheritedAttributesTable,
	type InheritedRow,
	OwnAttributesTable,
	type OwnRow,
} from "./attributes-table";

interface CategoryAttributesPanelProps {
	canCreate: boolean;
	canDelete: boolean;
	canUpdate: boolean;
	categoryId: string;
	categoryName: string;
	inheritedRows: InheritedRow[];
	ownRows: OwnRow[];
}

function defToFormValues(
	def: AttributeDefinition
): Partial<AttributeFormValues> {
	const opts = def.options as AttributeOptions | null;
	return {
		slug: def.slug,
		label: def.label,
		inputType: def.inputType,
		unit: def.unit ?? "",
		isRequired: def.isRequired,
		sortOrder: def.sortOrder,
		options: opts && opts.kind === "select" ? opts.options : [],
		swatches: opts && opts.kind === "color" ? opts.swatches : [],
	};
}

export function CategoryAttributesPanel({
	canCreate,
	canDelete,
	canUpdate,
	categoryId,
	categoryName,
	inheritedRows,
	ownRows,
}: CategoryAttributesPanelProps) {
	const [sheetMode, setSheetMode] = useState<AttributeSheetMode | null>(null);

	return (
		<>
			<Card>
				<CardHeader>
					<CardTitle>Atributos próprios</CardTitle>
					<CardDescription>
						Definidos nesta categoria. Aplicam-se a ela e a todas as
						descendentes.
					</CardDescription>
					{canCreate && (
						<CardAction>
							<Button
								onClick={() => setSheetMode({ kind: "create" })}
								size="sm"
								type="button"
							>
								<Plus /> Novo atributo
							</Button>
						</CardAction>
					)}
				</CardHeader>
				<CardContent>
					<OwnAttributesTable
						canDelete={canDelete}
						canUpdate={canUpdate}
						categoryId={categoryId}
						onEdit={(def) =>
							setSheetMode({
								kind: "edit",
								attributeId: def.id,
								defaultValues: defToFormValues(def),
							})
						}
						rows={ownRows}
					/>
				</CardContent>
			</Card>

			{inheritedRows.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle>Atributos herdados</CardTitle>
						<CardDescription>
							Vindos de categorias-pai. Edite na categoria de origem para
							alterar em todas as descendentes.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<InheritedAttributesTable rows={inheritedRows} />
					</CardContent>
				</Card>
			)}

			<AttributeSheet
				categoryId={categoryId}
				categoryName={categoryName}
				mode={sheetMode}
				onClose={() => setSheetMode(null)}
			/>
		</>
	);
}
