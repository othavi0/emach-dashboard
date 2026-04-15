import { buttonVariants } from "@emach/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@emach/ui/components/empty";
import Link from "next/link";

import { requireCurrentSession } from "@/lib/session";
import { BranchesTable, type BranchRow } from "./_components/branches-table";
import { listBranches } from "./actions";

export const dynamic = "force-dynamic";

export default async function BranchesPage() {
	const session = await requireCurrentSession();
	const role = session.user.role ?? "user";
	const canMutate = role === "admin";

	const rows = await listBranches();
	const branches: BranchRow[] = rows.map((b) => ({
		id: b.id,
		name: b.name,
		address: b.address,
		createdAt: b.createdAt,
	}));

	const isEmpty = branches.length === 0;

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="font-serif text-2xl">Filiais</h1>
					<p className="text-muted-foreground text-sm">
						Gerencie as filiais que recebem estoque e aparecem em ajustes de
						inventário.
					</p>
				</div>
				{canMutate && (
					<Link
						className={buttonVariants({ variant: "default" })}
						href="/dashboard/branches/new"
					>
						Nova filial
					</Link>
				)}
			</div>

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
				<BranchesTable branches={branches} canMutate={canMutate} />
			)}
		</div>
	);
}
