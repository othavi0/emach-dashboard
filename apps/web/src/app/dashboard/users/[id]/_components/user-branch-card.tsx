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
import { BranchStatsCard } from "@/app/dashboard/branches/_components/branch-stats-card";
import { formatBranchAddress } from "@/lib/format/branch";
import { notify } from "@/lib/notify";
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
				notify.success("Filial desvinculada");
				setOpen(false);
				router.refresh();
			} else {
				notify.error(result.error);
			}
		} finally {
			setUnlinking(false);
		}
	}

	return (
		<BranchStatsCard
			address={formatBranchAddress(branch)}
			footer={
				<div className="flex justify-end border-border border-t px-4 py-2">
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
			}
			name={branch.name}
			onActivate={() => router.push(`/dashboard/branches/${branch.id}`)}
			stats={[
				{ label: "Equipe", value: branch.teamCount },
				{ label: "SKUs ativos", value: branch.activeSkus },
				{ amber: true, label: "Abaixo mín.", value: branch.lowStock },
			]}
			status={branch.status}
		/>
	);
}
