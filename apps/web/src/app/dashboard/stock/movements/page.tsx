import { db } from "@emach/db";
import { branch } from "@emach/db/schema/inventory";
import { asc, eq } from "drizzle-orm";

import { PageHeader } from "@/components/page-header";
import { requireCapabilityOrRedirect } from "@/lib/permissions";
import { getActiveSuppliers } from "@/lib/suppliers";

import { fetchLedgerPage, type LedgerFilters } from "../movements-data";
import { LedgerFiltersBar } from "./_components/ledger-filters";
import { LedgerInfinite } from "./_components/ledger-infinite";

export const dynamic = "force-dynamic";

interface PageProps {
	searchParams: Promise<{
		actorId?: string;
		branchId?: string;
		period?: string;
		reason?: string;
		supplierId?: string;
		toolId?: string;
	}>;
}

export default async function StockMovementsPage({ searchParams }: PageProps) {
	await requireCapabilityOrRedirect("stock.read");

	const sp = await searchParams;

	const validPeriods = ["today", "7d", "30d", "90d", "all"] as const;
	type Period = (typeof validPeriods)[number];
	const period: Period =
		sp.period && (validPeriods as readonly string[]).includes(sp.period)
			? (sp.period as Period)
			: "all";

	const filters: LedgerFilters = {
		period,
		toolId: sp.toolId,
		branchId: sp.branchId,
		supplierId: sp.supplierId,
		actorId: sp.actorId,
		reasons: sp.reason ? sp.reason.split(",").filter(Boolean) : undefined,
	};

	const [firstPage, suppliers, branches] = await Promise.all([
		fetchLedgerPage(filters, null),
		getActiveSuppliers(),
		db
			.select({ id: branch.id, name: branch.name })
			.from(branch)
			.where(eq(branch.status, "active"))
			.orderBy(asc(branch.name)),
	]);

	return (
		<>
			<PageHeader
				description="Histórico completo de entradas, saídas e ajustes de estoque."
				title="Movimentações"
			/>

			<LedgerFiltersBar
				branches={branches}
				filters={filters}
				suppliers={suppliers}
			/>

			<LedgerInfinite
				filters={filters}
				initial={firstPage.items}
				initialCursor={firstPage.nextCursor}
			/>
		</>
	);
}
