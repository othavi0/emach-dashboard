import {
	CalendarClock,
	CalendarPlus,
	Percent,
	Ticket,
	Wrench,
} from "lucide-react";

import {
	EntityKpisRow,
	type KpiItem,
} from "@/components/entity/entity-kpis-row";
import {
	daysRemainingDisplay,
	fmtDate,
	fmtDateTime,
	formatDiscount,
} from "../../_components/_lib/format";
import { CopyCodeButton } from "../../_components/copy-code-button";
import type { PromotionDetail, PromotionStatus } from "../../data";

const MARKER =
	"font-sans font-semibold text-muted-foreground text-xs uppercase tracking-wider";

const STATUS_DOT: Record<PromotionStatus, string> = {
	active: "bg-success",
	scheduled: "bg-amber-500",
	expired: "bg-destructive",
	inactive: "bg-muted-foreground",
};

function executionMessage(status: PromotionStatus): string {
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

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: componente de overview com múltiplos estados condicionais de promoção; complexidade inerente ao domínio
export function OverviewTab({ detail }: { detail: PromotionDetail }) {
	const remaining = daysRemainingDisplay(detail.status, detail.endsAt);
	const isCoupon = detail.type === "promocode";

	let terminoHint = "Sem prazo";
	if (detail.endsAt) {
		terminoHint =
			detail.status === "expired"
				? "Expirada"
				: `${remaining.value} dias restantes`;
	}

	const kpis: KpiItem[] = [
		{
			icon: Percent,
			label: "Desconto",
			value: formatDiscount(detail.discountType, detail.discountValue),
		},
		{
			icon: Wrench,
			label: "Alcance",
			switchTab: detail.appliesToAll ? undefined : "tools",
			tone:
				!detail.appliesToAll && detail.tools.length === 0
					? "warning"
					: "default",
			value: detail.appliesToAll ? "Todas" : detail.tools.length,
		},
		{
			icon: CalendarPlus,
			label: "Início",
			value: detail.startsAt ? fmtDate(detail.startsAt) : "Imediato",
		},
		{
			hint: terminoHint,
			icon: CalendarClock,
			label: "Término",
			tone: remaining.tone,
			value: detail.endsAt ? fmtDate(detail.endsAt) : "—",
		},
	];

	if (isCoupon) {
		kpis.push({
			hint: detail.maxRedemptions == null ? "ilimitado" : undefined,
			icon: Ticket,
			label: "Resgates",
			value:
				detail.maxRedemptions == null
					? String(detail.redemptionCount)
					: `${detail.redemptionCount} / ${detail.maxRedemptions}`,
		});
	}

	const resumo = (
		<section className="rounded-lg border border-border bg-card p-5">
			<h3 className={MARKER}>Resumo</h3>
			<div className="mt-3 flex flex-col gap-3 text-sm">
				<div className="flex items-center gap-2">
					<span
						aria-hidden
						className={`size-2 shrink-0 rounded-full ${STATUS_DOT[detail.status]}`}
					/>
					<span>{executionMessage(detail.status)}</span>
				</div>

				{isCoupon && detail.minOrderAmount != null ? (
					<div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs">
						<span>
							Pedido mínimo: {formatDiscount("fixed", detail.minOrderAmount)}
						</span>
					</div>
				) : null}

				{isCoupon && detail.code ? (
					<div className="flex items-center gap-2">
						<code className="rounded bg-muted px-2 py-1 font-mono text-foreground text-sm">
							{detail.code}
						</code>
						<CopyCodeButton code={detail.code} />
					</div>
				) : null}

				<p className="text-muted-foreground leading-relaxed">
					{detail.description ?? "Sem descrição."}
				</p>
			</div>
		</section>
	);

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
			<div className="grid gap-6 sm:grid-cols-[1.4fr_1fr]">
				{resumo}
				{historico}
			</div>
		</div>
	);
}
