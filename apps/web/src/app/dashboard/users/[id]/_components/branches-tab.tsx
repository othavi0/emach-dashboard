"use client";

import { Button } from "@emach/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { Building2, Plus, X } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { linkUserToBranch, unlinkUserFromBranch } from "../../actions";
import type { UserDetail } from "../../data";

export interface BranchOption {
	id: string;
	name: string;
}

export function BranchesTab({
	user,
	availableBranches,
}: {
	availableBranches: BranchOption[];
	user: UserDetail;
}) {
	const [pending, startTransition] = useTransition();

	const linked = user.branchIds.map((id, i) => ({
		id,
		name: user.branchNames[i] ?? id,
	}));
	const unlinkedOptions = availableBranches.filter(
		(b) => !user.branchIds.includes(b.id)
	);

	const link = (branchId: string) => {
		startTransition(async () => {
			const res = await linkUserToBranch({ userId: user.id, branchId });
			if (res.ok) {
				toast.success("Filial vinculada");
			} else {
				toast.error(res.error);
			}
		});
	};
	const unlink = (branchId: string) => {
		startTransition(async () => {
			const res = await unlinkUserFromBranch({ userId: user.id, branchId });
			if (res.ok) {
				toast.success("Filial desvinculada");
			} else {
				toast.error(res.error);
			}
		});
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Filiais vinculadas</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				{linked.length === 0 ? (
					<div className="flex flex-col items-center gap-2 py-8 text-center">
						<Building2
							aria-hidden
							className="size-12 text-muted-foreground opacity-40"
						/>
						<p className="font-medium text-sm">Sem filiais vinculadas</p>
						<p className="text-muted-foreground text-xs">
							Vincule abaixo para escopar acesso desse usuário.
						</p>
					</div>
				) : (
					<ul className="flex flex-col gap-2">
						{linked.map((b) => (
							<li
								className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2"
								key={b.id}
							>
								<span className="text-sm">{b.name}</span>
								<Button
									disabled={pending}
									onClick={() => unlink(b.id)}
									size="sm"
									variant="ghost"
								>
									<X aria-hidden className="size-3.5" />
									Desvincular
								</Button>
							</li>
						))}
					</ul>
				)}
				{unlinkedOptions.length > 0 ? (
					<div className="flex flex-col gap-2 border-border border-t pt-3">
						<p className="text-muted-foreground text-xs uppercase tracking-wide">
							Vincular filial
						</p>
						<div className="flex flex-wrap gap-2">
							{unlinkedOptions.map((b) => (
								<Button
									disabled={pending}
									key={b.id}
									onClick={() => link(b.id)}
									size="sm"
									variant="outline"
								>
									<Plus aria-hidden className="size-3.5" />
									{b.name}
								</Button>
							))}
						</div>
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}
