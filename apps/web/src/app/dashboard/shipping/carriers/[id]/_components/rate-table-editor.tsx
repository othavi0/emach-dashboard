"use client";

import { Button } from "@emach/ui/components/button";
import { Spinner } from "@emach/ui/components/spinner";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { FieldError } from "@/components/field-error";
import { MaskedInput } from "@/components/masked-input";
import { MoneyInput } from "@/components/money-input";
import { decimalMask } from "@/lib/masks";
import { notify } from "@/lib/notify";
import { useFormErrors } from "@/lib/use-form-errors";
import { type RateRow, ratesSchema } from "../../../_components/zone-schema";
import { saveZoneRates } from "../../../actions";

interface RateRowState {
	baseAmount: number;
	perKgAmount: number;
	weightFromKg: number;
	weightToKg: number | null; // null = ∞
}

interface InitialRate {
	baseAmount: string;
	id: string;
	perKgAmount: string;
	weightFromKg: string;
	weightToKg: string | null;
}

interface Props {
	canManage: boolean;
	carrierId: string;
	initialRates: InitialRate[];
	zoneId: string;
}

function toNum(v: string | null | undefined): number {
	if (v == null) {
		return 0;
	}
	const n = Number(v);
	return Number.isNaN(n) ? 0 : n;
}

function toNumOrNull(v: string | null | undefined): number | null {
	if (v == null) {
		return null;
	}
	const n = Number(v);
	return Number.isNaN(n) ? null : n;
}

export function RateTableEditor({
	carrierId,
	zoneId,
	initialRates,
	canManage,
}: Props) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const { errors, reportValidationError, clearErrors } =
		useFormErrors<Record<string, string>>();

	const [rows, setRows] = useState<RateRowState[]>(
		initialRates.map((r) => ({
			weightFromKg: toNum(r.weightFromKg),
			weightToKg: toNumOrNull(r.weightToKg),
			baseAmount: toNum(r.baseAmount),
			perKgAmount: toNum(r.perKgAmount),
		}))
	);

	function patchRow(idx: number, patch: Partial<RateRowState>) {
		setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
	}

	function addRow() {
		setRows((prev) => [
			...prev,
			{ weightFromKg: 0, weightToKg: null, baseAmount: 0, perKgAmount: 0 },
		]);
	}

	function removeRow(idx: number) {
		setRows((prev) => prev.filter((_, i) => i !== idx));
	}

	function handleSave() {
		const parsed = ratesSchema.safeParse(rows);
		if (!parsed.success) {
			reportValidationError(parsed.error);
			return;
		}
		startTransition(async () => {
			const result = await saveZoneRates(carrierId, zoneId, rows as RateRow[]);
			if (result.ok) {
				notify.success("Tabela de fretes salva");
				clearErrors();
				router.refresh();
			} else {
				notify.error(result.error ?? "Erro ao salvar tabela");
			}
		});
	}

	return (
		<div className="flex flex-col gap-3">
			<h4 className="font-medium text-sm">Tabela de faixas de peso</h4>

			{rows.length === 0 ? (
				<p className="text-muted-foreground text-sm">
					Nenhuma faixa configurada. Adicione uma faixa para calcular o frete.
				</p>
			) : (
				<div className="flex flex-col gap-2">
					<div className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 text-muted-foreground text-xs">
						<span>De (kg)</span>
						<span>Até (kg)</span>
						<span>Base (R$)</span>
						<span>R$/kg</span>
						<span />
					</div>
					{rows.map((row, idx) => (
						<div className="col-span-5 flex flex-col gap-1" key={idx}>
							<div className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] items-start gap-2">
								<MaskedInput
									disabled={!canManage || isPending}
									mask={decimalMask}
									onChange={(v) => patchRow(idx, { weightFromKg: v ?? 0 })}
									placeholder="0"
									value={row.weightFromKg}
								/>
								<MaskedInput
									disabled={!canManage || isPending}
									mask={decimalMask}
									onChange={(v) =>
										patchRow(idx, {
											weightToKg: v === undefined ? null : v,
										})
									}
									placeholder="∞"
									value={row.weightToKg ?? undefined}
								/>
								<MoneyInput
									disabled={!canManage || isPending}
									onChange={(v) => patchRow(idx, { baseAmount: v ?? 0 })}
									value={row.baseAmount}
								/>
								<MoneyInput
									disabled={!canManage || isPending}
									onChange={(v) => patchRow(idx, { perKgAmount: v ?? 0 })}
									value={row.perKgAmount}
								/>
								{canManage ? (
									<Button
										aria-label="Remover faixa"
										disabled={isPending}
										onClick={() => removeRow(idx)}
										size="icon"
										type="button"
										variant="ghost"
									>
										<Trash2 className="size-4" />
									</Button>
								) : (
									<span />
								)}
							</div>
							<FieldError>{errors[String(idx)]}</FieldError>
						</div>
					))}
				</div>
			)}

			<FieldError>{errors._form}</FieldError>

			{canManage && (
				<div className="flex items-center gap-2">
					<Button
						disabled={isPending}
						onClick={addRow}
						size="sm"
						type="button"
						variant="outline"
					>
						<Plus className="size-4" /> Adicionar faixa
					</Button>
					<Button
						disabled={isPending}
						onClick={handleSave}
						size="sm"
						type="button"
					>
						{isPending ? (
							<>
								<Spinner /> Salvando…
							</>
						) : (
							"Salvar tabela"
						)}
					</Button>
				</div>
			)}
		</div>
	);
}
