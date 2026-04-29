"use client";

import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
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

import { type ToolVariantInput, VOLTAGE_OPTIONS } from "./tool-schema";

interface VariantsEditorProps {
	error?: string;
	onChange: (next: ToolVariantInput[]) => void;
	value: ToolVariantInput[];
}

const BRL_FORMATTER = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
});

function formatBRL(reais: number | undefined): string {
	if (reais === undefined || Number.isNaN(reais)) {
		return "";
	}
	return BRL_FORMATTER.format(reais);
}

function parseBRLToReais(display: string): number {
	const digits = display.replace(/\D/g, "");
	return digits ? Number(digits) / 100 : 0;
}

const EMPTY_VARIANT: ToolVariantInput = {
	sku: "",
	voltage: "",
	priceAmount: 0,
	costAmount: undefined,
	isDefault: false,
	sortOrder: 0,
};

export function VariantsEditor({
	value,
	onChange,
	error,
}: VariantsEditorProps) {
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
		if (next.length > 0 && !next.some((v) => v.isDefault)) {
			next[0].isDefault = true;
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
			{value.map((variant, index) => (
				<div
					className="grid gap-3 rounded-md border border-border bg-background p-4 md:grid-cols-[2fr_1fr_1fr_1fr_2fr_auto]"
					key={index}
				>
					<div className="flex flex-col gap-2">
						<Label htmlFor={`var-sku-${index}`}>
							SKU
							<span className="text-destructive"> *</span>
						</Label>
						<Input
							id={`var-sku-${index}`}
							onChange={(e) => update(index, { sku: e.target.value })}
							placeholder="FUR-700-127"
							value={variant.sku}
						/>
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
						<Input
							id={`var-price-${index}`}
							inputMode="numeric"
							onChange={(e) =>
								update(index, { priceAmount: parseBRLToReais(e.target.value) })
							}
							placeholder="R$ 0,00"
							value={formatBRL(variant.priceAmount)}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor={`var-cost-${index}`}>Custo</Label>
						<Input
							id={`var-cost-${index}`}
							inputMode="numeric"
							onChange={(e) =>
								update(index, {
									costAmount: parseBRLToReais(e.target.value) || undefined,
								})
							}
							placeholder="R$ 0,00"
							value={formatBRL(variant.costAmount)}
						/>
					</div>
					<div className="flex items-end justify-end">
						<Button
							onClick={() => remove(index)}
							size="sm"
							type="button"
							variant="ghost"
						>
							<Trash2 className="size-4" />
						</Button>
					</div>
				</div>
			))}
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
