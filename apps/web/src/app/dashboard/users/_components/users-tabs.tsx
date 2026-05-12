"use client";

import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@emach/ui/components/tabs";

import { ActiveTable } from "./active-table";
import { PendingTable } from "./pending-table";
import { SuspendedTable } from "./suspended-table";
import type { BranchLite, UserRow } from "./types";

interface Props {
	branches: BranchLite[];
	users: UserRow[];
}

export function UsersTabs({ users, branches }: Props) {
	const pending = users.filter((u) => u.status === "pending");
	const active = users.filter((u) => u.status === "active");
	const suspended = users.filter((u) => u.status === "suspended");

	return (
		<Tabs defaultValue="active">
			<TabsList>
				<TabsTrigger value="active">Ativos · {active.length}</TabsTrigger>
				<TabsTrigger value="pending">
					Pendentes
					{pending.length > 0 && (
						<span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-primary-foreground text-xs">
							{pending.length}
						</span>
					)}
				</TabsTrigger>
				<TabsTrigger value="suspended">
					Suspensos · {suspended.length}
				</TabsTrigger>
			</TabsList>
			<TabsContent value="active">
				<ActiveTable branches={branches} users={active} />
			</TabsContent>
			<TabsContent value="pending">
				<PendingTable branches={branches} users={pending} />
			</TabsContent>
			<TabsContent value="suspended">
				<SuspendedTable branches={branches} users={suspended} />
			</TabsContent>
		</Tabs>
	);
}
