"use client";

import { Button } from "@emach/ui/components/button";
import { useState } from "react";

import { ApprovalSheet } from "./approval-sheet";
import type { BranchLite, UserRow } from "./types";

interface Props {
	branches: BranchLite[];
	users: UserRow[];
}

export function PendingTable({ users, branches }: Props) {
	const [selected, setSelected] = useState<UserRow | null>(null);

	if (users.length === 0) {
		return (
			<p className="py-12 text-center text-muted-foreground text-sm">
				Nenhum pendente no momento.
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
						<th className="text-left">Solicitado</th>
						<th />
					</tr>
				</thead>
				<tbody>
					{users.map((u) => (
						<tr className="border-border border-t" key={u.id}>
							<td className="py-2">{u.name}</td>
							<td>{u.email}</td>
							<td>{u.createdAt.toLocaleDateString("pt-BR")}</td>
							<td className="text-right">
								<Button
									onClick={() => setSelected(u)}
									size="sm"
									variant="ghost"
								>
									Revisar →
								</Button>
							</td>
						</tr>
					))}
				</tbody>
			</table>
			<ApprovalSheet
				branches={branches}
				onClose={() => setSelected(null)}
				user={selected}
			/>
		</>
	);
}
