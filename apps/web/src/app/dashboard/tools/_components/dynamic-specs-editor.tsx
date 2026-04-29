"use client";

import type { AttributeDefinition } from "@emach/db/schema/attributes";
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
import { Switch } from "@emach/ui/components/switch";

import type { AttributeValueInput } from "./tool-schema";

interface DynamicSpecsEditorProps {
	definitions: AttributeDefinition[];
	onChange: (slug: string, value: AttributeValueInput) => void;
	values: Record<string, AttributeValueInput>;
}

function resolveOptions(
	options: AttributeDefinition["options"]
): { value: string; label: string }[] {
	if (!options) {
		return [];
	}
	if ("options" in options) {
		return options.options;
	}
	if ("swatches" in options) {
		return options.swatches.map((s) => ({ value: s.value, label: s.label }));
	}
	return [];
}

function parseNumber(s: string): number | null {
	const cleaned = s.replace(",", ".").replace(/[^\d.-]/g, "");
	if (!cleaned) {
		return null;
	}
	const n = Number(cleaned);
	return Number.isNaN(n) ? null : n;
}

export function DynamicSpecsEditor({
	definitions,
	values,
	onChange,
}: DynamicSpecsEditorProps) {
	if (definitions.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">
				Nenhuma especificação dinâmica definida para a categoria principal
				selecionada. Cadastre atributos editando a categoria.
			</p>
		);
	}

	return (
		<div className="grid gap-4 md:grid-cols-2">
			{definitions.map((def) => {
				const v = values[def.slug] ?? {};
				const labelWithUnit = def.unit
					? `${def.label} (${def.unit})`
					: def.label;

				switch (def.inputType) {
					case "text":
						return (
							<div className="flex flex-col gap-2" key={def.id}>
								<Label htmlFor={`attr-${def.slug}`}>
									{labelWithUnit}
									{def.isRequired && (
										<span className="text-destructive"> *</span>
									)}
								</Label>
								<Input
									id={`attr-${def.slug}`}
									onChange={(e) =>
										onChange(def.slug, { ...v, valueText: e.target.value })
									}
									placeholder={`Informe ${def.label.toLowerCase()}`}
									value={v.valueText ?? ""}
								/>
							</div>
						);
					case "number":
						return (
							<div className="flex flex-col gap-2" key={def.id}>
								<Label htmlFor={`attr-${def.slug}`}>
									{labelWithUnit}
									{def.isRequired && (
										<span className="text-destructive"> *</span>
									)}
								</Label>
								<Input
									id={`attr-${def.slug}`}
									inputMode="decimal"
									onChange={(e) =>
										onChange(def.slug, {
											...v,
											valueNumeric: parseNumber(e.target.value),
										})
									}
									placeholder={def.unit ? `Ex: 0 ${def.unit}` : "Ex: 0"}
									value={v.valueNumeric ?? ""}
								/>
							</div>
						);
					case "boolean":
						return (
							<div
								className="flex items-center justify-between rounded-md border border-border p-3"
								key={def.id}
							>
								<Label htmlFor={`attr-${def.slug}`}>{def.label}</Label>
								<Switch
									checked={v.valueBool ?? false}
									id={`attr-${def.slug}`}
									onCheckedChange={(checked) =>
										onChange(def.slug, { ...v, valueBool: checked })
									}
								/>
							</div>
						);
					case "select":
					case "color": {
						const opts = resolveOptions(def.options);
						return (
							<div className="flex flex-col gap-2" key={def.id}>
								<Label htmlFor={`attr-${def.slug}`}>
									{labelWithUnit}
									{def.isRequired && (
										<span className="text-destructive"> *</span>
									)}
								</Label>
								<Select
									onValueChange={(val) =>
										onChange(def.slug, { ...v, valueText: val })
									}
									value={v.valueText ?? ""}
								>
									<SelectTrigger id={`attr-${def.slug}`}>
										<SelectValue placeholder="Selecione" />
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											{opts.map((o) => (
												<SelectItem key={o.value} value={o.value}>
													{o.label}
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
							</div>
						);
					}
					case "numeric_range":
						return (
							<div className="flex flex-col gap-2" key={def.id}>
								<Label>
									{labelWithUnit}
									{def.isRequired && (
										<span className="text-destructive"> *</span>
									)}
								</Label>
								<div className="grid grid-cols-2 gap-2">
									<Input
										inputMode="decimal"
										onChange={(e) =>
											onChange(def.slug, {
												...v,
												valueNumeric: parseNumber(e.target.value),
											})
										}
										placeholder="mínimo"
										value={v.valueNumeric ?? ""}
									/>
									<Input
										inputMode="decimal"
										onChange={(e) =>
											onChange(def.slug, {
												...v,
												valueNumericMax: parseNumber(e.target.value),
											})
										}
										placeholder="máximo"
										value={v.valueNumericMax ?? ""}
									/>
								</div>
							</div>
						);
					default:
						return null;
				}
			})}
		</div>
	);
}
