import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "@emach/ui/components/sidebar";
import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardChrome } from "./_components/dashboard-chrome";
import { SidebarSkeleton } from "./_components/sidebar-skeleton";

export const metadata: Metadata = {
	description:
		"Área administrativa privada da Emach Ferramentas para gestão operacional do e-commerce.",
	robots: {
		follow: false,
		index: false,
	},
};

export default function DashboardLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<SidebarProvider>
			<Suspense fallback={<SidebarSkeleton />}>
				<DashboardChrome />
			</Suspense>
			<SidebarInset>
				<header className="flex h-12 items-center gap-2 border-b px-4 md:hidden">
					<SidebarTrigger />
					<span className="font-serif text-base uppercase tracking-[0.04em]">
						emach
					</span>
				</header>
				<div className="flex w-full flex-col gap-6 px-6 py-6">{children}</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
