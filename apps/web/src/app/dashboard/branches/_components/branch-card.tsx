"use client";

import { buttonVariants } from "@emach/ui/components/button";
import { Boxes } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatBranchAddress } from "@/lib/format/branch";

import type { BranchTableRow } from "../data";
import { BranchStatsCard } from "./branch-stats-card";

interface BranchCardProps {
	branch: BranchTableRow;
	canManage: boolean;
}

export function BranchCard({ branch, canManage }: BranchCardProps) {
	const router = useRouter();
	const detailHref = `/dashboard/branches/${branch.id}`;
	const stockHref = `/dashboard/branches/${branch.id}?tab=stock`;
	const primaryHref = canManage ? detailHref : stockHref;

	return (
		<BranchStatsCard
			address={formatBranchAddress(branch)}
			headerAction={
				canManage ? (
					<Link
						aria-label={`Ver estoque de ${branch.name}`}
						className={`${buttonVariants({
							size: "icon-sm",
							variant: "ghost",
						})} shrink-0 border border-border bg-muted`}
						href={stockHref}
						onClick={(e) => e.stopPropagation()}
					>
						<Boxes aria-hidden className="size-4" />
					</Link>
				) : undefined
			}
			name={branch.name}
			onActivate={() => router.push(primaryHref)}
			stats={[
				{ label: "Equipe", value: branch.teamCount },
				{ label: "SKUs ativos", value: branch.activeSkus },
				{ amber: true, label: "Abaixo mín.", value: branch.lowStock },
			]}
			status={branch.status}
		/>
	);
}
