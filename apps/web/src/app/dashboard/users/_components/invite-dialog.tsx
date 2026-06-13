"use client";

import { Button } from "@emach/ui/components/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@emach/ui/components/dialog";
import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import { UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { notify } from "@/lib/notify";

import { allowedApprovalRoles } from "../_lib/approval-roles";
import { inviteUser } from "../actions";
import { BranchesCombobox } from "./branches-combobox";
import { RoleSelect } from "./role-select";
import type { BranchLite, UserRow } from "./types";

interface Props {
	actorRole: UserRow["role"];
	branches: BranchLite[];
}

export function InviteDialog({ actorRole, branches }: Props) {
	const router = useRouter();
	const allowed = allowedApprovalRoles(actorRole);
	const [open, setOpen] = useState(false);
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<UserRow["role"]>(allowed.at(-1) ?? "user");
	const [branchIds, setBranchIds] = useState<string[]>([]);
	const [submitting, startTransition] = useTransition();

	function reset() {
		setEmail("");
		setRole(allowed.at(-1) ?? "user");
		setBranchIds([]);
	}

	function handleSubmit() {
		startTransition(async () => {
			const result = await inviteUser({ email, role, branchIds });
			if (result.ok) {
				notify.success("Convite enviado");
				reset();
				setOpen(false);
				router.refresh();
			} else {
				notify.error(result.error);
			}
		});
	}

	return (
		<Dialog
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) {
					reset();
				}
			}}
			open={open}
		>
			<DialogTrigger
				render={
					<Button size="sm">
						<UserPlus aria-hidden className="mr-1.5 size-4" />
						Convidar usuário
					</Button>
				}
			/>
			<DialogContent className="flex flex-col gap-4">
				<DialogHeader>
					<DialogTitle>Convidar usuário</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col gap-2">
					<Label htmlFor="invite-email">Email</Label>
					<Input
						id="invite-email"
						onChange={(e) => setEmail(e.target.value)}
						placeholder="pessoa@emach.com.br"
						type="email"
						value={email}
					/>
				</div>
				<div className="flex flex-col gap-2">
					<Label>Cargo</Label>
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
				<DialogFooter>
					<DialogClose
						disabled={submitting}
						render={<Button variant="ghost">Cancelar</Button>}
					/>
					<Button disabled={submitting || !email} onClick={handleSubmit}>
						{submitting ? "Enviando..." : "Enviar convite"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
