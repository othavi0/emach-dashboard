"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";
import { useEffect, useState } from "react";

import { AffixInput } from "@/components/affix-input";
import {
	formatMoney,
	formatPercent,
	parseMoney,
	parsePercent,
	sanitizePercent,
} from "@/lib/discount-format";

type DiscountType = "percent" | "fixed";

interface DiscountInputProps {
	disabled?: boolean;
	discountType: DiscountType;
	discountValue: number;
	id?: string;
	onChange: (next: {
		discountType: DiscountType;
		discountValue: number;
	}) => void;
}

function formatFor(type: DiscountType, value: number): string {
	return type === "percent" ? formatPercent(value) : formatMoney(value);
}

export function DiscountInput({
	discountType,
	discountValue,
	disabled,
	id,
	onChange,
}: DiscountInputProps) {
	const [display, setDisplay] = useState(() =>
		formatFor(discountType, discountValue)
	);

	// Re-sincroniza o display ao trocar o tipo — corrige o bug do MaskedInput
	// (display preso da máscara antiga). Valor numérico é preservado.
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-sync só ao trocar de tipo
	useEffect(() => {
		setDisplay(formatFor(discountType, discountValue));
	}, [discountType]);

	function handleTypeChange(next: DiscountType) {
		onChange({ discountType: next, discountValue });
	}

	function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
		if (discountType === "percent") {
			const sanitized = sanitizePercent(e.target.value);
			setDisplay(sanitized);
			onChange({ discountType, discountValue: parsePercent(sanitized) });
		} else {
			const n = parseMoney(e.target.value);
			setDisplay(formatMoney(n));
			onChange({ discountType, discountValue: n });
		}
	}

	const prefix = (
		<Select
			disabled={disabled}
			onValueChange={(v) => handleTypeChange(v as DiscountType)}
			value={discountType}
		>
			<SelectTrigger
				aria-label="Tipo de desconto"
				className="h-8 w-auto gap-1 rounded-none border-0 bg-transparent px-2.5 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
			>
				<SelectValue />
			</SelectTrigger>
			<SelectContent align="start">
				<SelectItem value="percent">%</SelectItem>
				<SelectItem value="fixed">R$</SelectItem>
			</SelectContent>
		</Select>
	);

	return (
		<AffixInput
			disabled={disabled}
			id={id}
			inputMode="decimal"
			onChange={handleInput}
			placeholder={discountType === "percent" ? "Ex: 10" : "0,00"}
			prefix={prefix}
			value={display}
		/>
	);
}
