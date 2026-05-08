import { db } from "@emach/db";
import { toDate } from "@emach/db/utils";
import { buttonVariants } from "@emach/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { sql } from "drizzle-orm";
import Link from "next/link";

import { type ActivityEvent, ActivityFeed } from "@/components/activity-feed";
import { type PendingGroup, PendingList } from "@/components/pending-list";
import { requireCurrentSession } from "@/lib/session";

export const dynamic = "force-dynamic";

interface PendingCounts extends Record<string, number> {
	items_to_reorder: number;
	orders_paid: number;
	orders_preparing: number;
	orders_shipped: number;
	reviews_pending: number;
	stock_zero: number;
}

interface ActivityRow extends Record<string, unknown> {
	created_at: Date;
	href: string | null;
	id: string;
	kind: "order" | "review" | "stock";
	primary: string;
	secondary: string | null;
}

async function fetchPendingCounts(): Promise<PendingCounts> {
	const result = await db.execute<PendingCounts>(sql`
		SELECT
			(SELECT COUNT(*)::int FROM stock_level WHERE reorder_point > 0 AND quantity <= reorder_point) AS items_to_reorder,
			(SELECT COUNT(*)::int FROM stock_level WHERE quantity = 0) AS stock_zero,
			(SELECT COUNT(*)::int FROM "order" WHERE status = 'paid') AS orders_paid,
			(SELECT COUNT(*)::int FROM "order" WHERE status = 'preparing') AS orders_preparing,
			(SELECT COUNT(*)::int FROM "order" WHERE status = 'shipped') AS orders_shipped,
			(SELECT COUNT(*)::int FROM review WHERE status = 'pending') AS reviews_pending
	`);
	return result.rows[0];
}

async function fetchRecentActivity(): Promise<ActivityEvent[]> {
	const result = await db.execute<ActivityRow>(sql`
		(
			SELECT
				'stock-' || sm.id AS id,
				'stock'::text AS kind,
				sm.created_at,
				CASE
					WHEN sm.delta > 0 THEN '+' || sm.delta || ' un. ' || COALESCE(tv.sku, 'variante')
					ELSE sm.delta || ' un. ' || COALESCE(tv.sku, 'variante')
				END AS primary,
				COALESCE(b.name, '—') AS secondary,
				NULL::text AS href
			FROM stock_movement sm
			LEFT JOIN tool_variant tv ON tv.id = sm.variant_id
			LEFT JOIN branch b ON b.id = sm.branch_id
			ORDER BY sm.created_at DESC
			LIMIT 8
		)
		UNION ALL
		(
			SELECT
				'order-' || osh.id AS id,
				'order'::text AS kind,
				osh.created_at,
				'#' || o.number || ' → ' || osh.to_status::text AS primary,
				NULL::text AS secondary,
				'/dashboard/orders/' || o.id AS href
			FROM order_status_history osh
			JOIN "order" o ON o.id = osh.order_id
			ORDER BY osh.created_at DESC
			LIMIT 8
		)
		UNION ALL
		(
			SELECT
				'review-' || r.id AS id,
				'review'::text AS kind,
				r.created_at,
				'Review ' || r.rating || '★ · ' || COALESCE(t.name, 'ferramenta') AS primary,
				r.status::text AS secondary,
				'/dashboard/reviews/' || r.id AS href
			FROM review r
			LEFT JOIN tool t ON t.id = r.tool_id
			ORDER BY r.created_at DESC
			LIMIT 8
		)
		ORDER BY created_at DESC
		LIMIT 15
	`);
	return result.rows.map((r) => ({
		id: r.id,
		kind: r.kind,
		at: toDate(r.created_at),
		primary: r.primary,
		secondary: r.secondary ?? undefined,
		href: r.href ?? undefined,
	}));
}

export default async function DashboardPage() {
	const session = await requireCurrentSession();
	const [pending, activity] = await Promise.all([
		fetchPendingCounts(),
		fetchRecentActivity(),
	]);

	const groups: PendingGroup[] = [
		{
			title: "Estoque",
			items: [
				{
					label: "Repor agora (≤ ponto de pedido)",
					count: pending.items_to_reorder,
					href: "/dashboard/stock?ordem=menor",
					role: "warning",
				},
				{
					label: "Sem estoque (zero)",
					count: pending.stock_zero,
					href: "/dashboard/stock?ordem=menor",
					role: "destructive",
				},
			],
		},
		{
			title: "Pedidos",
			items: [
				{
					label: "Pagos · aguardando preparação",
					count: pending.orders_paid,
					href: "/dashboard/orders?status=paid",
					role: "warning",
				},
				{
					label: "Em preparação",
					count: pending.orders_preparing,
					href: "/dashboard/orders?status=preparing",
					role: "info",
				},
				{
					label: "Em transporte",
					count: pending.orders_shipped,
					href: "/dashboard/orders?status=shipped",
					role: "info",
				},
			],
		},
		{
			title: "Moderação",
			items: [
				{
					label: "Reviews aguardando aprovação",
					count: pending.reviews_pending,
					href: "/dashboard/reviews?status=pending",
					role: "warning",
				},
			],
		},
	];

	return (
		<main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8">
			<section className="flex flex-col gap-2">
				<p className="text-muted-foreground text-sm">Painel</p>
				<h1 className="font-medium text-2xl tracking-tight">
					Olá, {session.user.name?.split(" ")[0] ?? "admin"}
				</h1>
				<p className="max-w-3xl text-muted-foreground text-sm">
					Visão operacional. Esquerda: o que precisa ação. Direita: o que
					aconteceu.
				</p>
			</section>

			<section className="grid gap-4 lg:grid-cols-2">
				<PendingList groups={groups} />
				<ActivityFeed events={activity} />
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
	{
		href: "/dashboard/categories",
		label: "Categorias",
		variant: "ghost",
	},
] as const;
