"use client";

import { Button } from "@emach/ui/components/button";
import { Plus } from "lucide-react";
import { useState } from "react";

import { AddToolToBranchSheet } from "@/app/dashboard/stock/_components/add-tool-to-branch-sheet";

interface Props {
	branchId: string;
	branchName: string;
}

export function AddToolButton({ branchId, branchName }: Props) {
	const [open, setOpen] = useState(false);
	return (
		<>
			<Button onClick={() => setOpen(true)} size="sm">
				<Plus className="size-4" />
				Adicionar ao estoque
			</Button>
			<AddToolToBranchSheet
				branchId={branchId}
				branchName={branchName}
				onClose={() => setOpen(false)}
				open={open}
			/>
		</>
	);
}
