"use client";

import { Badge } from "@emach/ui/components/badge";
import { Button } from "@emach/ui/components/button";
import { useState } from "react";

import { EditSheet } from "./edit-sheet";
import { ROLE_LABELS } from "./role-labels";
import type { BranchLite, UserRow } from "./types";

const ROLE_BADGE: Record<UserRow["role"], "default" | "info" | "secondary"> = {
	super_admin: "default",
	admin: "default",
	manager: "info",
	user: "secondary",
};

interface Props {
	branches: BranchLite[];
	users: UserRow[];
}

export function ActiveTable({ users, branches }: Props) {
	const [selected, setSelected] = useState<UserRow | null>(null);
	const branchById = new Map(branches.map((b) => [b.id, b.name]));

	if (users.length === 0) {
		return (
			<p className="py-12 text-center text-muted-foreground text-sm">
				Nenhum user ativo.
			</p>
		);
	}

	return (
		<>
			<table className="w-full text-sm">
				<thead className="text-muted-foreground text-xs uppercase">
					<tr>
						<th className="py-2 text-left">Nome</th>
						<th className="text-left">Email</th>
						<th className="text-left">Role</th>
						<th className="text-left">Filiais</th>
						<th />
					</tr>
				</thead>
				<tbody>
					{users.map((u) => (
						<tr className="border-border border-t" key={u.id}>
							<td className="py-2">{u.name}</td>
							<td>{u.email}</td>
							<td>
								<Badge variant={ROLE_BADGE[u.role]}>
									{ROLE_LABELS[u.role]}
								</Badge>
							</td>
							<td className="text-xs">
								{u.branchIds.length > 0
									? u.branchIds.map((id) => branchById.get(id) ?? id).join(", ")
									: "—"}
							</td>
							<td className="text-right">
								<Button
									onClick={() => setSelected(u)}
									size="sm"
									variant="ghost"
								>
									Editar →
								</Button>
							</td>
						</tr>
					))}
				</tbody>
			</table>
			<EditSheet
				branches={branches}
				onClose={() => setSelected(null)}
				user={selected}
			/>
		</>
	);
}
