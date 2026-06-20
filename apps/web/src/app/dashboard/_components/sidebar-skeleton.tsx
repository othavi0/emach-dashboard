import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarRail,
} from "@emach/ui/components/sidebar";
import { Skeleton } from "@emach/ui/components/skeleton";

// Chaves estáveis (não index) pras linhas do skeleton — lista fixa, nunca reordena.
const NAV_ROWS = [
	"dashboard",
	"catalogo",
	"pedidos",
	"estoque",
	"clientes",
	"reviews",
	"config",
	"usuarios",
] as const;

/** Fallback do <Suspense> do dashboard layout enquanto a sessão resolve. */
export function SidebarSkeleton() {
	return (
		<Sidebar collapsible="icon">
			<SidebarHeader>
				<div className="flex items-center justify-center px-2 py-2">
					<Skeleton className="h-7 w-28" />
				</div>
			</SidebarHeader>
			<SidebarContent className="gap-2 px-2 py-2">
				{NAV_ROWS.map((row) => (
					<Skeleton className="h-8 w-full" key={row} />
				))}
			</SidebarContent>
			<SidebarFooter>
				<Skeleton className="h-10 w-full" />
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
