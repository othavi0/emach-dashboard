"use client";

import { Badge } from "@emach/ui/components/badge";
import { Button } from "@emach/ui/components/button";
import { ExternalLink, Factory, Pencil } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { EntityIdentityHeader } from "@/components/entity/entity-identity-header";
import type { SupplierDetail } from "../../data";

export function SupplierIdentity({ detail }: { detail: SupplierDetail }) {
	const router = useRouter();
	const pathname = usePathname();
	const params = useSearchParams();

	const handleEdit = () => {
		const sp = new URLSearchParams(params);
		sp.set("edit", "1");
		router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
	};

	const badges = detail.website ? (
		<a href={detail.website} rel="noopener noreferrer" target="_blank">
			<Badge className="flex items-center gap-1" variant="outline">
				<ExternalLink aria-hidden className="size-3" />
				Website
			</Badge>
		</a>
	) : undefined;

	return (
		<EntityIdentityHeader
			actions={
				<Button onClick={handleEdit} size="sm" variant="outline">
					<Pencil aria-hidden className="mr-1.5 size-3.5" />
					Editar
				</Button>
			}
			avatarFallback={<Factory aria-hidden className="size-5" />}
			badges={badges}
			subtitle={detail.contactEmail ?? detail.phone ?? undefined}
			title={detail.name}
		/>
	);
}
