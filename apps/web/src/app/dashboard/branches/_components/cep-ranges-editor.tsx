"use client";

import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { MaskedInput } from "@/components/masked-input";
import { cepMask } from "@/lib/masks";

export type CepRangeValue = { from: string; to: string; label?: string };

interface Row {
	from: string;
	label: string;
	to: string;
	uiId: string;
}

interface Props {
	disabled?: boolean;
	onChange: (next: CepRangeValue[]) => void;
	value: CepRangeValue[];
}

const MAX_RANGES = 20;

function toRows(value: CepRangeValue[]): Row[] {
	return value.map((r) => ({
		uiId: crypto.randomUUID(),
		from: r.from,
		to: r.to,
		label: r.label ?? "",
	}));
}

function stripUi(rows: Row[]): CepRangeValue[] {
	return rows.map((r) => {
		const label = r.label.trim();
		return label
			? { from: r.from, to: r.to, label }
			: { from: r.from, to: r.to };
	});
}

export function CepRangesEditor({ value, onChange, disabled }: Props) {
	// Estado local mantém uiId estável por linha; sincroniza pro pai sem uiId.
	const [rows, setRows] = useState<Row[]>(() => toRows(value));

	function commit(next: Row[]) {
		setRows(next);
		onChange(stripUi(next));
	}

	function patchRow(uiId: string, patch: Partial<Omit<Row, "uiId">>) {
		commit(rows.map((r) => (r.uiId === uiId ? { ...r, ...patch } : r)));
	}

	function addRow() {
		if (rows.length >= MAX_RANGES) {
			return;
		}
		commit([
			...rows,
			{ uiId: crypto.randomUUID(), from: "", to: "", label: "" },
		]);
	}

	function removeRow(uiId: string) {
		commit(rows.filter((r) => r.uiId !== uiId));
	}

	return (
		<div className="flex flex-col gap-3">
			{rows.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					Nenhuma faixa configurada. A filial não será sugerida por CEP.
				</p>
			) : (
				<ul className="flex flex-col gap-3">
					{rows.map((row) => (
						<li
							className="flex flex-col gap-2 rounded-md border border-border p-3"
							key={row.uiId}
						>
							<div className="flex flex-col gap-1.5">
								<Label htmlFor={`cep-label-${row.uiId}`}>
									Rótulo (opcional)
								</Label>
								<Input
									disabled={disabled}
									id={`cep-label-${row.uiId}`}
									onChange={(e) =>
										patchRow(row.uiId, { label: e.target.value })
									}
									placeholder="Ex.: SP capital zona oeste"
									value={row.label}
								/>
							</div>
							<div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
								<div className="flex flex-col gap-1.5">
									<Label htmlFor={`cep-from-${row.uiId}`}>De</Label>
									<MaskedInput
										disabled={disabled}
										id={`cep-from-${row.uiId}`}
										mask={cepMask}
										onChange={(v) => patchRow(row.uiId, { from: v ?? "" })}
										value={row.from}
									/>
								</div>
								<div className="flex flex-col gap-1.5">
									<Label htmlFor={`cep-to-${row.uiId}`}>Até</Label>
									<MaskedInput
										disabled={disabled}
										id={`cep-to-${row.uiId}`}
										mask={cepMask}
										onChange={(v) => patchRow(row.uiId, { to: v ?? "" })}
										value={row.to}
									/>
								</div>
								<Button
									aria-label="Remover faixa"
									disabled={disabled}
									onClick={() => removeRow(row.uiId)}
									size="icon"
									type="button"
									variant="ghost"
								>
									<Trash2 className="size-4" />
								</Button>
							</div>
						</li>
					))}
				</ul>
			)}
			<Button
				className="self-start"
				disabled={disabled || rows.length >= MAX_RANGES}
				onClick={addRow}
				size="sm"
				type="button"
				variant="outline"
			>
				<Plus className="size-4" /> Adicionar faixa
			</Button>
		</div>
	);
}
