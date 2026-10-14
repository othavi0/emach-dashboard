import {
	ArrowLeftRight,
	Building2,
	FolderTree,
	Image as ImageIcon,
	LayoutDashboard,
	type LucideIcon,
	Megaphone,
	PackageCheck,
	Settings,
	ShieldCheck,
	ShoppingCart,
	Star,
	Truck,
	Users,
	Wrench,
} from "lucide-react";
import type { Route } from "next";
import type { Capability } from "@/lib/permissions";

export type BadgeKey = "orders" | "picking" | "stock" | "reviews" | "users";

export interface NavItemConfig {
	badgeKey?: BadgeKey;
	capability?: Capability;
	disabled?: boolean;
	exact?: boolean;
	href: Route;
	icon: LucideIcon;
	label: string;
}

export interface NavGroupConfig {
	items: NavItemConfig[];
	label: string;
}

export const DASHBOARD_HREF: Route = "/dashboard";

export const NAV_GROUPS: NavGroupConfig[] = [
	{
		label: "",
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
		label: "Vendas",
		items: [
			{
				label: "Pedidos",
				href: "/dashboard/orders",
				icon: ShoppingCart,
				capability: "orders.read",
				badgeKey: "orders",
			},
			{
				label: "Separação",
				href: "/dashboard/separacao",
				icon: PackageCheck,
				capability: "orders.pick",
				badgeKey: "picking",
			},
			{
				label: "Movimentações",
				href: "/dashboard/stock/movements",
				icon: ArrowLeftRight,
			},
		],
	},
	{
		label: "Catálogo",
		items: [
			{
				label: "Ferramentas",
				href: "/dashboard/tools",
				icon: Wrench,
				badgeKey: "stock",
			},
			{
				label: "Categorias",
				href: "/dashboard/categories",
				icon: FolderTree,
			},
			{
				label: "Fornecedores",
				href: "/dashboard/suppliers",
				icon: Truck,
			},
		],
	},
	{
		label: "Loja & Clientes",
		items: [
			{
				label: "Promoções",
				href: "/dashboard/promotions",
				icon: Megaphone,
				capability: "promotions.read",
			},
			{
				label: "Banners",
				href: "/dashboard/site/banners",
				icon: ImageIcon,
				capability: "site.update_banners",
			},
			{
				label: "Clientes",
				href: "/dashboard/customers",
				icon: Users,
				capability: "customers.read",
			},
			{
				label: "Avaliações",
				href: "/dashboard/reviews",
				icon: Star,
				badgeKey: "reviews",
				capability: "reviews.read",
			},
		],
	},
	{
		label: "Configuração",
		items: [
			{
				label: "Filiais",
				href: "/dashboard/branches",
				icon: Building2,
				capability: "branches.read",
			},
			{
				label: "Frete",
				href: "/dashboard/shipping",
				icon: Truck,
				capability: "shipping.read",
			},
			{
				label: "Configurações",
				href: "/dashboard/site/settings",
				icon: Settings,
				capability: "site.update_settings",
			},
		],
	},
	{
		label: "Administração",
		items: [
			{
				label: "Usuários",
				href: "/dashboard/users",
				icon: ShieldCheck,
				badgeKey: "users",
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
