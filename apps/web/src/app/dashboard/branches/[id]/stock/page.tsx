import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";

export const metadata: Metadata = {
	title: "Estoque da filial",
};

interface PageProps {
	params: Promise<{ id: string }>;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function BranchStockRedirect({
	params,
	searchParams,
}: PageProps) {
	const { id } = await params;
	const sp = await searchParams;

	const qs = new URLSearchParams();
	qs.set("tab", "stock");
	for (const [key, value] of Object.entries(sp)) {
		if (value === undefined) {
			continue;
		}
		if (Array.isArray(value)) {
			for (const v of value) {
				qs.append(key, v);
			}
		} else {
			qs.set(key, value);
		}
	}

	permanentRedirect(`/dashboard/branches/${id}?${qs.toString()}`);
}
