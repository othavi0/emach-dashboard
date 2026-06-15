"use client";

import { Button, buttonVariants } from "@emach/ui/components/button";
import { Copy, PauseCircle, PlayCircle, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { notify } from "@/lib/notify";
import { DeletePromotionDialog } from "../../_components/delete-promotion-dialog";
import {
	duplicatePromotion,
	type PromotionDetail,
	togglePromotionActive,
} from "../../actions";

export function PromotionHeaderActions({
	canDelete,
	promotion,
}: {
	canDelete: boolean;
	promotion: PromotionDetail;
}) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [deleteOpen, setDeleteOpen] = useState(false);

	function handleToggle() {
		startTransition(async () => {
			const res = await togglePromotionActive(promotion.id);
			if (!res.ok) {
				notify.error(res.error);
				return;
			}
			notify.success(res.data.active ? "Promoção ativada" : "Promoção pausada");
			router.refresh();
		});
	}

	function handleDuplicate() {
		startTransition(async () => {
			const res = await duplicatePromotion(promotion.id);
			if (!res.ok) {
				notify.error(res.error);
				return;
			}
			notify.success("Promoção duplicada");
			router.push(`/dashboard/promotions/${res.data.id}/edit`);
		});
	}

	return (
		<>
			<Link
				className={buttonVariants({ variant: "default" })}
				href={`/dashboard/promotions/${promotion.id}/edit`}
			>
				Editar
			</Link>
			<Button
				disabled={isPending}
				onClick={handleToggle}
				type="button"
				variant="secondary"
			>
				{promotion.active ? (
					<>
						<PauseCircle aria-hidden className="mr-1.5 size-4" />
						Pausar
					</>
				) : (
					<>
						<PlayCircle aria-hidden className="mr-1.5 size-4" />
						Ativar
					</>
				)}
			</Button>
			<Button
				aria-label="Duplicar promoção"
				disabled={isPending}
				onClick={handleDuplicate}
				size="icon"
				type="button"
				variant="outline"
			>
				<Copy aria-hidden className="size-4" />
			</Button>
			{canDelete && (
				<Button
					aria-label="Excluir promoção"
					onClick={() => setDeleteOpen(true)}
					size="icon"
					type="button"
					variant="destructive"
				>
					<Trash2 aria-hidden className="size-4" />
				</Button>
			)}
			{canDelete && (
				<DeletePromotionDialog
					controlled={{ open: deleteOpen, onOpenChange: setDeleteOpen }}
					promotionId={promotion.id}
					promotionTitle={promotion.title}
					redirectTo="/dashboard/promotions"
				/>
			)}
		</>
	);
}
