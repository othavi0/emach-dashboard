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

interface Props {
	extraActions?: React.ReactNode;
	user: UserDetail;
}

export function UserIdentity({ user, extraActions }: Props) {
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
				<div className="flex items-center gap-2">
					<Button onClick={handleEdit} size="sm" variant="outline">
						<Pencil aria-hidden className="mr-1.5 size-3.5" />
						Editar
					</Button>
					{extraActions}
				</div>
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
