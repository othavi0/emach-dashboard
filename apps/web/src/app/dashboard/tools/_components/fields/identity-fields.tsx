"use client";

import { Checkbox } from "@emach/ui/components/checkbox";
import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";
import { Textarea } from "@emach/ui/components/textarea";
import { Star } from "lucide-react";
import { useMemo } from "react";

import { HelpTooltip } from "@/components/help-tooltip";
import { useToolFormContext } from "../tool-form-context";
import { slugify } from "../tool-schema";
import type { ToolFieldGroupProps } from "./types";

export function IdentityFields({
	values,
	onPatch,
	errors,
	disabled,
}: ToolFieldGroupProps) {
	const { categories, suppliers, mode, existingSlug } = useToolFormContext();

	const slugPreview = useMemo(() => {
		if (mode === "edit" && existingSlug) {
			return existingSlug;
		}
		return slugify(values.name) || "—";
	}, [mode, existingSlug, values.name]);

	function toggleCategory(catId: string, checked: boolean) {
		if (checked) {
			const next = [...values.categoryIds, catId];
			onPatch({
				categoryIds: next,
				primaryCategoryId: next.length === 1 ? catId : values.primaryCategoryId,
			});
		} else {
			const next = values.categoryIds.filter((c) => c !== catId);
			onPatch({
				categoryIds: next,
				primaryCategoryId:
					values.primaryCategoryId === catId
						? (next[0] ?? "")
						: values.primaryCategoryId,
			});
		}
	}

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-2">
				<Label htmlFor="name">
					Nome <span className="text-destructive">*</span>
				</Label>
				<Input
					aria-invalid={errors.name ? true : undefined}
					aria-required="true"
					disabled={disabled}
					id="name"
					onChange={(e) => onPatch({ name: e.target.value })}
					placeholder="Ex: Furadeira de impacto 700W"
					value={values.name}
				/>
				<p className="font-mono text-muted-foreground text-xs">
					Endereço público: /ferramentas/{slugPreview}
				</p>
				{errors.name && (
					<p className="text-destructive text-xs">{errors.name}</p>
				)}
			</div>

			<div className="flex flex-col gap-2">
				<Label className="flex items-center gap-1.5" htmlFor="description">
					Descrição
					<HelpTooltip
						body="Use **negrito**, listas com - e títulos. É renderizado na página pública da ferramenta."
						example="**Potente** e leve - 700W - Bivolt"
						title="Aceita Markdown"
					/>
				</Label>
				<Textarea
					disabled={disabled}
					id="description"
					onChange={(e) => onPatch({ description: e.target.value })}
					placeholder="Especificações, destaques e uso recomendado. Aceita markdown."
					rows={4}
					value={values.description ?? ""}
				/>
			</div>

			<div className="flex flex-col gap-2">
				<Label className="flex items-center gap-1.5">
					Categorias <span className="text-destructive">*</span>
					<HelpTooltip text="Onde a ferramenta aparece na árvore do site. A categoria principal (★) define as especificações técnicas disponíveis." />
				</Label>
				<div className="flex flex-col gap-1 rounded border border-border p-3">
					{categories.map((cat) => {
						const checked = values.categoryIds.includes(cat.id);
						const isPrimary = values.primaryCategoryId === cat.id;
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
								</div>
								{checked && (
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
								)}
							</div>
						);
					})}
				</div>
				{errors.categoryIds && (
					<p className="text-destructive text-xs">{errors.categoryIds}</p>
				)}
				{errors.primaryCategoryId && (
					<p className="text-destructive text-xs">{errors.primaryCategoryId}</p>
				)}
			</div>

			<div className="flex flex-col gap-2">
				<Label htmlFor="supplierId">Fornecedor</Label>
				<Select
					disabled={disabled}
					onValueChange={(v) => onPatch({ supplierId: v ?? "" })}
					value={values.supplierId ?? ""}
				>
					<SelectTrigger id="supplierId">
						<SelectValue placeholder="Opcional" />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							{suppliers.map((s) => (
								<SelectItem key={s.id} value={s.id}>
									{s.name}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
			</div>
		</div>
	);
}
