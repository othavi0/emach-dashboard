import { notFound } from "next/navigation";

import { requireCapabilityOrRedirect } from "@/lib/permissions";
import { PromotionForm } from "../../_components/promotion-form";
import type { PromotionFormValues } from "../../_components/promotion-schema";
import { getPromotion, getToolOptions } from "../../actions";
import { PromotionIdentity } from "../_components/promotion-identity";

interface PageProps {
	params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function EditPromotionPage({ params }: PageProps) {
	await requireCapabilityOrRedirect("promotions.manage");

	const { id } = await params;

	const [detail, availableTools] = await Promise.all([
		getPromotion(id),
		getToolOptions(),
	]);

	if (!detail) {
		notFound();
	}

	const initialValues: PromotionFormValues =
		detail.type === "promocode"
			? {
					type: "promocode",
					title: detail.title,
					description: detail.description,
					discountType: detail.discountType as "percent" | "fixed",
					discountValue: Number(detail.discountValue),
					appliesToAll: detail.appliesToAll,
					active: detail.active,
					featured: false,
					startsAt: detail.startsAt,
					endsAt: detail.endsAt,
					code: detail.code ?? "",
					toolIds: detail.toolIds,
					maxRedemptions: detail.maxRedemptions,
					minOrderAmount:
						detail.minOrderAmount == null
							? null
							: Number(detail.minOrderAmount),
				}
			: {
					type: "promotion",
					title: detail.title,
					description: detail.description,
					discountType: detail.discountType as "percent" | "fixed",
					discountValue: Number(detail.discountValue),
					appliesToAll: detail.appliesToAll,
					active: detail.active,
					featured: detail.featured,
					startsAt: detail.startsAt,
					endsAt: detail.endsAt,
					code: null,
					toolIds: detail.toolIds,
				};

	return (
		<div className="flex flex-col gap-6 p-6">
			<PromotionIdentity detail={detail} />
			<PromotionForm
				availableTools={availableTools}
				initialValues={initialValues}
				mode="edit"
				promotionId={id}
			/>
		</div>
	);
}
