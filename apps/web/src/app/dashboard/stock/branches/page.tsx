import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { Suspense } from "react";

export const metadata: Metadata = {
	title: "Estoque por filial",
};

interface PageProps {
	searchParams: Promise<{
		branch?: string;
		categoryId?: string;
		search?: string;
		sort?: string;
		status?: string;
	}>;
}

// Rota consolidada (#77): o estoque por filial vive na tab de cada filial
// (`/dashboard/branches/[id]?tab=stock`). Esta rota órfã vira redirect.
export default function BranchesStockRedirect({ searchParams }: PageProps) {
	return (
		<Suspense>
			<BranchesStockRedirectContent searchParams={searchParams} />
		</Suspense>
	);
}

async function BranchesStockRedirectContent({
	searchParams,
}: PageProps): Promise<never> {
	const sp = await searchParams;

	if (!sp.branch) {
		permanentRedirect("/dashboard/branches");
	}

	const qs = new URLSearchParams({ tab: "stock" });
	if (sp.categoryId) {
		qs.set("categoryId", sp.categoryId);
	}
	if (sp.search) {
		qs.set("search", sp.search);
	}
	if (sp.sort) {
		qs.set("sort", sp.sort);
	}
	if (sp.status) {
		qs.set("status", sp.status);
	}

	permanentRedirect(`/dashboard/branches/${sp.branch}?${qs.toString()}`);
}
