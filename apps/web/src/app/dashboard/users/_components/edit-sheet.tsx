"use client";

import type { BranchLite, UserRow } from "./types";

interface Props {
	branches: BranchLite[];
	onClose: () => void;
	user: UserRow | null;
}

export function EditSheet(_props: Props) {
	return null;
}
