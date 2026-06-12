"use client";

import { Button } from "@emach/ui/components/button";
import { Spinner } from "@emach/ui/components/spinner";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { notify } from "@/lib/notify";

import { toggleCategoryActive } from "../actions";
import { DeleteCategoryDialog } from "./delete-category-dialog";

interface CategoryDetailActionsProps {
	categoryId: string;
	categoryName: string;
	isActive: boolean;
}

export function CategoryDetailActions({
	categoryId,
	categoryName,
	isActive,
}: CategoryDetailActionsProps) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();

	function handleToggle() {
		startTransition(async () => {
			const result = await toggleCategoryActive(categoryId, !isActive);
			if (result.ok) {
				notify.success(isActive ? "Categoria desativada" : "Categoria ativada");
				router.refresh();
			} else {
				notify.error(result.error);
			}
		});
	}

	return (
		<div className="flex flex-col gap-2">
			<Button
				className="w-full"
				disabled={isPending}
				onClick={handleToggle}
				type="button"
				variant="outline"
			>
				{isPending ? <Spinner /> : null}
				{isActive ? "Desativar" : "Ativar"}
			</Button>
			<DeleteCategoryDialog
				categoryId={categoryId}
				categoryName={categoryName}
				redirectTo="/dashboard/categories"
				variant="button"
			/>
		</div>
	);
}
