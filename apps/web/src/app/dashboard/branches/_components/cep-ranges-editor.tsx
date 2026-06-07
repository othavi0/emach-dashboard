"use client";

import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";
import { Plus, Trash2 } from "lucide-react";

import { MaskedInput } from "@/components/masked-input";
import { cepMask } from "@/lib/masks";
import { BRASIL_PRESET, UF_CEP_PRESETS } from "./cep-presets";

export interface CepRangeValue {
	from: string;
	label?: string;
	to: string;
}

interface Props {
	disabled?: boolean;
	onChange: (next: CepRangeValue[]) => void;
	value: CepRangeValue[];
}

const MAX_RANGES = 20;

/** Mantém o label digitado, mas omite a chave quando vazio (não persiste ""). */
function normalize(rows: CepRangeValue[]): CepRangeValue[] {
	return rows.map((r) => {
		const hasLabel = Boolean(r.label && r.label.trim() !== "");
		return hasLabel
			? { from: r.from, to: r.to, label: r.label }
			: { from: r.from, to: r.to };
	});
}

export function CepRangesEditor({ value, onChange, disabled }: Props) {
	function patchRow(idx: number, patch: Partial<CepRangeValue>) {
		onChange(
			normalize(value.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
		);
	}

	function addRow() {
		if (value.length >= MAX_RANGES) {
			return;
		}
		onChange([...value, { from: "", to: "" }]);
	}

	function addBrasil() {
		if (value.length >= MAX_RANGES) {
			return;
		}
		onChange([
			...value,
			{
				from: BRASIL_PRESET.from,
				to: BRASIL_PRESET.to,
				label: BRASIL_PRESET.label,
			},
		]);
	}

	function addUf(uf: string | null) {
		const preset = UF_CEP_PRESETS.find((p) => p.uf === uf);
		if (!preset) {
			return;
		}
		const additions = preset.ranges
			.slice(0, MAX_RANGES - value.length)
			.map((r) => ({ from: r.from, to: r.to, label: preset.name }));
		if (additions.length === 0) {
			return;
		}
		onChange([...value, ...additions]);
	}

	function removeRow(idx: number) {
		onChange(value.filter((_, i) => i !== idx));
	}

	function renderRow(row: CepRangeValue, idx: number) {
		return (
			<li
				className="flex flex-col gap-2 rounded-md border border-border p-3"
				key={`cep-${idx}-${row.from}`}
			>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor={`cep-label-${idx}`}>Rótulo (opcional)</Label>
					<Input
						disabled={disabled}
						id={`cep-label-${idx}`}
						onChange={(e) => patchRow(idx, { label: e.target.value })}
						placeholder="Ex.: SP capital zona oeste"
						value={row.label ?? ""}
					/>
				</div>
				<div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
					<div className="flex flex-col gap-1.5">
						<Label htmlFor={`cep-from-${idx}`}>De</Label>
						<MaskedInput
							disabled={disabled}
							id={`cep-from-${idx}`}
							mask={cepMask}
							onChange={(v) => patchRow(idx, { from: v ?? "" })}
							value={row.from}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor={`cep-to-${idx}`}>Até</Label>
						<MaskedInput
							disabled={disabled}
							id={`cep-to-${idx}`}
							mask={cepMask}
							onChange={(v) => patchRow(idx, { to: v ?? "" })}
							value={row.to}
						/>
					</div>
					<Button
						aria-label="Remover faixa"
						disabled={disabled}
						onClick={() => removeRow(idx)}
						size="icon"
						type="button"
						variant="ghost"
					>
						<Trash2 className="size-4" />
					</Button>
				</div>
			</li>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			{value.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					Nenhuma faixa configurada. A filial não será sugerida por CEP.
				</p>
			) : (
				<ul className="flex flex-col gap-3">{value.map(renderRow)}</ul>
			)}
			<div className="flex flex-wrap items-center gap-2">
				<Button
					disabled={disabled || value.length >= MAX_RANGES}
					onClick={addRow}
					size="sm"
					type="button"
					variant="outline"
				>
					<Plus className="size-4" /> Adicionar faixa
				</Button>
				<Button
					disabled={disabled || value.length >= MAX_RANGES}
					onClick={addBrasil}
					size="sm"
					type="button"
					variant="outline"
				>
					Brasil todo
				</Button>
				<Select
					disabled={disabled || value.length >= MAX_RANGES}
					onValueChange={addUf}
					value=""
				>
					<SelectTrigger className="h-8 w-[200px]" size="sm">
						<SelectValue placeholder="Adicionar estado…" />
					</SelectTrigger>
					<SelectContent>
						{UF_CEP_PRESETS.map((preset) => (
							<SelectItem key={preset.uf} value={preset.uf}>
								{preset.uf} — {preset.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
		</div>
	);
}
