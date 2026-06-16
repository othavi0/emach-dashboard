import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
	title: "Estoque da ferramenta",
};

interface PageProps {
	params: Promise<{ id: string }>;
}

export default async function ToolStockRedirect({ params }: PageProps) {
	const { id } = await params;
	redirect(`/dashboard/tools/${id}?tab=estoque`);
}
