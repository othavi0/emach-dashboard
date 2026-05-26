import { buttonVariants } from "@emach/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import Link from "next/link";

import { ActivityFeed } from "@/components/activity-feed";
import { PendingPanel, type PendingTab } from "@/components/pending-panel";
import { requireCurrentSession } from "@/lib/session";
import {
	fetchDashboardActivity,
	fetchDashboardCounts,
	fetchPendingOrders,
	fetchPendingReviews,
	fetchPendingStock,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
	const session = await requireCurrentSession();
	const [counts, stock, orders, reviews, activity] = await Promise.all([
		fetchDashboardCounts(),
		fetchPendingStock(null),
		fetchPendingOrders(null),
		fetchPendingReviews(null),
		fetchDashboardActivity(null),
	]);

	const tabs: PendingTab[] = [
		{
			id: "stock",
			label: "Estoque",
			count: counts.stock,
			role: "warning",
			initial: stock.items,
			initialCursor: stock.nextCursor,
			fetchPage: fetchPendingStock,
		},
		{
			id: "orders",
			label: "Pedidos",
			count: counts.orders,
			role: "info",
			initial: orders.items,
			initialCursor: orders.nextCursor,
			fetchPage: fetchPendingOrders,
		},
		{
			id: "reviews",
			label: "Moderação",
			count: counts.reviews,
			role: "warning",
			initial: reviews.items,
			initialCursor: reviews.nextCursor,
			fetchPage: fetchPendingReviews,
		},
	];

	return (
		<main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-8">
			<section className="flex flex-col gap-2 pb-10">
				<p className="text-muted-foreground text-sm">Painel</p>
				<h1 className="font-medium font-serif text-4xl tracking-tight">
					Olá, {session.user.name?.split(" ")[0] ?? "admin"}
				</h1>
				<p className="max-w-3xl text-muted-foreground text-sm">
					Visão operacional. Esquerda: o que precisa ação. Direita: o que
					aconteceu.
				</p>
			</section>

			<section className="-mx-6 grid min-w-0 gap-4 border-border border-y bg-muted/50 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
				<PendingPanel compact tabs={tabs} />
				<div className="relative min-h-[18rem] min-w-0">
					<div className="absolute inset-0">
						<ActivityFeed
							fetchPage={fetchDashboardActivity}
							initialCursor={activity.nextCursor}
							initialEvents={activity.items}
						/>
					</div>
				</div>
			</section>

			<section className="pt-10">
				<Card>
					<CardHeader>
						<CardTitle>Atalhos operacionais</CardTitle>
						<CardDescription>
							Entradas rápidas para as telas mais usadas no dia a dia.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
							{QUICK_ACTIONS.map((action) => (
								<Link
									className={`${buttonVariants({
										variant: action.variant,
									})} h-10 w-full justify-start`}
									href={action.href}
									key={action.href}
								>
									{action.label}
								</Link>
							))}
						</div>
					</CardContent>
				</Card>
			</section>
		</main>
	);
}

const QUICK_ACTIONS = [
	{
		href: "/dashboard/tools",
		label: "Abrir ferramentas",
		variant: "secondary",
	},
	{ href: "/dashboard/stock", label: "Estoque geral", variant: "secondary" },
	{
		href: "/dashboard/stock/branches",
		label: "Estoque por filiais",
		variant: "secondary",
	},
	{ href: "/dashboard/branches", label: "Filiais", variant: "ghost" },
	{ href: "/dashboard/suppliers", label: "Fornecedores", variant: "ghost" },
	{ href: "/dashboard/categories", label: "Categorias", variant: "ghost" },
] as const;
