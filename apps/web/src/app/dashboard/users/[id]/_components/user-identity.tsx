"use client";

import { Button } from "@emach/ui/components/button";
import { Pencil } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { EntityIdentityHeader } from "@/components/entity/entity-identity-header";

import { RoleBadge } from "../../_components/role-badge";
import { StatusBadge } from "../../_components/status-badge";
import type { UserDetail } from "../../data";

function getInitials(name: string): string {
	return name
		.split(" ")
		.filter(Boolean)
		.slice(0, 2)
		.map((w) => w[0]?.toUpperCase() ?? "")
		.join("");
}

export function UserIdentity({ user }: { user: UserDetail }) {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();

	const handleEdit = () => {
		const sp = new URLSearchParams(params);
		sp.set("edit", "1");
		router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
	};

	return (
		<EntityIdentityHeader
			actions={
				<Button onClick={handleEdit} size="sm" variant="outline">
					<Pencil aria-hidden className="mr-1.5 size-3.5" />
					Editar
				</Button>
			}
			avatarFallback={getInitials(user.name)}
			avatarUrl={user.image}
			badges={
				<>
					<RoleBadge role={user.role} />
					<StatusBadge status={user.status} />
				</>
			}
			subtitle={user.email}
			title={user.name}
		/>
	);
}
