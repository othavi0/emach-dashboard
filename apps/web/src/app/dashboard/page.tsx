import { db } from "@emach/db";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { buttonVariants } from "@emach/ui/components/button";
import { sql } from "drizzle-orm";
import Link from "next/link";

import { requireCurrentSession } from "@/lib/session";

interface InventoryStats extends Record<string, number> {
	branches_total: number;
	categories_total: number;
	stock_total: number;
	suppliers_total: number;
	tools_hidden: number;
	tools_total: number;
	tools_visible: number;
}

async function fetchInventoryStats(): Promise<InventoryStats> {
	const result = await db.execute<InventoryStats>(sql`
		SELECT
			(SELECT COUNT(*)::int FROM tool) AS tools_total,
			(SELECT COUNT(*)::int FROM tool WHERE visible_on_site = true) AS tools_visible,
			(SELECT COUNT(*)::int FROM tool WHERE visible_on_site = false) AS tools_hidden,
			(SELECT COALESCE(SUM(quantity), 0)::int FROM stock_level) AS stock_total,
			(SELECT COUNT(*)::int FROM category) AS categories_total,
			(SELECT COUNT(*)::int FROM supplier) AS suppliers_total,
			(SELECT COUNT(*)::int FROM branch) AS branches_total
	`);
	return result.rows[0];
}

export default async function DashboardPage() {
	const session = await requireCurrentSession();
	const stats = await fetchInventoryStats();

	return (
		<main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8">
			<section className="flex flex-col gap-2">
				<p className="text-muted-foreground text-sm">Painel</p>
				<h1 className="font-serif text-2xl">
					Olá, {session.user.name?.split(" ")[0] ?? "admin"}
				</h1>
				<p className="max-w-3xl text-muted-foreground text-sm">
					Visão geral do inventário da E-mach Ferramentas. Use a navegação
					lateral para gerenciar o catálogo, o estoque e as configurações.
				</p>
			</section>

			<section className="grid gap-4 md:grid-cols-4">
				<StatCard
					description={`${stats.tools_visible} visíveis · ${stats.tools_hidden} ocultas`}
					href="/dashboard/tools"
					title="Ferramentas"
					value={stats.tools_total}
				/>
				<StatCard
					description="Soma em todas as filiais"
					href="/dashboard/stock"
					title="Estoque total"
					value={stats.stock_total}
				/>
				<StatCard
					description="Cadastradas"
					href="/dashboard/categories"
					title="Categorias"
					value={stats.categories_total}
				/>
				<StatCard
					description="Cadastrados"
					href="/dashboard/suppliers"
					title="Fornecedores"
					value={stats.suppliers_total}
				/>
			</section>

			<section>
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

			<section className="grid gap-4 lg:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>
							<Link className="hover:underline" href="/dashboard/branches">
								Filiais
							</Link>
						</CardTitle>
						<CardDescription>
							{stats.branches_total} filial(is) registrada(s).
						</CardDescription>
					</CardHeader>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>Sessão</CardTitle>
						<CardDescription>{session.user.email}</CardDescription>
					</CardHeader>
				</Card>
			</section>
		</main>
	);
}

function StatCard({
	title,
	value,
	description,
	href,
}: {
	description: string;
	href: string;
	title: string;
	value: number;
}) {
	return (
		<Link className="block h-full" href={href}>
			<Card className="h-full transition-colors hover:border-primary/40">
				<CardHeader>
					<CardDescription>{title}</CardDescription>
					<CardTitle className="font-serif text-3xl">{value}</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-muted-foreground text-xs">{description}</p>
				</CardContent>
			</Card>
		</Link>
	);
}

const QUICK_ACTIONS = [
	{ href: "/dashboard/tools", label: "Abrir ferramentas", variant: "secondary" },
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
