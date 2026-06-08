import { requireCapabilityOrRedirect } from "@/lib/permissions";
import { PromotionForm } from "../_components/promotion-form";
import type { PromotionFormValues } from "../_components/promotion-schema";
import { getToolOptions } from "../actions";

interface PageProps {
	searchParams: Promise<{ type?: string }>;
}

const COUPON_DEFAULTS: PromotionFormValues = {
	type: "promocode",
	title: "",
	description: null,
	discountType: "percent",
	discountValue: 0,
	appliesToAll: false,
	active: true,
	featured: false,
	startsAt: null,
	endsAt: null,
	code: "",
	toolIds: [],
	maxRedemptions: null,
	minOrderAmount: null,
};

const PROMOTION_DEFAULTS: PromotionFormValues = {
	type: "promotion",
	title: "",
	description: null,
	discountType: "percent",
	discountValue: 0,
	appliesToAll: false,
	active: true,
	featured: false,
	startsAt: null,
	endsAt: null,
	code: null,
	toolIds: [],
};

export default async function NewPromotionPage({ searchParams }: PageProps) {
	await requireCapabilityOrRedirect("promotions.manage");

	const { type } = await searchParams;
	const isCoupon = type === "promocode";
	const availableTools = await getToolOptions();

	return (
		<div className="flex flex-col gap-6 p-6">
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
				initialValues={isCoupon ? COUPON_DEFAULTS : PROMOTION_DEFAULTS}
				mode="create"
			/>
		</div>
	);
}
