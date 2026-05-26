"use client";

import { Button } from "@emach/ui/components/button";
import { Label } from "@emach/ui/components/label";
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@emach/ui/components/sheet";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { allowedApprovalRoles } from "../_lib/approval-roles";
import { approveUser, rejectUser } from "../actions";
import { BranchesCombobox } from "./branches-combobox";
import { RoleSelect } from "./role-select";
import type { BranchLite, UserRow } from "./types";

interface Props {
	actorRole: UserRow["role"];
	branches: BranchLite[];
	onClose: () => void;
	onResolved?: () => void;
	user: UserRow | null;
}

export function ApprovalSheet({
	user,
	branches,
	onClose,
	onResolved,
	actorRole,
}: Props) {
	const allowed = allowedApprovalRoles(actorRole);
	const [role, setRole] = useState<UserRow["role"]>(allowed.at(-1) ?? "user");
	const [branchIds, setBranchIds] = useState<string[]>([]);
	const [, startTransition] = useTransition();
	const [submitting, setSubmitting] = useState(false);

	useEffect(() => {
		if (user) {
			setRole(allowed.at(-1) ?? "user");
			setBranchIds([]);
		}
	}, [user, allowed]);

	function handleApprove() {
		if (!user) {
			return;
		}
		setSubmitting(true);
		startTransition(async () => {
			const result = await approveUser({ userId: user.id, role, branchIds });
			setSubmitting(false);
			if (result.ok) {
				toast.success("Usuário aprovado");
				onResolved?.();
				onClose();
			} else {
				toast.error(result.error);
			}
		});
	}

	function handleReject() {
		if (!user) {
			return;
		}
		setSubmitting(true);
		startTransition(async () => {
			const result = await rejectUser({ userId: user.id });
			setSubmitting(false);
			if (result.ok) {
				toast.success("Solicitação rejeitada");
				onResolved?.();
				onClose();
			} else {
				toast.error(result.error);
			}
		});
	}

	return (
		<Sheet onOpenChange={(open) => !open && onClose()} open={!!user}>
			<SheetContent className="flex flex-col gap-4">
				<SheetHeader>
					<SheetTitle>{user ? `Aprovar ${user.name}` : ""}</SheetTitle>
				</SheetHeader>
				{user && (
					<>
						<div className="flex flex-col gap-1">
							<Label className="text-xs uppercase">Email</Label>
							<span className="text-sm">{user.email}</span>
						</div>
						<div className="flex flex-col gap-2">
							<Label>Role</Label>
							<RoleSelect
								allowedRoles={allowed}
								disabled={submitting}
								onChange={setRole}
								value={role}
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label>Filiais</Label>
							<BranchesCombobox
								branches={branches}
								disabled={submitting || role === "super_admin"}
								onChange={setBranchIds}
								value={branchIds}
							/>
						</div>
						<div className="mt-auto flex gap-2">
							<Button disabled={submitting} onClick={handleApprove}>
								Aprovar
							</Button>
							<Button
								disabled={submitting}
								onClick={handleReject}
								variant="destructive"
							>
								Rejeitar
							</Button>
							<SheetClose
								disabled={submitting}
								render={<Button variant="ghost">Cancelar</Button>}
							/>
						</div>
					</>
				)}
			</SheetContent>
		</Sheet>
	);
}
