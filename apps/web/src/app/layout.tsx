import type { Metadata } from "next";
import {
	Barlow,
	Barlow_Condensed,
	Cormorant_Garamond,
	Inter,
} from "next/font/google";

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

// Fontes do storefront (hero), usadas no preview de banner para fidelidade.
const fontBarlow = Barlow({
	subsets: ["latin"],
	weight: ["400", "600", "700"],
	variable: "--font-barlow",
	display: "swap",
});

const fontBarlowCondensed = Barlow_Condensed({
	subsets: ["latin"],
	weight: ["600", "700"],
	variable: "--font-barlow-condensed",
	display: "swap",
});

const siteUrl = new URL("https://dashboard.emachferramentas.com.br");
const siteDescription =
	"Dashboard administrativo da Emach Ferramentas para gestão de ferramentas, pedidos, estoque, clientes e conteúdo do e-commerce.";

export const metadata: Metadata = {
	applicationName: "Emach Dashboard",
	authors: [{ name: "Emach Ferramentas" }],
	creator: "Emach Ferramentas",
	description: siteDescription,
	icons: {
		apple: "/logo.jpg",
		icon: "/logo.jpg",
		shortcut: "/logo.jpg",
	},
	metadataBase: siteUrl,
	openGraph: {
		description: siteDescription,
		images: [
			{
				alt: "Emach Dashboard",
				height: 465,
				url: "/logo.jpg",
				width: 553,
			},
		],
		locale: "pt_BR",
		siteName: "Emach Dashboard",
		title: "Emach Dashboard",
		type: "website",
		url: "/",
	},
	publisher: "Emach Ferramentas",
	title: {
		default: "Emach Dashboard",
		template: "%s · Emach Dashboard",
	},
	twitter: {
		card: "summary_large_image",
		description: siteDescription,
		images: ["/logo.jpg"],
		title: "Emach Dashboard",
	},
	alternates: {
		canonical: "/",
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html
			className={`dark ${fontSerif.variable} ${fontSans.variable} ${fontBarlow.variable} ${fontBarlowCondensed.variable}`}
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
