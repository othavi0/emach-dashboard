import type { UserDetail } from "../../data";

export interface BranchOption {
	id: string;
	name: string;
}

export function BranchesTab({
	user: _user,
	availableBranches: _availableBranches,
}: {
	availableBranches: BranchOption[];
	user: UserDetail;
}) {
	return <p>TODO BranchesTab</p>;
}
