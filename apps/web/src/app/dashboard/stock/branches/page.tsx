import { permanentRedirect } from "next/navigation";

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
export default async function BranchesStockRedirect({
	searchParams,
}: PageProps) {
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
