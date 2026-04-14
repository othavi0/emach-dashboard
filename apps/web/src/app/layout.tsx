import type { Metadata } from "next";

import "../index.css";
import AppHeader from "@/components/app-header";
import Providers from "@/components/providers";

export const metadata: Metadata = {
	title: "emach dashboard",
	description: "Dashboard de gestao de estoque e ecommerce da E-mach.",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html className="dark" lang="pt-BR" suppressHydrationWarning>
			<body className="min-h-svh antialiased">
				<Providers>
					<div className="flex min-h-svh flex-col bg-background">
						<AppHeader />
						{children}
					</div>
				</Providers>
			</body>
		</html>
	);
}
