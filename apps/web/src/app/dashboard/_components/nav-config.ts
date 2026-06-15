import {
	ArrowLeftRight,
	Bell,
	Building2,
	FolderTree,
	Image as ImageIcon,
	LayoutDashboard,
	type LucideIcon,
	Megaphone,
	Settings,
	ShieldCheck,
	ShoppingCart,
	Star,
	Truck,
	Users,
	Wrench,
} from "lucide-react";
import type { Route } from "next";

export type BadgeKey = "orders" | "stock" | "reviews" | "users";

export interface NavItemConfig {
	badgeKey?: BadgeKey;
	disabled?: boolean;
	exact?: boolean;
	href: Route;
	icon: LucideIcon;
	label: string;
	requiresManageUsers?: boolean;
}

export interface NavGroupConfig {
	items: NavItemConfig[];
	label: string;
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
				badgeKey: "stock",
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
			{
				label: "Movimentações",
				href: "/dashboard/stock/movements" as Route,
				icon: ArrowLeftRight,
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
		label: "Sistema",
		items: [
			{
				label: "Configurações",
				href: "/dashboard/site/settings" as Route,
				icon: Settings,
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
	exact?: boolean
): boolean {
	if (href === DASHBOARD_HREF || exact) {
		return pathname === href;
	}
	return pathname === href || pathname.startsWith(`${href}/`);
}
