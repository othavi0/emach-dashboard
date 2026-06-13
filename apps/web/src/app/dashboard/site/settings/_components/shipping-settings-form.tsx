"use client";

import { Button } from "@emach/ui/components/button";
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
import { Spinner } from "@emach/ui/components/spinner";
import { useState, useTransition } from "react";
import {
	errorToastMessage,
	focusFirstError,
	zodIssuesToFieldErrors,
} from "@/lib/form-errors";
import { notify } from "@/lib/notify";
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
	};
}

export function ShippingSettingsForm({
	originOptions,
	settings,
}: ShippingSettingsFormProps) {
	const [isPending, startTransition] = useTransition();
	const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
	const [originBranchId, setOriginBranchId] = useState(
		settings.originBranchId ?? NO_ORIGIN
	);
	const [insurancePolicy, setInsurancePolicy] = useState(
		settings.insurancePolicy
	);
	const [capAmount, setCapAmount] = useState(
		String(settings.insuranceCapAmount)
	);

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setErrors({});

		const values: ShippingSettingsFormValues = {
			originBranchId: originBranchId === NO_ORIGIN ? undefined : originBranchId,
			insurancePolicy,
			insuranceCapAmount: Number(capAmount),
		};

		const parsed = shippingSettingsSchema.safeParse(values);
		if (!parsed.success) {
			setErrors(zodIssuesToFieldErrors(parsed.error));
			notify.error(errorToastMessage(parsed.error.issues.length));
			focusFirstError();
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
					<div className="flex flex-col gap-2">
						<Label htmlFor="originBranchId">Filial de origem</Label>
						<Select
							onValueChange={(v) => setOriginBranchId(v ?? NO_ORIGIN)}
							value={originBranchId}
						>
							<SelectTrigger
								aria-invalid={errors.originBranchId ? true : undefined}
								id="originBranchId"
							>
								<SelectValue placeholder="Selecione a filial" />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									<SelectItem value={NO_ORIGIN}>Sem origem definida</SelectItem>
									{originOptions.map((o) => (
										<SelectItem key={o.id} value={o.id}>
											{o.name}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
						{errors.originBranchId && (
							<p className="text-destructive text-xs">
								{errors.originBranchId}
							</p>
						)}
					</div>
				)}
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
				<div className="flex flex-col gap-2">
					<Label htmlFor="insurancePolicy">Política de seguro</Label>
					<Select
						onValueChange={(v) =>
							setInsurancePolicy(v as typeof insurancePolicy)
						}
						value={insurancePolicy}
					>
						<SelectTrigger id="insurancePolicy">
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
				</div>
				{insurancePolicy === "cart_value" ? (
					<div className="flex flex-col gap-2">
						<Label htmlFor="insuranceCapAmount">Teto do seguro (R$)</Label>
						<Input
							aria-invalid={errors.insuranceCapAmount ? true : undefined}
							id="insuranceCapAmount"
							inputMode="decimal"
							onChange={(e) => setCapAmount(e.target.value)}
							placeholder="3000.00"
							value={capAmount}
						/>
						{errors.insuranceCapAmount && (
							<p className="text-destructive text-xs">
								{errors.insuranceCapAmount}
							</p>
						)}
						<p className="text-muted-foreground text-xs">
							Valor máximo declarado por envio. Padrão R$ 3.000 (teto
							SuperFrete).
						</p>
					</div>
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
