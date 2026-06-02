import { Building2 } from "lucide-react";
import type { UserLinkedBranch } from "../../data";
import { UserBranchCard } from "./user-branch-card";

interface Props {
	linkedBranches: UserLinkedBranch[];
	userId: string;
}

export function BranchesTab({ userId, linkedBranches }: Props) {
	if (linkedBranches.length === 0) {
		return (
			<div className="flex flex-col items-center gap-2 py-16 text-center">
				<Building2
					aria-hidden
					className="size-12 text-muted-foreground opacity-40"
				/>
				<p className="font-medium text-sm">Sem filiais vinculadas</p>
				<p className="text-muted-foreground text-xs">
					Use "Vincular filial" no topo para adicionar.
				</p>
			</div>
		);
	}

	return (
		<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
			{linkedBranches.map((b) => (
				<UserBranchCard branch={b} key={b.id} userId={userId} />
			))}
		</div>
	);
}
