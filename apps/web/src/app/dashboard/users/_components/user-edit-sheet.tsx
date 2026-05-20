"use client";

import { Input } from "@emach/ui/components/input";
import { Label } from "@emach/ui/components/label";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { EntityEditSheet } from "@/components/entity/entity-edit-sheet";
import {
	type FormIssue,
	zodIssuesToFormIssues,
} from "@/components/form-error-panel";

import { updateUser } from "../actions";
import { updateUserSchema } from "../schema";
import { BranchesCombobox } from "./branches-combobox";
import type { Role } from "./role-labels";
import { RoleSelect } from "./role-select";
import type { BranchLite, UserRow } from "./types";

const ALL_ROLES: Role[] = ["super_admin", "admin", "manager", "user"];

interface Props {
	branches: BranchLite[];
	user: {
		id: string;
		name: string;
		role: UserRow["role"];
		branchIds: string[];
	};
}

export function UserEditSheet({ user, branches }: Props) {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();
	const open = params.get("edit") === "1";

	const [name, setName] = useState(user.name);
	const [role, setRole] = useState<UserRow["role"]>(user.role);
	const [branchIds, setBranchIds] = useState<string[]>(user.branchIds);
	const [issues, setIssues] = useState<FormIssue[]>([]);
	const [submitting, startTransition] = useTransition();

	useEffect(() => {
		if (open) {
			setName(user.name);
			setRole(user.role);
			setBranchIds(user.branchIds);
			setIssues([]);
		}
	}, [open, user]);

	const close = () => {
		const sp = new URLSearchParams(params);
		sp.delete("edit");
		const qs = sp.toString();
		router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
	};

	const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const parsed = updateUserSchema.safeParse({
			userId: user.id,
			name,
			role,
			branchIds,
		});
		if (!parsed.success) {
			setIssues(
				zodIssuesToFormIssues(parsed.error, {
					name: "Nome",
					role: "Cargo",
					branchIds: "Filiais",
				})
			);
			return;
		}
		startTransition(async () => {
			const res = await updateUser(parsed.data);
			if (res.ok) {
				toast.success("Usuário atualizado");
				close();
			} else {
				toast.error(res.error);
			}
		});
	};

	return (
		<EntityEditSheet
			description="Atualize nome, cargo e filiais"
			issues={issues}
			onOpenChange={(v) => !v && close()}
			onSubmit={handleSubmit}
			open={open}
			submitting={submitting}
			title={`Editar ${user.name}`}
		>
			<div className="flex flex-col gap-4">
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="user-name">Nome</Label>
					<Input
						id="user-name"
						onChange={(e) => setName(e.target.value)}
						value={name}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label>Cargo</Label>
					<RoleSelect
						allowedRoles={ALL_ROLES}
						onChange={setRole}
						value={role}
					/>
				</div>
				<div className="flex flex-col gap-1.5">
					<Label>Filiais</Label>
					<BranchesCombobox
						branches={branches}
						onChange={setBranchIds}
						value={branchIds}
					/>
				</div>
			</div>
		</EntityEditSheet>
	);
}
