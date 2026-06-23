"use client";

import { Button } from "@emach/ui/components/button";
import { Plus, Trash2 } from "lucide-react";

import { MaskedInput } from "@/components/masked-input";
import { MoneyInput } from "@/components/money-input";
import { decimalMask } from "@/lib/masks";

import type { RateRowDraft } from "./carrier-schema";

const EMPTY_ROW: RateRowDraft = {
	weightFromKg: null,
	weightToKg: null,
	baseAmount: null,
	perKgAmount: 0,
};

interface Props {
	disabled?: boolean;
	onChange: (next: RateRowDraft[]) => void;
	value: RateRowDraft[];
}

export function RateRowsEditor({ value, onChange, disabled }: Props) {
	const patch = (index: number, next: Partial<RateRowDraft>) => {
		onChange(value.map((row, i) => (i === index ? { ...row, ...next } : row)));
	};
	const addRow = () => onChange([...value, { ...EMPTY_ROW }]);
	const removeRow = (index: number) =>
		onChange(value.filter((_, i) => i !== index));

	return (
		<div className="flex flex-col gap-2">
			<div className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 text-muted-foreground text-xs">
				<span>Peso de (kg)</span>
				<span>Peso até (kg)</span>
				<span>Base (R$)</span>
				<span>+ por kg (R$)</span>
				<span />
			</div>
			{value.map((row, index) => (
				// Inputs controlados sem id estável; index é a key (exceção do CLAUDE.md — NÃO usar biome-ignore noArrayIndexKey, vira warning suppressions/unused)
				<div
					className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] items-center gap-2"
					key={index}
				>
					<MaskedInput
						disabled={disabled}
						mask={decimalMask}
						onChange={(v) => patch(index, { weightFromKg: v ?? null })}
						placeholder="0"
						value={row.weightFromKg ?? undefined}
					/>
					<MaskedInput
						disabled={disabled}
						mask={decimalMask}
						onChange={(v) => patch(index, { weightToKg: v ?? null })}
						placeholder="∞"
						value={row.weightToKg ?? undefined}
					/>
					<MoneyInput
						disabled={disabled}
						onChange={(v) => patch(index, { baseAmount: v })}
						value={row.baseAmount}
					/>
					<MoneyInput
						disabled={disabled}
						onChange={(v) => patch(index, { perKgAmount: v ?? 0 })}
						value={row.perKgAmount}
					/>
					<Button
						disabled={disabled}
						onClick={() => removeRow(index)}
						size="icon"
						type="button"
						variant="ghost"
					>
						<Trash2 aria-hidden className="size-4" />
					</Button>
				</div>
			))}
			<Button
				disabled={disabled}
				onClick={addRow}
				size="sm"
				type="button"
				variant="outline"
			>
				<Plus aria-hidden className="mr-1.5 size-3.5" /> Faixa de peso
			</Button>
		</div>
	);
}
