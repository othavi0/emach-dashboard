"use client";

import { Button } from "@emach/ui/components/button";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { reactivateUser } from "../actions";
import { EditSheet } from "./edit-sheet";
import type { BranchLite, UserRow } from "./types";

interface Props {
	branches: BranchLite[];
	users: UserRow[];
}

export function SuspendedTable({ users, branches }: Props) {
	const [selected, setSelected] = useState<UserRow | null>(null);
	const [pendingId, setPendingId] = useState<string | null>(null);
	const [, startTransition] = useTransition();

	function handleReactivate(userId: string) {
		setPendingId(userId);
		startTransition(async () => {
			const result = await reactivateUser({ userId });
			setPendingId(null);
			if (result.ok) {
				toast.success("Usuário reativado");
			} else {
				toast.error(result.error);
			}
		});
	}

	if (users.length === 0) {
		return (
			<p className="py-12 text-center text-muted-foreground text-sm">
				Nenhum user suspenso.
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
						<th />
					</tr>
				</thead>
				<tbody>
					{users.map((u) => (
						<tr className="border-border border-t" key={u.id}>
							<td className="py-2">{u.name}</td>
							<td>{u.email}</td>
							<td className="flex justify-end gap-2 py-2">
								<Button
									disabled={pendingId === u.id}
									onClick={() => handleReactivate(u.id)}
									size="sm"
									variant="outline"
								>
									Reativar
								</Button>
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
