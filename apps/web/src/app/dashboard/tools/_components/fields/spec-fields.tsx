"use client";

import type { AttributeDefinition } from "@emach/db/schema/attributes";
import { useMemo } from "react";

import { AttributeAssignmentsEditor } from "../attribute-assignments-editor";
import { DynamicSpecsEditor } from "../dynamic-specs-editor";
import { useToolFormContext } from "../tool-form-context";
import {
	type AttributeValueInput,
	countFilledSpecs,
	MIN_SPECS_ACTIVE,
} from "../tool-schema";
import type { ToolFieldGroupProps } from "./types";

export function SpecFields({ values, onPatch }: ToolFieldGroupProps) {
	const { allDefinitions, definitionsByCategory } = useToolFormContext();

	const suggestedDefinitions = useMemo(
		() => definitionsByCategory[values.primaryCategoryId] ?? [],
		[definitionsByCategory, values.primaryCategoryId]
	);

	const definitionsBySlug = useMemo(
		() => new Map(allDefinitions.map((d) => [d.slug, d])),
		[allDefinitions]
	);

	const assignedDefinitions = useMemo(() => {
		const out: AttributeDefinition[] = [];
		for (const slug of values.attributeAssignments) {
			const def = definitionsBySlug.get(slug);
			if (def) {
				out.push(def);
			}
		}
		return out;
	}, [values.attributeAssignments, definitionsBySlug]);

	const filledSpecs = countFilledSpecs(
		values.attributeValues,
		values.attributeAssignments
	);

	function updateAssignments(next: string[]) {
		const nextSet = new Set(next);
		const trimmed: Record<string, AttributeValueInput> = {};
		for (const [k, v] of Object.entries(values.attributeValues)) {
			if (nextSet.has(k)) {
				trimmed[k] = v;
			}
		}
		onPatch({ attributeAssignments: next, attributeValues: trimmed });
	}

	function updateValue(slug: string, value: AttributeValueInput) {
		onPatch({ attributeValues: { ...values.attributeValues, [slug]: value } });
	}

	if (!values.primaryCategoryId) {
		return (
			<p className="text-muted-foreground text-sm">
				Selecione a categoria principal no passo 1 para liberar as
				especificações técnicas.
			</p>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between gap-2">
				<h3 className="font-medium text-sm">Atributos desta ferramenta</h3>
				<span
					className={
						filledSpecs >= MIN_SPECS_ACTIVE
							? "text-success text-xs"
							: "text-muted-foreground text-xs"
					}
				>
					{filledSpecs} de {MIN_SPECS_ACTIVE} preenchidas
				</span>
			</div>
			<AttributeAssignmentsEditor
				allDefinitions={allDefinitions}
				onChange={updateAssignments}
				suggested={suggestedDefinitions}
				value={values.attributeAssignments}
			/>
			{assignedDefinitions.length > 0 && (
				<div className="flex flex-col gap-2 border-border border-t pt-4">
					<h3 className="font-medium text-sm">Valores</h3>
					<DynamicSpecsEditor
						definitions={assignedDefinitions}
						onChange={updateValue}
						values={values.attributeValues}
					/>
				</div>
			)}
		</div>
	);
}
