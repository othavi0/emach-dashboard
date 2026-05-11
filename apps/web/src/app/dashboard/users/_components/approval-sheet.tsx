"use client";

import type { BranchLite, UserRow } from "./types";

interface Props {
	branches: BranchLite[];
	onClose: () => void;
	user: UserRow | null;
}

export function ApprovalSheet(_props: Props) {
	return null;
}
