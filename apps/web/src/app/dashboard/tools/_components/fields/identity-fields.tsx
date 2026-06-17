"use client";

import { Checkbox } from "@emach/ui/components/checkbox";
import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import { Textarea } from "@emach/ui/components/textarea";
import { Star } from "lucide-react";
import { useMemo } from "react";

import { FieldError } from "@/components/field-error";
import { HelpTooltip } from "@/components/help-tooltip";
import { LabeledField } from "@/components/labeled-field";
import {
	isCategoryComplete,
	MIN_CATEGORY_ATTRIBUTES,
} from "../../../categories/_lib/category-completeness";
import { useToolFormContext } from "../tool-form-context";
import { slugify } from "../tool-schema";
import type { ToolFieldGroupProps } from "./types";

export function IdentityFields({
	values,
	onPatch,
	errors,
	disabled,
}: ToolFieldGroupProps) {
	const { categories, definitionsByCategory, mode, existingSlug } =
		useToolFormContext();

	const effectiveAttrCount = (catId: string): number =>
		definitionsByCategory[catId]?.length ?? 0;
	const primaryIncomplete =
		values.primaryCategoryId !== "" &&
		!isCategoryComplete(effectiveAttrCount(values.primaryCategoryId));

	// Escolhe a principal preferindo categoria completa: mantém a atual se ainda
	// marcada e completa; senão a primeira completa marcada; senão a primeira
	// marcada (deixa o gate/aviso guiarem) ou vazio.
	function pickPrimary(ids: string[], current: string): string {
		if (
			current &&
			ids.includes(current) &&
			isCategoryComplete(effectiveAttrCount(current))
		) {
			return current;
		}
		return (
			ids.find((id) => isCategoryComplete(effectiveAttrCount(id))) ??
			ids[0] ??
			""
		);
	}

	const slugPreview = useMemo(() => {
		if (mode === "edit" && existingSlug) {
			return existingSlug;
		}
		return slugify(values.name) || "—";
	}, [mode, existingSlug, values.name]);

	function toggleCategory(catId: string, checked: boolean) {
		onPatch((prev) => {
			const next = checked
				? [...prev.categoryIds, catId]
				: prev.categoryIds.filter((c) => c !== catId);
			return {
				categoryIds: next,
				primaryCategoryId: pickPrimary(next, prev.primaryCategoryId),
			};
		});
	}

	return (
		<div className="flex flex-col gap-6">
			<LabeledField
				error={errors.name}
				hint={`Endereço público: /ferramentas/${slugPreview}`}
				id="name"
				label="Nome"
				required
			>
				{(field) => (
					<Input
						{...field}
						aria-required="true"
						disabled={disabled}
						onChange={(e) => onPatch({ name: e.target.value })}
						placeholder="Ex: Furadeira de impacto 700W"
						value={values.name}
					/>
				)}
			</LabeledField>

			<LabeledField
				help={
					<HelpTooltip
						body="Use **negrito**, listas com - e títulos. É renderizado na página pública da ferramenta."
						example="**Potente** e leve - 700W - Bivolt"
						title="Aceita Markdown"
					/>
				}
				id="description"
				label="Descrição"
			>
				{(field) => (
					<Textarea
						{...field}
						disabled={disabled}
						onChange={(e) => onPatch({ description: e.target.value })}
						placeholder="Especificações, destaques e uso recomendado. Aceita markdown."
						rows={4}
						value={values.description ?? ""}
					/>
				)}
			</LabeledField>

			<div className="flex flex-col gap-2">
				<Label className="flex items-center gap-1.5">
					Categorias <span className="text-destructive">*</span>
					<HelpTooltip text="Onde a ferramenta aparece na árvore do site. A categoria principal (★) define as especificações técnicas disponíveis." />
				</Label>
				<div className="flex flex-col gap-1 rounded border border-border p-3">
					{categories.map((cat) => {
						const checked = values.categoryIds.includes(cat.id);
						const isPrimary = values.primaryCategoryId === cat.id;
						const incomplete = !isCategoryComplete(effectiveAttrCount(cat.id));
						return (
							<div
								className="flex items-center justify-between gap-2"
								key={cat.id}
								style={{ paddingLeft: cat.depth * 16 }}
							>
								<div className="flex items-center gap-2">
									<Checkbox
										checked={checked}
										disabled={disabled}
										id={`cat-${cat.id}`}
										onCheckedChange={(v) => toggleCategory(cat.id, v === true)}
									/>
									<label
										className="cursor-pointer text-sm"
										htmlFor={`cat-${cat.id}`}
									>
										{cat.name}
									</label>
									{incomplete && (
										<span
											className="rounded border border-warning/40 px-1.5 py-0.5 text-[10px] text-warning"
											title={`Categoria incompleta: ${effectiveAttrCount(cat.id)} de ${MIN_CATEGORY_ATTRIBUTES} atributos. Não pode ser a categoria principal.`}
										>
											incompleta
										</span>
									)}
								</div>
								{checked &&
									(incomplete ? (
										<span className="text-muted-foreground/70 text-xs">
											não pode ser principal
										</span>
									) : (
										<button
											aria-label={
												isPrimary
													? `${cat.name} é a categoria principal`
													: `Tornar ${cat.name} principal`
											}
											aria-pressed={isPrimary}
											className={
												isPrimary
													? "inline-flex items-center gap-1 rounded px-2 py-0.5 text-primary text-xs"
													: "inline-flex items-center gap-1 rounded px-2 py-0.5 text-muted-foreground text-xs hover:text-foreground"
											}
											disabled={disabled}
											onClick={() => onPatch({ primaryCategoryId: cat.id })}
											type="button"
										>
											<Star
												aria-hidden
												className={
													isPrimary ? "size-3.5 fill-primary" : "size-3.5"
												}
											/>
											{isPrimary ? "Principal" : "Tornar principal"}
										</button>
									))}
							</div>
						);
					})}
				</div>
				<FieldError>{errors.categoryIds}</FieldError>
				<FieldError>{errors.primaryCategoryId}</FieldError>
				{primaryIncomplete && (
					<p className="text-warning text-xs" data-error="true">
						A categoria principal está incompleta (menos de{" "}
						{MIN_CATEGORY_ATTRIBUTES} atributos). Escolha uma categoria completa
						como principal ou adicione atributos a ela antes de salvar.
					</p>
				)}
			</div>
		</div>
	);
}
