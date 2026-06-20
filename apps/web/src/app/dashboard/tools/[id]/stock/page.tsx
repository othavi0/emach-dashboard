import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

export const metadata: Metadata = {
	title: "Estoque da ferramenta",
};

interface PageProps {
	params: Promise<{ id: string }>;
}

export default function ToolStockRedirect({ params }: PageProps) {
	return (
		<Suspense>
			<ToolStockRedirectContent params={params} />
		</Suspense>
	);
}

async function ToolStockRedirectContent({ params }: PageProps): Promise<never> {
	const { id } = await params;
	redirect(`/dashboard/tools/${id}?tab=estoque`);
}
