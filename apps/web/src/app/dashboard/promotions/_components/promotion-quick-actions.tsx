"use client";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@emach/ui/components/dropdown-menu";
import { Switch } from "@emach/ui/components/switch";
import { Copy, MoreVertical, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
	variant: "card" | "sheet";
}

export function PromotionQuickActions({
	canMutate,
	promotion,
	variant: _variant,
}: PromotionQuickActionsProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [deleteOpen, setDeleteOpen] = useState(false);

	if (!canMutate) {
		return null;
	}

	function handleToggle(checked: boolean) {
		startTransition(async () => {
			const result = await togglePromotionActive(promotion.id);
			if (!result.ok) {
				toast.error(result.error);
				return;
			}
			toast.success(
				result.data.active ? "Promoção ativada" : "Promoção desativada"
			);
			router.refresh();
		});
	}

	function handleDuplicate(event: React.MouseEvent) {
		event.stopPropagation();
		startTransition(async () => {
			const result = await duplicatePromotion(promotion.id);
			if (!result.ok) {
				toast.error(result.error);
				return;
			}
			toast.success("Promoção duplicada");
			router.push(`/dashboard/promotions/${result.data.id}/edit`);
		});
	}

	return (
		<div
			className="flex items-center gap-2"
			onClick={(e) => e.stopPropagation()}
			onKeyDown={(e) => e.stopPropagation()}
		>
			<Switch
				aria-label={promotion.active ? "Desativar promoção" : "Ativar promoção"}
				checked={promotion.active}
				disabled={isPending}
				onCheckedChange={handleToggle}
			/>
			<DropdownMenu>
				<DropdownMenuTrigger
					aria-label="Mais ações"
					className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
				>
					<MoreVertical className="size-4" />
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuItem
						render={
							<Link href={`/dashboard/promotions/${promotion.id}/edit`} />
						}
					>
						<Pencil className="mr-2 size-4" />
						Editar
					</DropdownMenuItem>
					<DropdownMenuItem disabled={isPending} onClick={handleDuplicate}>
						<Copy className="mr-2 size-4" />
						Duplicar
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onClick={(e) => {
							e.stopPropagation();
							setDeleteOpen(true);
						}}
						variant="destructive"
					>
						<Trash2 className="mr-2 size-4" />
						Excluir
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<DeletePromotionDialog
				controlled={{ open: deleteOpen, onOpenChange: setDeleteOpen }}
				promotionId={promotion.id}
				promotionTitle={promotion.title}
			/>
		</div>
	);
}
