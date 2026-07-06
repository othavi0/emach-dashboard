"use client";

import { Button } from "@emach/ui/components/button";
import { Input } from "@emach/ui/components/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";
import { Spinner } from "@emach/ui/components/spinner";
import { useState, useTransition } from "react";

import { LabeledField } from "@/components/labeled-field";
import { notify } from "@/lib/notify";
import { useFormErrors } from "@/lib/use-form-errors";
import type { OriginBranchOption } from "../actions";
import { updateShippingSettings } from "../actions";
import {
	INSURANCE_POLICY_LABELS,
	INSURANCE_POLICY_OPTIONS,
	type ShippingSettingsFormValues,
	shippingSettingsSchema,
} from "./shipping-schema";

const NO_ORIGIN = "__none__";

interface ShippingSettingsFormProps {
	originOptions: OriginBranchOption[];
	settings: {
		originBranchId: string | null;
		insurancePolicy: (typeof INSURANCE_POLICY_OPTIONS)[number];
		insuranceCapAmount: number;
		fillFactorPct: number;
		boxPaddingCm: number;
	};
}

export function ShippingSettingsForm({
	originOptions,
	settings,
}: ShippingSettingsFormProps) {
	const [isPending, startTransition] = useTransition();
	const { errors, setErrors, reportValidationError } =
		useFormErrors<ShippingSettingsFormValues>();
	const [originBranchId, setOriginBranchId] = useState(
		settings.originBranchId ?? NO_ORIGIN
	);
	const [insurancePolicy, setInsurancePolicy] = useState(
		settings.insurancePolicy
	);
	const [capAmount, setCapAmount] = useState(
		String(settings.insuranceCapAmount)
	);
	const [fillFactorPct, setFillFactorPct] = useState(
		String(settings.fillFactorPct)
	);
	const [boxPaddingCm, setBoxPaddingCm] = useState(
		String(settings.boxPaddingCm)
	);

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setErrors({});

		const values: ShippingSettingsFormValues = {
			originBranchId: originBranchId === NO_ORIGIN ? undefined : originBranchId,
			insurancePolicy,
			insuranceCapAmount: Number(capAmount),
			fillFactorPct: Number(fillFactorPct),
			boxPaddingCm: Number(boxPaddingCm),
		};

		const parsed = shippingSettingsSchema.safeParse(values);
		if (!parsed.success) {
			reportValidationError(parsed.error);
			return;
		}

		startTransition(async () => {
			const result = await updateShippingSettings(parsed.data);
			if (result.ok) {
				notify.success("Configurações de frete salvas");
			} else {
				notify.error(result.error || "Não foi possível salvar");
			}
		});
	}

	return (
		<form className="flex flex-col gap-6" onSubmit={handleSubmit}>
			<section className="flex flex-col gap-4 rounded-md border border-border bg-card p-6">
				<div className="flex flex-col gap-1">
					<h2 className="font-medium text-sm">Origem do despacho</h2>
					<p className="text-muted-foreground text-sm">
						De qual filial a loja calcula a distância até o cliente. O CEP dessa
						filial é o ponto de partida de toda cotação de frete no checkout. Só
						aparecem filiais com CEP cadastrado.
					</p>
				</div>
				{originOptions.length === 0 ? (
					<p className="rounded-md border border-border border-dashed bg-muted/40 p-4 text-muted-foreground text-sm">
						Nenhuma filial tem CEP cadastrado. Cadastre o CEP de uma filial para
						definir a origem do despacho.
					</p>
				) : (
					<LabeledField
						error={errors.originBranchId}
						id="originBranchId"
						label="Filial de origem"
					>
						{(field) => (
							<Select
								onValueChange={(v) => setOriginBranchId(v ?? NO_ORIGIN)}
								value={originBranchId}
							>
								<SelectTrigger {...field}>
									<SelectValue placeholder="Selecione a filial" />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectItem value={NO_ORIGIN}>
											Sem origem definida
										</SelectItem>
										{originOptions.map((o) => (
											<SelectItem key={o.id} value={o.id}>
												{o.name}
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						)}
					</LabeledField>
				)}
			</section>

			<section className="flex flex-col gap-4 rounded-md border border-border bg-card p-6">
				<div className="flex flex-col gap-1">
					<h2 className="font-medium text-sm">Empacotamento</h2>
					<p className="text-muted-foreground text-sm">
						Folgas usadas na consolidação do carrinho em caixas. A ocupação
						máxima compensa o encaixe imperfeito dos itens; o acréscimo por
						dimensão cobre parede e aba da caixa no peso cubado.
					</p>
				</div>
				<div className="grid gap-4 sm:grid-cols-2">
					<LabeledField
						error={errors.fillFactorPct}
						hint="Padrão 90%. Diminua se despachos reais não fecham na caixa cotada."
						id="fillFactorPct"
						label="Ocupação máxima da caixa (%)"
					>
						{(field) => (
							<Input
								{...field}
								inputMode="numeric"
								onChange={(e) => setFillFactorPct(e.target.value)}
								placeholder="90"
								value={fillFactorPct}
							/>
						)}
					</LabeledField>
					<LabeledField
						error={errors.boxPaddingCm}
						hint="Somado a cada dimensão externa da caixa na cotação. Padrão 0."
						id="boxPaddingCm"
						label="Acréscimo por dimensão (cm)"
					>
						{(field) => (
							<Input
								{...field}
								inputMode="decimal"
								onChange={(e) => setBoxPaddingCm(e.target.value)}
								placeholder="0"
								value={boxPaddingCm}
							/>
						)}
					</LabeledField>
				</div>
			</section>

			<section className="flex flex-col gap-4 rounded-md border border-border bg-card p-6">
				<div className="flex flex-col gap-1">
					<h2 className="font-medium text-sm">Seguro do frete</h2>
					<p className="text-muted-foreground text-sm">
						Quando o seguro está ativo, a loja declara o valor do carrinho à
						transportadora — encarece o frete, mas cobre o cliente em caso de
						extravio. Sem seguro, o frete sai mais barato e a loja assume o
						risco. O teto limita o valor declarado por envio.
					</p>
				</div>
				<LabeledField id="insurancePolicy" label="Política de seguro">
					{(field) => (
						<Select
							onValueChange={(v) =>
								setInsurancePolicy(v as typeof insurancePolicy)
							}
							value={insurancePolicy}
						>
							<SelectTrigger {...field}>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{INSURANCE_POLICY_OPTIONS.map((p) => (
										<SelectItem key={p} value={p}>
											{INSURANCE_POLICY_LABELS[p]}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					)}
				</LabeledField>
				{insurancePolicy === "cart_value" ? (
					<LabeledField
						error={errors.insuranceCapAmount}
						hint="Valor máximo declarado por envio na cotação. Padrão R$ 3.000."
						id="insuranceCapAmount"
						label="Teto do seguro (R$)"
					>
						{(field) => (
							<Input
								{...field}
								inputMode="decimal"
								onChange={(e) => setCapAmount(e.target.value)}
								placeholder="3000.00"
								value={capAmount}
							/>
						)}
					</LabeledField>
				) : null}
			</section>

			<div className="flex items-center gap-3">
				<Button disabled={isPending} type="submit">
					{isPending ? (
						<>
							<Spinner /> Salvando…
						</>
					) : (
						"Salvar alterações"
					)}
				</Button>
			</div>
		</form>
	);
}
