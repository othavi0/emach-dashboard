import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentSession } from "@/lib/session";

export const metadata: Metadata = {
	description:
		"Entrada do dashboard administrativo da Emach Ferramentas para gestão de ferramentas, pedidos, estoque e clientes.",
	title: "Emach Dashboard",
};

export default async function HomePage() {
	const session = await getCurrentSession();

	redirect(session?.user ? "/dashboard" : "/login");
}
