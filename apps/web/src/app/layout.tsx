import type { Metadata } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";

import "../index.css";
import AppHeader from "@/components/app-header";
import Providers from "@/components/providers";

const fontSerif = Cormorant_Garamond({
	subsets: ["latin"],
	weight: ["400", "500", "600"],
	variable: "--font-serif-loaded",
	display: "swap",
});

const fontSans = Inter({
	subsets: ["latin"],
	variable: "--font-sans-loaded",
	display: "swap",
});

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
		<html
			className={`dark ${fontSerif.variable} ${fontSans.variable}`}
			lang="pt-BR"
			suppressHydrationWarning
		>
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
