import { db } from "@emach/db";
import { branch } from "@emach/db/schema/inventory";
import { asc } from "drizzle-orm";
import { Activity, Briefcase, Lock, Monitor, User } from "lucide-react";
import { notFound } from "next/navigation";
import type { EntityTab } from "@/components/entity/entity-tabs";
import { EntityTabs } from "@/components/entity/entity-tabs";
import { requireCapabilityOrRedirect } from "@/lib/permissions";

import { UserEditSheet } from "../_components/user-edit-sheet";
import { getUserDetail } from "../data";
import { ActivityTab } from "./_components/activity-tab";
import { BranchesTab } from "./_components/branches-tab";
import { ProfileTab } from "./_components/profile-tab";
import { SecurityTab } from "./_components/security-tab";
import { SessionsTab } from "./_components/sessions-tab";
import { UserIdentity } from "./_components/user-identity";

interface PageProps {
	params: Promise<{ id: string }>;
}

export default async function UserDetailPage({ params }: PageProps) {
	await requireCapabilityOrRedirect("users.manage");

	const { id } = await params;

	const [user, availableBranches] = await Promise.all([
		getUserDetail(id),
		db
			.select({ id: branch.id, name: branch.name })
			.from(branch)
			.orderBy(asc(branch.name)),
	]);

	if (!user) {
		notFound();
	}

	const tabs: EntityTab[] = [
		{
			value: "profile",
			label: "Perfil",
			icon: User,
			content: <ProfileTab user={user} />,
		},
		{
			value: "branches",
			label: "Filiais",
			icon: Briefcase,
			content: (
				<BranchesTab availableBranches={availableBranches} user={user} />
			),
		},
		{
			value: "activity",
			label: "Atividade",
			icon: Activity,
			content: <ActivityTab userId={user.id} />,
		},
		{
			value: "sessions",
			label: "Sessões",
			icon: Monitor,
			content: <SessionsTab userId={user.id} />,
		},
		{
			value: "security",
			label: "Segurança",
			icon: Lock,
			content: <SecurityTab user={user} />,
		},
	];

	return (
		<div className="flex flex-col gap-6 p-6">
			<UserIdentity user={user} />
			<EntityTabs defaultValue="profile" tabs={tabs} />
			<UserEditSheet
				branches={availableBranches}
				user={{
					id: user.id,
					name: user.name,
					role: user.role,
					branchIds: user.branchIds,
				}}
			/>
		</div>
	);
}
