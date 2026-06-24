"use client";

import { Button } from "@emach/ui/components/button";
import { Label } from "@emach/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@emach/ui/components/radio-group";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";
import { Plus, Trash2 } from "lucide-react";

import { MaskedInput } from "@/components/masked-input";
import { brlMask, skuMask } from "@/lib/masks";

import { type ToolVariantInput, VOLTAGE_OPTIONS } from "./tool-schema";

interface VariantsEditorProps {
	error?: string;
	onChange: (next: ToolVariantInput[]) => void;
	value: ToolVariantInput[];
}

const EMPTY_VARIANT: ToolVariantInput = {
	sku: "",
	barcode: "",
	voltage: "",
	priceAmount: 0,
	isDefault: false,
	sortOrder: 0,
};

function computeDuplicateSkus(variants: ToolVariantInput[]): Set<string> {
	const seen = new Map<string, number>();
	const dups = new Set<string>();
	for (const v of variants) {
		const key = v.sku.trim().toLowerCase();
		if (!key) {
			continue;
		}
		const count = (seen.get(key) ?? 0) + 1;
		seen.set(key, count);
		if (count > 1) {
			dups.add(key);
		}
	}
	return dups;
}

export function VariantsEditor({
	value,
	onChange,
	error,
}: VariantsEditorProps) {
	const duplicateSkus = computeDuplicateSkus(value);

	function update(index: number, patch: Partial<ToolVariantInput>) {
		const next = value.map((v, i) => (i === index ? { ...v, ...patch } : v));
		onChange(next);
	}

	function setDefault(index: number) {
		onChange(value.map((v, i) => ({ ...v, isDefault: i === index })));
	}

	function add() {
		const next: ToolVariantInput = {
			...EMPTY_VARIANT,
			sortOrder: value.length,
			isDefault: value.length === 0,
		};
		onChange([...value, next]);
	}

	function remove(index: number) {
		const next = value
			.filter((_, i) => i !== index)
			.map((v, i) => ({ ...v, sortOrder: i }));
		const first = next[0];
		if (first && !next.some((v) => v.isDefault)) {
			first.isDefault = true;
		}
		onChange(next);
	}

	return (
		<div className="flex flex-col gap-3">
			{value.length === 0 && (
				<p className="text-muted-foreground text-sm">
					Adicione ao menos uma variante. Ferramentas sem variação elétrica
					ficam com voltagem em branco.
				</p>
			)}
			{value.map((variant, index) => {
				const skuKey = variant.sku.trim().toLowerCase();
				const isSkuDuplicate = skuKey !== "" && duplicateSkus.has(skuKey);
				return (
					<div
						className="grid gap-3 rounded-md border border-border bg-card p-4 md:grid-cols-[2fr_1fr_1fr_auto]"
						key={index}
					>
						<div className="flex flex-col gap-2">
							<Label htmlFor={`var-sku-${index}`}>
								SKU
								<span className="text-destructive"> *</span>
							</Label>
							<MaskedInput
								aria-invalid={isSkuDuplicate || undefined}
								aria-required="true"
								id={`var-sku-${index}`}
								mask={skuMask}
								onChange={(v) => update(index, { sku: v ?? "" })}
								value={variant.sku}
							/>
							{isSkuDuplicate && (
								<p className="text-destructive text-xs">
									SKU duplicado entre variantes
								</p>
							)}
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor={`var-volt-${index}`}>Voltagem</Label>
							<Select
								onValueChange={(v) =>
									update(index, {
										voltage: v as (typeof VOLTAGE_OPTIONS)[number],
									})
								}
								value={variant.voltage ?? ""}
							>
								<SelectTrigger id={`var-volt-${index}`}>
									<SelectValue placeholder="—" />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										{VOLTAGE_OPTIONS.map((v) => (
											<SelectItem key={v} value={v}>
												{v}
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor={`var-price-${index}`}>
								Preço
								<span className="text-destructive"> *</span>
							</Label>
							<MaskedInput
								aria-required="true"
								id={`var-price-${index}`}
								mask={brlMask}
								onChange={(v) => update(index, { priceAmount: v ?? 0 })}
								value={variant.priceAmount}
							/>
						</div>
						<div className="flex items-end justify-end">
							<Button
								onClick={() => remove(index)}
								size="sm"
								type="button"
								variant="destructive"
							>
								<Trash2 className="size-4" />
							</Button>
						</div>
					</div>
				);
			})}
			{value.length > 0 && (
				<div className="flex flex-col gap-2 rounded-md border border-border p-3">
					<Label>
						Variante padrão
						<span className="text-destructive"> *</span>
					</Label>
					<RadioGroup
						onValueChange={(v) => setDefault(Number(v))}
						value={String(value.findIndex((v) => v.isDefault))}
					>
						{value.map((variant, index) => (
							<div className="flex items-center gap-2" key={index}>
								<RadioGroupItem
									id={`primary-var-${index}`}
									value={String(index)}
								/>
								<label
									className="cursor-pointer text-sm"
									htmlFor={`primary-var-${index}`}
								>
									{variant.sku || `Variante ${index + 1}`}
									{variant.voltage ? ` · ${variant.voltage}` : ""}
								</label>
							</div>
						))}
					</RadioGroup>
				</div>
			)}
			<Button onClick={add} size="sm" type="button" variant="outline">
				<Plus className="size-4" /> Adicionar variante
			</Button>
			{error && <p className="text-destructive text-xs">{error}</p>}
		</div>
	);
}
