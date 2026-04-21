import { buttonVariants } from "@emach/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@emach/ui/components/empty";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireCurrentSession } from "@/lib/session";
import { BranchStockTable } from "../../../(inventory)/stock/_components/branch-stock-table";
import { fetchBranchStockRows } from "../../../(inventory)/stock/branch-stock-data";
import { getBranch } from "../../actions";

interface BranchStockPageProps {
	params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function BranchStockPage({ params }: BranchStockPageProps) {
	const session = await requireCurrentSession();
	const canMutate = (session.user.role ?? "user") === "admin";
	const { id } = await params;
	const branch = await getBranch(id);

	if (!branch) {
		notFound();
	}

	const rows = await fetchBranchStockRows({ branchId: branch.id });

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h1 className="font-serif text-2xl">Estoque: {branch.name}</h1>
					<p className="text-muted-foreground text-sm">
						Estoque local da filial. Use esta tela quando a operação começar
						pela unidade.
					</p>
				</div>
				<div className="flex gap-2">
					<Link
						className={buttonVariants({ variant: "ghost" })}
						href="/dashboard/branches"
					>
						Voltar para filiais
					</Link>
					<Link
						className={buttonVariants({ variant: "secondary" })}
						href={`/dashboard/stock/branches?branch=${branch.id}`}
					>
						Ver nas tabs
					</Link>
				</div>
			</div>

			{rows.length === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>Nenhuma ferramenta cadastrada</EmptyTitle>
						<EmptyDescription>
							Crie ferramentas para começar a acompanhar o estoque desta filial.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Link
							className={buttonVariants({ variant: "default" })}
							href="/dashboard/tools/new"
						>
							Nova ferramenta
						</Link>
					</EmptyContent>
				</Empty>
			) : (
				<BranchStockTable
					branchId={branch.id}
					branchName={branch.name}
					canMutate={canMutate}
					rows={rows}
				/>
			)}
		</div>
	);
}
