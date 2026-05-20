"use client";

import { Button } from "@emach/ui/components/button";
import { Building2, Pencil } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { EntityIdentityHeader } from "@/components/entity/entity-identity-header";
import type { BranchDetail } from "../../data";

export function BranchIdentity({
	detail,
	badges,
}: {
	detail: BranchDetail;
	badges?: ReactNode;
}) {
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
			avatarFallback={<Building2 aria-hidden className="size-5" />}
			badges={badges}
			subtitle={detail.address ?? detail.phone ?? undefined}
			title={detail.name}
		/>
	);
}
