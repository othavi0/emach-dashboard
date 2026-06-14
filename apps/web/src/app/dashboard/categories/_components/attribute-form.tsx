"use client";

import { Button } from "@emach/ui/components/button";
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
import { Spinner } from "@emach/ui/components/spinner";
import { Switch } from "@emach/ui/components/switch";
import { Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { FieldError } from "@/components/field-error";
import { HelpTooltip } from "@/components/help-tooltip";
import { LabeledField } from "@/components/labeled-field";
import { notify } from "@/lib/notify";
import { useFormErrors } from "@/lib/use-form-errors";

import {
	createCategoryAttribute,
	updateCategoryAttribute,
} from "../_lib/attribute-actions";
import {
	ATTRIBUTE_INPUT_TYPE_LABELS,
	ATTRIBUTE_INPUT_TYPES,
	type AttributeFormValues,
	attributeFormSchema,
	slugifyLabel,
} from "../_lib/attribute-schema";

interface AttributeFormProps {
	attributeId?: string;
	categoryId: string;
	defaultValues: Partial<AttributeFormValues>;
	mode: "create" | "edit";
	onSuccess: () => void;
}

const EMPTY: AttributeFormValues = {
	slug: "",
	label: "",
	inputType: "text",
	unit: "",
	isRequired: false,
	sortOrder: 0,
	options: [],
	swatches: [],
};

function renderSubmitLabel(isPending: boolean, mode: "create" | "edit") {
	if (isPending) {
		return (
			<>
				<Spinner /> Salvando…
			</>
		);
	}
	return mode === "create" ? "Criar atributo" : "Salvar alterações";
}

export function AttributeForm({
	mode,
	attributeId,
	categoryId,
	defaultValues,
	onSuccess,
}: AttributeFormProps) {
	const [isPending, startTransition] = useTransition();
	const [values, setValues] = useState<AttributeFormValues>({
		...EMPTY,
		...defaultValues,
		options: defaultValues.options ?? [],
		swatches: defaultValues.swatches ?? [],
	});
	const { errors, reportValidationError, clearErrors } =
		useFormErrors<AttributeFormValues>();

	function update<K extends keyof AttributeFormValues>(
		key: K,
		value: AttributeFormValues[K]
	) {
		setValues((prev) => ({ ...prev, [key]: value }));
	}

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const result = attributeFormSchema.safeParse(values);
		if (!result.success) {
			reportValidationError(result.error);
			return;
		}
		clearErrors();
		startTransition(async () => {
			const action =
				mode === "create"
					? await createCategoryAttribute(categoryId, result.data)
					: await updateCategoryAttribute(
							attributeId ?? "",
							categoryId,
							result.data
						);
			if (action.ok) {
				notify.success(
					mode === "create" ? "Atributo criado" : "Atributo atualizado"
				);
				onSuccess();
				return;
			}
			notify.error(action.error || "Falha ao salvar");
		});
	}

	const showOptions = values.inputType === "select";
	const showSwatches = values.inputType === "color";
	const showUnit =
		values.inputType === "number" || values.inputType === "numeric_range";

	return (
		<form className="flex flex-col gap-4" onSubmit={handleSubmit}>
			<LabeledField error={errors.label} id="label" label="Rótulo" required>
				{(field) => (
					<Input
						{...field}
						aria-required="true"
						onChange={(e) => {
							const v = e.target.value;
							update("label", v);
							if (mode === "create") {
								update("slug", slugifyLabel(v));
							}
						}}
						placeholder="RPM máximo"
						value={values.label}
					/>
				)}
			</LabeledField>

			<div className="grid gap-3 md:grid-cols-2">
				<LabeledField
					help={
						<HelpTooltip
							body="Texto e número são livres. Lista (select) exige opções; cor exige swatches; faixa numérica pede unidade."
							title="Tipo de campo"
						/>
					}
					id="inputType"
					label="Tipo de campo"
					required
				>
					{(field) => (
						<Select
							onValueChange={(v) =>
								update("inputType", v as AttributeFormValues["inputType"])
							}
							value={values.inputType}
						>
							<SelectTrigger {...field}>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{ATTRIBUTE_INPUT_TYPES.map((t) => (
										<SelectItem key={t} value={t}>
											{ATTRIBUTE_INPUT_TYPE_LABELS[t]}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					)}
				</LabeledField>
				<LabeledField id="sortOrder" label="Ordem">
					{(field) => (
						<Input
							{...field}
							onChange={(e) =>
								update("sortOrder", Number.parseInt(e.target.value, 10) || 0)
							}
							placeholder="0"
							type="number"
							value={values.sortOrder}
						/>
					)}
				</LabeledField>
			</div>

			{showUnit && (
				<LabeledField id="unit" label="Unidade">
					{(field) => (
						<Input
							{...field}
							onChange={(e) => update("unit", e.target.value)}
							placeholder="RPM, mm, kg, W"
							value={values.unit ?? ""}
						/>
					)}
				</LabeledField>
			)}

			<div className="flex items-center justify-between rounded-md border border-border bg-muted/30 p-3">
				<div className="flex flex-col gap-0.5">
					<Label className="text-xs" htmlFor="isRequired">
						Obrigatório
					</Label>
					<span className="text-muted-foreground text-xs">
						Forçar preenchimento ao cadastrar ferramenta.
					</span>
				</div>
				<Switch
					checked={values.isRequired}
					id="isRequired"
					onCheckedChange={(checked) => update("isRequired", checked)}
				/>
			</div>

			{showOptions && (
				<section className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3">
					<h3 className="flex items-center gap-1.5 font-semibold text-xs uppercase tracking-wide">
						Opções da lista
						<HelpTooltip text="Cada opção tem rótulo visível e um slug técnico (gerado do rótulo)." />
					</h3>
					{values.options.map((opt, index) => (
						<div className="grid grid-cols-[2fr_2fr_auto] gap-2" key={index}>
							<Input
								onChange={(e) => {
									const label = e.target.value;
									const next = [...values.options];
									next[index] = {
										...opt,
										label,
										value: mode === "create" ? slugifyLabel(label) : opt.value,
									};
									update("options", next);
								}}
								placeholder="Rótulo visível"
								value={opt.label}
							/>
							<Input
								disabled={mode === "create"}
								onChange={(e) => {
									const next = [...values.options];
									next[index] = { ...opt, value: e.target.value };
									update("options", next);
								}}
								placeholder="slug-da-opcao"
								value={opt.value}
							/>
							<Button
								onClick={() =>
									update(
										"options",
										values.options.filter((_, i) => i !== index)
									)
								}
								size="icon-sm"
								type="button"
								variant="ghost"
							>
								<Trash2 />
							</Button>
						</div>
					))}
					<Button
						onClick={() =>
							update("options", [...values.options, { value: "", label: "" }])
						}
						size="sm"
						type="button"
						variant="outline"
					>
						<Plus /> Adicionar opção
					</Button>
					<FieldError>{errors.options}</FieldError>
				</section>
			)}

			{showSwatches && (
				<section className="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3">
					<h3 className="font-semibold text-xs uppercase tracking-wide">
						Cores
					</h3>
					{values.swatches.map((sw, index) => (
						<div
							className="grid grid-cols-[1fr_2fr_2fr_auto] gap-2"
							key={index}
						>
							<Input
								onChange={(e) => {
									const next = [...values.swatches];
									next[index] = { ...sw, hex: e.target.value };
									update("swatches", next);
								}}
								placeholder="#1a1a1a"
								value={sw.hex}
							/>
							<Input
								onChange={(e) => {
									const label = e.target.value;
									const next = [...values.swatches];
									next[index] = {
										...sw,
										label,
										value: mode === "create" ? slugifyLabel(label) : sw.value,
									};
									update("swatches", next);
								}}
								placeholder="Rótulo"
								value={sw.label}
							/>
							<Input
								disabled={mode === "create"}
								onChange={(e) => {
									const next = [...values.swatches];
									next[index] = { ...sw, value: e.target.value };
									update("swatches", next);
								}}
								placeholder="slug-da-cor"
								value={sw.value}
							/>
							<Button
								onClick={() =>
									update(
										"swatches",
										values.swatches.filter((_, i) => i !== index)
									)
								}
								size="icon-sm"
								type="button"
								variant="ghost"
							>
								<Trash2 />
							</Button>
						</div>
					))}
					<Button
						onClick={() =>
							update("swatches", [
								...values.swatches,
								{ hex: "#000000", value: "", label: "" },
							])
						}
						size="sm"
						type="button"
						variant="outline"
					>
						<Plus /> Adicionar cor
					</Button>
					<FieldError>{errors.swatches}</FieldError>
				</section>
			)}

			<div className="mt-2 flex justify-end gap-2">
				<Button
					disabled={isPending}
					onClick={() => onSuccess()}
					type="button"
					variant="outline"
				>
					Cancelar
				</Button>
				<Button disabled={isPending} type="submit">
					{renderSubmitLabel(isPending, mode)}
				</Button>
			</div>
		</form>
	);
}
