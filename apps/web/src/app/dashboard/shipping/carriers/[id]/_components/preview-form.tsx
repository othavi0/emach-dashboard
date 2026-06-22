"use client";

import type { QuoteItem, QuoteResult } from "@emach/db/queries/shipping-quote";
import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import { Spinner } from "@emach/ui/components/spinner";
import { CheckCircle2, PackageX } from "lucide-react";
import { useState, useTransition } from "react";
import { LabeledField } from "@/components/labeled-field";
import { MaskedInput } from "@/components/masked-input";
import { MoneyInput } from "@/components/money-input";
import { formatMoney } from "@/lib/discount-format";
import { cepMask } from "@/lib/masks";
import { notify } from "@/lib/notify";
import type { ToolForQuote } from "../../../data";
import { previewQuote } from "../../../preview-action";

interface SelectedItem {
	qty: number;
	toolId: string;
}

interface Props {
	carrierId: string;
	tools: ToolForQuote[];
}

const UNQUOTABLE_REASON: Record<string, string> = {
	no_zone: "Sem zona para o CEP",
	no_rate: "Sem faixa de peso",
	out_of_catalog: "Fora do catálogo de caixas — a combinar",
};

export function PreviewForm({ carrierId, tools }: Props) {
	const [cep, setCep] = useState<string | undefined>(undefined);
	const [declaredValue, setDeclaredValue] = useState<number | null>(null);
	const [selected, setSelected] = useState<SelectedItem[]>([]);
	const [result, setResult] = useState<QuoteResult | null>(null);
	const [isPending, startTransition] = useTransition();

	function updateQty(toolId: string, qty: number) {
		if (qty <= 0) {
			setSelected((prev) => prev.filter((s) => s.toolId !== toolId));
		} else {
			setSelected((prev) => {
				const existing = prev.find((s) => s.toolId === toolId);
				if (existing) {
					return prev.map((s) => (s.toolId === toolId ? { ...s, qty } : s));
				}
				return [...prev, { toolId, qty }];
			});
		}
	}

	function getQty(toolId: string): number {
		return selected.find((s) => s.toolId === toolId)?.qty ?? 0;
	}

	function buildItems(): QuoteItem[] {
		return selected
			.filter((s) => s.qty > 0)
			.map((s) => {
				const t = tools.find((tool) => tool.id === s.toolId);
				if (!t) {
					throw new Error(`Tool ${s.toolId} not found`);
				}
				return {
					qty: s.qty,
					weightKg: Number(t.weightKg),
					lengthCm: Number(t.lengthCm),
					widthCm: Number(t.widthCm),
					heightCm: Number(t.heightCm),
					packagingWeightKg: Number(t.packagingWeightKg),
					stackable: t.stackable,
					shipsInOwnBox: t.shipsInOwnBox,
				};
			});
	}

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		const normalizedCep = cep?.replace(/\D/g, "") ?? "";
		if (normalizedCep.length !== 8) {
			notify.error("CEP deve ter 8 dígitos");
			return;
		}
		if (selected.length === 0) {
			notify.error("Selecione ao menos um produto");
			return;
		}
		let items: QuoteItem[];
		try {
			items = buildItems();
		} catch {
			notify.error("Erro ao montar itens");
			return;
		}
		startTransition(async () => {
			const res = await previewQuote({
				destinationCep: normalizedCep,
				declaredValue: declaredValue ?? 0,
				items,
			});
			if (!res.ok) {
				notify.error(res.error ?? "Erro ao cotar");
				return;
			}
			setResult(res.data);
		});
	}

	const thisCarrierOption = result?.options.find(
		(o) => o.carrierId === carrierId
	);
	const thisCarrierUnquotable = result?.unquotable.find(
		(u) => u.carrierId === carrierId
	);

	let carrierHighlight: React.ReactNode = null;
	if (thisCarrierOption) {
		carrierHighlight = (
			<div className="flex items-center gap-3 rounded-lg border-2 border-primary bg-primary/5 p-4">
				<CheckCircle2 className="size-5 shrink-0 text-primary" />
				<div className="flex-1">
					<p className="font-medium text-sm">{thisCarrierOption.carrierName}</p>
					{thisCarrierOption.deliveryDays ? (
						<p className="text-muted-foreground text-xs">
							{thisCarrierOption.deliveryDays} dias úteis
						</p>
					) : null}
				</div>
				<span className="font-semibold text-primary">
					R$ {formatMoney(thisCarrierOption.amount)}
				</span>
			</div>
		);
	} else if (thisCarrierUnquotable) {
		carrierHighlight = (
			<div className="flex items-center gap-3 rounded-lg border-2 border-destructive/40 bg-destructive/5 p-4">
				<PackageX className="size-5 shrink-0 text-destructive" />
				<div className="flex-1">
					<p className="font-medium text-sm">
						{thisCarrierUnquotable.carrierName}
					</p>
					<p className="text-muted-foreground text-xs">
						{UNQUOTABLE_REASON[thisCarrierUnquotable.reason] ??
							thisCarrierUnquotable.reason}
					</p>
				</div>
				<span className="font-medium text-destructive text-sm">A combinar</span>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-6">
			<form className="rounded-lg border bg-card p-4" onSubmit={handleSubmit}>
				<div className="mb-4 grid gap-4 sm:grid-cols-2">
					<LabeledField id="preview-cep" label="CEP de destino" required>
						{(field) => (
							<MaskedInput
								{...field}
								mask={cepMask}
								onChange={setCep}
								value={cep}
							/>
						)}
					</LabeledField>

					<LabeledField id="preview-declared-value" label="Valor declarado">
						{(field) => (
							<MoneyInput
								{...field}
								onChange={setDeclaredValue}
								value={declaredValue}
							/>
						)}
					</LabeledField>
				</div>

				<div className="mb-4">
					<p className="mb-2 font-medium text-sm">Produtos</p>
					<div className="flex flex-col gap-2">
						{tools.map((t) => (
							<div
								className="flex items-center justify-between gap-3 rounded border px-3 py-2"
								key={t.id}
							>
								<span className="flex-1 truncate text-sm">{t.name}</span>
								<Input
									className="w-20 text-center"
									inputMode="numeric"
									min={0}
									onChange={(e) => {
										const v = Number.parseInt(e.target.value, 10);
										updateQty(t.id, Number.isNaN(v) ? 0 : v);
									}}
									placeholder="0"
									type="number"
									value={getQty(t.id) === 0 ? "" : getQty(t.id)}
								/>
							</div>
						))}
					</div>
				</div>

				<Button disabled={isPending} type="submit">
					{isPending ? <Spinner className="mr-2 size-4" /> : null}
					Cotar
				</Button>
			</form>

			{result ? (
				<div className="flex flex-col gap-4">
					{/* Resultado da transportadora desta página em destaque */}
					{carrierHighlight}

					{/* Todas as opções */}
					{result.options.length > 0 ? (
						<div className="rounded-lg border bg-card">
							<p className="border-b px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">
								Todas as opções
							</p>
							<div className="divide-y">
								{result.options.map((opt) => (
									<div
										className={`flex items-center justify-between px-4 py-3 ${opt.carrierId === carrierId ? "bg-primary/5" : ""}`}
										key={opt.carrierId}
									>
										<div>
											<p className="font-medium text-sm">{opt.carrierName}</p>
											{opt.deliveryDays ? (
												<p className="text-muted-foreground text-xs">
													{opt.deliveryDays} dias úteis
												</p>
											) : null}
										</div>
										<span className="font-semibold text-sm">
											R$ {formatMoney(opt.amount)}
										</span>
									</div>
								))}
							</div>
						</div>
					) : null}

					{/* Transportadoras sem cotação */}
					{result.unquotable.length > 0 ? (
						<div className="rounded-lg border bg-card">
							<p className="border-b px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">
								Sem cotação
							</p>
							<div className="divide-y">
								{result.unquotable.map((u) => (
									<div
										className={`flex items-center justify-between px-4 py-3 ${u.carrierId === carrierId ? "bg-destructive/5" : ""}`}
										key={u.carrierId}
									>
										<div>
											<p className="font-medium text-sm">{u.carrierName}</p>
											<p className="text-muted-foreground text-xs">
												{UNQUOTABLE_REASON[u.reason] ?? u.reason}
											</p>
										</div>
										<span className="text-muted-foreground text-sm">
											A combinar
										</span>
									</div>
								))}
							</div>
						</div>
					) : null}
				</div>
			) : null}
		</div>
	);
}
