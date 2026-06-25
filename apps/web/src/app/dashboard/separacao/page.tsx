import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { getUserBranchScope } from "@/lib/branch-scope";
import { requireCapabilityOrRedirect } from "@/lib/permissions";
import { PickingQueue } from "./_components/picking-queue";
import { ResumeBanner } from "./_components/resume-banner";
import { fetchPickingQueuePage, getActivePickingForUser } from "./data";

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

	// Carrega as 3 tabs em paralelo para os contadores do cabeçalho e a tab ativa
	const [resultA, resultEm, resultEx, activePicking] = await Promise.all([
		fetchPickingQueuePage({ cursor: null, scope, tab: "a_separar" }),
		fetchPickingQueuePage({ cursor: null, scope, tab: "em_separacao" }),
		fetchPickingQueuePage({ cursor: null, scope, tab: "excecoes" }),
		getActivePickingForUser(session.user.id, scope),
	]);

	const counts = {
		a_separar: resultA.items.length,
		em_separacao: resultEm.items.length,
		excecoes: resultEx.items.length,
	};

	let initialResult = resultA;
	if (activeTab === "em_separacao") {
		initialResult = resultEm;
	} else if (activeTab === "excecoes") {
		initialResult = resultEx;
	}

	return (
		<>
			<PageHeader
				action={
					<div className="flex items-center gap-6">
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
								Em andamento
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
				scope={scope}
			/>
		</>
	);
}
