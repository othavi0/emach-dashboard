import { requireRole } from "@/lib/session";
import { PromotionForm } from "../_components/promotion-form";
import { getToolOptions } from "../actions";

interface PageProps {
	searchParams: Promise<{ type?: string }>;
}

export default async function NewPromotionPage({ searchParams }: PageProps) {
	await requireRole("admin");

	const { type } = await searchParams;
	const initialType = type === "promocode" ? "promocode" : "promotion";
	const isCoupon = initialType === "promocode";

	const availableTools = await getToolOptions();

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="font-medium font-serif text-4xl tracking-tight">
					{isCoupon ? "Novo cupom" : "Nova promoção"}
				</h1>
				<p className="text-muted-foreground text-sm">
					{isCoupon
						? "Código aplicado pelo cliente no checkout das ferramentas vinculadas."
						: "Desconto aplicado direto no preço das ferramentas vinculadas."}
				</p>
			</div>

			<PromotionForm
				availableTools={availableTools}
				defaultValues={{ type: initialType }}
				mode="create"
			/>
		</div>
	);
}
