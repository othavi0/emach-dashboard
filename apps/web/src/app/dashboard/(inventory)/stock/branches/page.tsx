import { buttonVariants } from "@emach/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "@emach/ui/components/empty";
import { Input } from "@emach/ui/components/input";
import { Tabs, TabsList, TabsTrigger } from "@emach/ui/components/tabs";
import Link from "next/link";

import { listBranches } from "@/app/dashboard/branches/actions";
import { requireCurrentSession } from "@/lib/session";
import { BranchStockTable } from "../_components/branch-stock-table";
import { fetchBranchStockRows } from "../branch-stock-data";

export const dynamic = "force-dynamic";

interface BranchesStockPageProps {
	searchParams: Promise<{
		branch?: string;
		search?: string;
	}>;
}

function branchHref(branchId: string, search?: string): string {
	const params = new URLSearchParams({ branch: branchId });
	if (search) {
		params.set("search", search);
	}
	return `/dashboard/stock/branches?${params.toString()}`;
}

export default async function BranchesStockPage({
	searchParams,
}: BranchesStockPageProps) {
	const session = await requireCurrentSession();
	const canMutate = (session.user.role ?? "user") === "admin";
	const params = await searchParams;
	const branches = await listBranches();

	if (branches.length === 0) {
		return (
			<div className="flex flex-col gap-6">
				<div>
					<h1 className="font-serif text-2xl">Estoque por Filiais</h1>
					<p className="text-muted-foreground text-sm">
						Consulte o estoque local de cada filial.
					</p>
				</div>
				<Empty>
					<EmptyHeader>
						<EmptyTitle>Nenhuma filial cadastrada</EmptyTitle>
						<EmptyDescription>
							Cadastre uma filial para acompanhar estoque separado por unidade.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Link
							className={buttonVariants({ variant: "default" })}
							href="/dashboard/branches/new"
						>
							Nova filial
						</Link>
					</EmptyContent>
				</Empty>
			</div>
		);
	}

	const selectedBranch =
		branches.find((branch) => branch.id === params.branch) ?? branches[0];
	const search = params.search?.trim() ?? "";
	const rows = await fetchBranchStockRows({
		branchId: selectedBranch.id,
		search: search || undefined,
	});

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h1 className="font-serif text-2xl">Estoque por Filiais</h1>
				<p className="text-muted-foreground text-sm">
					Selecione uma filial para ver e ajustar o estoque local de cada
					ferramenta.
				</p>
			</div>

			<Tabs value={selectedBranch.id}>
				<TabsList className="max-w-full overflow-x-auto">
					{branches.map((branch) => (
						<TabsTrigger
							key={branch.id}
							nativeButton={false}
							render={
								<Link href={branchHref(branch.id, search)}>{branch.name}</Link>
							}
							value={branch.id}
						/>
					))}
				</TabsList>
			</Tabs>

			<form action="/dashboard/stock/branches" className="flex max-w-md gap-2">
				<input name="branch" type="hidden" value={selectedBranch.id} />
				<Input
					defaultValue={search}
					name="search"
					placeholder="Buscar ferramenta ou SKU nesta filial"
				/>
				<button
					className={buttonVariants({ variant: "secondary" })}
					type="submit"
				>
					Buscar
				</button>
			</form>

			<div className="flex items-center justify-between gap-4">
				<div>
					<h2 className="font-serif text-lg">{selectedBranch.name}</h2>
					<p className="text-muted-foreground text-sm">
						{rows.length} ferramenta{rows.length === 1 ? "" : "s"} listada
						{rows.length === 1 ? "" : "s"} nesta filial.
					</p>
				</div>
				<Link
					className={buttonVariants({ variant: "ghost" })}
					href={`/dashboard/branches/${selectedBranch.id}/stock`}
				>
					Abrir rota da filial
				</Link>
			</div>

			{rows.length === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>Nenhuma ferramenta encontrada</EmptyTitle>
						<EmptyDescription>
							Tente ajustar a busca ou limpe o filtro aplicado.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Link
							className={buttonVariants({ variant: "ghost" })}
							href={branchHref(selectedBranch.id)}
						>
							Limpar busca
						</Link>
					</EmptyContent>
				</Empty>
			) : (
				<BranchStockTable
					branchId={selectedBranch.id}
					branchName={selectedBranch.name}
					canMutate={canMutate}
					rows={rows}
				/>
			)}
		</div>
	);
}
