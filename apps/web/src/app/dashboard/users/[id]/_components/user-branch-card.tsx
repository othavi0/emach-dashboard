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
	AlertDialogTrigger,
} from "@emach/ui/components/alert-dialog";
import { Button } from "@emach/ui/components/button";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { formatBranchAddress } from "@/lib/format/branch";
import { getInitials } from "@/lib/format/name";
import { unlinkUserFromBranch } from "../../actions";
import type { UserLinkedBranch } from "../../data";

interface Props {
	branch: UserLinkedBranch;
	userId: string;
}

export function UserBranchCard({ userId, branch }: Props) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [unlinking, setUnlinking] = useState(false);

	async function handleUnlink() {
		setUnlinking(true);
		try {
			const result = await unlinkUserFromBranch({
				userId,
				branchId: branch.id,
			});
			if (result.ok) {
				toast.success("Filial desvinculada");
				setOpen(false);
				router.refresh();
			} else {
				toast.error(result.error);
			}
		} finally {
			setUnlinking(false);
		}
	}

	return (
		<div
			className={`group flex cursor-pointer flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${branch.status === "inactive" ? "opacity-70" : ""}`}
			onClick={() => router.push(`/dashboard/branches/${branch.id}`)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					router.push(`/dashboard/branches/${branch.id}`);
				}
			}}
			role="button"
			tabIndex={0}
		>
			<div className="flex items-start gap-3 px-4 pt-4 pb-3">
				<div className="flex size-12 flex-shrink-0 items-center justify-center rounded-[10px] border border-border bg-muted font-bold text-[17px] text-foreground">
					{getInitials(branch.name)}
				</div>
				<div className="min-w-0 flex-1">
					<p className="font-semibold text-[15px] text-foreground leading-tight">
						{branch.name}
					</p>
					{branch.status === "inactive" && (
						<span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground uppercase tracking-wider">
							Inativa
						</span>
					)}
					{(() => {
						const addr = formatBranchAddress(branch);
						return addr ? (
							<p className="line-clamp-1 text-muted-foreground text-xs">
								{addr}
							</p>
						) : null;
					})()}
				</div>
			</div>

			<div className="grid grid-cols-3 border-border border-t">
				<div className="flex flex-col items-center border-border border-r py-3">
					<span className="font-bold text-[20px] text-foreground tabular-nums">
						{branch.teamCount}
					</span>
					<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
						Equipe
					</span>
				</div>
				<div className="flex flex-col items-center border-border border-r py-3">
					<span className="font-bold text-[20px] text-foreground tabular-nums">
						{branch.activeSkus}
					</span>
					<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
						SKUs ativos
					</span>
				</div>
				<div className="flex flex-col items-center py-3">
					<span
						className={`font-bold text-[20px] tabular-nums ${
							branch.lowStock > 0 ? "text-amber-500" : "text-foreground"
						}`}
					>
						{branch.lowStock}
					</span>
					<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
						Abaixo mín.
					</span>
				</div>
			</div>

			<div className="-mx-0 flex justify-end border-border border-t px-4 py-2">
				<AlertDialog onOpenChange={setOpen} open={open}>
					<AlertDialogTrigger
						render={
							<Button
								onClick={(e) => e.stopPropagation()}
								size="sm"
								variant="outline"
							/>
						}
					>
						Desvincular
					</AlertDialogTrigger>
					<AlertDialogContent onClick={(e) => e.stopPropagation()}>
						<AlertDialogHeader>
							<AlertDialogTitle>Desvincular {branch.name}?</AlertDialogTitle>
							<AlertDialogDescription>
								O usuário perde o acesso a esta filial. É possível vincular de
								novo depois.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel disabled={unlinking}>
								Cancelar
							</AlertDialogCancel>
							<AlertDialogAction
								disabled={unlinking}
								onClick={(e) => {
									e.preventDefault();
									handleUnlink().catch(() => undefined);
								}}
							>
								{unlinking ? (
									<Loader2
										aria-hidden
										className="mr-1.5 size-3.5 animate-spin"
									/>
								) : null}
								Desvincular
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</div>
		</div>
	);
}
