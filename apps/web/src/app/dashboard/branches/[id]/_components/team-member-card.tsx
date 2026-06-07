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
import { StatusBadge } from "@/app/dashboard/users/_components/status-badge";
import { getInitials } from "@/lib/format/name";
import { formatRelative } from "@/lib/format/relative";
import { unlinkUserFromBranchAction } from "../../actions";
import type { BranchTeamRow } from "../../data";

const ROLE_LABEL: Record<BranchTeamRow["role"], string> = {
	super_admin: "Super admin",
	admin: "Admin",
	manager: "Gerente",
	user: "Usuário",
};

interface Props {
	branchId: string;
	member: BranchTeamRow;
}

export function TeamMemberCard({ branchId, member }: Props) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [unlinking, setUnlinking] = useState(false);

	async function handleUnlink() {
		setUnlinking(true);
		try {
			const result = await unlinkUserFromBranchAction({
				branchId,
				userId: member.userId,
			});
			if (result.ok) {
				toast.success(`${member.name} desvinculado da filial.`);
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
		// biome-ignore lint/a11y/useSemanticElements: card clicável (padrão DESIGN.md §4) — div role=button com onKeyDown
		<div
			className="group flex cursor-pointer flex-col gap-3 rounded-[10px] border border-border bg-card p-4 shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			onClick={() => router.push(`/dashboard/users/${member.userId}`)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					router.push(`/dashboard/users/${member.userId}`);
				}
			}}
			role="button"
			tabIndex={0}
		>
			<div className="flex items-start gap-3">
				<div className="flex size-[52px] flex-shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-border bg-muted font-bold text-[18px] text-foreground">
					{member.image ? (
						// biome-ignore lint/performance/noImgElement: avatar do usuário
						// biome-ignore lint/correctness/useImageSize: tamanho fixo via Tailwind
						<img alt="" className="size-full object-cover" src={member.image} />
					) : (
						getInitials(member.name)
					)}
				</div>
				<div className="min-w-0 flex-1">
					<span className="block truncate font-semibold text-[14px] text-foreground leading-tight">
						{member.name}
					</span>
					<p className="truncate text-muted-foreground text-xs">
						{member.email}
					</p>
				</div>
				<StatusBadge status={member.status} />
			</div>

			<div className="-mx-4 flex items-center justify-between gap-2 border-border border-t px-4 pt-3">
				<span className="text-muted-foreground text-xs">
					<span className="font-semibold text-foreground">
						{ROLE_LABEL[member.role]}
					</span>
					<span aria-hidden className="mx-1.5">
						·
					</span>
					{member.lastLoginAt
						? `Login ${formatRelative(member.lastLoginAt)}`
						: "Nunca logou"}
				</span>
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
							<AlertDialogTitle>Desvincular {member.name}?</AlertDialogTitle>
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
