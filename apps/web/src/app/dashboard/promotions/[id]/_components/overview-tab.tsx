import { CalendarClock, CalendarPlus, Percent, Wrench } from "lucide-react";

import {
	EntityKpisRow,
	type KpiItem,
} from "@/components/entity/entity-kpis-row";
import {
	daysRemainingDisplay,
	fmtDate,
	fmtDateTime,
	formatDesconto,
} from "../../_components/_lib/format";
import { CopyCodeButton } from "../../_components/copy-code-button";
import type { PromotionDetail } from "../../actions";

const MARKER =
	"font-sans font-semibold text-muted-foreground text-xs uppercase tracking-wider";

function executionMessage(status: PromotionDetail["status"]): string {
	switch (status) {
		case "active":
			return "Aparece no site para clientes elegíveis.";
		case "scheduled":
			return "Agendada — começa a aparecer no site na data de início.";
		case "expired":
			return "Expirada — não aparece mais no site.";
		default:
			return "Pausada — não aparece no site.";
	}
}

export function OverviewTab({ detail }: { detail: PromotionDetail }) {
	const remaining = daysRemainingDisplay(detail.status, detail.endsAt);
	const isCoupon = detail.type === "promocode";

	const kpis: KpiItem[] = [
		{
			icon: Percent,
			label: "Desconto",
			value: formatDesconto(detail.discountPct),
		},
		{
			href: `/dashboard/promotions/${detail.id}?tab=tools`,
			icon: Wrench,
			label: "Ferramentas",
			tone: detail.tools.length === 0 ? "warning" : "default",
			value: detail.tools.length,
		},
		{
			icon: CalendarPlus,
			label: "Início",
			value: detail.startsAt ? fmtDate(detail.startsAt) : "Imediato",
		},
		{
			hint: detail.endsAt ? `${remaining.value} dias restantes` : "Sem prazo",
			icon: CalendarClock,
			label: "Término",
			tone: remaining.tone,
			value: detail.endsAt ? fmtDate(detail.endsAt) : "—",
		},
	];

	const historico = (
		<section className="rounded-lg border border-border bg-card p-5">
			<h3 className={MARKER}>Histórico</h3>
			<dl className="mt-2 space-y-1 text-sm">
				<div className="flex justify-between gap-4">
					<dt className="text-muted-foreground">Criada</dt>
					<dd className="tabular-nums">
						{fmtDateTime(detail.createdAt)}
						{detail.createdByName ? ` · ${detail.createdByName}` : ""}
					</dd>
				</div>
				<div className="flex justify-between gap-4">
					<dt className="text-muted-foreground">Atualizada</dt>
					<dd className="tabular-nums">
						{fmtDateTime(detail.updatedAt)}
						{detail.updatedByName ? ` · ${detail.updatedByName}` : ""}
					</dd>
				</div>
			</dl>
		</section>
	);

	return (
		<div className="flex flex-col gap-6">
			<EntityKpisRow items={kpis} />

			<section className="rounded-lg border border-border bg-card p-5">
				<h3 className={MARKER}>Descrição</h3>
				<p className="mt-2 text-sm leading-relaxed">
					{detail.description ?? "Sem descrição."}
				</p>
			</section>

			<section className="rounded-lg border border-border bg-card p-5">
				<h3 className={MARKER}>Execução</h3>
				<p className="mt-2 text-sm leading-relaxed">
					{executionMessage(detail.status)}
				</p>
			</section>

			{isCoupon && detail.code ? (
				<div className="grid gap-6 sm:grid-cols-2">
					<section className="rounded-lg border border-border bg-card p-5">
						<h3 className={MARKER}>Código do cupom</h3>
						<div className="mt-2 flex items-center gap-2">
							<code className="rounded bg-muted px-2 py-1 font-mono text-foreground text-sm">
								{detail.code}
							</code>
							<CopyCodeButton code={detail.code} />
						</div>
					</section>
					{historico}
				</div>
			) : (
				historico
			)}
		</div>
	);
}
