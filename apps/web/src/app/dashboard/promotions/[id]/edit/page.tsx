import { db } from "@emach/db";
import { tool } from "@emach/db/schema/tools";
import { asc } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/session";
import { PromotionForm } from "../../_components/promotion-form";
import { getPromotion } from "../../actions";

interface EditPromotionPageProps {
	params: Promise<{ id: string }>;
}

export default async function EditPromotionPage({
	params,
}: EditPromotionPageProps) {
	await requireRole("admin");
	const { id } = await params;

	const [promotion, availableTools] = await Promise.all([
		getPromotion(id),
		db
			.select({ id: tool.id, name: tool.name })
			.from(tool)
			.orderBy(asc(tool.name)),
	]);

	if (!promotion) {
		notFound();
	}

	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-2">
				<Link
					className="inline-flex w-fit items-center gap-1 text-muted-foreground text-sm hover:text-foreground"
					href={`/dashboard/promotions?view=${id}`}
				>
					<ArrowLeft className="size-3.5" />
					Voltar para promoções
				</Link>
				<h1 className="font-medium font-serif text-4xl tracking-tight">
					Editar: {promotion.title}
				</h1>
				<p className="text-muted-foreground text-sm">
					Atualize os dados da promoção{" "}
					<span className="font-medium text-foreground">{promotion.title}</span>
					.
				</p>
			</div>

			<PromotionForm
				availableTools={availableTools}
				defaultValues={{
					type: promotion.type as "promotion" | "promocode",
					title: promotion.title,
					description: promotion.description ?? undefined,
					discountPct: Number(promotion.discountPct),
					active: promotion.active,
					startsAt: promotion.startsAt ?? undefined,
					endsAt: promotion.endsAt ?? undefined,
					code: promotion.code ?? undefined,
					toolIds: promotion.toolIds,
				}}
				mode="edit"
				promotionId={id}
			/>
		</div>
	);
}
