"use client";

import { LazyTab } from "@/components/entity/lazy-tab";
import type { BranchTeamRow } from "../../data";
import { fetchBranchTeamAction } from "../_lib/tab-actions";
import { TeamGrid } from "./team-grid";

export function TeamTabLoader({ branchId }: { branchId: string }) {
	return (
		<LazyTab load={() => fetchBranchTeamAction(branchId)}>
			{(members: BranchTeamRow[]) => (
				<TeamGrid branchId={branchId} members={members} />
			)}
		</LazyTab>
	);
}
