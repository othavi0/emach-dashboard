import { buttonVariants } from "@emach/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@emach/ui/components/empty";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { requireCurrentSession } from "@/lib/session";
import { BranchesInfinite } from "./_components/branches-infinite";
import { type BranchesFiltersInput, fetchBranchesPage } from "./actions";

export const dynamic = "force-dynamic";

export default async function BranchesPage() {
	const session = await requireCurrentSession();
	const role = session.user.role ?? "user";
	const canMutate = role === "admin";

	const filters: BranchesFiltersInput = { sort: "newest" };
	const first = await fetchBranchesPage({ filters, cursor: null });
	const isEmpty = first.items.length === 0;

	return (
		<>
			<PageHeader
				action={
					canMutate ? (
						<Link
							className={buttonVariants({ variant: "default" })}
							href="/dashboard/branches/new"
						>
							Nova filial
						</Link>
					) : null
				}
				description="Gerencie as filiais que recebem estoque e aparecem em ajustes de inventário."
				title="Filiais"
			/>

			{isEmpty ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>Nenhuma filial cadastrada</EmptyTitle>
						<EmptyDescription>
							Comece cadastrando a primeira filial para habilitar o controle de
							estoque por localização.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						{canMutate && (
							<Link
								className={buttonVariants({ variant: "default" })}
								href="/dashboard/branches/new"
							>
								Nova filial
							</Link>
						)}
					</EmptyContent>
				</Empty>
			) : (
				<BranchesInfinite
					canMutate={canMutate}
					filters={filters}
					initial={first.items}
					initialCursor={first.nextCursor}
				/>
			)}
		</>
	);
}
