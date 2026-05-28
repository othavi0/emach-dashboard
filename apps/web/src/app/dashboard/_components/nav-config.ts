import type { Route } from "next";
import {
	Bell,
	Boxes,
	Building2,
	FolderTree,
	Image as ImageIcon,
	LayoutDashboard,
	type LucideIcon,
	Megaphone,
	ShieldCheck,
	ShoppingCart,
	Star,
	Truck,
	Users,
	Wrench,
} from "lucide-react";

export type BadgeKey = "orders" | "stock" | "reviews" | "users";

export interface NavItemConfig {
	label: string;
	href: Route;
	icon: LucideIcon;
	exact?: boolean;
	disabled?: boolean;
	badgeKey?: BadgeKey;
	requiresManageUsers?: boolean;
}

export interface NavGroupConfig {
	label: string;
	items: NavItemConfig[];
}

export const DASHBOARD_HREF = "/dashboard" as Route;

export const NAV_GROUPS: NavGroupConfig[] = [
	{
		label: "Visão",
		items: [
			{
				label: "Dashboard",
				href: DASHBOARD_HREF,
				icon: LayoutDashboard,
				exact: true,
			},
		],
	},
	{
		label: "Operação",
		items: [
			{
				label: "Pedidos",
				href: "/dashboard/orders" as Route,
				icon: ShoppingCart,
				badgeKey: "orders",
			},
			{
				label: "Estoque",
				href: "/dashboard/stock" as Route,
				icon: Boxes,
				badgeKey: "stock",
			},
			{
				label: "Filiais",
				href: "/dashboard/branches" as Route,
				icon: Building2,
			},
		],
	},
	{
		label: "Catálogo",
		items: [
			{
				label: "Ferramentas",
				href: "/dashboard/tools" as Route,
				icon: Wrench,
			},
			{
				label: "Categorias",
				href: "/dashboard/categories" as Route,
				icon: FolderTree,
			},
			{
				label: "Fornecedores",
				href: "/dashboard/suppliers" as Route,
				icon: Truck,
			},
		],
	},
	{
		label: "Relacionamento",
		items: [
			{
				label: "Clientes",
				href: "/dashboard/customers" as Route,
				icon: Users,
			},
			{
				label: "Avaliações",
				href: "/dashboard/reviews" as Route,
				icon: Star,
				badgeKey: "reviews",
			},
			{
				label: "Promoções",
				href: "/dashboard/promotions" as Route,
				icon: Megaphone,
			},
			{
				label: "Banners",
				href: "/dashboard/site/banners" as Route,
				icon: ImageIcon,
				disabled: true,
			},
			{
				label: "Notificações",
				href: "/dashboard/site/notifications" as Route,
				icon: Bell,
				disabled: true,
			},
		],
	},
	{
		label: "Administração",
		items: [
			{
				label: "Usuários",
				href: "/dashboard/users" as Route,
				icon: ShieldCheck,
				badgeKey: "users",
				requiresManageUsers: true,
			},
		],
	},
];

export function isNavItemActive(
	pathname: string,
	href: string,
	exact?: boolean,
): boolean {
	if (href === DASHBOARD_HREF || exact) {
		return pathname === href;
	}
	return pathname === href || pathname.startsWith(`${href}/`);
}
