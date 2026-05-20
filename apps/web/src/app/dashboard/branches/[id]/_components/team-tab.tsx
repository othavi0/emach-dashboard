import type { BranchTeamRow } from "../../data";
import { TeamLinkPanel } from "./team-link-panel";
import { TeamList } from "./team-list";

interface Props {
	branchId: string;
	team: BranchTeamRow[];
}

export function TeamTab({ branchId, team }: Props) {
	return (
		<div className="flex flex-col gap-6">
			<TeamLinkPanel branchId={branchId} />
			<TeamList branchId={branchId} members={team} />
		</div>
	);
}
