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
import { PromotionsFilters } from "./_components/promotions-filters";
import { PromotionsTable } from "./_components/promotions-table";
import { listPromotions } from "./actions";

interface PageProps {
	searchParams: Promise<{
		type?: string;
		search?: string;
	}>;
}

export const dynamic = "force-dynamic";

export default async function PromotionsPage({ searchParams }: PageProps) {
	const session = await requireCurrentSession();
	const role = session.user.role ?? "user";
	const canMutate = role === "admin";

	const params = await searchParams;
	const rawType = params.type;
	const search = params.search ?? "";

	const typeFilter =
		rawType === "promotion" || rawType === "promocode" ? rawType : "all";

	const promotions = await listPromotions({
		type: typeFilter,
		search: search || undefined,
	});

	const hasFilters = Boolean(rawType || search);
	const isEmpty = promotions.length === 0;

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="font-serif text-2xl">Promoções</h1>
					<p className="text-muted-foreground text-sm">
						Gerencie promoções automáticas e cupons aplicados a ferramentas
						específicas.
					</p>
				</div>
				{canMutate && (
					<Link
						className={buttonVariants({ variant: "default" })}
						href="/dashboard/promotions/new"
					>
						Nova promoção
					</Link>
				)}
			</div>

			<PromotionsFilters initialSearch={search} initialType={typeFilter} />

			{isEmpty ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>
							{hasFilters
								? "Nenhuma promoção encontrada para os filtros aplicados"
								: "Nenhuma promoção cadastrada"}
						</EmptyTitle>
						{!hasFilters && (
							<EmptyDescription>
								Comece cadastrando a primeira promoção ou código promocional.
							</EmptyDescription>
						)}
					</EmptyHeader>
					<EmptyContent>
						{hasFilters ? (
							<Link
								className={buttonVariants({ variant: "ghost" })}
								href="/dashboard/promotions"
							>
								Limpar filtros
							</Link>
						) : (
							canMutate && (
								<Link
									className={buttonVariants({ variant: "default" })}
									href="/dashboard/promotions/new"
								>
									Nova promoção
								</Link>
							)
						)}
					</EmptyContent>
				</Empty>
			) : (
				<PromotionsTable canMutate={canMutate} promotions={promotions} />
			)}
		</div>
	);
}
