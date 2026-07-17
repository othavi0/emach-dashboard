import type { Metadata } from "next";

import { AutoRefresh } from "@/components/auto-refresh";
import { PageHeader } from "@/components/page-header";
import { getUserBranchScope } from "@/lib/branch-scope";
import { requireCapabilityOrRedirect } from "@/lib/permissions";
import { LateOrdersToast } from "../orders/_components/late-orders-toast";
import { getLateOrdersCount } from "../orders/data";
import { PickingQueue } from "./_components/picking-queue";
import { ProductivityPanel } from "./_components/productivity-panel";
import { type SeparacaoTab, SeparacaoTabs } from "./_components/separacao-tabs";
import {
	fetchPickingProductivityByOperator,
	fetchPickingProductivitySummary,
	fetchPickingQueueCounts,
	fetchPickingQueuePage,
} from "./data";

export const metadata: Metadata = {
	title: "Separação",
};

const TABS: SeparacaoTab[] = [
	"a_separar",
	"em_separacao",
	"excecoes",
	"produtividade",
];

function clampTab(raw: string | undefined): SeparacaoTab {
	return TABS.find((t) => t === raw) ?? "a_separar";
}

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
	const activeTab = clampTab(rawTab);

	// Contadores reais (COUNT) das 3 tabs de fila + o dado da tab ativa.
	// Produtividade busca os agregados; tabs de fila buscam a 1ª página.
	const [counts, lateCount, queuePage, summary, operators] = await Promise.all([
		fetchPickingQueueCounts(scope),
		getLateOrdersCount(scope),
		activeTab === "produtividade"
			? null
			: fetchPickingQueuePage({ cursor: null, scope, tab: activeTab }),
		activeTab === "produtividade"
			? fetchPickingProductivitySummary(scope)
			: null,
		activeTab === "produtividade"
			? fetchPickingProductivityByOperator(scope)
			: null,
	]);

	return (
		<>
			<AutoRefresh />
			<LateOrdersToast count={lateCount} />

			{activeTab === "produtividade" ? (
				<>
					<PageHeader
						description="Fila de pedidos pagos aguardando conferência física"
						title="Separação"
					/>
					<SeparacaoTabs activeTab="produtividade" counts={counts} />
					{summary && operators && (
						<ProductivityPanel operators={operators} summary={summary} />
					)}
				</>
			) : (
				<PickingQueue
					activeTab={activeTab}
					counts={counts}
					initial={queuePage?.items ?? []}
					initialCursor={queuePage?.nextCursor ?? null}
					sessionUserId={session.user.id}
				/>
			)}
		</>
	);
}
