"use client";

import { Button, buttonVariants } from "@emach/ui/components/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@emach/ui/components/tooltip";
import { Copy, PauseCircle, Pencil, PlayCircle, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
	duplicatePromotion,
	type PromotionListItem,
	togglePromotionActive,
} from "../actions";
import { DeletePromotionDialog } from "./delete-promotion-dialog";

interface PromotionQuickActionsProps {
	canMutate: boolean;
	promotion: PromotionListItem;
}

export function PromotionQuickActions({
	canMutate,
	promotion,
}: PromotionQuickActionsProps) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [isPending, startTransition] = useTransition();
	const [deleteOpen, setDeleteOpen] = useState(false);

	if (!canMutate) {
		return null;
	}

	function editUrl(id: string): string {
		const params = new URLSearchParams(searchParams);
		params.delete("view");
		params.set("edit", id);
		return `/dashboard/promotions?${params.toString()}`;
	}

	function handleToggle() {
		startTransition(async () => {
			const result = await togglePromotionActive(promotion.id);
			if (!result.ok) {
				toast.error(result.error);
				return;
			}
			toast.success(
				result.data.active ? "Promoção ativada" : "Promoção pausada"
			);
			router.refresh();
		});
	}

	function handleDuplicate() {
		startTransition(async () => {
			const result = await duplicatePromotion(promotion.id);
			if (!result.ok) {
				toast.error(result.error);
				return;
			}
			toast.success("Promoção duplicada");
			router.push(editUrl(result.data.id));
		});
	}

	const editHref = editUrl(promotion.id);

	return (
		<TooltipProvider>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: stopPropagation wrapper */}
			{/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: idem */}
			<div
				className="flex items-center justify-between gap-2"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.stopPropagation()}
			>
				{promotion.active ? (
					<Button
						disabled={isPending}
						onClick={handleToggle}
						size="sm"
						variant="secondary"
					>
						<PauseCircle className="mr-1.5 size-4" />
						Pausar
					</Button>
				) : (
					<Button
						disabled={isPending}
						onClick={handleToggle}
						size="sm"
						variant="default"
					>
						<PlayCircle className="mr-1.5 size-4" />
						Ativar
					</Button>
				)}

				<div className="flex items-center gap-1">
					<Tooltip>
						<TooltipTrigger
							render={
								<Link
									aria-label="Editar promoção"
									className={buttonVariants({
										size: "icon-sm",
										variant: "secondary",
									})}
									href={editHref}
								/>
							}
						>
							<Pencil className="size-3.5" />
						</TooltipTrigger>
						<TooltipContent>Editar</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger
							render={
								<Button
									aria-label="Duplicar promoção"
									disabled={isPending}
									onClick={handleDuplicate}
									size="icon-sm"
									type="button"
									variant="secondary"
								/>
							}
						>
							<Copy className="size-3.5" />
						</TooltipTrigger>
						<TooltipContent>Duplicar</TooltipContent>
					</Tooltip>

					<Tooltip>
						<TooltipTrigger
							render={
								<Button
									aria-label="Excluir promoção"
									onClick={() => setDeleteOpen(true)}
									size="icon-sm"
									type="button"
									variant="destructive"
								/>
							}
						>
							<Trash2 className="size-3.5" />
						</TooltipTrigger>
						<TooltipContent>Excluir</TooltipContent>
					</Tooltip>
				</div>

				<DeletePromotionDialog
					controlled={{ open: deleteOpen, onOpenChange: setDeleteOpen }}
					promotionId={promotion.id}
					promotionTitle={promotion.title}
				/>
			</div>
		</TooltipProvider>
	);
}
