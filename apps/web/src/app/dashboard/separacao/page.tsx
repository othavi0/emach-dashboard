import { buttonVariants } from "@emach/ui/components/button";
import { PrinterIcon } from "lucide-react";
import type { Metadata } from "next";

import { AutoRefresh } from "@/components/auto-refresh";
import { PageHeader } from "@/components/page-header";
import { getUserBranchScope } from "@/lib/branch-scope";
import { requireCapabilityOrRedirect } from "@/lib/permissions";
import { LateOrdersToast } from "../orders/_components/late-orders-toast";
import { getLateOrdersCount } from "../orders/data";
import { PickingQueue } from "./_components/picking-queue";
import { ResumeBanner } from "./_components/resume-banner";
import {
	fetchPickingQueueCounts,
	fetchPickingQueuePage,
	getActivePickingForUser,
} from "./data";

export const metadata: Metadata = {
	title: "Separação",
};

type Tab = "a_separar" | "em_separacao" | "excecoes";

interface PageProps {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default function SeparacaoPage({ searchParams }: PageProps) {
	return <SeparacaoPageContent searchParams={searchParams} />;
}

async function SeparacaoPageContent({ searchParams }: PageProps) {
	const session = await requireCapabilityOrRedirect("orders.pick");
	const scope = await getUserBranchScope(session);

	const raw = await searchParams;
	const rawTab = Array.isArray(raw.tab) ? raw.tab[0] : raw.tab;
	const activeTab: Tab =
		rawTab === "em_separacao" || rawTab === "excecoes" ? rawTab : "a_separar";

	// Contadores reais (COUNT) das 3 tabs + apenas a página da tab ativa.
	const [counts, initialResult, activePicking, lateCount] = await Promise.all([
		fetchPickingQueueCounts(scope),
		fetchPickingQueuePage({ cursor: null, scope, tab: activeTab }),
		getActivePickingForUser(session.user.id, scope),
		getLateOrdersCount(scope),
	]);

	return (
		<>
			<AutoRefresh />
			<LateOrdersToast count={lateCount} />
			<PageHeader
				action={
					<div className="flex items-center gap-6">
						{activeTab !== "excecoes" && (
							<a
								className={buttonVariants({ size: "sm", variant: "outline" })}
								href={`/dashboard/orders/picking-list?tab=${activeTab}`}
								rel="noopener"
								target="_blank"
							>
								<PrinterIcon aria-hidden className="size-4" />
								Imprimir lista
							</a>
						)}
						<div className="text-right">
							<div className="font-semibold text-2xl tabular-nums">
								{counts.a_separar}
							</div>
							<div className="text-[11px] text-muted-foreground uppercase tracking-widest">
								A separar
							</div>
						</div>
						<div className="text-right">
							<div className="font-semibold text-2xl tabular-nums">
								{counts.em_separacao}
							</div>
							<div className="text-[11px] text-muted-foreground uppercase tracking-widest">
								Separando
							</div>
						</div>
						<div className="text-right">
							<div
								className={`font-semibold text-2xl tabular-nums ${counts.excecoes > 0 ? "text-warning" : ""}`}
							>
								{counts.excecoes}
							</div>
							<div className="text-[11px] text-muted-foreground uppercase tracking-widest">
								Exceções
							</div>
						</div>
					</div>
				}
				description="Fila de pedidos pagos aguardando conferência física"
				title="Separação"
			/>

			{activePicking && <ResumeBanner activePicking={activePicking} />}

			<PickingQueue
				activeTab={activeTab}
				counts={counts}
				initial={initialResult.items}
				initialCursor={initialResult.nextCursor}
			/>
		</>
	);
}
