"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@emach/ui/components/alert-dialog";
import { Button } from "@emach/ui/components/button";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { notify } from "@/lib/notify";
import { deleteBanner } from "../actions";

export function DeleteBannerDialog({
	bannerId,
	bannerTitle,
	onDeleted,
}: {
	bannerId: string;
	bannerTitle: string;
	onDeleted?: () => void;
}) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [pending, startTransition] = useTransition();

	return (
		<AlertDialog onOpenChange={setOpen} open={open}>
			<Button
				aria-label={`Excluir banner ${bannerTitle}`}
				onClick={(e) => {
					e.stopPropagation();
					setOpen(true);
				}}
				size="icon-sm"
				type="button"
				variant="ghost"
			>
				<Trash2 className="size-3.5" />
			</Button>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Excluir banner?</AlertDialogTitle>
					<AlertDialogDescription>
						"{bannerTitle}" e suas imagens serão removidos permanentemente.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancelar</AlertDialogCancel>
					<AlertDialogAction
						disabled={pending}
						onClick={(e) => {
							e.preventDefault();
							startTransition(async () => {
								const r = await deleteBanner(bannerId);
								if (r.ok) {
									notify.success("Banner excluído");
									setOpen(false);
									onDeleted?.();
									router.refresh();
								} else {
									notify.error(r.error);
								}
							});
						}}
					>
						Excluir
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
