import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCurrentSession } from "@/lib/session";

export const metadata: Metadata = {
	description:
		"Entrada do dashboard administrativo da Emach Ferramentas para gestão de ferramentas, pedidos, estoque e clientes.",
	title: "Emach Dashboard",
};

async function HomeRedirect() {
	const session = await getCurrentSession();
	redirect(session?.user ? "/dashboard" : "/login");
	return null;
}

export default function HomePage() {
	// Sob cacheComponents a rota "/" serve um shell estático em branco enquanto
	// HomeRedirect resolve o redirect assíncrono — antes era redirect HTTP imediato.
	return (
		<Suspense fallback={null}>
			<HomeRedirect />
		</Suspense>
	);
}
