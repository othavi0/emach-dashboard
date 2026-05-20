import { db } from "@emach/db";
import { user as userTable } from "@emach/db/schema/auth";
import { branch, userBranch } from "@emach/db/schema/inventory";
import { asc, eq, sql } from "drizzle-orm";

import { requireCapabilityOrRedirect } from "@/lib/permissions";
import { UsersTabs } from "./_components/users-tabs";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
	await requireCapabilityOrRedirect("users.approve");

	const usersRaw = await db
		.select({
			id: userTable.id,
			name: userTable.name,
			email: userTable.email,
			role: userTable.role,
			status: userTable.status,
			createdAt: userTable.createdAt,
			branchIds: sql<string[]>`coalesce(
				array_agg(${userBranch.branchId}) filter (where ${userBranch.branchId} is not null),
				'{}'
			)`,
		})
		.from(userTable)
		.leftJoin(userBranch, eq(userBranch.userId, userTable.id))
		.groupBy(userTable.id)
		.orderBy(asc(userTable.createdAt));

	const branches = await db
		.select({ id: branch.id, name: branch.name })
		.from(branch)
		.orderBy(asc(branch.name));

	return (
		<div className="flex flex-col gap-6">
			<header>
				<h1 className="font-normal font-serif text-3xl tracking-tight">
					Usuários do dashboard
				</h1>
				<p className="text-muted-foreground text-sm">
					Aprovar pendentes, gerenciar permissões e vinculação por filial.
				</p>
			</header>
			<UsersTabs branches={branches} users={usersRaw} />
		</div>
	);
}
