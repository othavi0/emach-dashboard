import type { ShippingInsurancePolicy } from "@emach/db/schema/store-settings";

interface PreviewRow {
	label: string;
	value: string;
}

interface ShippingPreviewRailProps {
	boxPaddingCm: number;
	fillFactorPct: number;
	insuranceCapAmount: number;
	insurancePolicy: ShippingInsurancePolicy;
	originLabel: string | null;
}

const BRL = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL",
});

export function ShippingPreviewRail({
	originLabel,
	insurancePolicy,
	insuranceCapAmount,
	fillFactorPct,
	boxPaddingCm,
}: ShippingPreviewRailProps) {
	const rows: PreviewRow[] = [
		{
			label: "Origem do despacho",
			value: originLabel ?? "Sem origem definida",
		},
		{
			label: "Seguro declarado",
			value:
				insurancePolicy === "cart_value"
					? `Valor do carrinho (até ${BRL.format(insuranceCapAmount)})`
					: "Sem seguro",
		},
		{
			label: "Empacotamento",
			value: `Até ${fillFactorPct}% de ocupação · +${boxPaddingCm} cm por dimensão`,
		},
		{
			label: "Cotação",
			value: "Frenet (multi-transportadora), por caixa de envio",
		},
		{ label: "Item fora do catálogo de caixas", value: "Frete a combinar" },
		{ label: "Frete grátis", value: "Apenas via cupom de promoção" },
	];

	return (
		<aside className="flex flex-col gap-3 self-start rounded-md border border-border bg-card p-4">
			<div className="flex flex-col gap-1">
				<h2 className="font-medium text-sm">Como o cliente vê</h2>
				<p className="text-muted-foreground text-xs">
					Reflete o efeito destas configurações na cotação da loja.
				</p>
			</div>
			<dl className="flex flex-col">
				{rows.map((row) => (
					<div
						className="-mx-4 flex flex-col gap-0.5 border-border border-b px-4 py-2.5 last:border-b-0"
						key={row.label}
					>
						<dt className="text-muted-foreground text-xs">{row.label}</dt>
						<dd className="text-foreground text-sm">{row.value}</dd>
					</div>
				))}
			</dl>
		</aside>
	);
}
